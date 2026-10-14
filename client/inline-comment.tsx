import { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import type { LineComment } from "../shared/settings";

type Theme = PluginSurfaceProps["theme"];

export function InlineCommentCard({
  comment,
  theme,
  editing,
  draftBody,
  onStartEdit,
  onChangeDraft,
  onSave,
  onCancel,
  onDelete,
}: {
  comment: LineComment;
  theme: Theme;
  editing: boolean;
  draftBody: string;
  onStartEdit(comment: LineComment): void;
  onChangeDraft(body: string): void;
  onSave(comment: LineComment): void;
  onCancel(): void;
  onDelete(comment: LineComment): void;
}) {
  const styles = useMemo(
    () => ({
      box: {
        marginLeft: 88,
        marginVertical: 4,
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
      },
      actionPressable: {
        paddingHorizontal: 4,
        paddingVertical: 8,
        justifyContent: "center" as const,
      },
      action: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" as const },
      danger: { color: theme.colors.statusDanger, fontSize: 12, fontWeight: "600" as const },
    }),
    [theme],
  );

  const startEdit = useCallback(() => onStartEdit(comment), [comment, onStartEdit]);
  const save = useCallback(() => onSave(comment), [comment, onSave]);
  const remove = useCallback(() => onDelete(comment), [comment, onDelete]);
  const canSave = draftBody.trim().length > 0;

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
        <>
          <TextInput
            multiline
            value={draftBody}
            onChangeText={onChangeDraft}
            style={styles.input}
            placeholderTextColor={theme.colors.foregroundMuted}
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
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.actionPressable}
            >
              <Text style={styles.action}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={remove} style={styles.actionPressable}>
              <Text style={styles.danger}>Delete</Text>
            </Pressable>
          </View>
        </>
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
