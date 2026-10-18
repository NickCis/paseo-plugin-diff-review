import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { extendedThemeColors } from "./theme-colors";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { buildFileTree, flattenTree, type ChangeGlyph, type FlatTreeRow } from "./file-tree";
import type { DiffFile } from "../shared/rpc";
import type { FileProgress } from "../shared/settings";

interface FileListProps {
  files: readonly DiffFile[];
  progress: Record<string, FileProgress>;
  selectedPathKey: string | null;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  onSelect(pathKey: string): void;
}

const EMPTY_PROGRESS: FileProgress = { status: "unread", lineComments: [] };

function glyphStyle(
  glyph: ChangeGlyph,
  theme: PluginSurfaceProps["theme"],
): { symbol: string; color: string } {
  const colors = extendedThemeColors(theme);
  if (glyph === "add") return { symbol: "+", color: colors.diffAddition };
  if (glyph === "del") return { symbol: "−", color: colors.diffDeletion };
  return { symbol: "±", color: colors.foregroundMuted };
}

function DirRow({
  row,
  theme,
  compact,
  onToggle,
}: {
  row: Extract<FlatTreeRow, { kind: "dir" }>;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  onToggle(id: string): void;
}) {
  const styles = useMemo(
    () => ({
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        paddingVertical: compact ? 4 : 6,
        paddingLeft: 8 + row.depth * 14,
        paddingRight: 8,
      },
      name: {
        color: theme.colors.foregroundMuted,
        fontSize: compact ? 12 : 13,
        fontWeight: "600" as const,
      },
    }),
    [compact, row.depth, theme],
  );
  const toggle = useCallback(() => onToggle(row.id), [onToggle, row.id]);
  return (
    <Pressable accessibilityRole="button" onPress={toggle} style={styles.row}>
      <Icon
        name={row.expanded ? "ChevronDown" : "ChevronRight"}
        size={14}
        color={theme.colors.foregroundMuted}
      />
      <Text style={styles.name} numberOfLines={1}>
        {row.name}
      </Text>
    </Pressable>
  );
}

function FileRow({
  row,
  progress,
  selected,
  theme,
  compact,
  onSelect,
}: {
  row: Extract<FlatTreeRow, { kind: "file" }>;
  progress: FileProgress;
  selected: boolean;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  onSelect(pathKey: string): void;
}) {
  const glyph = glyphStyle(row.glyph, theme);
  const styles = useMemo(
    () => ({
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingVertical: compact ? 5 : 7,
        paddingLeft: 8 + row.depth * 14,
        paddingRight: 8,
        borderRadius: 6,
        backgroundColor: selected ? theme.colors.surface2 : "transparent",
        opacity: progress.status === "ignored" ? 0.5 : 1,
      },
      glyph: {
        width: 14,
        color: glyph.color,
        fontSize: 13,
        fontWeight: "700" as const,
        textAlign: "center" as const,
      },
      name: {
        flex: 1,
        color: theme.colors.foreground,
        fontSize: compact ? 13 : 14,
        textDecorationLine: progress.status === "seen" ? ("line-through" as const) : undefined,
      },
      badge: { color: theme.colors.foregroundMuted, fontSize: 11 },
    }),
    [compact, glyph.color, progress.status, row.depth, selected, theme],
  );
  const select = useCallback(() => onSelect(row.file.pathKey), [onSelect, row.file.pathKey]);
  return (
    <Pressable accessibilityRole="button" onPress={select} style={styles.row}>
      <Text style={styles.glyph}>{glyph.symbol}</Text>
      <Text style={styles.name} numberOfLines={1}>
        {row.name}
      </Text>
      {progress.status === "seen" ? <Text style={styles.badge}>viewed</Text> : null}
      {progress.status === "ignored" ? <Text style={styles.badge}>ignored</Text> : null}
      {progress.fileComment || progress.lineComments.length > 0 ? (
        <Icon name="MessageSquare" size={12} color={theme.colors.accent} />
      ) : null}
    </Pressable>
  );
}

export function FileList({
  files,
  progress,
  selectedPathKey,
  theme,
  compact,
  onSelect,
}: FileListProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const rows = useMemo(() => flattenTree(tree, collapsed), [collapsed, tree]);
  const styles = useMemo(() => ({ list: { gap: 1 } }), []);

  const toggleDir = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <View style={styles.list}>
      {rows.map((row) => {
        if (row.kind === "dir") {
          return (
            <DirRow
              key={row.id}
              row={row}
              theme={theme}
              compact={compact}
              onToggle={toggleDir}
            />
          );
        }
        return (
          <FileRow
            key={row.id}
            row={row}
            progress={progress[row.file.pathKey] ?? EMPTY_PROGRESS}
            selected={selectedPathKey === row.file.pathKey}
            theme={theme}
            compact={compact}
            onSelect={onSelect}
          />
        );
      })}
    </View>
  );
}
