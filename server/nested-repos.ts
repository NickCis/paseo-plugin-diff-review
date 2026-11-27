import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { NESTED_REPOS_CONFIG_FILE } from "../shared/nested-repos";
import { runGit } from "./git";

/** How many directory levels below an untracked/ignored folder to search for a `.git`. */
const MAX_SCAN_DEPTH = 3;
/** Upper bound on directories read while scanning, so huge ignored trees stay cheap. */
const MAX_SCANNED_DIRS = 2_000;
/** Folders that never hold repos worth reviewing and are often very large. */
const SKIPPED_DIR_NAMES = new Set([
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  "dist",
  "build",
  "target",
  ".next",
  ".turbo",
  ".gradle",
]);

export interface NestedRepoOptions {
  autoDetect: boolean;
  configFile: boolean;
}

export interface NestedReposConfig {
  repos: string[];
  exclude: string[];
}

function hasGitDir(absolutePath: string): boolean {
  return existsSync(join(absolutePath, ".git"));
}

/** Normalize to a forward-slash path relative to the repo root, or null if it escapes / is unusable. */
function toRepoRelative(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!trimmed || isAbsolute(trimmed)) return null;
  const normalized = normalize(trimmed).split(sep).join("/");
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) return null;
  // Path keys use ":" to separate the owning repo from the nested path.
  if (normalized.includes(":")) return null;
  return normalized;
}

function segmentPattern(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")}$`);
}

/** Match a repo-relative path against a pattern where `*` / `?` stay within one segment. */
export function matchesPattern(path: string, pattern: string): boolean {
  const pathParts = path.split("/");
  const patternParts = pattern.split("/");
  if (pathParts.length !== patternParts.length) return false;
  return patternParts.every((part, index) => segmentPattern(part).test(pathParts[index]!));
}

/** Expand a `*` / `?` pattern against the filesystem, returning existing directories. */
async function expandPattern(cwd: string, pattern: string): Promise<string[]> {
  let current = [""];
  for (const part of pattern.split("/")) {
    const next: string[] = [];
    const wildcard = /[*?]/.test(part);
    for (const base of current) {
      if (!wildcard) {
        next.push(base ? `${base}/${part}` : part);
        continue;
      }
      try {
        const entries = await readdir(join(cwd, base), { withFileTypes: true });
        const regex = segmentPattern(part);
        for (const entry of entries) {
          if (entry.isDirectory() && regex.test(entry.name)) {
            next.push(base ? `${base}/${entry.name}` : entry.name);
          }
        }
      } catch {
        // Missing directory: the pattern simply matches nothing here.
      }
    }
    current = next;
  }
  return current;
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** Read `.diff-review.json` from the working tree. Missing file → null; invalid file → throws. */
export async function readNestedReposConfig(cwd: string): Promise<NestedReposConfig | null> {
  let text: string;
  try {
    text = await readFile(join(cwd, NESTED_REPOS_CONFIG_FILE), "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${NESTED_REPOS_CONFIG_FILE}: ${message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${NESTED_REPOS_CONFIG_FILE}: expected a JSON object`);
  }
  const record = parsed as Record<string, unknown>;
  const normalizeList = (list: string[]) =>
    list.map(toRepoRelative).filter((entry): entry is string => entry !== null);
  return {
    repos: normalizeList(parseStringList(record.repos)),
    exclude: normalizeList(parseStringList(record.exclude)),
  };
}

/**
 * Untracked and ignored folders that hold their own `.git` (e.g. repos cloned by a setup
 * script into a gitignored folder). Git does not descend into these, so we look ourselves.
 */
export async function detectUntrackedNestedRepos(cwd: string): Promise<string[]> {
  // No exclude rules: list ignored and plain untracked entries alike, collapsed to folders.
  const { stdout } = await runGit(cwd, ["ls-files", "--others", "--directory", "-z"], {
    acceptExitCodes: [0],
  });
  const found: string[] = [];
  let budget = MAX_SCANNED_DIRS;

  const scan = async (relative: string, depth: number): Promise<void> => {
    if (budget <= 0) return;
    const absolute = join(cwd, relative);
    if (hasGitDir(absolute)) {
      found.push(relative);
      return;
    }
    if (depth >= MAX_SCAN_DEPTH) return;
    budget -= 1;
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === ".git" || SKIPPED_DIR_NAMES.has(entry.name)) {
        continue;
      }
      await scan(`${relative}/${entry.name}`, depth + 1);
    }
  };

  for (const entry of stdout.split("\0")) {
    if (!entry.endsWith("/")) continue;
    const relative = toRepoRelative(entry);
    if (!relative) continue;
    const name = relative.split("/").at(-1)!;
    if (SKIPPED_DIR_NAMES.has(name)) continue;
    await scan(relative, 0);
  }
  return found;
}

/** Nested repos (beyond submodules) to review, honoring the enabled discovery sources. */
export async function listExtraNestedRepos(
  cwd: string,
  options: NestedRepoOptions,
): Promise<{ repos: string[]; exclude: string[]; warning: string | null }> {
  const repos = new Set<string>();
  let exclude: string[] = [];
  let warning: string | null = null;

  if (options.autoDetect) {
    for (const path of await detectUntrackedNestedRepos(cwd)) repos.add(path);
  }

  if (options.configFile) {
    let config: NestedReposConfig | null = null;
    try {
      config = await readNestedReposConfig(cwd);
    } catch (error) {
      // A broken config file should not hide the rest of the review.
      warning = error instanceof Error ? error.message : String(error);
    }
    if (config) {
      exclude = config.exclude;
      for (const pattern of config.repos) {
        for (const path of await expandPattern(cwd, pattern)) {
          if (hasGitDir(join(cwd, path))) repos.add(path);
        }
      }
    }
  }

  const kept = [...repos].filter(
    (path) => !exclude.some((pattern) => matchesPattern(path, pattern)),
  );
  return { repos: kept, exclude, warning };
}
