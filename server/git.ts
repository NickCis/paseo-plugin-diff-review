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
  const { stdout } = await runGit(cwd, ["status", "--porcelain=1"], { acceptExitCodes: [0] });
  const candidates: string[] = [];
  for (const line of stdout
    .split("\n")
    .map((entry) => entry.trimEnd())
    .filter(Boolean)) {
    if (line.length < 4) continue;
    const indexStatus = line[0];
    const worktreeStatus = line[1];
    const dirty =
      indexStatus === "m" ||
      indexStatus === "M" ||
      worktreeStatus === "m" ||
      worktreeStatus === "M" ||
      worktreeStatus === "?";
    if (!dirty) continue;
    const pathField = line.slice(3);
    const path = pathField.includes(" -> ")
      ? (pathField.split(" -> ").at(-1) ?? pathField)
      : pathField;
    if (path) candidates.push(path);
  }
  if (candidates.length === 0) return [];

  const { stdout: lsOut } = await runGit(cwd, ["ls-files", "-s", "--", ...candidates], {
    acceptExitCodes: [0],
  });
  const gitlinks: string[] = [];
  for (const line of lsOut
    .split("\n")
    .map((entry) => entry.trimEnd())
    .filter(Boolean)) {
    const match = line.match(/^160000 [0-9a-f]+ \d+\t(.+)$/);
    if (match?.[1]) gitlinks.push(match[1]);
  }
  return gitlinks;
}
