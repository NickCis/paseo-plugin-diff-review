import { displayPathForKey } from "./paths";
import type { FileProgress, ReviewSettingsValues } from "./settings";

export function expandPromptTemplate(input: {
  template: string;
  workspaceName: string;
  files: readonly { pathKey: string; progress: FileProgress }[];
}): string {
  const nonIgnored = input.files.filter((file) => file.progress.status !== "ignored");
  const seen = nonIgnored.filter((file) => file.progress.status === "seen");
  const ignored = input.files.filter((file) => file.progress.status === "ignored");
  const seenUncommented = seen.filter(
    (file) => !file.progress.fileComment?.trim() && file.progress.lineComments.length === 0,
  );

  const commentBlocks: string[] = [];
  for (const file of input.files) {
    const display = displayPathForKey(file.pathKey);
    const parts: string[] = [];
    if (file.progress.fileComment?.trim()) {
      parts.push(`File note: ${file.progress.fileComment.trim()}`);
    }
    for (const comment of file.progress.lineComments) {
      if (!comment.body.trim()) continue;
      const range =
        comment.startLine === comment.endLine
          ? `L${comment.startLine}`
          : `L${comment.startLine}-L${comment.endLine}`;
      parts.push(`${comment.side} ${range}: ${comment.body.trim()}`);
    }
    if (parts.length > 0) {
      commentBlocks.push(`### ${display}\n${parts.join("\n")}`);
    }
  }

  return input.template
    .replaceAll("{{workspace}}", input.workspaceName)
    .replaceAll("{{seenCount}}", String(seen.length))
    .replaceAll("{{totalCount}}", String(nonIgnored.length))
    .replaceAll("{{ignoredCount}}", String(ignored.length))
    .replaceAll(
      "{{comments}}",
      commentBlocks.length > 0 ? commentBlocks.join("\n\n") : "_No comments._",
    )
    .replaceAll(
      "{{seenUncommented}}",
      seenUncommented.length > 0
        ? seenUncommented.map((file) => `- ${displayPathForKey(file.pathKey)}`).join("\n")
        : "_None._",
    )
    .replaceAll(
      "{{seenFiles}}",
      seen.length > 0
        ? seen.map((file) => `- ${displayPathForKey(file.pathKey)}`).join("\n")
        : "_None._",
    );
}

export function filesEligibleForStage(
  progressByPath: ReviewSettingsValues["progressByWorkspace"][string]["files"] | undefined,
  pathKeys: readonly string[],
): string[] {
  if (!progressByPath) return [];
  return pathKeys.filter((pathKey) => {
    const progress = progressByPath[pathKey];
    if (!progress || progress.status !== "seen") return false;
    if (progress.fileComment?.trim()) return false;
    if (progress.lineComments.some((comment) => comment.body.trim())) return false;
    return true;
  });
}
