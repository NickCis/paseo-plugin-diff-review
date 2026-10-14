import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import { makePathKey } from "../shared/paths";
import type { DiffFile } from "../shared/rpc";
import { diffSnapshotRpc } from "../shared/rpc";
import { listDirtySubmodulePaths, resolveSubmoduleCwd, runGit } from "./git";

type NameStatus = DiffFile["status"];

function mapStatus(code: string): NameStatus {
  switch (code[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "renamed";
    case "?":
      return "untracked";
    default:
      return "modified";
  }
}

async function listUnstagedNameStatus(
  cwd: string,
): Promise<Array<{ status: NameStatus; path: string; oldPath?: string }>> {
  const tracked = await runGit(cwd, ["diff", "--name-status", "--find-renames"], {
    acceptExitCodes: [0, 1],
  });
  const untracked = await runGit(cwd, ["ls-files", "--others", "--exclude-standard", "-z"], {
    acceptExitCodes: [0],
  });

  const entries: Array<{ status: NameStatus; path: string; oldPath?: string }> = [];
  for (const line of tracked.stdout
    .split("\n")
    .map((entry) => entry.trimEnd())
    .filter(Boolean)) {
    const parts = line.split("\t");
    const code = parts[0] ?? "";
    if (parts.length >= 3 && (code.startsWith("R") || code.startsWith("C"))) {
      entries.push({
        status: "renamed",
        oldPath: parts[1],
        path: parts[2]!,
      });
      continue;
    }
    if (parts.length >= 2) {
      entries.push({ status: mapStatus(code), path: parts[1]! });
    }
  }

  for (const path of untracked.stdout.split("\0").filter(Boolean)) {
    entries.push({ status: "untracked", path });
  }
  return entries;
}

async function listNumstat(
  cwd: string,
): Promise<Map<string, { additions: number; deletions: number; binary: boolean }>> {
  const { stdout } = await runGit(cwd, ["diff", "--numstat"], { acceptExitCodes: [0, 1] });
  const map = new Map<string, { additions: number; deletions: number; binary: boolean }>();
  for (const line of stdout
    .split("\n")
    .map((entry) => entry.trimEnd())
    .filter(Boolean)) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) continue;
    const pathField = match[3]!;
    let path = pathField;
    if (pathField.includes(" => ")) {
      path = (pathField.split(" => ").at(-1) ?? pathField).replace(/[{}]/g, "");
    } else if (pathField.includes("\t")) {
      path = pathField.split("\t").at(-1)!;
    }
    const binary = match[1] === "-" || match[2] === "-";
    map.set(path, {
      additions: binary ? 0 : Number.parseInt(match[1]!, 10),
      deletions: binary ? 0 : Number.parseInt(match[2]!, 10),
      binary,
    });
  }
  return map;
}

async function countUntrackedLines(cwd: string, path: string): Promise<number> {
  try {
    const text = await readFile(join(cwd, path), "utf8");
    if (text.includes("\0")) return 0;
    const lines = text.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.length;
  } catch {
    return 0;
  }
}

async function listRepoFiles(cwd: string, submodulePath: string | null): Promise<DiffFile[]> {
  const [entries, numstat] = await Promise.all([listUnstagedNameStatus(cwd), listNumstat(cwd)]);
  const files: DiffFile[] = [];
  for (const entry of entries) {
    const stats = numstat.get(entry.path);
    let additions = stats?.additions ?? 0;
    let deletions = stats?.deletions ?? 0;
    if (entry.status === "untracked" && !stats) {
      additions = await countUntrackedLines(cwd, entry.path);
    }
    files.push({
      pathKey: makePathKey({ submodulePath, path: entry.path }),
      path: entry.path,
      submodulePath,
      kind: submodulePath ? "submodule" : "file",
      status: stats?.binary ? "binary" : entry.status,
      additions,
      deletions,
      ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
    });
  }
  return files;
}

export async function getDiffSnapshot(
  input: RpcInput<typeof diffSnapshotRpc>,
): Promise<{ files: DiffFile[]; error: string | null }> {
  try {
    const parentFiles = await listRepoFiles(input.cwd, null);
    const dirtySubs = await listDirtySubmodulePaths(input.cwd);
    const nested: DiffFile[] = [];
    for (const subPath of dirtySubs.sort()) {
      const subCwd = resolveSubmoduleCwd(input.cwd, subPath);
      if (!subCwd) {
        nested.push({
          pathKey: makePathKey({ submodulePath: subPath, path: "." }),
          path: ".",
          submodulePath: subPath,
          kind: "submodule",
          status: "modified",
          additions: 0,
          deletions: 0,
        });
        continue;
      }
      const childFiles = await listRepoFiles(subCwd, subPath);
      if (childFiles.length === 0) {
        nested.push({
          pathKey: makePathKey({ submodulePath: subPath, path: "." }),
          path: ".",
          submodulePath: subPath,
          kind: "submodule",
          status: "modified",
          additions: 0,
          deletions: 0,
        });
        continue;
      }
      nested.push(...childFiles);
    }

    // Drop parent gitlink rows when we expanded nested content for that path.
    const expanded = new Set(dirtySubs);
    const files = [...parentFiles.filter((file) => !expanded.has(file.path)), ...nested].sort(
      (left, right) => {
        const leftGroup = left.submodulePath ?? "";
        const rightGroup = right.submodulePath ?? "";
        if (leftGroup !== rightGroup) return leftGroup < rightGroup ? -1 : 1;
        if (left.path < right.path) return -1;
        if (left.path > right.path) return 1;
        return 0;
      },
    );

    return { files, error: null };
  } catch (error) {
    return {
      files: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
