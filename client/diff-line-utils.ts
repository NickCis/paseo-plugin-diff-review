import type { DiffFile, DiffLine } from "../shared/rpc";

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
