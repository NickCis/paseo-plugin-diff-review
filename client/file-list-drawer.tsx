import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { FileList } from "./file-list";
import type { DiffFile } from "../shared/rpc";
import type { FileProgress } from "../shared/settings";

type Theme = PluginSurfaceProps["theme"];

export function FileListDrawer({
  open,
  onClose,
  theme,
  compact,
  files,
  progress,
  selectedPathKey,
  counts,
  loadingSnapshot,
  snapshotError,
  onSelect,
}: {
  open: boolean;
  onClose(): void;
  theme: Theme;
  compact: boolean;
  files: readonly DiffFile[];
  progress: Record<string, FileProgress>;
  selectedPathKey: string | null;
  counts: { seen: number; total: number; ignored: number };
  loadingSnapshot: boolean;
  snapshotError: string | null;
  onSelect(pathKey: string): void;
}) {
  if (!open) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 50,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close file list"
        onPress={onClose}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "86%",
          maxWidth: 360,
          backgroundColor: theme.colors.surface1,
          borderLeftWidth: 1,
          borderLeftColor: theme.colors.border,
          paddingTop: 12,
          paddingHorizontal: 12,
          paddingBottom: 16,
          gap: 10,
          elevation: 24,
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: -4, height: 0 },
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 16,
              fontWeight: "600",
              flex: 1,
            }}
          >
            Changed files
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close file list"
            onPress={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="X" size={16} color={theme.colors.foreground} />
          </Pressable>
        </View>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
          Viewed {counts.seen}/{counts.total}
          {counts.ignored > 0 ? ` · ignored ${counts.ignored}` : ""}
        </Text>
        {loadingSnapshot ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>Refreshing…</Text>
        ) : null}
        {snapshotError ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>{snapshotError}</Text>
        ) : null}
        <ScrollView style={{ flex: 1, minHeight: 0 }}>
          {files.length === 0 && !loadingSnapshot ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
              No unstaged or untracked changes.
            </Text>
          ) : (
            <FileList
              files={files}
              progress={progress}
              selectedPathKey={selectedPathKey}
              theme={theme}
              compact={compact}
              onSelect={(pathKey) => {
                onSelect(pathKey);
                onClose();
              }}
            />
          )}
        </ScrollView>
      </View>
    </View>
  );
}
