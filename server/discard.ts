import type { RpcInput } from "@getpaseo/plugin";
import { parsePathKey } from "../shared/paths";
import { diffDiscardRpc } from "../shared/rpc";
import { resolveSubmoduleCwd, runGit } from "./git";

/**
 * Discard unstaged worktree changes for one path (what the review panel shows).
 * Leaves the index alone — staged/cached changes are not touched.
 */
export async function discardPath(input: RpcInput<typeof diffDiscardRpc>): Promise<{
  pathKey: string;
  ok: boolean;
  error: string | null;
}> {
  const { submodulePath, path } = parsePathKey(input.pathKey);
  if (path === ".") {
    return {
      pathKey: input.pathKey,
      ok: false,
      error: "Cannot discard a submodule placeholder row",
    };
  }

  const repoCwd = submodulePath ? resolveSubmoduleCwd(input.cwd, submodulePath) : input.cwd;
  if (!repoCwd) {
    return {
      pathKey: input.pathKey,
      ok: false,
      error: submodulePath
        ? `Submodule checkout missing: ${submodulePath}`
        : "Repository missing",
    };
  }

  try {
    const { restore, clean } = await resolveDiscardTargets(repoCwd, path);
    if (restore.length === 0 && clean.length === 0) {
      return {
        pathKey: input.pathKey,
        ok: false,
        error: "No unstaged or untracked changes to discard",
      };
    }
    if (restore.length > 0) {
      await runGit(repoCwd, ["restore", "--worktree", "--", ...restore]);
    }
    if (clean.length > 0) {
      await runGit(repoCwd, ["clean", "-f", "-d", "--", ...clean]);
    }
    return { pathKey: input.pathKey, ok: true, error: null };
  } catch (error) {
    return {
      pathKey: input.pathKey,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveDiscardTargets(
  repoCwd: string,
  path: string,
): Promise<{ restore: string[]; clean: string[] }> {
  const rename = await findUnstagedRename(repoCwd, path);
  if (rename) {
    return { restore: [rename.oldPath], clean: [rename.newPath] };
  }

  const status = await runGit(repoCwd, ["status", "--porcelain=1", "--", path], {
    acceptExitCodes: [0],
  });
  const line = status.stdout
    .split("\n")
    .map((entry) => entry.trimEnd())
    .find(Boolean);
  if (!line || line.length < 3) {
    return { restore: [], clean: [] };
  }

  const indexStatus = line[0]!;
  const worktreeStatus = line[1]!;
  if (indexStatus === "?" && worktreeStatus === "?") {
    return { restore: [], clean: [path] };
  }

  // Only discard worktree side (space/M/D/etc. in column 2). Index-only rows are ignored.
  if (worktreeStatus === " " || worktreeStatus === "?") {
    return { restore: [], clean: [] };
  }
  return { restore: [path], clean: [] };
}

async function findUnstagedRename(
  repoCwd: string,
  path: string,
): Promise<{ oldPath: string; newPath: string } | null> {
  const { stdout } = await runGit(repoCwd, ["diff", "--name-status", "--find-renames", "--"], {
    acceptExitCodes: [0, 1],
  });
  for (const line of stdout
    .split("\n")
    .map((entry) => entry.trimEnd())
    .filter(Boolean)) {
    const parts = line.split("\t");
    const code = parts[0] ?? "";
    if (parts.length >= 3 && (code.startsWith("R") || code.startsWith("C"))) {
      const oldPath = parts[1]!;
      const newPath = parts[2]!;
      if (newPath === path || oldPath === path) {
        return { oldPath, newPath };
      }
    }
  }
  return null;
}
