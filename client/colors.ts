import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

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

export function diffPalette(theme: Theme) {
  return {
    addFg: theme.colors.statusSuccess,
    delFg: theme.colors.statusDanger,
    addBg: withAlpha(theme.colors.statusSuccess, 0.15),
    delBg: withAlpha(theme.colors.statusDanger, 0.15),
    selectBg: withAlpha(theme.colors.accent, 0.22),
  };
}
