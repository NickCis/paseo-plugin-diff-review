import { ExpandButton } from "./expand-button";
import type { DisplayGap } from "./diff-display";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

type Theme = PluginSurfaceProps["theme"];

export function ExpandGapButton({
  gap,
  totalLines,
  expandingKey,
  theme,
  onExpand,
}: {
  gap: DisplayGap;
  totalLines: number | null;
  expandingKey: string | null;
  theme: Theme;
  onExpand(gapId: string, startLine: number, endLine: number, side: "old" | "new"): void;
}) {
  return (
    <ExpandButton
      gapId={gap.id}
      startLine={gap.startLine}
      endLine={gap.endLine}
      totalLines={totalLines}
      expanding={expandingKey === `${gap.startLine}:${gap.endLine}`}
      theme={theme}
      onExpand={(gapId, start, end) => onExpand(gapId, start, end, gap.side)}
    />
  );
}
