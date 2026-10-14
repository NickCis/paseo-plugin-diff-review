import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import { parsePathKey } from "../shared/paths";
import { diffContextRpc } from "../shared/rpc";
import { resolveSubmoduleCwd, runGit } from "./git";

const MAX_EXPAND_LINES = 400;

async function readSideText(
  repoCwd: string,
  path: string,
  side: "old" | "new",
): Promise<{ text: string } | { error: string }> {
  if (side === "old") {
    const shown = await runGit(repoCwd, ["show", `HEAD:${path}`], { acceptExitCodes: [0, 128] });
    if (shown.exitCode !== 0) return { error: "Old file content unavailable" };
    return { text: shown.stdout };
  }
  try {
    return { text: await readFile(join(repoCwd, path), "utf8") };
  } catch {
    const shown = await runGit(repoCwd, ["show", `HEAD:${path}`], { acceptExitCodes: [0, 128] });
    if (shown.exitCode !== 0) return { error: "File content unavailable" };
    return { text: shown.stdout };
  }
}

export async function getDiffContext(input: RpcInput<typeof diffContextRpc>): Promise<{
  pathKey: string;
  status: "ok" | "missing";
  side: "old" | "new";
  totalLines: number;
  lines: Array<{
    content: string;
    oldLineNumber: number | null;
    newLineNumber: number | null;
  }>;
  error: string | null;
}> {
  const side = input.side ?? "new";
  const { submodulePath, path } = parsePathKey(input.pathKey);
  if (path === ".") {
    return {
      pathKey: input.pathKey,
      status: "missing",
      side,
      totalLines: 0,
      lines: [],
      error: "Cannot expand a submodule placeholder",
    };
  }

  const repoCwd = submodulePath ? resolveSubmoduleCwd(input.cwd, submodulePath) : input.cwd;
  if (!repoCwd) {
    return {
      pathKey: input.pathKey,
      status: "missing",
      side,
      totalLines: 0,
      lines: [],
      error: submodulePath ? `Submodule checkout missing: ${submodulePath}` : "Repository missing",
    };
  }

  const start = Math.min(input.startLine, input.endLine);
  const end = Math.max(input.startLine, input.endLine);
  if (end - start + 1 > MAX_EXPAND_LINES) {
    return {
      pathKey: input.pathKey,
      status: "missing",
      side,
      totalLines: 0,
      lines: [],
      error: `Expand at most ${MAX_EXPAND_LINES} lines at a time`,
    };
  }

  try {
    const loaded = await readSideText(repoCwd, path, side);
    if ("error" in loaded) {
      return {
        pathKey: input.pathKey,
        status: "missing",
        side,
        totalLines: 0,
        lines: [],
        error: loaded.error,
      };
    }

    const all = loaded.text.split("\n");
    if (all.length > 0 && all[all.length - 1] === "") all.pop();
    const lines: Array<{
      content: string;
      oldLineNumber: number | null;
      newLineNumber: number | null;
    }> = [];
    for (let line = start; line <= end && line <= all.length; line += 1) {
      lines.push({
        content: all[line - 1]!,
        oldLineNumber: side === "old" ? line : null,
        newLineNumber: side === "new" ? line : null,
      });
    }
    return {
      pathKey: input.pathKey,
      status: "ok",
      side,
      totalLines: all.length,
      lines,
      error: null,
    };
  } catch (error) {
    return {
      pathKey: input.pathKey,
      status: "missing",
      side,
      totalLines: 0,
      lines: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
