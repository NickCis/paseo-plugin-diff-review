import { useCallback, useMemo, type ComponentRef } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { diffPalette } from "./colors";
import { HighlightedContent } from "./highlight-text";
import { lineNumberForSide, lineSide } from "./diff-line-utils";
import type { DiffLine } from "../shared/rpc";
import type { DiffTypography } from "../shared/settings";

type Theme = PluginSurfaceProps["theme"];
type RowNode = ComponentRef<typeof View>;

export function DiffLineRow({
  line,
  theme,
  palette,
  typography,
  selected,
  cursor = false,
  platform,
  rowRef,
  onPress,
  onDragStartLine,
  onDragEnterLine,
  onDragEndLine,
  lineId = "",
  syntaxHighlight = true,
}: {
  line: DiffLine;
  theme: Theme;
  palette: ReturnType<typeof diffPalette>;
  typography: DiffTypography;
  selected: boolean;
  cursor?: boolean;
  syntaxHighlight?: boolean;
  platform: "ios" | "android" | "web";
  rowRef?(node: RowNode | null): void;
  onPress?(): void;
  onDragStartLine?(side: "old" | "new", lineNumber: number, id: string): void;
  onDragEnterLine?(side: "old" | "new", lineNumber: number): void;
  onDragEndLine?(): void;
  lineId?: string;
}) {
  const side = lineSide(line);
  const lineNumber = side ? lineNumberForSide(line, side) : null;
  const disabled = side == null || lineNumber == null || !onPress;

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
        minHeight: typography.lineHeight,
        alignItems: "flex-start" as const,
        alignSelf: "stretch" as const,
        backgroundColor,
        borderLeftWidth: cursor ? 2 : 0,
        borderLeftColor: cursor ? theme.colors.accent : "transparent",
        width: "100%" as const,
      },
      pressable: {
        flex: 1,
        flexDirection: "row" as const,
        alignItems: "flex-start" as const,
        alignSelf: "stretch" as const,
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
      cursor,
      prefixColor,
      theme.colors.accent,
      theme.colors.foreground,
      theme.colors.foregroundMuted,
      typography.fontFamily,
      typography.fontSize,
      typography.lineHeight,
    ],
  );

  const content =
    syntaxHighlight && line.content.length > 0 ? (
      <HighlightedContent
        content={line.content}
        theme={theme}
        baseColor={theme.colors.foreground}
        typography={typography}
        style={styles.content}
      />
    ) : (
      <Text style={styles.content}>{line.content}</Text>
    );

  const body = (
    <>
      <Text style={styles.gutter}>{line.oldLineNumber ?? ""}</Text>
      <Text style={styles.gutter}>{line.newLineNumber ?? ""}</Text>
      <Text style={styles.prefix}>{prefix}</Text>
      {content}
    </>
  );

  const press = useCallback(() => {
    onPress?.();
  }, [onPress]);

  if (platform === "web" && onDragStartLine && onDragEnterLine && onDragEndLine) {
    const webProps: Record<string, unknown> = disabled
      ? {}
      : {
          onMouseDown: (event: { button?: number; preventDefault?: () => void }) => {
            if (event.button != null && event.button !== 0) return;
            event.preventDefault?.();
            if (side && lineNumber != null) onDragStartLine(side, lineNumber, lineId ?? "");
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
      <View ref={rowRef} style={styles.line} {...webProps}>
        {disabled ? (
          body
        ) : (
          <Pressable accessibilityRole="button" onPress={press} style={styles.pressable}>
            {body}
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <Pressable
      ref={rowRef as never}
      disabled={disabled}
      onPress={press}
      style={styles.line}
    >
      {body}
    </Pressable>
  );
}
