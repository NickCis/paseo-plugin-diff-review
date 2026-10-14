import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { diffPalette } from "./colors";
import { ExpandButton } from "./expand-button";
import { FileHeader } from "./file-header";
import { HighlightedContent } from "./highlight-text";
import { InlineCommentCard } from "./inline-comment";
import { commentKey } from "./progress";
import { diffContextRpc, type DiffFile, type DiffHunk, type DiffLine } from "../shared/rpc";
import type { FileProgress, LineComment } from "../shared/settings";

type Theme = PluginSurfaceProps["theme"];

interface DiffViewProps {
  pathKey: string;
  displayPath: string;
  file: DiffFile;
  cwd: string;
  status: "ok" | "binary" | "too_large" | "missing" | "loading";
  hunks: readonly DiffHunk[];
  error: string | null;
  progress: FileProgress;
  theme: Theme;
  compact: boolean;
  platform: "ios" | "android" | "web";
  canViewFile: boolean;
  onToggleViewed(): void;
  onIgnore(): void;
  onViewFile(): void;
  onChangeFileComment(body: string): Promise<boolean>;
  onSaveLineComment(comment: LineComment): Promise<boolean>;
  onDeleteLineComment(comment: Pick<LineComment, "side" | "startLine" | "endLine">): Promise<boolean>;
}

type DisplayLine = DiffLine & { id: string; source: "hunk" | "expand" };

interface Gap {
  id: string;
  side: "old" | "new";
  startLine: number;
  endLine: number;
  beforeId: string | null;
}

const EXPAND_CHUNK = 20;

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

function lineInRange(
  line: DiffLine,
  range: { side: "old" | "new"; startLine: number; endLine: number },
): boolean {
  const number = lineNumberForSide(line, range.side);
  if (number == null) return false;
  const lo = Math.min(range.startLine, range.endLine);
  const hi = Math.max(range.startLine, range.endLine);
  return number >= lo && number <= hi;
}

function expandAxis(file: DiffFile): "old" | "new" {
  return file.status === "deleted" ? "old" : "new";
}

function lineAxisNumber(line: DiffLine, axis: "old" | "new"): number | null {
  return axis === "new" ? line.newLineNumber : line.oldLineNumber;
}

function buildDisplay(
  hunks: readonly DiffHunk[],
  expanded: Map<string, DisplayLine[]>,
  totalLines: number | null,
  axis: "old" | "new",
): {
  lines: DisplayLine[];
  gaps: Gap[];
} {
  const lines: DisplayLine[] = [];
  const gaps: Gap[] = [];
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

function DiffLineRow({
  line,
  theme,
  palette,
  selected,
  platform,
  onPressLine,
  onDragEnterLine,
  onDragStartLine,
  onDragEndLine,
}: {
  line: DisplayLine;
  theme: Theme;
  palette: ReturnType<typeof diffPalette>;
  selected: boolean;
  platform: "ios" | "android" | "web";
  onPressLine(side: "old" | "new", lineNumber: number): void;
  onDragEnterLine(side: "old" | "new", lineNumber: number): void;
  onDragStartLine(side: "old" | "new", lineNumber: number): void;
  onDragEndLine(): void;
}) {
  const side = lineSide(line);
  const lineNumber = side ? lineNumberForSide(line, side) : null;
  const disabled = side == null || lineNumber == null;
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

  const styles = useMemo(
    () => ({
      line: {
        flexDirection: "row" as const,
        paddingHorizontal: 4,
        minHeight: 20,
        alignItems: "flex-start" as const,
        alignSelf: "stretch" as const,
        backgroundColor,
        width: "100%" as const,
        minWidth: "100%" as const,
      },
      gutter: {
        width: 40,
        color: theme.colors.foregroundMuted,
        fontFamily: "monospace",
        fontSize: 11,
        textAlign: "right" as const,
        paddingRight: 6,
        flexShrink: 0,
      },
      prefix: {
        width: 14,
        color: prefixColor,
        fontFamily: "monospace",
        fontSize: 12,
        fontWeight: "700" as const,
        flexShrink: 0,
      },
    }),
    [backgroundColor, prefixColor, theme.colors.foregroundMuted],
  );

  const press = useCallback(() => {
    if (side && lineNumber != null) onPressLine(side, lineNumber);
  }, [lineNumber, onPressLine, side]);

  if (platform === "web") {
    const webProps: Record<string, unknown> = disabled
      ? {}
      : {
          onMouseDown: (event: { button?: number; preventDefault?: () => void }) => {
            if (event.button != null && event.button !== 0) return;
            event.preventDefault?.();
            if (side && lineNumber != null) onDragStartLine(side, lineNumber);
          },
          onMouseEnter: (event: { buttons?: number }) => {
            if (event.buttons !== 1) return;
            if (side && lineNumber != null) onDragEnterLine(side, lineNumber);
          },
          onMouseUp: () => {
            onDragEndLine();
          },
        };
    return (
      <View style={styles.line} {...webProps}>
        <Text style={styles.gutter}>{line.oldLineNumber ?? ""}</Text>
        <Text style={styles.gutter}>{line.newLineNumber ?? ""}</Text>
        <Text style={styles.prefix}>{prefix}</Text>
        <HighlightedContent
          content={line.content}
          theme={theme}
          baseColor={theme.colors.foreground}
        />
      </View>
    );
  }

  return (
    <Pressable disabled={disabled} onPress={press} style={styles.line}>
      <Text style={styles.gutter}>{line.oldLineNumber ?? ""}</Text>
      <Text style={styles.gutter}>{line.newLineNumber ?? ""}</Text>
      <Text style={styles.prefix}>{prefix}</Text>
      <HighlightedContent
        content={line.content}
        theme={theme}
        baseColor={theme.colors.foreground}
      />
    </Pressable>
  );
}

export function DiffView({
  pathKey,
  displayPath,
  file,
  cwd,
  status,
  hunks,
  error,
  progress,
  theme,
  compact,
  platform,
  canViewFile,
  onToggleViewed,
  onIgnore,
  onViewFile,
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
  const dragging = useRef<{
    side: "old" | "new";
    startLine: number;
    moved: boolean;
  } | null>(null);
  const [draft, setDraft] = useState<{
    side: "old" | "new";
    startLine: number;
    endLine: number;
    body: string;
  } | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    setExpanded(new Map());
    setTotalLines(null);
    setDraft(null);
    setEditingKey(null);
    dragging.current = null;
  }, [pathKey]);

  const { lines, gaps } = useMemo(
    () => buildDisplay(hunks, expanded, totalLines, axis),
    [axis, expanded, hunks, totalLines],
  );

  const styles = useMemo(
    () => ({
      root: { gap: 12, alignSelf: "stretch" as const, width: "100%" as const },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        padding: 10,
        color: theme.colors.foreground,
        minHeight: 64,
        textAlignVertical: "top" as const,
      },
      draftBox: {
        marginLeft: 88,
        marginVertical: 4,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.surface1,
        gap: 8,
      },
      hunk: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        overflow: "hidden" as const,
        alignSelf: "stretch" as const,
        width: "100%" as const,
      },
      hunkScroll: { width: "100%" as const, alignSelf: "stretch" as const },
      hunkScrollContent: { flexGrow: 1, minWidth: "100%" as const },
      hunkInner: { flexGrow: 1, minWidth: "100%" as const, alignSelf: "stretch" as const },
      button: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.accent,
        justifyContent: "center" as const,
      },
      buttonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      actions: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
      },
      cancelButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        justifyContent: "center" as const,
      },
      action: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" as const },
    }),
    [theme],
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

  const onDragStartLine = useCallback((side: "old" | "new", line: number) => {
    dragging.current = { side, startLine: line, moved: false };
    setEditingKey(null);
  }, []);

  const onDragEnterLine = useCallback((side: "old" | "new", line: number) => {
    const active = dragging.current;
    if (!active || active.side !== side) return;
    if (line === active.startLine) return;
    active.moved = true;
    setDraft((current) => ({
      side,
      startLine: Math.min(active.startLine, line),
      endLine: Math.max(active.startLine, line),
      body: current?.side === side ? (current.body ?? "") : "",
    }));
  }, []);

  const applyTapSelection = useCallback((side: "old" | "new", line: number) => {
    setDraft((current) => {
      if (!current || current.side !== side) {
        return { side, startLine: line, endLine: line, body: "" };
      }
      const lo = Math.min(current.startLine, current.endLine);
      const hi = Math.max(current.startLine, current.endLine);
      // Same single line: keep (confirmed). Outside range with empty body: restart.
      if (lo === hi && lo === line) return current;
      if ((line < lo || line > hi) && !current.body.trim()) {
        return { side, startLine: line, endLine: line, body: "" };
      }
      return {
        side,
        startLine: Math.min(lo, line),
        endLine: Math.max(hi, line),
        body: current.body,
      };
    });
    setEditingKey(null);
  }, []);

  const onDragEndLine = useCallback(() => {
    const active = dragging.current;
    if (!active) return;
    if (!active.moved) applyTapSelection(active.side, active.startLine);
    dragging.current = null;
  }, [applyTapSelection]);

  useEffect(() => {
    if (platform !== "web") return;
    const doc = (
      globalThis as { document?: { addEventListener: Function; removeEventListener: Function } }
    ).document;
    if (!doc) return;
    const onWindowMouseUp = () => {
      if (dragging.current) onDragEndLine();
    };
    doc.addEventListener("mouseup", onWindowMouseUp);
    return () => doc.removeEventListener("mouseup", onWindowMouseUp);
  }, [onDragEndLine, platform]);

  const onPressLine = useCallback(
    (side: "old" | "new", line: number) => {
      applyTapSelection(side, line);
    },
    [applyTapSelection],
  );

  const onDraftBody = useCallback((body: string) => {
    setDraft((current) => (current ? { ...current, body } : current));
  }, []);

  const saveDraft = useCallback(async () => {
    if (!draft || !draft.body.trim() || savingDraft) return;
    setSavingDraft(true);
    try {
      const ok = await onSaveLineComment({
        side: draft.side,
        startLine: Math.min(draft.startLine, draft.endLine),
        endLine: Math.max(draft.startLine, draft.endLine),
        body: draft.body.trim(),
      });
      if (ok) setDraft(null);
      else toast.error("Could not save comment");
    } finally {
      setSavingDraft(false);
    }
  }, [draft, onSaveLineComment, savingDraft, toast]);

  const cancelDraft = useCallback(() => setDraft(null), []);

  const startEditComment = useCallback((comment: LineComment) => {
    setEditingKey(commentKey(comment));
    setEditBody(comment.body);
    setDraft(null);
  }, []);
  const saveEditComment = useCallback(
    async (comment: LineComment) => {
      const trimmed = editBody.trim();
      if (!trimmed) {
        toast.error("Comment body is empty — use Delete to remove it");
        return;
      }
      const ok = await onSaveLineComment({ ...comment, body: trimmed });
      if (ok) setEditingKey(null);
      else toast.error("Could not save comment");
    },
    [editBody, onSaveLineComment, toast],
  );
  const cancelEditComment = useCallback(() => setEditingKey(null), []);
  const deleteComment = useCallback(
    async (comment: LineComment) => {
      const ok = await onDeleteLineComment(comment);
      if (ok) setEditingKey(null);
      else toast.error("Could not delete comment");
    },
    [onDeleteLineComment, toast],
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

  if (status === "loading") return <Text style={styles.muted}>Loading diff…</Text>;
  if (status === "binary") return <Text style={styles.muted}>Binary file</Text>;
  if (status === "too_large") return <Text style={styles.muted}>Diff too large to display</Text>;
  if (status === "missing") {
    return <Text style={styles.muted}>{error ?? "File unavailable"}</Text>;
  }

  const selectionRange = draft
    ? {
        side: draft.side,
        startLine: Math.min(draft.startLine, draft.endLine),
        endLine: Math.max(draft.startLine, draft.endLine),
      }
    : null;

  const gapByBefore = new Map<string | null, Gap[]>();
  for (const gap of gaps) {
    const list = gapByBefore.get(gap.beforeId) ?? [];
    list.push(gap);
    gapByBefore.set(gap.beforeId, list);
  }

  return (
    <View style={styles.root}>
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
        onSaveFileComment={onChangeFileComment}
        onViewFile={onViewFile}
      />
      {progress.fileComment ? (
        <Text style={styles.muted} numberOfLines={2}>
          File note: {progress.fileComment}
        </Text>
      ) : null}
      <Text style={styles.muted}>
        {platform === "web"
          ? "Drag across lines, or click two lines, to comment. Click outside the range (empty draft) to start over."
          : "Tap a line to comment; tap another to set a range. Tap outside the range (empty draft) to start over."}
      </Text>

      <View style={styles.hunk}>
        <ScrollView
          horizontal
          style={styles.hunkScroll}
          contentContainerStyle={styles.hunkScrollContent}
        >
          <View style={styles.hunkInner}>
            {(gapByBefore.get(null) ?? []).map((gap) => (
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
            ))}
            {lines.map((line) => {
              const selected = selectionRange ? lineInRange(line, selectionRange) : false;
              const comments = commentsAfterLine(line);
              const draftHere =
                draft &&
                lineNumberForSide(line, draft.side) === Math.max(draft.startLine, draft.endLine);
              return (
                <View key={line.id}>
                  <DiffLineRow
                    line={line}
                    theme={theme}
                    palette={palette}
                    selected={selected}
                    platform={platform}
                    onPressLine={onPressLine}
                    onDragEnterLine={onDragEnterLine}
                    onDragStartLine={onDragStartLine}
                    onDragEndLine={onDragEndLine}
                  />
                  {comments.map((comment) => {
                    const key = commentKey(comment);
                    return (
                      <InlineCommentCard
                        key={key}
                        comment={comment}
                        theme={theme}
                        editing={editingKey === key}
                        draftBody={editingKey === key ? editBody : comment.body}
                        onStartEdit={startEditComment}
                        onChangeDraft={setEditBody}
                        onSave={(next) => void saveEditComment(next)}
                        onCancel={cancelEditComment}
                        onDelete={(next) => void deleteComment(next)}
                      />
                    );
                  })}
                  {draftHere ? (
                    <View style={styles.draftBox}>
                      <Text style={styles.muted}>
                        Comment on {draft.side} L{Math.min(draft.startLine, draft.endLine)}
                        {draft.startLine !== draft.endLine
                          ? `–${Math.max(draft.startLine, draft.endLine)}`
                          : ""}
                      </Text>
                      <TextInput
                        multiline
                        value={draft.body}
                        onChangeText={onDraftBody}
                        placeholder="Line comment"
                        placeholderTextColor={theme.colors.foregroundMuted}
                        style={styles.input}
                        autoFocus
                      />
                      <View style={styles.actions}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => void saveDraft()}
                          style={styles.button}
                          disabled={savingDraft}
                        >
                          <Text style={styles.buttonText}>
                            {savingDraft ? "Saving…" : "Save comment"}
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={cancelDraft}
                          style={styles.cancelButton}
                        >
                          <Text style={styles.action}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  {(gapByBefore.get(line.id) ?? []).map((gap) => (
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
                  ))}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
