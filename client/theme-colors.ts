import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

type Theme = PluginSurfaceProps["theme"];

/** Theme colors including diff/syntax tokens when the host provides them. */
export type ExtendedThemeColors = Theme["colors"] & {
  readonly diffAddition?: string;
  readonly diffDeletion?: string;
  readonly syntax?: Readonly<Record<string, string>>;
};

export function extendedThemeColors(theme: Theme): ExtendedThemeColors & {
  readonly diffAddition: string;
  readonly diffDeletion: string;
  readonly syntax: Readonly<Record<string, string>>;
} {
  const colors = theme.colors as ExtendedThemeColors;
  return {
    ...colors,
    diffAddition: colors.diffAddition ?? colors.statusSuccess,
    diffDeletion: colors.diffDeletion ?? colors.statusDanger,
    syntax: colors.syntax ?? {},
  };
}
