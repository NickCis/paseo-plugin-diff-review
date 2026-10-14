import { useMemo } from "react";
import { Text } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { highlightLine, roleColor, type HighlightSpan } from "./highlight";

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
}: {
  content: string;
  theme: Theme;
  baseColor: string;
}) {
  const spans = useMemo(() => highlightLine(content), [content]);
  const root = useMemo(
    () => ({
      flexGrow: 1,
      flexShrink: 0,
      fontFamily: "monospace",
      fontSize: 12,
      color: baseColor,
    }),
    [baseColor],
  );
  return (
    <Text style={root}>
      {spans.map((span) => (
        <Span key={`${span.start}:${span.role}`} span={span} baseColor={baseColor} theme={theme} />
      ))}
    </Text>
  );
}
