import type { RpcInput } from "@getpaseo/plugin";
import { parsePathKey } from "../shared/paths";
import { diffStageRpc } from "../shared/rpc";
import { resolveSubmoduleCwd, runGit } from "./git";

export async function stagePaths(input: RpcInput<typeof diffStageRpc>): Promise<{
  staged: string[];
  failed: Array<{ pathKey: string; error: string }>;
}> {
  const byRepo = new Map<string, Array<{ pathKey: string; path: string }>>();
  const failed: Array<{ pathKey: string; error: string }> = [];

  for (const pathKey of input.pathKeys) {
    const { submodulePath, path } = parsePathKey(pathKey);
    if (path === ".") {
      failed.push({ pathKey, error: "Cannot stage a submodule placeholder row" });
      continue;
    }
    const repoCwd = submodulePath ? resolveSubmoduleCwd(input.cwd, submodulePath) : input.cwd;
    if (!repoCwd) {
      failed.push({
        pathKey,
        error: submodulePath
          ? `Submodule checkout missing: ${submodulePath}`
          : "Repository missing",
      });
      continue;
    }
    const bucket = byRepo.get(repoCwd) ?? [];
    bucket.push({ pathKey, path });
    byRepo.set(repoCwd, bucket);
  }

  const staged: string[] = [];
  for (const [repoCwd, entries] of byRepo) {
    try {
      await runGit(repoCwd, ["add", "--", ...entries.map((entry) => entry.path)]);
      staged.push(...entries.map((entry) => entry.pathKey));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const entry of entries) {
        failed.push({ pathKey: entry.pathKey, error: message });
      }
    }
  }

  return { staged, failed };
}
