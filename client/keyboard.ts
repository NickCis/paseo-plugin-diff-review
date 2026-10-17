/**
 * Key event shape. On web this is a DOM/React keyboard event; on native, RN key
 * press events only carry the key under `nativeEvent`.
 */
export type WebKeyEvent = {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
  nativeEvent?: { key?: string };
  preventDefault?: () => void;
};

export type WebDocument = {
  addEventListener(type: "keydown", listener: (event: WebKeyEvent) => void): void;
  removeEventListener(type: "keydown", listener: (event: WebKeyEvent) => void): void;
};

export type ReviewKeyAction =
  | "cursorDown"
  | "cursorUp"
  | "pageDown"
  | "pageUp"
  | "cursorTop"
  | "cursorBottom"
  | "toggleVisual"
  | "lineComment"
  | "fileComment"
  | "markRead"
  | "ignore"
  | "escape";

const REVIEW_KEY_ACTIONS = new Map<string, ReviewKeyAction>([
  ["j", "cursorDown"],
  ["ArrowDown", "cursorDown"],
  ["k", "cursorUp"],
  ["ArrowUp", "cursorUp"],
  ["v", "toggleVisual"],
  ["c", "lineComment"],
  ["C", "fileComment"],
  ["r", "markRead"],
  ["i", "ignore"],
  ["Escape", "escape"],
]);

function keyOf(event: WebKeyEvent): string | undefined {
  return event.key ?? event.nativeEvent?.key;
}

export function isSaveChord(event: WebKeyEvent): boolean {
  return keyOf(event) === "Enter" && Boolean(event.ctrlKey || event.metaKey);
}

/**
 * Key props for a multiline composer: Ctrl/Cmd+Enter saves, Escape cancels.
 *
 * Must be `onKeyPress`: react-native-web's TextInput overwrites `onKeyDown` with its
 * own handler and only forwards to `onKeyPress`, so an `onKeyDown` prop never fires.
 */
export function composerKeyProps(handlers: {
  onSave(): void;
  onCancel?(): void;
}): Record<string, unknown> {
  return {
    onKeyPress: (event: WebKeyEvent) => {
      if (isSaveChord(event)) {
        event.preventDefault?.();
        handlers.onSave();
        return;
      }
      if (handlers.onCancel && keyOf(event) === "Escape") {
        event.preventDefault?.();
        handlers.onCancel();
      }
    },
  };
}

/**
 * Ctrl+F / Ctrl+B page the diff (vim). Other modifier chords are ignored.
 * Plain `f` and `b` are not shortcuts.
 */
export function reviewModifierAction(event: WebKeyEvent): ReviewKeyAction | null {
  if (!event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = keyOf(event)?.toLowerCase();
  if (key === "f") return "pageDown";
  if (key === "b") return "pageUp";
  return null;
}

/** Maps a diff-review shortcut key to its action. Modifier combos are filtered by the caller. */
export function reviewKeyAction(key: string | undefined): ReviewKeyAction | null {
  if (!key) return null;
  if (key === "G") return "cursorBottom";
  return REVIEW_KEY_ACTIONS.get(key) ?? null;
}

/**
 * Resolves one key, including the `gg` chord. A lone `g` arms the chord; the next
 * key either completes it or runs as itself.
 */
export function nextReviewKey(
  pending: "g" | null,
  key: string | undefined,
): { action: ReviewKeyAction | null; pending: "g" | null } {
  if (!key) return { action: null, pending };
  if (pending === "g") {
    if (key === "g") return { action: "cursorTop", pending: null };
    return { action: reviewKeyAction(key), pending: null };
  }
  if (key === "g") return { action: null, pending: "g" };
  return { action: reviewKeyAction(key), pending: null };
}

/** Keystrokes typed into inputs must not trigger review shortcuts. */
export function isEditableTarget(target: unknown): boolean {
  const node = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!node) return false;
  if (node.isContentEditable) return true;
  return node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT";
}

export function webDocument(): WebDocument | null {
  return (globalThis as { document?: WebDocument }).document ?? null;
}
