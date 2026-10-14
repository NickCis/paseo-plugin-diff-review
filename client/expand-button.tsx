import { useCallback, useMemo } from "react";
import { Pressable, Text } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

type Theme = PluginSurfaceProps["theme"];

export function ExpandButton({
  gapId,
  startLine,
  endLine,
  totalLines,
  expanding,
  theme,
  onExpand,
}: {
  gapId: string;
  startLine: number;
  endLine: number;
  totalLines: number | null;
  expanding: boolean;
  theme: Theme;
  onExpand(gapId: string, startLine: number, endLine: number): void;
}) {
  const visibleEnd = Math.min(endLine, totalLines ?? endLine);
  const hidden = Math.max(0, visibleEnd - startLine + 1);
  const hiddenCompletely = totalLines != null && startLine > totalLines;
  const styles = useMemo(
    () => ({
      expand: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: theme.colors.surface2,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      expandText: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" as const },
    }),
    [theme],
  );
  const press = useCallback(() => {
    onExpand(gapId, startLine, endLine);
  }, [endLine, gapId, onExpand, startLine]);

  if (hiddenCompletely) return null;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={expanding}
      onPress={press}
      style={styles.expand}
    >
      <Text style={styles.expandText}>
        {expanding ? "Expanding…" : `Expand lines ${startLine}–${visibleEnd} (${hidden} hidden)`}
      </Text>
    </Pressable>
  );
}
