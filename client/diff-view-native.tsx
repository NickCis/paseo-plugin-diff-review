import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Text, View } from "react-native";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { diffPalette } from "./colors";
import { DiffLineRow } from "./diff-line-row";
import {
  commentsAfterLine,
  draftSelectionRange,
  isDraftComposerLine,
  lineInRange,
  lineNumberForSide,
  lineSide,
} from "./diff-line-utils";
import { ExpandGapButton } from "./expand-gap-button";
import { FileHeader } from "./file-header";
import { InlineCommentCard } from "./inline-comment";
import { LineDraftBox, type LineDraftRange } from "./line-draft-box";
import { commentKey } from "./progress";
import { diffViewFrameStyles, diffViewStatusMessage } from "./diff-view-layout";
import type { DiffViewProps } from "./diff-view-props";
import { useDiffExpand } from "./use-diff-expand";
import { useScrollComposerIntoView } from "./use-scroll-composer-into-view";

/** Native diff renderer — touch-first; shares display, expand, and row styling with web. */
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
  const toast = useToast();
  const palette = useMemo(() => diffPalette(theme), [theme]);
  const { lines, gapByBefore, totalLines, expandingKey, onExpand } = useDiffExpand({
    cwd,
    pathKey,
    file,
    hunks,
  });
  const [draft, setDraft] = useState<LineDraftRange | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [fileCommentOpen, setFileCommentOpen] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const contentRef = useRef<View>(null);
  const composerRef = useRef<View>(null);
  const assignComposerRef = useCallback((node: View | null) => {
    composerRef.current = node;
  }, []);
  const composerScrollKey = useMemo(() => {
    if (draft) {
      const end = Math.max(draft.startLine, draft.endLine);
      return `draft:${draft.side}:${end}`;
    }
    if (editingKey) return `edit:${editingKey}`;
    return null;
  }, [draft, editingKey]);
  const composerActive = composerScrollKey != null;
  useScrollComposerIntoView(scrollRef, contentRef, composerRef, composerScrollKey);

  useEffect(() => {
    setDraft(null);
    setEditingKey(null);
    setFileCommentOpen(false);
  }, [pathKey]);

  const styles = useMemo(
    () => diffViewFrameStyles(theme, composerActive),
    [composerActive, theme],
  );

  const onPressLine = useCallback((side: "old" | "new", line: number) => {
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

  if (status !== "ok") {
    return (
      <View style={styles.root}>
        {header}
        <Text style={[styles.muted, { marginTop: 12 }]}>
          {diffViewStatusMessage(status, error)}
        </Text>
      </View>
    );
  }

  const selectionRange = draftSelectionRange(draft);

  return (
    <View style={styles.root}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View ref={contentRef} collapsable={false}>
          {progress.fileComment ? (
            <Text style={styles.muted} numberOfLines={2}>
              File note: {progress.fileComment}
            </Text>
          ) : null}
          <Text style={styles.muted}>Tap a line to comment; tap another to set a range.</Text>
          <View style={styles.hunk}>
            {(gapByBefore.get(null) ?? []).map((gap) => (
              <ExpandGapButton
                key={gap.id}
                gap={gap}
                totalLines={totalLines}
                expandingKey={expandingKey}
                theme={theme}
                onExpand={onExpand}
              />
            ))}
            {lines.map((line) => {
              const side = lineSide(line);
              const lineNumber = side ? lineNumberForSide(line, side) : null;
              const selected = selectionRange ? lineInRange(line, selectionRange) : false;
              const comments = commentsAfterLine(line, progress.lineComments);
              const draftHere = draft != null && isDraftComposerLine(line, draft);
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
                    const editing = editingKey === key;
                    return (
                      <View
                        key={key}
                        ref={editing ? assignComposerRef : undefined}
                        collapsable={false}
                      >
                        <InlineCommentCard
                          comment={comment}
                          theme={theme}
                          editing={editing}
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
                      </View>
                    );
                  })}
                  {draftHere && draft ? (
                    <View ref={assignComposerRef} collapsable={false}>
                      <LineDraftBox
                        range={draft}
                        theme={theme}
                        onSave={saveDraft}
                        onCancel={() => setDraft(null)}
                      />
                    </View>
                  ) : null}
                  {(gapByBefore.get(line.id) ?? []).map((gap) => (
                    <ExpandGapButton
                      key={gap.id}
                      gap={gap}
                      totalLines={totalLines}
                      expandingKey={expandingKey}
                      theme={theme}
                      onExpand={onExpand}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
