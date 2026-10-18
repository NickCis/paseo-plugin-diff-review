import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { extendedThemeColors } from "./theme-colors";

type Theme = PluginSurfaceProps["theme"];

/** Append alpha to a #RRGGBB color. */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return hex;
  const clamped = Math.max(0, Math.min(1, alpha));
  const byte = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return `${normalized}${byte}`;
}

/** Match Paseo's built-in diff palette (appearance diff colors + status tints). */
export function diffPalette(theme: Theme) {
  const colors = extendedThemeColors(theme);
  return {
    addFg: colors.diffAddition,
    delFg: colors.diffDeletion,
    addBg: withAlpha(colors.diffAddition, 0.15),
    delBg: withAlpha(colors.diffDeletion, 0.1),
    selectBg: withAlpha(colors.accent, 0.22),
  };
}
