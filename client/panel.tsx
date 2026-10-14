import { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { DiffView } from "./diff-view";
import { FileList } from "./file-list";
import { SendSheet } from "./send-sheet";
import { useDiffReview } from "./use-diff-review";
import { displayPathForKey, parsePathKey } from "../shared/paths";
import type { SendTarget } from "./send-review";

type HostNavigation = NonNullable<PluginWorkspacePanelProps["navigation"]> & {
  openFile?: (input: {
    workspaceId: string;
    path: string;
    serverId?: string;
  }) => void;
};

export function DiffReviewPanel({
  theme,
  layout,
  workspaceId,
  navigation,
}: PluginWorkspacePanelProps) {
  const toast = useToast();
  const review = useDiffReview(workspaceId);
  const hostNavigation = navigation as HostNavigation | undefined;
  const canViewFile = typeof hostNavigation?.openFile === "function";
  const sendToAgent = review.sendToAgent;
  const onSend = useCallback(
    (target: SendTarget) => {
      void sendToAgent(target, hostNavigation?.openAgent);
    },
    [hostNavigation?.openAgent, sendToAgent],
  );
  const selectedPathKey = review.selectedPathKey;
  const toggleViewed = review.toggleViewed;
  const ignoreFile = review.ignoreFile;
  const onToggleViewed = useCallback(() => {
    if (selectedPathKey) toggleViewed(selectedPathKey);
  }, [selectedPathKey, toggleViewed]);
  const onIgnore = useCallback(() => {
    if (selectedPathKey) ignoreFile(selectedPathKey);
  }, [ignoreFile, selectedPathKey]);
  const onViewFile = useCallback(() => {
    if (!selectedPathKey) return;
    const { submodulePath, path } = parsePathKey(selectedPathKey);
    const relative = submodulePath ? `${submodulePath}/${path}` : path;
    if (hostNavigation?.openFile) {
      hostNavigation.openFile({ workspaceId, path: relative });
      return;
    }
    toast.error("This host cannot open files in the editor yet.");
  }, [hostNavigation, selectedPathKey, toast, workspaceId]);
  const discardFile = review.discardFile;
  const onDiscardFile = useCallback(async () => {
    if (!selectedPathKey) return "No file selected";
    return discardFile(selectedPathKey);
  }, [discardFile, selectedPathKey]);

  const styles = useMemo(
    () => ({
      root: {
        flex: 1,
        minHeight: 0,
        backgroundColor: theme.colors.surface0,
        padding: layout.compact ? 12 : 16,
        gap: 12,
      },
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 8,
        flexWrap: "wrap" as const,
        flexShrink: 0,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: layout.compact ? 18 : 20,
        fontWeight: "600" as const,
      },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      actions: { flexDirection: "row" as const, gap: 8, flexWrap: "wrap" as const },
      button: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      buttonSecondary: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      buttonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      buttonSecondaryText: { color: theme.colors.foreground, fontWeight: "600" as const },
      body: layout.compact
        ? { flex: 1, minHeight: 0, gap: 12 }
        : { flex: 1, minHeight: 0, flexDirection: "row" as const, gap: 16 },
      listPane: layout.compact
        ? { maxHeight: "38%" as const, minHeight: 140, gap: 8 }
        : { width: 280, minWidth: 220, minHeight: 0, gap: 8 },
      detailPane: { flex: 1, minHeight: 0, gap: 8 },
      paneScroll: { flex: 1, minHeight: 0 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
    }),
    [layout.compact, theme],
  );

  if (!review.workspace || review.settings.status === "loading") {
    return (
      <View style={styles.root}>
        <Text style={styles.muted}>
          {!review.workspace ? "Loading workspace…" : "Loading review settings…"}
        </Text>
      </View>
    );
  }
  if (review.settings.status !== "ready") {
    return (
      <View style={styles.root}>
        <Text style={styles.error}>{review.settings.error}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={review.settings.reload}
          style={styles.buttonSecondary}
        >
          <Text style={styles.buttonSecondaryText}>Reload settings</Text>
        </Pressable>
      </View>
    );
  }

  const workspace = review.workspace;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Diff Review</Text>
          <Text style={styles.muted}>{workspace.title?.trim() || workspace.name}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={review.onRefreshPress}
            style={styles.buttonSecondary}
          >
            <Text style={styles.buttonSecondaryText}>Refresh</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={review.files.length === 0 || review.sending}
            onPress={review.openSend}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Send</Text>
          </Pressable>
        </View>
      </View>
      {review.statusMessage ? <Text style={styles.muted}>{review.statusMessage}</Text> : null}
      {review.progressError ? (
        <Pressable accessibilityRole="button" onPress={review.clearProgressError}>
          <Text style={styles.error}>{review.progressError} (tap to dismiss)</Text>
        </Pressable>
      ) : null}
      <View style={styles.body}>
        <View style={styles.listPane}>
          <Text style={styles.muted}>
            Viewed {review.counts.seen}/{review.counts.total}
            {review.counts.ignored > 0 ? ` · ignored ${review.counts.ignored}` : ""}
          </Text>
          {review.loadingSnapshot ? <Text style={styles.muted}>Refreshing…</Text> : null}
          {review.snapshotError ? <Text style={styles.error}>{review.snapshotError}</Text> : null}
          <ScrollView style={styles.paneScroll}>
            {review.files.length === 0 && !review.loadingSnapshot ? (
              <Text style={styles.muted}>No unstaged or untracked changes.</Text>
            ) : (
              <FileList
                files={review.files}
                progress={review.progress}
                selectedPathKey={review.selectedPathKey}
                theme={theme}
                compact={layout.compact}
                onSelect={review.selectFile}
              />
            )}
          </ScrollView>
        </View>
        <View style={styles.detailPane}>
          {review.selectedPathKey && review.selectedFile && review.cwd ? (
            <DiffView
              pathKey={review.selectedPathKey}
              displayPath={displayPathForKey(review.selectedPathKey)}
              file={review.selectedFile}
              cwd={review.cwd}
              status={review.hunkStatus}
              hunks={review.hunks}
              error={review.hunkError}
              progress={review.fileProgress}
              typography={review.typography}
              theme={theme}
              compact={layout.compact}
              platform={layout.platform}
              canViewFile={canViewFile}
              keyboardEnabled={!review.sendOpen}
              onToggleViewed={onToggleViewed}
              onIgnore={onIgnore}
              onViewFile={onViewFile}
              onDiscardFile={onDiscardFile}
              onChangeFileComment={review.onChangeFileComment}
              onSaveLineComment={review.onSaveLineComment}
              onDeleteLineComment={review.onDeleteLineComment}
            />
          ) : (
            <Text style={styles.muted}>Select a file to review.</Text>
          )}
        </View>
      </View>
      <SendSheet
        open={review.sendOpen}
        onOpenChange={review.setSendOpen}
        workspaceId={workspaceId}
        theme={theme}
        sending={review.sending}
        note={review.sendNote}
        onNoteChange={review.setSendNote}
        includeFileLists={review.includeFileLists}
        onIncludeFileListsChange={review.setIncludeFileLists}
        onSend={onSend}
      />
    </View>
  );
}
