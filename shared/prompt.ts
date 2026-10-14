import { displayPathForKey } from "./paths";
import type { FileProgress, LineComment, ReviewSettingsValues } from "./settings";

type FileEntry = { pathKey: string; progress: FileProgress };

function bulletList(files: readonly FileEntry[]): string {
  return files.map((file) => `- ${displayPathForKey(file.pathKey)}`).join("\n");
}

function lineRange(comment: LineComment): string {
  return comment.startLine === comment.endLine
    ? `${comment.startLine}`
    : `${comment.startLine}-${comment.endLine}`;
}

/**
 * Numbered comments across all files, anchored to `path:line` (tuicr-style).
 * Removed lines are marked so the agent knows which side of the diff they refer to.
 */
function formatComments(files: readonly FileEntry[]): string[] {
  const entries: string[] = [];
  for (const file of files) {
    const path = displayPathForKey(file.pathKey);
    const note = file.progress.fileComment?.trim();
    const items: Array<{ anchor: string; body: string }> = [];
    if (note) items.push({ anchor: `\`${path}\` (file note)`, body: note });
    for (const comment of file.progress.lineComments) {
      const body = comment.body.trim();
      if (!body) continue;
      const removed = comment.side === "old" ? " (removed)" : "";
      items.push({ anchor: `\`${path}:${lineRange(comment)}\`${removed}`, body });
    }
    for (const item of items) {
      const index = entries.length + 1;
      const body = item.body.replaceAll("\n", "\n   ");
      entries.push(`${index}. ${item.anchor}: ${body}`);
    }
  }
  return entries;
}

export function expandPromptTemplate(input: {
  template: string;
  workspaceName: string;
  reviewComment: string;
  includeFileLists: boolean;
  files: readonly FileEntry[];
}): string {
  const nonIgnored = input.files.filter((file) => file.progress.status !== "ignored");
  const seen = nonIgnored.filter((file) => file.progress.status === "seen");
  const ignored = input.files.filter((file) => file.progress.status === "ignored");
  const seenUncommented = seen.filter(
    (file) => !file.progress.fileComment?.trim() && file.progress.lineComments.length === 0,
  );

  const comments = formatComments(input.files);
  const values: Record<string, string> = {
    workspace: input.workspaceName,
    comments: comments.length > 0 ? comments.join("\n") : "_No comments._",
    reviewComment: input.reviewComment.trim() || "_None._",
    // Legacy placeholders, still supported for templates saved by earlier versions.
    seenCount: String(seen.length),
    totalCount: String(nonIgnored.length),
    ignoredCount: String(ignored.length),
    seenUncommented: seenUncommented.length > 0 ? bulletList(seenUncommented) : "_None._",
    seenFiles: seen.length > 0 ? bulletList(seen) : "_None._",
  };

  // Single pass so placeholder-like text inside comments is never expanded.
  const prompt = input.template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? values[key]! : match,
  );

  const sections = [prompt.trimEnd()];
  if (input.includeFileLists) {
    if (seen.length > 0) sections.push(`## Viewed files\n${bulletList(seen)}`);
    if (ignored.length > 0) sections.push(`## Ignored files\n${bulletList(ignored)}`);
  }
  return sections.join("\n\n");
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
