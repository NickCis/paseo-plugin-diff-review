import type { usePaseo } from "@getpaseo/plugin/client";
import { expandPromptTemplate, filesEligibleForStage } from "../shared/prompt";
import type { DiffFile } from "../shared/rpc";
import type { FileProgress, ReviewSettingsValues } from "../shared/settings";
import { workspaceFiles } from "./progress";

type Paseo = ReturnType<typeof usePaseo>;

export type SendTarget =
  | { kind: "existing"; agentId: string }
  | { kind: "create"; agentId?: string };

async function resolveProviderSelection(
  paseo: Paseo,
  cwd: string,
  templateId: string | undefined,
): Promise<string> {
  if (templateId) {
    const listed = await paseo.agents.list();
    const template = listed.entries
      .map(({ agent }) => agent)
      .find((agent) => agent.id === templateId);
    if (template?.provider && template.model) {
      return `${template.provider}/${template.model}`;
    }
  }
  const providers = await paseo.providers.waitForReady({ cwd });
  const readyProvider = providers.entries.find((entry) => entry.status === "ready");
  const model =
    readyProvider?.models?.find((candidate) => candidate.isDefault) ?? readyProvider?.models?.[0];
  if (!readyProvider || !model) {
    throw new Error("No provider model is ready to create an agent");
  }
  return `${readyProvider.provider}/${model.id}`;
}

export async function sendDiffReview(input: {
  paseo: Paseo;
  cwd: string;
  workspaceId: string;
  workspaceName: string;
  files: readonly DiffFile[];
  values: ReviewSettingsValues;
  target: SendTarget;
  stage(args: { cwd: string; pathKeys: string[] }): Promise<{
    staged: string[];
    failed: Array<{ pathKey: string; error: string }>;
  }>;
}): Promise<{ agentId: string; statusMessage: string }> {
  const progressMap = workspaceFiles(input.values, input.workspaceId);
  const empty: FileProgress = { status: "unread", lineComments: [] };
  const prompt = expandPromptTemplate({
    template: input.values.promptTemplate,
    workspaceName: input.workspaceName,
    files: input.files.map((file) => ({
      pathKey: file.pathKey,
      progress: progressMap[file.pathKey] ?? empty,
    })),
  });

  let agentId: string;
  if (input.target.kind === "existing") {
    await input.paseo.agents.ref(input.target.agentId).send(prompt);
    agentId = input.target.agentId;
  } else {
    const provider = await resolveProviderSelection(input.paseo, input.cwd, input.target.agentId);
    const created = await input.paseo.workspaces.ref(input.workspaceId).agents.create({
      config: { provider },
      prompt,
      title: "Diff review",
    });
    agentId = created.id;
  }

  const eligible = filesEligibleForStage(
    progressMap,
    input.files.map((file) => file.pathKey),
  );
  if (eligible.length === 0) {
    return { agentId, statusMessage: "Sent to agent · nothing eligible to stage" };
  }
  const staged = await input.stage({ cwd: input.cwd, pathKeys: eligible });
  const failedNote =
    staged.failed.length > 0
      ? ` · failed: ${staged.failed
          .slice(0, 3)
          .map((entry) => entry.pathKey)
          .join(", ")}${staged.failed.length > 3 ? ` +${staged.failed.length - 3}` : ""}`
      : "";
  return {
    agentId,
    statusMessage: `Sent to agent · staged ${staged.staged.length}/${eligible.length}${failedNote}`,
  };
}
