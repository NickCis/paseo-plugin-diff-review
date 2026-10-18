import type { DiffHunk, DiffLine } from "../shared/rpc";
import { lineAxisNumber } from "./diff-line-utils";

export type DisplayLine = DiffLine & { id: string; source: "hunk" | "expand" };

export interface DisplayGap {
  id: string;
  side: "old" | "new";
  startLine: number;
  endLine: number;
  beforeId: string | null;
}

export const EXPAND_CHUNK = 20;

export function buildDisplay(
  hunks: readonly DiffHunk[],
  expanded: Map<string, DisplayLine[]>,
  totalLines: number | null,
  axis: "old" | "new",
): {
  lines: DisplayLine[];
  gaps: DisplayGap[];
} {
  const lines: DisplayLine[] = [];
  const gaps: DisplayGap[] = [];
  let previousAxis: number | null = null;
  let previousId: string | null = null;

  const expandedBlocks = [...expanded.entries()]
    .map(([key, block]) => {
      const [startText, endText] = key.split(":");
      const start = Number(startText);
      const end = Number(endText);
      return { start, end, block, key };
    })
    .filter((entry) => Number.isFinite(entry.start) && Number.isFinite(entry.end))
    .sort((left, right) => left.start - right.start);

  const emitChunk = (
    gapStart: number,
    gapEnd: number,
    beforeId: string | null,
    direction: "up" | "down",
  ) => {
    let end = gapEnd;
    if (totalLines != null) end = Math.min(end, totalLines);
    if (gapStart > end) return;
    let chunkStart = gapStart;
    let chunkEnd = end;
    if (end - gapStart + 1 > EXPAND_CHUNK) {
      if (direction === "up") {
        chunkStart = end - EXPAND_CHUNK + 1;
        chunkEnd = end;
      } else {
        chunkStart = gapStart;
        chunkEnd = gapStart + EXPAND_CHUNK - 1;
      }
    }
    gaps.push({
      id: `gap:${axis}:${chunkStart}-${chunkEnd}`,
      side: axis,
      startLine: chunkStart,
      endLine: chunkEnd,
      beforeId,
    });
  };

  const fillGap = (
    gapStart: number,
    gapEnd: number,
    beforeId: string | null,
    direction: "up" | "down",
  ) => {
    let cursor = gapStart;
    let lastId = beforeId;
    const blocks = expandedBlocks.filter(
      (block) => block.end >= gapStart && block.start <= gapEnd,
    );
    for (const block of blocks) {
      if (block.start > cursor) {
        emitChunk(cursor, block.start - 1, lastId, direction);
      }
      for (const line of block.block) {
        lines.push(line);
        lastId = line.id;
      }
      cursor = Math.max(cursor, block.end + 1);
    }
    if (cursor <= gapEnd) emitChunk(cursor, gapEnd, lastId, direction);
  };

  for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex += 1) {
    const hunk = hunks[hunkIndex]!;
    const firstAxis =
      hunk.lines.map((line) => lineAxisNumber(line, axis)).find((value) => value != null) ?? null;

    if (firstAxis != null && previousAxis != null && firstAxis > previousAxis + 1) {
      fillGap(previousAxis + 1, firstAxis - 1, previousId, "down");
    } else if (firstAxis != null && previousAxis == null && firstAxis > 1) {
      fillGap(1, firstAxis - 1, null, "up");
    }

    for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex += 1) {
      const line = hunk.lines[lineIndex]!;
      const id = `h${hunkIndex}:${lineIndex}:${line.type}:${line.oldLineNumber ?? "-"}:${line.newLineNumber ?? "-"}`;
      lines.push({ ...line, id, source: "hunk" });
      const axisNumber = lineAxisNumber(line, axis);
      if (axisNumber != null) {
        previousAxis = axisNumber;
        previousId = id;
      }
    }
  }

  if (previousAxis != null) {
    const bottomEnd = totalLines ?? previousAxis + EXPAND_CHUNK;
    if (previousAxis < bottomEnd) {
      fillGap(previousAxis + 1, bottomEnd, previousId, "down");
    }
  }

  return { lines, gaps };
}

export function gapsByBeforeId(gaps: readonly DisplayGap[]): Map<string | null, DisplayGap[]> {
  const grouped = new Map<string | null, DisplayGap[]>();
  for (const gap of gaps) {
    const list = grouped.get(gap.beforeId) ?? [];
    list.push(gap);
    grouped.set(gap.beforeId, list);
  }
  return grouped;
}
