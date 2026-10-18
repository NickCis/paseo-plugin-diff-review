import { useMemo } from "react";
import { Text } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { highlightLine, roleColor, type HighlightSpan } from "./highlight";
import type { DiffTypography } from "../shared/settings";

type Theme = PluginSurfaceProps["theme"];

function Span({
  span,
  baseColor,
  theme,
}: {
  span: HighlightSpan;
  baseColor: string;
  theme: Theme;
}) {
  const color = span.role === "plain" ? baseColor : roleColor(span.role, theme.colors);
  const style = useMemo(() => ({ color }), [color]);
  return <Text style={style}>{span.text}</Text>;
}

export function HighlightedContent({
  content,
  theme,
  baseColor,
  typography,
  style,
}: {
  content: string;
  theme: Theme;
  baseColor: string;
  typography: DiffTypography;
  style?: {
    flexGrow?: number;
    flexShrink?: number;
    fontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
    color?: string;
  };
}) {
  const spans = useMemo(() => highlightLine(content), [content]);
  const root = useMemo(
    () => ({
      flexGrow: 1,
      flexShrink: 1,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
      lineHeight: typography.lineHeight,
      color: baseColor,
      ...style,
    }),
    [baseColor, style, typography.fontFamily, typography.fontSize, typography.lineHeight],
  );
  return (
    <Text style={root}>
      {spans.map((span) => (
        <Span key={`${span.start}:${span.role}`} span={span} baseColor={baseColor} theme={theme} />
      ))}
    </Text>
  );
}
