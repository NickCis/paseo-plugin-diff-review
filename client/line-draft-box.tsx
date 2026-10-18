import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { diffCommentBoxStyle } from "./diff-comment-layout";
import { composerKeyProps } from "./keyboard";

type Theme = PluginSurfaceProps["theme"];

export type LineDraftRange = {
  side: "old" | "new";
  startLine: number;
  endLine: number;
};

export function LineDraftBox({
  range,
  theme,
  onSave,
  onCancel,
  bodyRef,
  showKeyboardHint = false,
}: {
  range: LineDraftRange;
  theme: Theme;
  onSave(body: string): Promise<void>;
  onCancel(): void;
  /** When set (web), draft text is mirrored here so the parent avoids re-rendering the file. */
  bodyRef?: { current: string };
  showKeyboardHint?: boolean;
}) {
  const [body, setBody] = useState(() => bodyRef?.current ?? "");
  const [saving, setSaving] = useState(false);
  const onChange = useCallback(
    (text: string) => {
      if (bodyRef) bodyRef.current = text;
      setBody(text);
    },
    [bodyRef],
  );
  const save = useCallback(() => {
    const value = bodyRef?.current ?? body;
    if (saving || !value.trim()) return;
    setSaving(true);
    void onSave(value).finally(() => setSaving(false));
  }, [body, bodyRef, onSave, saving]);
  const keyProps = useMemo(
    () => composerKeyProps({ onSave: save, onCancel }),
    [onCancel, save],
  );
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
      actions: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        flexWrap: "wrap" as const,
      },
      button: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.accent,
        justifyContent: "center" as const,
      },
      buttonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      cancelButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        justifyContent: "center" as const,
      },
      action: { color: theme.colors.accent, fontWeight: "600" as const },
      hint: { color: theme.colors.foregroundMuted, fontSize: 11, marginLeft: "auto" as const },
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
        onChangeText={onChange}
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
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.action}>Cancel</Text>
        </Pressable>
        {showKeyboardHint ? <Text style={styles.hint}>Ctrl+Enter to save</Text> : null}
      </View>
    </View>
  );
}
