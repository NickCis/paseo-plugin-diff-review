import { existsSync } from "node:fs";
import { join } from "node:path";
import { execCommand } from "@getpaseo/plugin/server";

export async function runGit(
  cwd: string,
  args: string[],
  options?: { acceptExitCodes?: number[] },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execCommand("git", ["--literal-pathspecs", ...args], {
      cwd,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const err = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const exitCode = typeof err.code === "number" ? err.code : 1;
    if (options?.acceptExitCodes?.includes(exitCode)) {
      return {
        stdout: typeof err.stdout === "string" ? err.stdout : "",
        stderr: typeof err.stderr === "string" ? err.stderr : "",
        exitCode,
      };
    }
    throw new Error(err.stderr?.trim() || err.message || `git ${args.join(" ")} failed`, {
      cause: error,
    });
  }
}

export function resolveSubmoduleCwd(parentCwd: string, subPath: string): string | null {
  const subCwd = join(parentCwd, subPath);
  if (!existsSync(subCwd) || !existsSync(join(subCwd, ".git"))) {
    return null;
  }
  return subCwd;
}

export async function listDirtySubmodulePaths(cwd: string): Promise<string[]> {
  const { stdout } = await runGit(cwd, ["status", "--porcelain=1", "-z"]);
  const entries = stdout.split("\0");
  const candidates = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.length < 4) continue;
    const index_status = entry[0];
    const worktree_status = entry[1];
    // In porcelain -z, a rename or copy lists its destination first,
    // followed by a separate NUL-terminated source path.
    if (/[RC]/.test(entry.slice(0, 2))) i++;
    if (
      index_status === "m" ||
      index_status === "M" ||
      worktree_status === "m" ||
      worktree_status === "M" ||
      worktree_status === "?"
    ) {
      candidates.add(entry.slice(3));
    }
  }
  if (candidates.size === 0) return [];

  // Intersect with index gitlinks in memory so the command length is independent
  // of the number of dirty paths, including when the SDK uses cmd.exe on Windows.
  const { stdout: index_entries } = await runGit(cwd, ["ls-files", "--stage", "-z"]);
  const gitlinks = new Set<string>();
  for (const entry of index_entries.split("\0")) {
    if (!entry.startsWith("160000 ")) continue;
    const path = entry.slice(entry.indexOf("\t") + 1);
    if (candidates.has(path)) gitlinks.add(path);
  }
  return [...gitlinks];
}
