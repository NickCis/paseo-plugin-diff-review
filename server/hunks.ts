import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import { parsePathKey } from "../shared/paths";
import type { DiffHunk, DiffLine } from "../shared/rpc";
import { diffHunksRpc } from "../shared/rpc";
import { resolveSubmoduleCwd, runGit } from "./git";

const MAX_DIFF_BYTES = 1024 * 1024;

function parseUnifiedDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of diffText.split("\n")) {
    const hunkMatch = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch) {
      if (current) hunks.push(current);
      oldLine = Number.parseInt(hunkMatch[1]!, 10);
      newLine = Number.parseInt(hunkMatch[3]!, 10);
      current = {
        header: raw,
        oldStart: oldLine,
        oldCount: Number.parseInt(hunkMatch[2] ?? "1", 10),
        newStart: newLine,
        newCount: Number.parseInt(hunkMatch[4] ?? "1", 10),
        lines: [],
      };
      continue;
    }
    if (!current) continue;
    if (
      raw.startsWith("diff --git") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ")
    ) {
      continue;
    }
    const prefix = raw[0];
    let line: DiffLine;
    if (prefix === "+") {
      line = {
        type: "add",
        content: raw.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine,
      };
      newLine += 1;
    } else if (prefix === "-") {
      line = {
        type: "del",
        content: raw.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: null,
      };
      oldLine += 1;
    } else if (prefix === "\\" || raw === "") {
      continue;
    } else {
      const content = prefix === " " ? raw.slice(1) : raw;
      line = {
        type: "context",
        content,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      };
      oldLine += 1;
      newLine += 1;
    }
    current.lines.push(line);
  }
  if (current) hunks.push(current);
  return hunks;
}

async function isLikelyBinary(absolutePath: string): Promise<boolean> {
  try {
    const handle = await readFile(absolutePath);
    const sample = handle.subarray(0, 16 * 1024);
    return sample.includes(0);
  } catch {
    return false;
  }
}

export async function getDiffHunks(input: RpcInput<typeof diffHunksRpc>): Promise<{
  pathKey: string;
  status: "ok" | "binary" | "too_large" | "missing";
  hunks: DiffHunk[];
  error: string | null;
}> {
  const { submodulePath, path } = parsePathKey(input.pathKey);
  const repoCwd = submodulePath ? resolveSubmoduleCwd(input.cwd, submodulePath) : input.cwd;
  if (!repoCwd) {
    return {
      pathKey: input.pathKey,
      status: "missing",
      hunks: [],
      error: submodulePath ? `Submodule checkout missing: ${submodulePath}` : "Repository missing",
    };
  }

  if (path === ".") {
    return {
      pathKey: input.pathKey,
      status: "ok",
      hunks: [
        {
          header: "@@ -0,0 +0,0 @@",
          oldStart: 0,
          oldCount: 0,
          newStart: 0,
          newCount: 0,
          lines: [
            {
              type: "header",
              content:
                "Submodule pointer or dirtiness changed; expand nested files when available.",
              oldLineNumber: null,
              newLineNumber: null,
            },
          ],
        },
      ],
      error: null,
    };
  }

  const absolute = join(repoCwd, path);
  if (await isLikelyBinary(absolute)) {
    return { pathKey: input.pathKey, status: "binary", hunks: [], error: null };
  }

  try {
    // Untracked files need --no-index against /dev/null.
    const status = await runGit(repoCwd, ["status", "--porcelain=1", "--", path], {
      acceptExitCodes: [0],
    });
    const isUntracked = status.stdout.startsWith("??");
    const isDeleted = status.stdout.length >= 2 && status.stdout[1] === "D";

    // Deleted worktree files: sample HEAD blob for NULs; numstat "-" also marks binary.
    if (isDeleted) {
      const shown = await runGit(repoCwd, ["show", `HEAD:${path}`], {
        acceptExitCodes: [0, 128],
      });
      if (shown.exitCode === 0 && shown.stdout.includes("\0")) {
        return { pathKey: input.pathKey, status: "binary", hunks: [], error: null };
      }
    }

    const numstat = await runGit(repoCwd, ["diff", "--numstat", "--", path], {
      acceptExitCodes: [0, 1],
    });
    if (/^-\t-\t/.test(numstat.stdout.trim())) {
      return { pathKey: input.pathKey, status: "binary", hunks: [], error: null };
    }

    const diff = isUntracked
      ? await runGit(repoCwd, ["diff", "--no-index", "--", "/dev/null", path], {
          acceptExitCodes: [0, 1],
        })
      : await runGit(repoCwd, ["diff", "--", path], { acceptExitCodes: [0, 1] });

    if (
      /Binary files .* differ/i.test(diff.stdout) ||
      /Binary files .* differ/i.test(diff.stderr)
    ) {
      return { pathKey: input.pathKey, status: "binary", hunks: [], error: null };
    }

    if (Buffer.byteLength(diff.stdout, "utf8") > MAX_DIFF_BYTES) {
      return { pathKey: input.pathKey, status: "too_large", hunks: [], error: null };
    }
    if (!diff.stdout.trim()) {
      return { pathKey: input.pathKey, status: "ok", hunks: [], error: null };
    }
    return {
      pathKey: input.pathKey,
      status: "ok",
      hunks: parseUnifiedDiff(diff.stdout),
      error: null,
    };
  } catch (error) {
    return {
      pathKey: input.pathKey,
      status: "missing",
      hunks: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
