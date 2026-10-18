import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

type Theme = PluginSurfaceProps["theme"];

export function diffViewFrameStyles(theme: Theme, composerActive: boolean) {
  return {
    root: {
      flex: 1,
      minHeight: 0,
      gap: 0,
      alignSelf: "stretch" as const,
      width: "100%" as const,
    },
    scroll: { flex: 1, minHeight: 0 },
    scrollContent: {
      gap: 12,
      paddingTop: 12,
      paddingBottom: composerActive ? 280 : 24,
    },
    muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
    error: { color: theme.colors.statusDanger, fontSize: 13 },
    hunk: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      overflow: "hidden" as const,
      alignSelf: "stretch" as const,
      width: "100%" as const,
    },
  };
}

const STATUS_MESSAGE: Record<
  "loading" | "binary" | "too_large" | "missing",
  string | ((error: string | null) => string)
> = {
  loading: "Loading diff…",
  binary: "Binary file",
  too_large: "Diff too large to display",
  missing: (error) => error ?? "File unavailable",
};

export function diffViewStatusMessage(
  status: "loading" | "binary" | "too_large" | "missing",
  error: string | null,
): string {
  const label = STATUS_MESSAGE[status];
  return typeof label === "function" ? label(error) : label;
}
