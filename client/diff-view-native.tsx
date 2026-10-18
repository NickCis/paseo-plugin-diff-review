import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { diffPalette } from "./colors";
import { diffCommentBoxStyle } from "./diff-comment-layout";
import { type DisplayLine, buildDisplay, gapsByBeforeId } from "./diff-display";
import { DiffLineRow } from "./diff-line-row";
import { expandAxis, lineInRange, lineNumberForSide, lineSide } from "./diff-line-utils";
import { ExpandButton } from "./expand-button";
import { FileHeader } from "./file-header";
import { InlineCommentCard } from "./inline-comment";
import { composerKeyProps } from "./keyboard";
import { commentKey } from "./progress";
import { diffContextRpc } from "../shared/rpc";
import type { LineComment } from "../shared/settings";
import type { DiffViewProps } from "./diff-view-props";
import { useScrollComposerIntoView } from "./use-scroll-composer-into-view";

type DraftRange = { side: "old" | "new"; startLine: number; endLine: number };

function NativeLineDraftBox({
  range,
  theme,
  onSave,
  onCancel,
}: {
  range: DraftRange;
  theme: DiffViewProps["theme"];
  onSave(body: string): Promise<void>;
  onCancel(): void;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const save = useCallback(() => {
    if (saving || !body.trim()) return;
    setSaving(true);
    void onSave(body).finally(() => setSaving(false));
  }, [body, onSave, saving]);
  const keyProps = useMemo(() => composerKeyProps({ onSave: save, onCancel }), [onCancel, save]);
  const styles = useMemo(
    () => ({
      box: {
        ...diffCommentBoxStyle,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.surface1,
        gap: 8,
      },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        padding: 10,
        color: theme.colors.foreground,
        minHeight: 64,
        textAlignVertical: "top" as const,
      },
      actions: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
      button: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.accent,
      },
      buttonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      cancel: { color: theme.colors.accent, fontWeight: "600" as const },
    }),
    [theme],
  );
  const lo = Math.min(range.startLine, range.endLine);
  const hi = Math.max(range.startLine, range.endLine);

  return (
    <View style={styles.box}>
      <Text style={styles.muted}>
        Comment on {range.side} L{lo}
        {lo !== hi ? `–${hi}` : ""}
      </Text>
      <TextInput
        multiline
        value={body}
        onChangeText={setBody}
        placeholder="Line comment"
        placeholderTextColor={theme.colors.foregroundMuted}
        style={styles.input}
        autoFocus
        {...keyProps}
      />
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={save} style={styles.button} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? "Saving…" : "Save comment"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Native diff renderer — plain rows, single vertical scroll, shared display logic with web. */
export function NativeDiffView({
  pathKey,
  displayPath,
  file,
  cwd,
  status,
  hunks,
  error,
  progress,
  typography,
  theme,
  compact,
  platform,
  canViewFile,
  panelActions,
  onToggleViewed,
  onIgnore,
  onViewFile,
  onDiscardFile,
  onChangeFileComment,
  onSaveLineComment,
  onDeleteLineComment,
}: DiffViewProps) {
  const loadContext = useRpc(diffContextRpc);
  const toast = useToast();
  const palette = useMemo(() => diffPalette(theme), [theme]);
  const axis = expandAxis(file);
  const [expanded, setExpanded] = useState<Map<string, DisplayLine[]>>(() => new Map());
  const [expandingKey, setExpandingKey] = useState<string | null>(null);
  const [totalLines, setTotalLines] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftRange | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [fileCommentOpen, setFileCommentOpen] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const composerActive = draft != null || editingKey != null;
  useScrollComposerIntoView(scrollRef, composerActive);

  useEffect(() => {
    setExpanded(new Map());
    setExpandingKey(null);
    setTotalLines(null);
    setDraft(null);
    setEditingKey(null);
    setFileCommentOpen(false);
  }, [pathKey]);

  const { lines, gaps } = useMemo(
    () => buildDisplay(hunks, expanded, totalLines, axis),
    [axis, expanded, hunks, totalLines],
  );
  const gapByBefore = useMemo(() => gapsByBeforeId(gaps), [gaps]);

  const styles = useMemo(
    () => ({
      root: { flex: 1, minHeight: 0, gap: 0, alignSelf: "stretch" as const, width: "100%" as const },
      scroll: { flex: 1, minHeight: 0 },
      scrollContent: {
        gap: 12,
        paddingTop: 12,
        paddingBottom: composerActive ? 280 : 24,
      },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      hunk: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        overflow: "hidden" as const,
        alignSelf: "stretch" as const,
        width: "100%" as const,
      },
    }),
    [composerActive, theme],
  );

  const onExpand = useCallback(
    async (_gapId: string, startLine: number, endLine: number, side: "old" | "new") => {
      const key = `${startLine}:${endLine}`;
      setExpandingKey(key);
      try {
        const result = await loadContext({ cwd, pathKey, side, startLine, endLine });
        if (result.status !== "ok") {
          toast.error(result.error ?? "Could not expand context");
          return;
        }
        setTotalLines(result.totalLines);
        const block: DisplayLine[] = result.lines.map((line, index) => ({
          id: `x:${side}:${line.oldLineNumber ?? line.newLineNumber ?? index}`,
          type: "context" as const,
          content: line.content,
          oldLineNumber: line.oldLineNumber,
          newLineNumber: line.newLineNumber,
          source: "expand" as const,
        }));
        setExpanded((current) => {
          const next = new Map(current);
          next.set(key, block);
          return next;
        });
      } catch (expandError) {
        toast.error(expandError instanceof Error ? expandError.message : String(expandError));
      } finally {
        setExpandingKey(null);
      }
    },
    [cwd, loadContext, pathKey, toast],
  );

  const applyTapSelection = useCallback((side: "old" | "new", line: number) => {
    setDraft((current) => {
      if (!current || current.side !== side) {
        return { side, startLine: line, endLine: line };
      }
      const lo = Math.min(current.startLine, current.endLine);
      const hi = Math.max(current.startLine, current.endLine);
      if (lo === hi && lo === line) return current;
      return {
        side,
        startLine: Math.min(lo, line),
        endLine: Math.max(hi, line),
      };
    });
    setEditingKey(null);
  }, []);

  const onPressLine = useCallback(
    (side: "old" | "new", line: number) => {
      applyTapSelection(side, line);
    },
    [applyTapSelection],
  );

  const saveDraft = useCallback(
    async (body: string) => {
      if (!draft || !body.trim()) return;
      const ok = await onSaveLineComment({
        side: draft.side,
        startLine: Math.min(draft.startLine, draft.endLine),
        endLine: Math.max(draft.startLine, draft.endLine),
        body: body.trim(),
      });
      if (ok) setDraft(null);
      else toast.error("Could not save comment");
    },
    [draft, onSaveLineComment, toast],
  );

  const commentsAfterLine = useCallback(
    (line: DisplayLine): LineComment[] => {
      const matched: LineComment[] = [];
      for (const comment of progress.lineComments) {
        const number = comment.side === "new" ? line.newLineNumber : line.oldLineNumber;
        if (number === comment.endLine) matched.push(comment);
      }
      return matched;
    },
    [progress.lineComments],
  );

  const header = (
    <FileHeader
      displayPath={displayPath}
      file={file}
      progress={progress}
      theme={theme}
      compact={compact}
      platform={platform}
      canViewFile={canViewFile}
      onToggleViewed={onToggleViewed}
      onIgnore={onIgnore}
      commentOpen={fileCommentOpen}
      onCommentOpenChange={setFileCommentOpen}
      onSaveFileComment={onChangeFileComment}
      onViewFile={onViewFile}
      onDiscardFile={onDiscardFile}
      panelActions={panelActions}
    />
  );

  if (status === "loading") {
    return (
      <View style={styles.root}>
        {header}
        <Text style={[styles.muted, { marginTop: 12 }]}>Loading diff…</Text>
      </View>
    );
  }
  if (status === "binary") {
    return (
      <View style={styles.root}>
        {header}
        <Text style={[styles.muted, { marginTop: 12 }]}>Binary file</Text>
      </View>
    );
  }
  if (status === "too_large") {
    return (
      <View style={styles.root}>
        {header}
        <Text style={[styles.muted, { marginTop: 12 }]}>Diff too large to display</Text>
      </View>
    );
  }
  if (status === "missing") {
    return (
      <View style={styles.root}>
        {header}
        <Text style={[styles.muted, { marginTop: 12 }]}>{error ?? "File unavailable"}</Text>
      </View>
    );
  }

  const selectionRange = draft
    ? {
        side: draft.side,
        startLine: Math.min(draft.startLine, draft.endLine),
        endLine: Math.max(draft.startLine, draft.endLine),
      }
    : null;

  const renderGap = (gap: (typeof gaps)[number]) => (
    <ExpandButton
      key={gap.id}
      gapId={gap.id}
      startLine={gap.startLine}
      endLine={gap.endLine}
      totalLines={totalLines}
      expanding={expandingKey === `${gap.startLine}:${gap.endLine}`}
      theme={theme}
      onExpand={(gapId, start, end) => void onExpand(gapId, start, end, gap.side)}
    />
  );

  return (
    <View style={styles.root}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {progress.fileComment ? (
          <Text style={styles.muted} numberOfLines={2}>
            File note: {progress.fileComment}
          </Text>
        ) : null}
        <Text style={styles.muted}>Tap a line to comment; tap another to set a range.</Text>
        <View style={styles.hunk}>
          {(gapByBefore.get(null) ?? []).map(renderGap)}
          {lines.map((line) => {
            const side = lineSide(line);
            const lineNumber = side ? lineNumberForSide(line, side) : null;
            const selected = selectionRange ? lineInRange(line, selectionRange) : false;
            const comments = commentsAfterLine(line);
            const draftHere =
              draft &&
              side &&
              lineNumber === Math.max(draft.startLine, draft.endLine) &&
              draft.side === side;
            return (
              <View key={line.id}>
                <DiffLineRow
                  line={line}
                  theme={theme}
                  palette={palette}
                  typography={typography}
                  selected={selected}
                  platform={platform}
                  onPress={
                    side && lineNumber != null
                      ? () => onPressLine(side, lineNumber)
                      : undefined
                  }
                />
                {comments.map((comment) => {
                  const key = commentKey(comment);
                  return (
                    <InlineCommentCard
                      key={key}
                      comment={comment}
                      theme={theme}
                      editing={editingKey === key}
                      onStartEdit={(next) => setEditingKey(commentKey(next))}
                      onSave={(next, body) => {
                        void (async () => {
                          const ok = await onSaveLineComment({ ...next, body: body.trim() });
                          if (ok) setEditingKey(null);
                          else toast.error("Could not save comment");
                        })();
                      }}
                      onCancel={() => setEditingKey(null)}
                      onDelete={(next) => {
                        void (async () => {
                          const ok = await onDeleteLineComment(next);
                          if (ok) setEditingKey(null);
                          else toast.error("Could not delete comment");
                        })();
                      }}
                    />
                  );
                })}
                {draftHere && draft ? (
                  <NativeLineDraftBox
                    range={draft}
                    theme={theme}
                    onSave={saveDraft}
                    onCancel={() => setDraft(null)}
                  />
                ) : null}
                {(gapByBefore.get(line.id) ?? []).map(renderGap)}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
