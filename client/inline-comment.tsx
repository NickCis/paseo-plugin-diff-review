import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { diffCommentBoxStyle } from "./diff-comment-layout";
import { composerKeyProps } from "./keyboard";
import type { LineComment } from "../shared/settings";

type Theme = PluginSurfaceProps["theme"];

export function InlineCommentCard({
  comment,
  theme,
  editing,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
}: {
  comment: LineComment;
  theme: Theme;
  editing: boolean;
  onStartEdit(comment: LineComment): void;
  onSave(comment: LineComment, body: string): void;
  onCancel(): void;
  onDelete(comment: LineComment): void;
}) {
  const styles = useMemo(
    () => ({
      box: {
        ...diffCommentBoxStyle,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        gap: 8,
      },
      meta: { color: theme.colors.foregroundMuted, fontSize: 11 },
      body: { color: theme.colors.foreground, fontSize: 13 },
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        padding: 8,
        color: theme.colors.foreground,
        minHeight: 56,
        textAlignVertical: "top" as const,
      },
      actions: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        flexWrap: "wrap" as const,
      },
      actionPressable: {
        paddingHorizontal: 4,
        paddingVertical: 8,
        justifyContent: "center" as const,
      },
      action: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" as const },
      danger: { color: theme.colors.statusDanger, fontSize: 12, fontWeight: "600" as const },
      hint: { color: theme.colors.foregroundMuted, fontSize: 11, marginLeft: "auto" as const },
    }),
    [theme],
  );

  const startEdit = useCallback(() => onStartEdit(comment), [comment, onStartEdit]);
  const remove = useCallback(() => onDelete(comment), [comment, onDelete]);
  const save = useCallback(
    (body: string) => onSave(comment, body),
    [comment, onSave],
  );

  const range =
    comment.startLine === comment.endLine
      ? `L${comment.startLine}`
      : `L${comment.startLine}–${comment.endLine}`;

  return (
    <View style={styles.box}>
      <Text style={styles.meta}>
        {comment.side} {range}
      </Text>
      {editing ? (
        <CommentEditor
          initialBody={comment.body}
          theme={theme}
          onSave={save}
          onCancel={onCancel}
          onDelete={remove}
        />
      ) : (
        <>
          <Text style={styles.body}>{comment.body}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={startEdit}
              style={styles.actionPressable}
            >
              <Text style={styles.action}>Edit</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={remove} style={styles.actionPressable}>
              <Text style={styles.danger}>Delete</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/** Owns the text being typed so each keystroke does not re-render the diff. */
function CommentEditor({
  initialBody,
  theme,
  onSave,
  onCancel,
  onDelete,
}: {
  initialBody: string;
  theme: Theme;
  onSave(body: string): void;
  onCancel(): void;
  onDelete(): void;
}) {
  const [body, setBody] = useState(initialBody);
  const canSave = body.trim().length > 0;
  const save = useCallback(() => {
    if (body.trim()) onSave(body);
  }, [body, onSave]);
  const keyProps = useMemo(
    () => composerKeyProps({ onSave: save, onCancel }),
    [onCancel, save],
  );
  const styles = useMemo(
    () => ({
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        padding: 8,
        color: theme.colors.foreground,
        minHeight: 56,
        textAlignVertical: "top" as const,
      },
      actions: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        flexWrap: "wrap" as const,
      },
      actionPressable: {
        paddingHorizontal: 4,
        paddingVertical: 8,
        justifyContent: "center" as const,
      },
      action: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" as const },
      danger: { color: theme.colors.statusDanger, fontSize: 12, fontWeight: "600" as const },
      hint: { color: theme.colors.foregroundMuted, fontSize: 11, marginLeft: "auto" as const },
    }),
    [theme],
  );

  return (
    <>
      <TextInput
        multiline
        value={body}
        onChangeText={setBody}
        autoFocus
        style={styles.input}
        placeholderTextColor={theme.colors.foregroundMuted}
        {...keyProps}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={!canSave}
          onPress={save}
          style={styles.actionPressable}
        >
          <Text style={[styles.action, !canSave ? { opacity: 0.4 } : null]}>Save</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.actionPressable}>
          <Text style={styles.action}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onDelete} style={styles.actionPressable}>
          <Text style={styles.danger}>Delete</Text>
        </Pressable>
        <Text style={styles.hint}>Ctrl+Enter to save</Text>
      </View>
    </>
  );
}
