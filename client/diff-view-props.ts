import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { DiffFile, DiffHunk } from "../shared/rpc";
import type { DiffTypography, FileProgress, LineComment } from "../shared/settings";

type Theme = PluginSurfaceProps["theme"];

export interface DiffViewProps {
  pathKey: string;
  displayPath: string;
  file: DiffFile;
  cwd: string;
  status: "ok" | "binary" | "too_large" | "missing" | "loading";
  hunks: readonly DiffHunk[];
  error: string | null;
  progress: FileProgress;
  typography: DiffTypography;
  theme: Theme;
  compact: boolean;
  platform: "ios" | "android" | "web";
  canViewFile: boolean;
  keyboardEnabled: boolean;
  onToggleViewed(): void;
  onIgnore(): void;
  onViewFile(): void;
  /** Returns an error message, or null on success. */
  onDiscardFile(): Promise<string | null>;
  onChangeFileComment(body: string): Promise<boolean>;
  onSaveLineComment(comment: LineComment): Promise<boolean>;
  onDeleteLineComment(comment: Pick<LineComment, "side" | "startLine" | "endLine">): Promise<boolean>;
}
