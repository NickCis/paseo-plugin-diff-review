import type { DisplayLine } from "./diff-display";
import type { LineDraftRange } from "./line-draft-box";
import type { DiffFile, DiffLine } from "../shared/rpc";
import type { LineComment } from "../shared/settings";

export function lineSide(line: DiffLine): "old" | "new" | null {
  if (line.type === "del") return "old";
  if (line.type === "add") return "new";
  if (line.newLineNumber != null) return "new";
  if (line.oldLineNumber != null) return "old";
  return null;
}

export function lineNumberForSide(line: DiffLine, side: "old" | "new"): number | null {
  return side === "new" ? line.newLineNumber : line.oldLineNumber;
}

export function lineAxisNumber(line: DiffLine, axis: "old" | "new"): number | null {
  return axis === "new" ? line.newLineNumber : line.oldLineNumber;
}

export function expandAxis(file: DiffFile): "old" | "new" {
  return file.status === "deleted" ? "old" : "new";
}

export function lineInRange(
  line: DiffLine,
  range: { side: "old" | "new"; startLine: number; endLine: number },
): boolean {
  const number = lineNumberForSide(line, range.side);
  if (number == null) return false;
  const lo = Math.min(range.startLine, range.endLine);
  const hi = Math.max(range.startLine, range.endLine);
  return number >= lo && number <= hi;
}

export function commentsAfterLine(
  line: DisplayLine,
  lineComments: readonly LineComment[],
): LineComment[] {
  const matched: LineComment[] = [];
  for (const comment of lineComments) {
    const number = comment.side === "new" ? line.newLineNumber : line.oldLineNumber;
    if (number === comment.endLine) matched.push(comment);
  }
  return matched;
}

export function draftSelectionRange(
  draft: LineDraftRange | null,
): { side: "old" | "new"; startLine: number; endLine: number } | null {
  if (!draft) return null;
  return {
    side: draft.side,
    startLine: Math.min(draft.startLine, draft.endLine),
    endLine: Math.max(draft.startLine, draft.endLine),
  };
}

export function isDraftComposerLine(line: DisplayLine, draft: LineDraftRange): boolean {
  const side = lineSide(line);
  const lineNumber = side ? lineNumberForSide(line, side) : null;
  if (side == null || lineNumber == null) return false;
  return lineNumber === Math.max(draft.startLine, draft.endLine) && draft.side === side;
}
