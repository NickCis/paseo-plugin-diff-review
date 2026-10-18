import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

type Theme = PluginSurfaceProps["theme"];

function HoverTip({ label, theme }: { label: string; theme: Theme }) {
  const styles = useMemo(
    () => ({
      tip: {
        position: "absolute" as const,
        top: "100%" as const,
        right: 0,
        marginTop: 6,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 6,
        backgroundColor: theme.colors.surface2,
        borderWidth: 1,
        borderColor: theme.colors.border,
        zIndex: 100,
        elevation: 12,
        maxWidth: 220,
        minWidth: 72,
      },
      tipText: {
        color: theme.colors.foreground,
        fontSize: 11,
        fontWeight: "500" as const,
      },
    }),
    [theme],
  );
  return (
    <View style={styles.tip} pointerEvents="none">
      <Text style={styles.tipText} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Icon/button with a hover tooltip on web and an a11y label everywhere. */
export function TooltipButton({
  label,
  platform,
  theme,
  onPress,
  style,
  children,
  accessibilityRole = "button",
  accessibilityState,
}: {
  label: string;
  platform: "ios" | "android" | "web";
  theme: Theme;
  onPress(): void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  accessibilityRole?: "button" | "checkbox";
  accessibilityState?: { checked?: boolean };
}) {
  const [hovered, setHovered] = useState(false);
  const wrap = useMemo(() => ({ position: "relative" as const }), []);
  const onHoverIn = useCallback(() => {
    if (platform === "web") setHovered(true);
  }, [platform]);
  const onHoverOut = useCallback(() => setHovered(false), []);

  const hoverProps =
    platform === "web" ? { onHoverIn, onHoverOut } : {};

  return (
    <View style={wrap}>
      <Pressable
        accessibilityRole={accessibilityRole}
        accessibilityLabel={label}
        accessibilityHint={label}
        accessibilityState={accessibilityState}
        onPress={onPress}
        {...hoverProps}
        style={style}
      >
        {children}
      </Pressable>
      {platform === "web" && hovered ? <HoverTip label={label} theme={theme} /> : null}
    </View>
  );
}

export function TooltipBox({
  label,
  platform,
  theme,
  style,
  children,
}: {
  label: string;
  platform: "ios" | "android" | "web";
  theme: Theme;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const onHoverIn = useCallback(() => {
    if (platform === "web") setHovered(true);
  }, [platform]);
  const onHoverOut = useCallback(() => setHovered(false), []);

  const hoverProps =
    platform === "web" ? { onHoverIn, onHoverOut } : {};

  return (
    <Pressable
      accessibilityLabel={label}
      {...hoverProps}
      style={[{ position: "relative" }, style]}
    >
      {children}
      {platform === "web" && hovered ? <HoverTip label={label} theme={theme} /> : null}
    </Pressable>
  );
}
