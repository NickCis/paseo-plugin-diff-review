import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { diffPalette } from "./colors";
import { composerKeyProps } from "./keyboard";
import { TooltipButton, TooltipBox } from "./tooltip-button";
import type { DiffFile } from "../shared/rpc";
import type { FileProgress } from "../shared/settings";

type Theme = PluginSurfaceProps["theme"];

export interface CompactPanelActions {
  onRefresh(): void;
  onOpenFileList(): void;
  onAskClearComments(): void;
  onSend(): void;
  sendDisabled: boolean;
  fileCount: number;
  hasComments: boolean;
  clearingComments: boolean;
}

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
  panelActions?: CompactPanelActions;
}

function useMenuDismiss(menuOpen: boolean, platform: "ios" | "android" | "web", closeMenu: () => void) {
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
    const timer = setTimeout(() => doc.addEventListener("mousedown", closeMenu), 0);
    return () => {
      clearTimeout(timer);
      doc.removeEventListener("mousedown", closeMenu);
    };
  }, [closeMenu, menuOpen, platform]);
}

type MenuStyles = {
  menuItem: object;
  menuItemRow: object;
  menuText: object;
  menuDanger: object;
  menuMuted: object;
};

function MenuItemRow({
  label,
  subtitle,
  danger,
  disabled,
  icon,
  iconColor,
  onPress,
  styles,
}: {
  label: string;
  subtitle?: string;
  danger?: boolean;
  disabled?: boolean;
  icon?: string;
  iconColor: string;
  onPress(): void;
  styles: MenuStyles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.menuItem, styles.menuItemRow]}
    >
      {icon ? <Icon name={icon} size={16} color={iconColor} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={danger ? styles.menuDanger : styles.menuText}>{label}</Text>
        {subtitle ? <Text style={styles.menuMuted}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

function PanelMenuItems({
  actions,
  theme,
  styles,
  onClose,
}: {
  actions: CompactPanelActions;
  theme: Theme;
  styles: MenuStyles;
  onClose(): void;
}) {
  return (
    <>
      <MenuItemRow
        label="Refresh"
        icon="RefreshCw"
        iconColor={theme.colors.foreground}
        styles={styles}
        onPress={() => {
          onClose();
          actions.onRefresh();
        }}
      />
      <MenuItemRow
        label="Changed files"
        subtitle={`${actions.fileCount} file${actions.fileCount === 1 ? "" : "s"}`}
        icon="Files"
        iconColor={theme.colors.foreground}
        styles={styles}
        onPress={() => {
          onClose();
          actions.onOpenFileList();
        }}
      />
      <MenuItemRow
        label="Clear comments"
        subtitle={!actions.hasComments ? "No comments to clear" : undefined}
        danger
        disabled={!actions.hasComments || actions.clearingComments}
        icon="MessageSquare"
        iconColor={theme.colors.statusDanger}
        styles={styles}
        onPress={() => {
          onClose();
          actions.onAskClearComments();
        }}
      />
      <MenuItemRow
        label="Send review"
        disabled={actions.sendDisabled}
        icon="Send"
        iconColor={theme.colors.accent}
        styles={styles}
        onPress={() => {
          onClose();
          actions.onSend();
        }}
      />
    </>
  );
}

export function CompactPanelToolbar({
  theme,
  platform,
  panelActions,
}: {
  theme: Theme;
  platform: "ios" | "android" | "web";
  panelActions: CompactPanelActions;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);
  useMenuDismiss(menuOpen, platform, closeMenu);

  const styles = useMemo(
    () => ({
      root: {
        flexDirection: "row" as const,
        justifyContent: "flex-end" as const,
        paddingBottom: 4,
        zIndex: menuOpen ? 20 : 1,
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
      menuItem: { paddingVertical: 10, paddingHorizontal: 12 },
      menuItemRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
      },
      menuText: { color: theme.colors.foreground, fontSize: 13, fontWeight: "500" as const },
      menuDanger: { color: theme.colors.statusDanger, fontSize: 13, fontWeight: "500" as const },
      menuMuted: { color: theme.colors.foregroundMuted, fontSize: 11, marginTop: 2 },
    }),
    [menuOpen, theme],
  );

  return (
    <View style={styles.root}>
      <View style={styles.menuAnchor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More actions"
          onPress={toggleMenu}
          style={styles.iconButton}
        >
          <Icon name="MoreHorizontal" size={16} color={theme.colors.foreground} />
        </Pressable>
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
            <PanelMenuItems
              actions={panelActions}
              theme={theme}
              styles={styles}
              onClose={closeMenu}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
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
  panelActions,
}: FileHeaderProps) {
  const toast = useToast();
  const palette = useMemo(() => diffPalette(theme), [theme]);
  const viewed = progress.status === "seen";
  const ignored = progress.status === "ignored";
  const canDiscard = file.path !== ".";
  const compactToolbar = compact && panelActions != null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(progress.fileComment ?? "");
  const [savingComment, setSavingComment] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const styles = useMemo(
    () => ({
      root: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: compactToolbar ? 6 : compact ? 8 : 10,
        flexWrap: (compactToolbar ? "nowrap" : "wrap") as "nowrap" | "wrap",
        paddingBottom: 8,
        paddingTop: 2,
        backgroundColor: theme.colors.surface0,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        zIndex: menuOpen ? 20 : 1,
        flexShrink: 0,
      },
      nameScroll: {
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 0,
      },
      modalHint: { color: theme.colors.foregroundMuted, fontSize: 11, marginLeft: "auto" as const },
      name: {
        color: theme.colors.foreground,
        fontSize: compact ? 14 : 15,
        fontWeight: "600" as const,
      },
      nameTruncated: {
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
        gap: compactToolbar ? 6 : 8,
        flexShrink: 0,
        flexWrap: (compactToolbar ? "nowrap" : "wrap") as "nowrap" | "wrap",
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
        paddingHorizontal: compactToolbar ? 4 : 8,
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
      menuItemRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
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
    [compact, compactToolbar, ignored, menuOpen, palette, theme, viewed],
  );

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
  useMenuDismiss(menuOpen, platform, closeMenu);

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

  const hasComment = Boolean(progress.fileComment?.trim()) || Boolean(draft.trim());
  const modalIcon = <Icon name="MessageSquare" size={18} color={theme.colors.foreground} />;

  const viewedControl =
    platform === "web" && !compactToolbar ? (
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
    ) : (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={viewed ? "Mark as not viewed" : "Mark as viewed"}
        accessibilityState={{ checked: viewed }}
        onPress={onToggleViewed}
        style={styles.viewedBox}
      >
        <View style={styles.checkbox}>
          {viewed ? <Icon name="Check" size={12} color="#ffffff" /> : null}
        </View>
        {!compactToolbar ? <Text style={styles.viewedLabel}>Viewed</Text> : null}
      </Pressable>
    );

  const menuPopover = menuOpen ? (
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
      {compactToolbar && panelActions ? (
        <PanelMenuItems
          actions={panelActions}
          theme={theme}
          styles={styles}
          onClose={closeMenu}
        />
      ) : null}
      {compactToolbar ? (
        <MenuItemRow
          label={progress.fileComment ? "Edit file comment" : "Add file comment"}
          subtitle={progress.fileComment ? "Comment saved" : undefined}
          icon="MessageSquare"
          iconColor={progress.fileComment ? theme.colors.accent : theme.colors.foreground}
          styles={styles}
          onPress={openComment}
        />
      ) : null}
      <MenuItemRow
        label="View file"
        subtitle={!canViewFile ? "Requires a host that can open the editor" : undefined}
        styles={styles}
        iconColor={theme.colors.foreground}
        onPress={viewFile}
      />
      <MenuItemRow
        label={discarding ? "Discarding…" : "Discard changes"}
        subtitle={
          canDiscard
            ? "Revert unstaged worktree changes for this file"
            : "Submodule placeholder cannot be discarded"
        }
        danger
        disabled={discarding || !canDiscard}
        styles={styles}
        iconColor={theme.colors.statusDanger}
        onPress={discardFile}
      />
    </View>
  ) : null;

  return (
    <>
      <View style={styles.root}>
        {compactToolbar ? (
          <ScrollView
            horizontal
            style={styles.nameScroll}
            contentContainerStyle={{ alignItems: "center" }}
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={displayPath}
          >
            <Text style={styles.name}>{displayPath}</Text>
          </ScrollView>
        ) : (
          <Text style={styles.nameTruncated} numberOfLines={1}>
            {displayPath}
          </Text>
        )}
        <View style={styles.right}>
          {platform === "web" ? (
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
          ) : (
            <View style={styles.stats} accessibilityLabel={`+${file.additions} −${file.deletions}`}>
              <Text style={styles.add}>+{file.additions}</Text>
              <Text style={styles.del}>-{file.deletions}</Text>
            </View>
          )}
          {viewedControl}
          {compactToolbar ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ignored ? "Unignore file" : "Ignore file"}
              onPress={onIgnore}
              style={[styles.iconButton, styles.iconButtonDanger]}
            >
              <Icon
                name="EyeOff"
                size={16}
                color={ignored ? theme.colors.statusDanger : theme.colors.foreground}
              />
            </Pressable>
          ) : null}
          {!compactToolbar && platform === "web" ? (
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
          ) : null}
          {!compactToolbar && platform !== "web" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={progress.fileComment ? "Edit file comment" : "Add file comment"}
              onPress={openComment}
              style={[styles.iconButton, progress.fileComment ? styles.iconButtonActive : null]}
            >
              <Icon
                name="MessageSquare"
                size={16}
                color={progress.fileComment ? theme.colors.accent : theme.colors.foreground}
              />
            </Pressable>
          ) : null}
          {!compactToolbar && platform === "web" ? (
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
          ) : null}
          {!compactToolbar && platform !== "web" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ignored ? "Unignore file" : "Ignore file"}
              onPress={onIgnore}
              style={[styles.iconButton, styles.iconButtonDanger]}
            >
              <Icon
                name="EyeOff"
                size={16}
                color={ignored ? theme.colors.statusDanger : theme.colors.foreground}
              />
            </Pressable>
          ) : null}
          <View style={styles.menuAnchor}>
            {platform === "web" && !compactToolbar ? (
              <TooltipButton
                label="More actions"
                platform={platform}
                theme={theme}
                onPress={toggleMenu}
                style={styles.iconButton}
              >
                <Icon name="MoreHorizontal" size={16} color={theme.colors.foreground} />
              </TooltipButton>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More actions"
                onPress={toggleMenu}
                style={styles.iconButton}
              >
                <Icon name="MoreHorizontal" size={16} color={theme.colors.foreground} />
              </Pressable>
            )}
            {menuPopover}
          </View>
        </View>
      </View>

      {commentOpen ? (
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
      ) : null}
    </>
  );
}
