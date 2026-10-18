import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { diffPalette } from "./colors";
import { FileHeader } from "./file-header";
import { InlineCommentCard } from "./inline-comment";
import { composerKeyProps } from "./keyboard";
import { commentKey } from "./progress";
import type { DiffLine } from "../shared/rpc";
import type { LineComment } from "../shared/settings";
import type { DiffViewProps } from "./diff-view-props";

type DisplayLine = DiffLine & { id: string };

type DraftRange = { side: "old" | "new"; startLine: number; endLine: number };

function lineSide(line: DiffLine): "old" | "new" | null {
  if (line.type === "del") return "old";
  if (line.type === "add") return "new";
  if (line.newLineNumber != null) return "new";
  if (line.oldLineNumber != null) return "old";
  return null;
}

function lineNumberForSide(line: DiffLine, side: "old" | "new"): number | null {
  return side === "new" ? line.newLineNumber : line.oldLineNumber;
}

function flattenHunks(hunks: DiffViewProps["hunks"]): DisplayLine[] {
  const lines: DisplayLine[] = [];
  for (const hunk of hunks) {
    for (let index = 0; index < hunk.lines.length; index += 1) {
      const line = hunk.lines[index]!;
      lines.push({ ...line, id: `${hunk.header}:${index}` });
    }
  }
  return lines;
}

function NativeLineRow({
  line,
  theme,
  typography,
  palette,
  selected,
  onPress,
}: {
  line: DisplayLine;
  theme: DiffViewProps["theme"];
  typography: DiffViewProps["typography"];
  palette: ReturnType<typeof diffPalette>;
  selected: boolean;
  onPress(): void;
}) {
  let backgroundColor = "transparent";
  if (selected) backgroundColor = palette.selectBg;
  else if (line.type === "add") backgroundColor = palette.addBg;
  else if (line.type === "del") backgroundColor = palette.delBg;

  let prefixColor = theme.colors.foregroundMuted;
  if (line.type === "add") prefixColor = palette.addFg;
  else if (line.type === "del") prefixColor = palette.delFg;

  let prefix = " ";
  if (line.type === "add") prefix = "+";
  else if (line.type === "del") prefix = "-";

  const side = lineSide(line);
  const lineNumber = side ? lineNumberForSide(line, side) : null;
  const disabled = side == null || lineNumber == null;

  const styles = useMemo(
    () => ({
      line: {
        flexDirection: "row" as const,
        paddingHorizontal: 4,
        minHeight: typography.lineHeight,
        alignItems: "flex-start" as const,
        alignSelf: "stretch" as const,
        backgroundColor,
        width: "100%" as const,
      },
      gutter: {
        width: 40,
        color: theme.colors.foregroundMuted,
        fontFamily: typography.fontFamily,
        fontSize: typography.fontSize,
        lineHeight: typography.lineHeight,
        textAlign: "right" as const,
        paddingRight: 6,
        flexShrink: 0,
      },
      prefix: {
        width: 14,
        color: prefixColor,
        fontFamily: typography.fontFamily,
        fontSize: typography.fontSize,
        lineHeight: typography.lineHeight,
        fontWeight: "700" as const,
        flexShrink: 0,
      },
      content: {
        flexShrink: 1,
        flexGrow: 1,
        fontFamily: typography.fontFamily,
        fontSize: typography.fontSize,
        lineHeight: typography.lineHeight,
        color: theme.colors.foreground,
      },
    }),
    [
      backgroundColor,
      prefixColor,
      theme.colors.foreground,
      theme.colors.foregroundMuted,
      typography.fontFamily,
      typography.fontSize,
      typography.lineHeight,
    ],
  );

  return (
    <Pressable disabled={disabled} onPress={onPress} style={styles.line}>
      <Text style={styles.gutter}>{line.oldLineNumber ?? ""}</Text>
      <Text style={styles.gutter}>{line.newLineNumber ?? ""}</Text>
      <Text style={styles.prefix}>{prefix}</Text>
      <Text style={styles.content}>{line.content}</Text>
    </Pressable>
  );
}

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
        marginLeft: 88,
        marginVertical: 4,
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

/** Native diff renderer — avoids web-only cursor store, nested scroll, and syntax spans. */
export function NativeDiffView({
  pathKey,
  displayPath,
  file,
  status,
  hunks,
  error,
  progress,
  typography,
  theme,
  compact,
  platform,
  canViewFile,
  onToggleViewed,
  onIgnore,
  onViewFile,
  onDiscardFile,
  onChangeFileComment,
  onSaveLineComment,
  onDeleteLineComment,
}: DiffViewProps) {
  const toast = useToast();
  const palette = useMemo(() => diffPalette(theme), [theme]);
  const lines = useMemo(() => flattenHunks(hunks), [hunks]);
  const [draft, setDraft] = useState<DraftRange | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [fileCommentOpen, setFileCommentOpen] = useState(false);

  useEffect(() => {
    setDraft(null);
    setEditingKey(null);
    setFileCommentOpen(false);
  }, [pathKey]);

  const styles = useMemo(
    () => ({
      root: { flex: 1, minHeight: 0, gap: 0, alignSelf: "stretch" as const, width: "100%" as const },
      scroll: { flex: 1, minHeight: 0 },
      scrollContent: { gap: 12, paddingTop: 12, paddingBottom: 24 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      hunk: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        overflow: "hidden" as const,
      },
    }),
    [theme],
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

  const lineInRange = (line: DisplayLine): boolean => {
    if (!selectionRange) return false;
    const number = lineNumberForSide(line, selectionRange.side);
    if (number == null) return false;
    return number >= selectionRange.startLine && number <= selectionRange.endLine;
  };

  return (
    <View style={styles.root}>
      {header}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {progress.fileComment ? (
          <Text style={styles.muted} numberOfLines={2}>
            File note: {progress.fileComment}
          </Text>
        ) : null}
        <Text style={styles.muted}>
          Tap a line to comment; tap another to set a range.
        </Text>
        <View style={styles.hunk}>
          {lines.map((line) => {
            const side = lineSide(line);
            const lineNumber = side ? lineNumberForSide(line, side) : null;
            const selected = lineInRange(line);
            const comments = commentsAfterLine(line);
            const draftHere =
              draft &&
              side &&
              lineNumber === Math.max(draft.startLine, draft.endLine) &&
              draft.side === side;
            return (
              <View key={line.id}>
                <NativeLineRow
                  line={line}
                  theme={theme}
                  typography={typography}
                  palette={palette}
                  selected={selected}
                  onPress={() => {
                    if (side && lineNumber != null) onPressLine(side, lineNumber);
                  }}
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
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
