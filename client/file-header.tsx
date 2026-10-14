import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { diffPalette } from "./colors";
import { composerKeyProps } from "./keyboard";
import { TooltipButton, TooltipBox } from "./tooltip-button";
import type { DiffFile } from "../shared/rpc";
import type { FileProgress } from "../shared/settings";

type Theme = PluginSurfaceProps["theme"];

interface FileHeaderProps {
  displayPath: string;
  file: DiffFile;
  progress: FileProgress;
  theme: Theme;
  compact: boolean;
  platform: "ios" | "android" | "web";
  canViewFile: boolean;
  onToggleViewed(): void;
  onIgnore(): void;
  commentOpen: boolean;
  onCommentOpenChange(open: boolean): void;
  onSaveFileComment(body: string): Promise<boolean>;
  onViewFile(): void;
  /** Returns an error message, or null on success. */
  onDiscardFile(): Promise<string | null>;
}

export function FileHeader({
  displayPath,
  file,
  progress,
  theme,
  compact,
  platform,
  canViewFile,
  onToggleViewed,
  onIgnore,
  commentOpen,
  onCommentOpenChange,
  onSaveFileComment,
  onViewFile,
  onDiscardFile,
}: FileHeaderProps) {
  const toast = useToast();
  const palette = useMemo(() => diffPalette(theme), [theme]);
  const viewed = progress.status === "seen";
  const ignored = progress.status === "ignored";
  const canDiscard = file.path !== ".";
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(progress.fileComment ?? "");
  const [savingComment, setSavingComment] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const styles = useMemo(
    () => ({
      root: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: compact ? 8 : 10,
        flexWrap: "wrap" as const,
        paddingBottom: 8,
        paddingTop: 2,
        backgroundColor: theme.colors.surface0,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        zIndex: menuOpen ? 20 : 1,
        flexShrink: 0,
      },
      modalHint: { color: theme.colors.foregroundMuted, fontSize: 11, marginLeft: "auto" as const },
      name: {
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 120,
        color: theme.colors.foreground,
        fontSize: compact ? 14 : 15,
        fontWeight: "600" as const,
      },
      right: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        flexShrink: 0,
        flexWrap: "wrap" as const,
        zIndex: 2,
      },
      stats: { flexDirection: "row" as const, gap: 6, alignItems: "center" as const },
      add: {
        color: palette.addFg,
        fontSize: 12,
        fontWeight: "600" as const,
        fontFamily: "monospace",
      },
      del: {
        color: palette.delFg,
        fontSize: 12,
        fontWeight: "600" as const,
        fontFamily: "monospace",
      },
      viewedBox: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: viewed ? theme.colors.statusSuccess : theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      checkbox: {
        width: 16,
        height: 16,
        borderRadius: 3,
        borderWidth: 1,
        borderColor: viewed ? theme.colors.statusSuccess : theme.colors.border,
        backgroundColor: viewed ? theme.colors.statusSuccess : "transparent",
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      viewedLabel: {
        color: viewed ? theme.colors.statusSuccess : theme.colors.foreground,
        fontSize: 12,
        fontWeight: "600" as const,
      },
      iconButton: {
        width: 32,
        height: 32,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      iconButtonActive: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.surface2,
      },
      iconButtonDanger: {
        borderColor: ignored ? theme.colors.statusDanger : theme.colors.border,
      },
      menuAnchor: { position: "relative" as const, zIndex: 30 },
      menuPopover: {
        position: "absolute" as const,
        top: 36,
        right: 0,
        minWidth: 200,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        paddingVertical: 4,
        zIndex: 40,
        elevation: 16,
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      menuItem: {
        paddingVertical: 10,
        paddingHorizontal: 12,
      },
      menuText: { color: theme.colors.foreground, fontSize: 13, fontWeight: "500" as const },
      menuDanger: { color: theme.colors.statusDanger, fontSize: 13, fontWeight: "500" as const },
      menuMuted: { color: theme.colors.foregroundMuted, fontSize: 11, marginTop: 2 },
      input: {
        minHeight: 120,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 12,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface0,
        textAlignVertical: "top" as const,
      },
      modalActions: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        marginTop: 12,
      },
      actionPressable: { paddingVertical: 8, paddingHorizontal: 4 },
      action: { color: theme.colors.accent, fontWeight: "600" as const },
      danger: { color: theme.colors.statusDanger, fontWeight: "600" as const },
    }),
    [compact, ignored, menuOpen, palette, theme, viewed],
  );

  // Reseed the draft from the saved note each time the modal opens.
  useEffect(() => {
    if (commentOpen) setDraft(progress.fileComment ?? "");
  }, [commentOpen]);

  const openComment = useCallback(() => {
    setMenuOpen(false);
    onCommentOpenChange(true);
  }, [onCommentOpenChange]);

  const saveComment = useCallback(async () => {
    if (savingComment) return;
    setSavingComment(true);
    try {
      const ok = await onSaveFileComment(draft);
      if (ok) onCommentOpenChange(false);
      else toast.error("Could not save file comment");
    } finally {
      setSavingComment(false);
    }
  }, [draft, onCommentOpenChange, onSaveFileComment, savingComment, toast]);

  const saveCommentPress = useCallback(() => {
    void saveComment();
  }, [saveComment]);
  const keyProps = useMemo(
    () => composerKeyProps({ onSave: saveCommentPress }),
    [saveCommentPress],
  );

  const clearComment = useCallback(async () => {
    setSavingComment(true);
    try {
      const ok = await onSaveFileComment("");
      if (ok) {
        setDraft("");
        onCommentOpenChange(false);
      } else {
        toast.error("Could not delete file comment");
      }
    } finally {
      setSavingComment(false);
    }
  }, [onCommentOpenChange, onSaveFileComment, toast]);

  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const viewFile = useCallback(() => {
    setMenuOpen(false);
    if (!canViewFile) {
      toast.error("This host cannot open files in the editor yet.");
      return;
    }
    onViewFile();
  }, [canViewFile, onViewFile, toast]);

  const discardFile = useCallback(() => {
    if (discarding) return;
    setMenuOpen(false);
    if (!canDiscard) {
      toast.error("Cannot discard a submodule placeholder.");
      return;
    }
    setDiscarding(true);
    void (async () => {
      try {
        const error = await onDiscardFile();
        if (error) toast.error(error);
      } finally {
        setDiscarding(false);
      }
    })();
  }, [canDiscard, discarding, onDiscardFile, toast]);

  useEffect(() => {
    if (!menuOpen || platform !== "web") return;
    const doc = (
      globalThis as {
        document?: {
          addEventListener: (type: string, listener: () => void) => void;
          removeEventListener: (type: string, listener: () => void) => void;
        };
      }
    ).document;
    if (!doc) return;
    // Defer so the opening click does not immediately dismiss.
    const timer = setTimeout(() => doc.addEventListener("mousedown", closeMenu), 0);
    return () => {
      clearTimeout(timer);
      doc.removeEventListener("mousedown", closeMenu);
    };
  }, [closeMenu, menuOpen, platform]);

  const hasComment = Boolean(progress.fileComment?.trim()) || Boolean(draft.trim());
  const modalIcon = (
    <Icon name="MessageSquare" size={18} color={theme.colors.foreground} />
  );

  return (
    <>
      <View style={styles.root}>
        <Text style={styles.name} numberOfLines={1}>
          {displayPath}
        </Text>
        <View style={styles.right}>
          <TooltipBox
            label={`+${file.additions} −${file.deletions}`}
            platform={platform}
            theme={theme}
          >
            <View style={styles.stats}>
              <Text style={styles.add}>+{file.additions}</Text>
              <Text style={styles.del}>-{file.deletions}</Text>
            </View>
          </TooltipBox>
          <TooltipButton
            label={viewed ? "Mark as not viewed" : "Mark as viewed"}
            platform={platform}
            theme={theme}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: viewed }}
            onPress={onToggleViewed}
            style={styles.viewedBox}
          >
            <View style={styles.checkbox}>
              {viewed ? <Icon name="Check" size={12} color="#ffffff" /> : null}
            </View>
            <Text style={styles.viewedLabel}>Viewed</Text>
          </TooltipButton>
          <TooltipButton
            label={progress.fileComment ? "Edit file comment" : "Add file comment"}
            platform={platform}
            theme={theme}
            onPress={openComment}
            style={[styles.iconButton, progress.fileComment ? styles.iconButtonActive : null]}
          >
            <Icon
              name="MessageSquare"
              size={16}
              color={progress.fileComment ? theme.colors.accent : theme.colors.foreground}
            />
          </TooltipButton>
          <TooltipButton
            label={ignored ? "Unignore file" : "Ignore file"}
            platform={platform}
            theme={theme}
            onPress={onIgnore}
            style={[styles.iconButton, styles.iconButtonDanger]}
          >
            <Icon
              name="EyeOff"
              size={16}
              color={ignored ? theme.colors.statusDanger : theme.colors.foreground}
            />
          </TooltipButton>
          <View style={styles.menuAnchor}>
            <TooltipButton
              label="More actions"
              platform={platform}
              theme={theme}
              onPress={toggleMenu}
              style={styles.iconButton}
            >
              <Icon name="MoreHorizontal" size={16} color={theme.colors.foreground} />
            </TooltipButton>
            {menuOpen ? (
              <View
                style={styles.menuPopover}
                {...(platform === "web"
                  ? {
                      onMouseDown: (event: { stopPropagation?: () => void }) => {
                        event.stopPropagation?.();
                      },
                    }
                  : {})}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={viewFile}
                  style={styles.menuItem}
                >
                  <Text style={styles.menuText}>View file</Text>
                  {!canViewFile ? (
                    <Text style={styles.menuMuted}>
                      Requires a host that can open the editor
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={discarding || !canDiscard}
                  onPress={discardFile}
                  style={styles.menuItem}
                >
                  <Text style={styles.menuDanger}>
                    {discarding ? "Discarding…" : "Discard changes"}
                  </Text>
                  <Text style={styles.menuMuted}>
                    {canDiscard
                      ? "Revert unstaged worktree changes for this file"
                      : "Submodule placeholder cannot be discarded"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <Modal
        open={commentOpen}
        onOpenChange={onCommentOpenChange}
        title="File comment"
        icon={modalIcon}
      >
        <Modal.Content>
          <TextInput
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder="Optional note for this file"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            autoFocus
            {...keyProps}
          />
          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              disabled={savingComment}
              onPress={saveCommentPress}
              style={styles.actionPressable}
            >
              <Text style={styles.action}>{savingComment ? "Saving…" : "Save"}</Text>
            </Pressable>
            {hasComment ? (
              <Pressable
                accessibilityRole="button"
                disabled={savingComment}
                onPress={() => void clearComment()}
                style={styles.actionPressable}
              >
                <Text style={styles.danger}>Delete</Text>
              </Pressable>
            ) : null}
            <Text style={styles.modalHint}>Ctrl+Enter to save</Text>
          </View>
        </Modal.Content>
      </Modal>
    </>
  );
}
