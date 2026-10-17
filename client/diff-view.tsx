import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
} from "react";
import { Pressable, Text, View } from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { diffPalette } from "./colors";
import { ExpandButton } from "./expand-button";
import { FileHeader } from "./file-header";
import { HighlightedContent } from "./highlight-text";
import { InlineCommentCard } from "./inline-comment";
import {
  composerKeyProps,
  isEditableTarget,
  nextReviewKey,
  reviewModifierAction,
  webDocument,
  type ReviewKeyAction,
  type WebKeyEvent,
} from "./keyboard";
import { commentKey } from "./progress";
import { diffContextRpc, type DiffFile, type DiffHunk, type DiffLine } from "../shared/rpc";
import type { DiffTypography, FileProgress, LineComment } from "../shared/settings";

type Theme = PluginSurfaceProps["theme"];

interface DiffViewProps {
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

type DisplayLine = DiffLine & { id: string; source: "hunk" | "expand" };

interface Gap {
  id: string;
  side: "old" | "new";
  startLine: number;
  endLine: number;
  beforeId: string | null;
}

const EXPAND_CHUNK = 20;

function lineSide(line: DiffLine): "old" | "new" | null {
  if (line.type === "del") return "old";
  if (line.type === "add") return "new";
  if (line.newLineNumber != null) return "new";
  if (line.oldLineNumber != null) return "old";
  return null;
}

function lineNumberForSide(line: DiffLine, side: "old" | "new"): number | null {
  return side === "new" ? line.newLineNumber : line.oldLineNumber;
}

function lineInRange(
  line: DiffLine,
  range: { side: "old" | "new"; startLine: number; endLine: number },
): boolean {
  const number = lineNumberForSide(line, range.side);
  if (number == null) return false;
  const lo = Math.min(range.startLine, range.endLine);
  const hi = Math.max(range.startLine, range.endLine);
  return number >= lo && number <= hi;
}

type LineRange = { side: "old" | "new"; startLine: number; endLine: number };
type RowNode = ComponentRef<typeof View>;

function isSelectableLine(line: DisplayLine): boolean {
  const side = lineSide(line);
  return side != null && lineNumberForSide(line, side) != null;
}

/** Inclusive range between two display lines, using the side of the first line. */
function rangeBetween(
  lines: readonly DisplayLine[],
  fromId: string,
  toId: string,
): LineRange | null {
  const from = lines.findIndex((line) => line.id === fromId);
  const to = lines.findIndex((line) => line.id === toId);
  if (from < 0 || to < 0) return null;
  const side = lineSide(lines[from]!);
  if (!side) return null;
  let startLine: number | null = null;
  let endLine: number | null = null;
  for (let index = Math.min(from, to); index <= Math.max(from, to); index += 1) {
    const number = lineNumberForSide(lines[index]!, side);
    if (number == null) continue;
    startLine = startLine == null ? number : Math.min(startLine, number);
    endLine = endLine == null ? number : Math.max(endLine, number);
  }
  if (startLine == null || endLine == null) return null;
  return { side, startLine, endLine };
}

const IDLE_MARK = { cursor: false, selected: false };

type LineMark = { cursor: boolean; selected: boolean };
type ScrollAlign = "nearest" | "start" | "end" | "pin";

/**
 * Line marker kept outside React state. A j/k repeat must not re-render the file:
 * rows subscribe here and bail out unless their own cursor or selection bit changes.
 */
class LineCursorStore {
  cursorId: string | null = null;
  visualAnchorId: string | null = null;
  scrollAlign: ScrollAlign = "nearest";
  /** Viewport offset, in px, used when `scrollAlign` is `pin`. */
  scrollPin = 0;
  scrollSeq = 0;
  lines: readonly DisplayLine[] = [];
  selectableIds: string[] = [];
  private indexById = new Map<string, number>();
  private selected = new Set<string>();
  private marks = new Map<string, LineMark>();
  private listeners = new Map<string, Set<() => void>>();
  private subscribeFns = new Map<string, (listener: () => void) => () => void>();
  private scrollListeners = new Set<() => void>();

  /** Stable per line id so a row subscribes once, not on every parent render. */
  subscribeFor(id: string): (listener: () => void) => () => void {
    const existing = this.subscribeFns.get(id);
    if (existing) return existing;
    const subscribe = (listener: () => void) => {
      let bucket = this.listeners.get(id);
      if (!bucket) {
        bucket = new Set();
        this.listeners.set(id, bucket);
      }
      const active = bucket;
      active.add(listener);
      return () => {
        active.delete(listener);
        if (active.size === 0) this.listeners.delete(id);
      };
    };
    this.subscribeFns.set(id, subscribe);
    return subscribe;
  }

  subscribeScroll = (listener: () => void) => {
    this.scrollListeners.add(listener);
    return () => {
      this.scrollListeners.delete(listener);
    };
  };

  mark(id: string): LineMark {
    const cursor = this.cursorId === id;
    const selected = this.selected.has(id);
    if (!cursor && !selected) return IDLE_MARK;
    const prev = this.marks.get(id);
    if (prev && prev.cursor === cursor && prev.selected === selected) return prev;
    const next = { cursor, selected };
    this.marks.set(id, next);
    return next;
  }

  syncLines(lines: readonly DisplayLine[]) {
    if (this.lines === lines) return;
    this.lines = lines;
    this.selectableIds = [];
    this.indexById = new Map();
    for (const line of lines) {
      if (!isSelectableLine(line)) continue;
      this.indexById.set(line.id, this.selectableIds.length);
      this.selectableIds.push(line.id);
    }
    const prevCursor = this.cursorId;
    const prevSelected = this.selected;
    if (this.cursorId != null && !this.indexById.has(this.cursorId)) this.cursorId = null;
    if (this.visualAnchorId != null && !lines.some((line) => line.id === this.visualAnchorId)) {
      this.visualAnchorId = null;
    }
    if (this.visualAnchorId) this.rebuildSelected();
    else if (this.selected.size > 0) this.selected = new Set();
    const dirty = this.diffIds(prevSelected, this.selected, null);
    if (prevCursor && prevCursor !== this.cursorId) dirty.add(prevCursor);
    if (this.cursorId && prevCursor !== this.cursorId) dirty.add(this.cursorId);
    if (dirty.size > 0) this.emitIds(dirty);
  }

  reset() {
    const dirty = this.cursorId != null || this.visualAnchorId != null || this.selected.size > 0;
    this.cursorId = null;
    this.visualAnchorId = null;
    this.selected = new Set();
    this.marks.clear();
    this.scrollAlign = "nearest";
    this.scrollPin = 0;
    if (dirty) this.emitAll();
  }

  currentId(): string | null {
    if (this.cursorId != null && this.indexById.has(this.cursorId)) return this.cursorId;
    return this.selectableIds[0] ?? null;
  }

  move(delta: number) {
    const ids = this.selectableIds;
    if (ids.length === 0) return;
    const index = this.cursorId != null ? this.indexById.get(this.cursorId) : undefined;
    const from = index == null ? 0 : index;
    const next = Math.min(ids.length - 1, Math.max(0, from + delta));
    this.commitCursor(ids[next]!, "nearest");
  }

  jump(edge: "start" | "end") {
    const ids = this.selectableIds;
    if (ids.length === 0) return;
    const id = edge === "start" ? ids[0]! : ids[ids.length - 1]!;
    this.commitCursor(id, edge);
  }

  /** Moves the marker to `id` and keeps it `pin` pixels below the viewport top. */
  placePinned(id: string, pin: number) {
    this.scrollPin = pin;
    this.commitCursor(id, "pin");
  }

  focusLine(id: string) {
    const prevSelected = this.selected;
    this.visualAnchorId = null;
    this.selected = new Set();
    this.commitCursor(id, "nearest");
    if (prevSelected.size > 0) this.emitIds(prevSelected);
  }

  toggleVisual() {
    if (this.visualAnchorId) {
      this.clearVisual();
      return;
    }
    const id = this.currentId();
    if (!id) return;
    const prevCursor = this.cursorId;
    this.cursorId = id;
    this.visualAnchorId = id;
    this.rebuildSelected();
    this.scrollAlign = "nearest";
    this.scrollSeq += 1;
    const dirty = new Set<string>(this.selected);
    if (prevCursor) dirty.add(prevCursor);
    this.emitIds(dirty);
    this.emitScroll();
  }

  clearVisual() {
    if (!this.visualAnchorId && this.selected.size === 0) return;
    const prevSelected = this.selected;
    this.visualAnchorId = null;
    this.selected = new Set();
    this.emitIds(prevSelected);
  }

  private commitCursor(id: string | null, align: ScrollAlign) {
    const prevCursor = this.cursorId;
    const prevSelected = this.selected;
    this.cursorId = id;
    if (this.visualAnchorId) this.rebuildSelected();
    this.scrollAlign = align;
    this.scrollSeq += 1;
    const dirty = new Set<string>();
    if (prevCursor) dirty.add(prevCursor);
    if (id) dirty.add(id);
    if (prevSelected !== this.selected) {
      for (const lineId of prevSelected) {
        if (!this.selected.has(lineId)) dirty.add(lineId);
      }
      for (const lineId of this.selected) {
        if (!prevSelected.has(lineId)) dirty.add(lineId);
      }
    }
    this.emitIds(dirty);
    this.emitScroll();
  }

  private rebuildSelected() {
    const next = new Set<string>();
    if (this.visualAnchorId && this.cursorId) {
      const range = rangeBetween(this.lines, this.visualAnchorId, this.cursorId);
      if (range) {
        for (const line of this.lines) {
          if (lineInRange(line, range)) next.add(line.id);
        }
      }
    }
    this.selected = next;
  }

  private diffIds(
    prevSelected: ReadonlySet<string>,
    nextSelected: ReadonlySet<string>,
    cursorId: string | null,
  ): Set<string> {
    const dirty = new Set<string>();
    if (cursorId) dirty.add(cursorId);
    for (const lineId of prevSelected) {
      if (!nextSelected.has(lineId)) dirty.add(lineId);
    }
    for (const lineId of nextSelected) {
      if (!prevSelected.has(lineId)) dirty.add(lineId);
    }
    return dirty;
  }

  private emitIds(ids: Iterable<string>) {
    for (const id of ids) {
      const bucket = this.listeners.get(id);
      if (!bucket) continue;
      for (const listener of bucket) listener();
    }
  }

  private emitAll() {
    for (const bucket of this.listeners.values()) {
      for (const listener of bucket) listener();
    }
  }

  private emitScroll() {
    for (const listener of this.scrollListeners) listener();
  }
}

type ScrollEl = {
  getBoundingClientRect?: () => { top: number; bottom: number };
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
  parentElement?: ScrollEl | null;
  scrollIntoView?: (options: { block: ScrollAlign }) => void;
};

function findVerticalScroller(el: ScrollEl): ScrollEl | null {
  const getStyle = (
    globalThis as { getComputedStyle?: (node: ScrollEl) => { overflowY?: string } }
  ).getComputedStyle;
  let parent = el.parentElement ?? null;
  while (parent) {
    const overflowY = getStyle?.(parent).overflowY ?? "";
    const height = parent.clientHeight ?? 0;
    const scrollHeight = parent.scrollHeight ?? 0;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      scrollHeight > height + 1
    ) {
      return parent;
    }
    parent = parent.parentElement ?? null;
  }
  return null;
}

/** Scrolls one row inside the diff pane. Skips the layout read when it is already visible. */
function scrollLineIntoView(node: object, align: ScrollAlign, pin = 0) {
  const el = node as ScrollEl;
  if (typeof el.getBoundingClientRect !== "function") return;
  const scroller = findVerticalScroller(el);
  if (
    !scroller ||
    typeof scroller.getBoundingClientRect !== "function" ||
    typeof scroller.scrollTop !== "number"
  ) {
    if (align !== "pin") el.scrollIntoView?.({ block: align });
    return;
  }
  const row = el.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  if (align === "nearest" && row.top >= view.top && row.bottom <= view.bottom) return;
  let delta = 0;
  if (align === "pin") delta = row.top - view.top - pin;
  else if (align === "start") delta = row.top - view.top;
  else if (align === "end") delta = row.bottom - view.bottom;
  else if (row.top < view.top) delta = row.top - view.top;
  else delta = row.bottom - view.bottom;
  scroller.scrollTop += delta;
}

/** Lines to jump when the diff pane has not been measured yet. */
const PAGE_FALLBACK_LINES = 20;

/**
 * Pages the line marker by about one viewport, keeping two lines of overlap
 * and the marker's place on screen (vim Ctrl-F / Ctrl-B).
 */
function pageCursor(
  store: LineCursorStore,
  rowNodes: Map<string, RowNode>,
  direction: 1 | -1,
) {
  const ids = store.selectableIds;
  if (ids.length === 0) return;
  const currentId = store.currentId();
  if (!currentId) return;
  const start = ids.indexOf(currentId);
  const from = start < 0 ? 0 : start;
  const fallback = () => {
    store.move(direction * Math.min(PAGE_FALLBACK_LINES, ids.length - 1));
  };

  const node = rowNodes.get(ids[from]!) as ScrollEl | undefined;
  if (!node || typeof node.getBoundingClientRect !== "function") {
    fallback();
    return;
  }
  const scroller = findVerticalScroller(node);
  if (
    !scroller ||
    typeof scroller.getBoundingClientRect !== "function" ||
    typeof scroller.clientHeight !== "number"
  ) {
    fallback();
    return;
  }
  const row = node.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const lineHeight = Math.max(1, row.bottom - row.top);
  const viewHeight = scroller.clientHeight > 0 ? scroller.clientHeight : view.bottom - view.top;
  if (viewHeight <= 0) {
    fallback();
    return;
  }
  const overlap = Math.min(lineHeight * 2, viewHeight / 2);
  const pagePx = Math.max(lineHeight, viewHeight - overlap);
  const pin = Math.min(Math.max(0, row.top - view.top), Math.max(0, viewHeight - lineHeight));

  let next = from;
  for (let step = from + direction; step >= 0 && step < ids.length; step += direction) {
    const candidate = rowNodes.get(ids[step]!) as ScrollEl | undefined;
    if (!candidate || typeof candidate.getBoundingClientRect !== "function") break;
    next = step;
    if (Math.abs(candidate.getBoundingClientRect().top - row.top) >= pagePx) break;
  }
  store.placePinned(ids[next]!, pin);
}

function CursorFollow({
  store,
  rowNodes,
}: {
  store: LineCursorStore;
  rowNodes: { current: Map<string, RowNode> };
}) {
  const seq = useSyncExternalStore(
    store.subscribeScroll,
    () => store.scrollSeq,
    () => store.scrollSeq,
  );
  useLayoutEffect(() => {
    if (seq === 0) return;
    const id = store.cursorId;
    if (!id) return;
    const node = rowNodes.current.get(id);
    if (node) scrollLineIntoView(node, store.scrollAlign, store.scrollPin);
  }, [rowNodes, seq, store]);
  return null;
}

function expandAxis(file: DiffFile): "old" | "new" {
  return file.status === "deleted" ? "old" : "new";
}

function lineAxisNumber(line: DiffLine, axis: "old" | "new"): number | null {
  return axis === "new" ? line.newLineNumber : line.oldLineNumber;
}

function buildDisplay(
  hunks: readonly DiffHunk[],
  expanded: Map<string, DisplayLine[]>,
  totalLines: number | null,
  axis: "old" | "new",
): {
  lines: DisplayLine[];
  gaps: Gap[];
} {
  const lines: DisplayLine[] = [];
  const gaps: Gap[] = [];
  let previousAxis: number | null = null;
  let previousId: string | null = null;

  const expandedBlocks = [...expanded.entries()]
    .map(([key, block]) => {
      const [startText, endText] = key.split(":");
      const start = Number(startText);
      const end = Number(endText);
      return { start, end, block, key };
    })
    .filter((entry) => Number.isFinite(entry.start) && Number.isFinite(entry.end))
    .sort((left, right) => left.start - right.start);

  const emitChunk = (
    gapStart: number,
    gapEnd: number,
    beforeId: string | null,
    direction: "up" | "down",
  ) => {
    let end = gapEnd;
    if (totalLines != null) end = Math.min(end, totalLines);
    if (gapStart > end) return;
    let chunkStart = gapStart;
    let chunkEnd = end;
    if (end - gapStart + 1 > EXPAND_CHUNK) {
      if (direction === "up") {
        chunkStart = end - EXPAND_CHUNK + 1;
        chunkEnd = end;
      } else {
        chunkStart = gapStart;
        chunkEnd = gapStart + EXPAND_CHUNK - 1;
      }
    }
    gaps.push({
      id: `gap:${axis}:${chunkStart}-${chunkEnd}`,
      side: axis,
      startLine: chunkStart,
      endLine: chunkEnd,
      beforeId,
    });
  };

  const fillGap = (
    gapStart: number,
    gapEnd: number,
    beforeId: string | null,
    direction: "up" | "down",
  ) => {
    let cursor = gapStart;
    let lastId = beforeId;
    const blocks = expandedBlocks.filter(
      (block) => block.end >= gapStart && block.start <= gapEnd,
    );
    for (const block of blocks) {
      if (block.start > cursor) {
        emitChunk(cursor, block.start - 1, lastId, direction);
      }
      for (const line of block.block) {
        lines.push(line);
        lastId = line.id;
      }
      cursor = Math.max(cursor, block.end + 1);
    }
    if (cursor <= gapEnd) emitChunk(cursor, gapEnd, lastId, direction);
  };

  for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex += 1) {
    const hunk = hunks[hunkIndex]!;
    const firstAxis =
      hunk.lines.map((line) => lineAxisNumber(line, axis)).find((value) => value != null) ?? null;

    if (firstAxis != null && previousAxis != null && firstAxis > previousAxis + 1) {
      fillGap(previousAxis + 1, firstAxis - 1, previousId, "down");
    } else if (firstAxis != null && previousAxis == null && firstAxis > 1) {
      fillGap(1, firstAxis - 1, null, "up");
    }

    for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex += 1) {
      const line = hunk.lines[lineIndex]!;
      const id = `h${hunkIndex}:${lineIndex}:${line.type}:${line.oldLineNumber ?? "-"}:${line.newLineNumber ?? "-"}`;
      lines.push({ ...line, id, source: "hunk" });
      const axisNumber = lineAxisNumber(line, axis);
      if (axisNumber != null) {
        previousAxis = axisNumber;
        previousId = id;
      }
    }
  }

  if (previousAxis != null) {
    const bottomEnd = totalLines ?? previousAxis + EXPAND_CHUNK;
    if (previousAxis < bottomEnd) {
      fillGap(previousAxis + 1, bottomEnd, previousId, "down");
    }
  }

  return { lines, gaps };
}

const DiffLineRow = memo(function DiffLineRow({
  line,
  theme,
  palette,
  typography,
  selected,
  store,
  rowRef,
  platform,
  onPressLine,
  onDragEnterLine,
  onDragStartLine,
  onDragEndLine,
}: {
  line: DisplayLine;
  theme: Theme;
  palette: ReturnType<typeof diffPalette>;
  typography: DiffTypography;
  /** Draft/drag highlight. Keyboard selection comes from `store`. */
  selected: boolean;
  store: LineCursorStore;
  rowRef(node: RowNode | null): void;
  platform: "ios" | "android" | "web";
  onPressLine(side: "old" | "new", lineNumber: number, id: string): void;
  onDragEnterLine(side: "old" | "new", lineNumber: number): void;
  onDragStartLine(side: "old" | "new", lineNumber: number, id: string): void;
  onDragEndLine(): void;
}) {
  const mark = useSyncExternalStore(
    store.subscribeFor(line.id),
    () => store.mark(line.id),
    () => store.mark(line.id),
  );
  const cursor = mark.cursor;
  const highlighted = selected || mark.selected;
  const side = lineSide(line);
  const lineNumber = side ? lineNumberForSide(line, side) : null;
  const disabled = side == null || lineNumber == null;
  let backgroundColor = "transparent";
  if (highlighted) backgroundColor = palette.selectBg;
  else if (line.type === "add") backgroundColor = palette.addBg;
  else if (line.type === "del") backgroundColor = palette.delBg;

  let prefixColor = theme.colors.foregroundMuted;
  if (line.type === "add") prefixColor = palette.addFg;
  else if (line.type === "del") prefixColor = palette.delFg;

  let prefix = " ";
  if (line.type === "add") prefix = "+";
  else if (line.type === "del") prefix = "-";

  const styles = useMemo(
    () => ({
      line: {
        flexDirection: "row" as const,
        paddingHorizontal: 4,
        minHeight: typography.lineHeight,
        alignItems: "flex-start" as const,
        alignSelf: "stretch" as const,
        backgroundColor,
        borderLeftWidth: 2,
        borderLeftColor: cursor ? theme.colors.accent : "transparent",
        width: "100%" as const,
        minWidth: "100%" as const,
      },
      gutter: {
        width: 40,
        color: theme.colors.foregroundMuted,
        fontFamily: typography.fontFamily,
        fontSize: typography.fontSize,
        lineHeight: typography.lineHeight,
        textAlign: "right" as const,
        paddingRight: 6,
        flexShrink: 0,
      },
      prefix: {
        width: 14,
        color: prefixColor,
        fontFamily: typography.fontFamily,
        fontSize: typography.fontSize,
        lineHeight: typography.lineHeight,
        fontWeight: "700" as const,
        flexShrink: 0,
      },
    }),
    [
      backgroundColor,
      cursor,
      prefixColor,
      theme.colors.accent,
      theme.colors.foregroundMuted,
      typography.fontFamily,
      typography.fontSize,
      typography.lineHeight,
    ],
  );

  const press = useCallback(() => {
    if (side && lineNumber != null) onPressLine(side, lineNumber, line.id);
  }, [line.id, lineNumber, onPressLine, side]);

  if (platform === "web") {
    const webProps: Record<string, unknown> = disabled
      ? {}
      : {
          onMouseDown: (event: { button?: number; preventDefault?: () => void }) => {
            if (event.button != null && event.button !== 0) return;
            event.preventDefault?.();
            if (side && lineNumber != null) onDragStartLine(side, lineNumber, line.id);
          },
          onMouseEnter: (event: { buttons?: number }) => {
            if (event.buttons !== 1) return;
            if (side && lineNumber != null) onDragEnterLine(side, lineNumber);
          },
          onMouseUp: () => {
            onDragEndLine();
          },
        };
    return (
      <View ref={rowRef} style={styles.line} {...webProps}>
        <Text style={styles.gutter}>{line.oldLineNumber ?? ""}</Text>
        <Text style={styles.gutter}>{line.newLineNumber ?? ""}</Text>
        <Text style={styles.prefix}>{prefix}</Text>
        <HighlightedContent
          content={line.content}
          theme={theme}
          baseColor={theme.colors.foreground}
          typography={typography}
        />
      </View>
    );
  }

  return (
    <Pressable ref={rowRef} disabled={disabled} onPress={press} style={styles.line}>
      <Text style={styles.gutter}>{line.oldLineNumber ?? ""}</Text>
      <Text style={styles.gutter}>{line.newLineNumber ?? ""}</Text>
      <Text style={styles.prefix}>{prefix}</Text>
      <HighlightedContent
        content={line.content}
        theme={theme}
        baseColor={theme.colors.foreground}
        typography={typography}
      />
    </Pressable>
  );
});

type DraftRange = { side: "old" | "new"; startLine: number; endLine: number };

/**
 * New-comment composer. Text stays in this component so typing does not re-render the file.
 * `bodyRef` lets the parent see whether the draft is empty without storing the text in state.
 */
function LineDraftBox({
  range,
  bodyRef,
  theme,
  onSave,
  onCancel,
}: {
  range: DraftRange;
  bodyRef: { current: string };
  theme: Theme;
  onSave(body: string): Promise<void>;
  onCancel(): void;
}) {
  const [body, setBody] = useState(() => bodyRef.current);
  const [saving, setSaving] = useState(false);
  const onChange = useCallback(
    (text: string) => {
      bodyRef.current = text;
      setBody(text);
    },
    [bodyRef],
  );
  const save = useCallback(() => {
    if (saving || !bodyRef.current.trim()) return;
    setSaving(true);
    void onSave(bodyRef.current).finally(() => setSaving(false));
  }, [bodyRef, onSave, saving]);
  const keyProps = useMemo(
    () => composerKeyProps({ onSave: save, onCancel }),
    [onCancel, save],
  );
  const styles = useMemo(
    () => ({
      box: {
        marginLeft: 88,
        marginVertical: 4,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.surface1,
        gap: 8,
      },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        padding: 10,
        color: theme.colors.foreground,
        minHeight: 64,
        textAlignVertical: "top" as const,
      },
      actions: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        flexWrap: "wrap" as const,
      },
      button: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.accent,
        justifyContent: "center" as const,
      },
      buttonText: { color: theme.colors.accentForeground, fontWeight: "600" as const },
      cancelButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        justifyContent: "center" as const,
      },
      action: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" as const },
      hint: { color: theme.colors.foregroundMuted, fontSize: 11, marginLeft: "auto" as const },
    }),
    [theme],
  );
  const lo = Math.min(range.startLine, range.endLine);
  const hi = Math.max(range.startLine, range.endLine);

  return (
    <View style={styles.box}>
      <Text style={styles.muted}>
        Comment on {range.side} L{lo}
        {lo !== hi ? `–${hi}` : ""}
      </Text>
      <TextInput
        multiline
        value={body}
        onChangeText={onChange}
        placeholder="Line comment"
        placeholderTextColor={theme.colors.foregroundMuted}
        style={styles.input}
        autoFocus
        {...keyProps}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={save}
          style={styles.button}
          disabled={saving}
        >
          <Text style={styles.buttonText}>{saving ? "Saving…" : "Save comment"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.action}>Cancel</Text>
        </Pressable>
        <Text style={styles.hint}>Ctrl+Enter to save</Text>
      </View>
    </View>
  );
}

export function DiffView({
  pathKey,
  displayPath,
  file,
  cwd,
  status,
  hunks,
  error,
  progress,
  typography,
  theme,
  compact,
  platform,
  canViewFile,
  keyboardEnabled,
  onToggleViewed,
  onIgnore,
  onViewFile,
  onDiscardFile,
  onChangeFileComment,
  onSaveLineComment,
  onDeleteLineComment,
}: DiffViewProps) {
  const loadContext = useRpc(diffContextRpc);
  const toast = useToast();
  const palette = useMemo(() => diffPalette(theme), [theme]);
  const axis = expandAxis(file);
  const [expanded, setExpanded] = useState<Map<string, DisplayLine[]>>(() => new Map());
  const [expandingKey, setExpandingKey] = useState<string | null>(null);
  const [totalLines, setTotalLines] = useState<number | null>(null);
  const dragging = useRef<{
    side: "old" | "new";
    startLine: number;
    moved: boolean;
  } | null>(null);
  const [draft, setDraft] = useState<DraftRange | null>(null);
  const draftBodyRef = useRef("");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [fileCommentOpen, setFileCommentOpen] = useState(false);
  const cursorStoreRef = useRef<LineCursorStore | null>(null);
  if (cursorStoreRef.current == null) cursorStoreRef.current = new LineCursorStore();
  const cursorStore = cursorStoreRef.current;
  const rowNodes = useRef(new Map<string, RowNode>());
  const rowRefCallbacks = useRef(new Map<string, (node: RowNode | null) => void>());
  const pendingKeyRef = useRef<"g" | null>(null);

  useEffect(() => {
    setExpanded(new Map());
    setTotalLines(null);
    setDraft(null);
    draftBodyRef.current = "";
    setEditingKey(null);
    setFileCommentOpen(false);
    cursorStore.reset();
    pendingKeyRef.current = null;
    rowNodes.current.clear();
    rowRefCallbacks.current.clear();
    dragging.current = null;
  }, [cursorStore, pathKey]);

  const { lines, gaps } = useMemo(
    () => buildDisplay(hunks, expanded, totalLines, axis),
    [axis, expanded, hunks, totalLines],
  );

  useLayoutEffect(() => {
    cursorStore.syncLines(lines);
  }, [cursorStore, lines]);

  const styles = useMemo(
    () => ({
      root: {
        flex: 1,
        minHeight: 0,
        gap: 0,
        alignSelf: "stretch" as const,
        width: "100%" as const,
      },
      scroll: { flex: 1, minHeight: 0 },
      scrollContent: { gap: 12, paddingTop: 12, paddingBottom: 24 },
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
      hunkScroll: { width: "100%" as const, alignSelf: "stretch" as const },
      hunkScrollContent: { flexGrow: 1, minWidth: "100%" as const },
      hunkInner: { flexGrow: 1, minWidth: "100%" as const, alignSelf: "stretch" as const },
    }),
    [theme],
  );

  const onExpand = useCallback(
    async (_gapId: string, startLine: number, endLine: number, side: "old" | "new") => {
      const key = `${startLine}:${endLine}`;
      setExpandingKey(key);
      try {
        const result = await loadContext({ cwd, pathKey, side, startLine, endLine });
        if (result.status !== "ok") {
          toast.error(result.error ?? "Could not expand context");
          return;
        }
        setTotalLines(result.totalLines);
        const block: DisplayLine[] = result.lines.map((line, index) => ({
          id: `x:${side}:${line.oldLineNumber ?? line.newLineNumber ?? index}`,
          type: "context" as const,
          content: line.content,
          oldLineNumber: line.oldLineNumber,
          newLineNumber: line.newLineNumber,
          source: "expand" as const,
        }));
        setExpanded((current) => {
          const next = new Map(current);
          next.set(key, block);
          return next;
        });
      } catch (expandError) {
        toast.error(expandError instanceof Error ? expandError.message : String(expandError));
      } finally {
        setExpandingKey(null);
      }
    },
    [cwd, loadContext, pathKey, toast],
  );

  const onDragStartLine = useCallback(
    (side: "old" | "new", line: number, id: string) => {
      dragging.current = { side, startLine: line, moved: false };
      setEditingKey(null);
      cursorStore.focusLine(id);
    },
    [cursorStore],
  );

  const onDragEnterLine = useCallback((side: "old" | "new", line: number) => {
    const active = dragging.current;
    if (!active || active.side !== side) return;
    if (line === active.startLine) return;
    active.moved = true;
    setDraft((current) => {
      if (current?.side !== side) draftBodyRef.current = "";
      return {
        side,
        startLine: Math.min(active.startLine, line),
        endLine: Math.max(active.startLine, line),
      };
    });
  }, []);

  const applyTapSelection = useCallback((side: "old" | "new", line: number) => {
    setDraft((current) => {
      if (!current || current.side !== side) {
        draftBodyRef.current = "";
        return { side, startLine: line, endLine: line };
      }
      const lo = Math.min(current.startLine, current.endLine);
      const hi = Math.max(current.startLine, current.endLine);
      // Same single line: keep (confirmed). Outside range with empty body: restart.
      if (lo === hi && lo === line) return current;
      if ((line < lo || line > hi) && !draftBodyRef.current.trim()) {
        draftBodyRef.current = "";
        return { side, startLine: line, endLine: line };
      }
      return {
        side,
        startLine: Math.min(lo, line),
        endLine: Math.max(hi, line),
      };
    });
    setEditingKey(null);
  }, []);

  const onDragEndLine = useCallback(() => {
    const active = dragging.current;
    if (!active) return;
    if (!active.moved) applyTapSelection(active.side, active.startLine);
    dragging.current = null;
  }, [applyTapSelection]);

  useEffect(() => {
    if (platform !== "web") return;
    const doc = (
      globalThis as { document?: { addEventListener: Function; removeEventListener: Function } }
    ).document;
    if (!doc) return;
    const onWindowMouseUp = () => {
      if (dragging.current) onDragEndLine();
    };
    doc.addEventListener("mouseup", onWindowMouseUp);
    return () => doc.removeEventListener("mouseup", onWindowMouseUp);
  }, [onDragEndLine, platform]);

  const onPressLine = useCallback(
    (side: "old" | "new", line: number, id: string) => {
      applyTapSelection(side, line);
      cursorStore.focusLine(id);
    },
    [applyTapSelection, cursorStore],
  );

  const saveDraft = useCallback(
    async (body: string) => {
      const current = draftRef.current;
      const trimmed = body.trim();
      if (!current || !trimmed) return;
      const ok = await onSaveLineComment({
        side: current.side,
        startLine: Math.min(current.startLine, current.endLine),
        endLine: Math.max(current.startLine, current.endLine),
        body: trimmed,
      });
      if (ok) {
        draftBodyRef.current = "";
        setDraft(null);
      } else toast.error("Could not save comment");
    },
    [onSaveLineComment, toast],
  );
  const cancelDraft = useCallback(() => {
    draftBodyRef.current = "";
    setDraft(null);
  }, []);

  const startEditComment = useCallback((comment: LineComment) => {
    setEditingKey(commentKey(comment));
    draftBodyRef.current = "";
    setDraft(null);
  }, []);
  const saveEditComment = useCallback(
    async (comment: LineComment, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) {
        toast.error("Comment body is empty — use Delete to remove it");
        return;
      }
      const ok = await onSaveLineComment({ ...comment, body: trimmed });
      if (ok) setEditingKey(null);
      else toast.error("Could not save comment");
    },
    [onSaveLineComment, toast],
  );
  const cancelEditComment = useCallback(() => setEditingKey(null), []);
  const deleteComment = useCallback(
    async (comment: LineComment) => {
      const ok = await onDeleteLineComment(comment);
      if (ok) setEditingKey(null);
      else toast.error("Could not delete comment");
    },
    [onDeleteLineComment, toast],
  );

  const commentsAfterLine = useCallback(
    (line: DisplayLine): LineComment[] => {
      const matched: LineComment[] = [];
      for (const comment of progress.lineComments) {
        const number = comment.side === "new" ? line.newLineNumber : line.oldLineNumber;
        if (number === comment.endLine) matched.push(comment);
      }
      return matched;
    },
    [progress.lineComments],
  );

  const openComposer = useCallback(
    (range: LineRange) => {
      const existing = progress.lineComments.find(
        (comment) => commentKey(comment) === commentKey(range),
      );
      if (existing) {
        startEditComment(existing);
        return;
      }
      setEditingKey(null);
      draftBodyRef.current = "";
      setDraft(range);
    },
    [progress.lineComments, startEditComment],
  );

  const rowRefFor = useCallback((id: string) => {
    const existing = rowRefCallbacks.current.get(id);
    if (existing) return existing;
    const callback = (node: RowNode | null) => {
      if (node) rowNodes.current.set(id, node);
      else rowNodes.current.delete(id);
    };
    rowRefCallbacks.current.set(id, callback);
    return callback;
  }, []);

  const runAction = (action: ReviewKeyAction): boolean => {
    cursorStore.syncLines(lines);
    switch (action) {
      case "cursorDown":
      case "cursorUp":
        cursorStore.move(action === "cursorDown" ? 1 : -1);
        return true;
      case "pageDown":
      case "pageUp":
        pageCursor(cursorStore, rowNodes.current, action === "pageDown" ? 1 : -1);
        return true;
      case "cursorTop":
        cursorStore.jump("start");
        return true;
      case "cursorBottom":
        cursorStore.jump("end");
        return true;
      case "toggleVisual":
        cursorStore.toggleVisual();
        return true;
      case "lineComment": {
        if (cursorStore.visualAnchorId) {
          const anchor = cursorStore.visualAnchorId;
          const current = cursorStore.cursorId;
          const range = current ? rangeBetween(lines, anchor, current) : null;
          cursorStore.clearVisual();
          if (range) openComposer(range);
          return true;
        }
        const current = cursorStore.currentId();
        if (!current) return true;
        if (cursorStore.cursorId !== current) cursorStore.focusLine(current);
        const range = rangeBetween(lines, current, current);
        if (range) openComposer(range);
        return true;
      }
      case "fileComment":
        setFileCommentOpen(true);
        return true;
      case "markRead":
        onToggleViewed();
        return true;
      case "ignore":
        onIgnore();
        return true;
      case "escape":
        return false;
    }
  };

  // Returns true when the key was handled (the caller then prevents default).
  // `chord` is a modifier shortcut (Ctrl+F / Ctrl+B) already resolved by the caller.
  const handleKey = (key: string | undefined, chord: ReviewKeyAction | null = null): boolean => {
    if (chord) {
      pendingKeyRef.current = null;
      if (!keyboardEnabled || draft || editingKey || fileCommentOpen) return false;
      return runAction(chord);
    }
    const parsed = nextReviewKey(pendingKeyRef.current, key);
    pendingKeyRef.current = parsed.pending;
    const action = parsed.action;
    if (action === "escape") {
      if (cursorStore.visualAnchorId) {
        cursorStore.clearVisual();
        return true;
      }
      if (draft) {
        cancelDraft();
        return true;
      }
      return false;
    }
    // Composers own the keyboard while open, so shortcuts must not fire through them.
    if (!keyboardEnabled || draft || editingKey || fileCommentOpen) {
      pendingKeyRef.current = null;
      return false;
    }
    if (!action) return parsed.pending === "g";
    return runAction(action);
  };
  // Keydown listener is attached once; it always calls the latest handler.
  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;

  useEffect(() => {
    if (platform !== "web") return;
    const doc = webDocument();
    if (!doc) return;
    const onKeyDown = (event: WebKeyEvent) => {
      if (isEditableTarget(event.target)) {
        pendingKeyRef.current = null;
        return;
      }
      const chord = reviewModifierAction(event);
      if (chord) {
        if (handleKeyRef.current(undefined, chord)) event.preventDefault?.();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (handleKeyRef.current(event.key)) event.preventDefault?.();
    };
    doc.addEventListener("keydown", onKeyDown);
    return () => doc.removeEventListener("keydown", onKeyDown);
  }, [platform]);

  const header = (
    <FileHeader
      displayPath={displayPath}
      file={file}
      progress={progress}
      theme={theme}
      compact={compact}
      platform={platform}
      canViewFile={canViewFile}
      onToggleViewed={onToggleViewed}
      onIgnore={onIgnore}
      commentOpen={fileCommentOpen}
      onCommentOpenChange={setFileCommentOpen}
      onSaveFileComment={onChangeFileComment}
      onViewFile={onViewFile}
      onDiscardFile={onDiscardFile}
    />
  );

  if (status === "loading") {
    return (
      <View style={styles.root}>
        {header}
        <Text style={[styles.muted, { marginTop: 12 }]}>Loading diff…</Text>
      </View>
    );
  }
  if (status === "binary") {
    return (
      <View style={styles.root}>
        {header}
        <Text style={[styles.muted, { marginTop: 12 }]}>Binary file</Text>
      </View>
    );
  }
  if (status === "too_large") {
    return (
      <View style={styles.root}>
        {header}
        <Text style={[styles.muted, { marginTop: 12 }]}>Diff too large to display</Text>
      </View>
    );
  }
  if (status === "missing") {
    return (
      <View style={styles.root}>
        {header}
        <Text style={[styles.muted, { marginTop: 12 }]}>{error ?? "File unavailable"}</Text>
      </View>
    );
  }

  const selectionRange: LineRange | null = draft
    ? {
        side: draft.side,
        startLine: Math.min(draft.startLine, draft.endLine),
        endLine: Math.max(draft.startLine, draft.endLine),
      }
    : null;

  const gapByBefore = new Map<string | null, Gap[]>();
  for (const gap of gaps) {
    const list = gapByBefore.get(gap.beforeId) ?? [];
    list.push(gap);
    gapByBefore.set(gap.beforeId, list);
  }

  return (
    <View style={styles.root}>
      {header}
      <CursorFollow store={cursorStore} rowNodes={rowNodes} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {progress.fileComment ? (
          <Text style={styles.muted} numberOfLines={2}>
            File note: {progress.fileComment}
          </Text>
        ) : null}
        <Text style={styles.muted}>
          {platform === "web"
            ? "Click or drag to comment. Keys: j/k move · Ctrl+F/Ctrl+B page · gg/G top/bottom · c comment line · v, j/k, c comment a range · C file note · r viewed · i ignore"
            : "Tap a line to comment; tap another to set a range. Tap outside the range (empty draft) to start over."}
        </Text>

        <View style={styles.hunk}>
          <ScrollView
            horizontal
            style={styles.hunkScroll}
            contentContainerStyle={styles.hunkScrollContent}
          >
            <View style={styles.hunkInner}>
              {(gapByBefore.get(null) ?? []).map((gap) => (
                <ExpandButton
                  key={gap.id}
                  gapId={gap.id}
                  startLine={gap.startLine}
                  endLine={gap.endLine}
                  totalLines={totalLines}
                  expanding={expandingKey === `${gap.startLine}:${gap.endLine}`}
                  theme={theme}
                  onExpand={(gapId, start, end) => void onExpand(gapId, start, end, gap.side)}
                />
              ))}
              {lines.map((line) => {
                const selected = selectionRange ? lineInRange(line, selectionRange) : false;
                const comments = commentsAfterLine(line);
                const draftHere =
                  draft &&
                  lineNumberForSide(line, draft.side) === Math.max(draft.startLine, draft.endLine);
                return (
                  <View key={line.id}>
                    <DiffLineRow
                      line={line}
                      theme={theme}
                      palette={palette}
                      typography={typography}
                      selected={selected}
                      store={cursorStore}
                      rowRef={rowRefFor(line.id)}
                      platform={platform}
                      onPressLine={onPressLine}
                      onDragEnterLine={onDragEnterLine}
                      onDragStartLine={onDragStartLine}
                      onDragEndLine={onDragEndLine}
                    />
                    {comments.map((comment) => {
                      const key = commentKey(comment);
                      return (
                        <InlineCommentCard
                          key={key}
                          comment={comment}
                          theme={theme}
                          editing={editingKey === key}
                          onStartEdit={startEditComment}
                          onSave={(next, body) => void saveEditComment(next, body)}
                          onCancel={cancelEditComment}
                          onDelete={(next) => void deleteComment(next)}
                        />
                      );
                    })}
                    {draftHere && draft ? (
                      <LineDraftBox
                        range={draft}
                        bodyRef={draftBodyRef}
                        theme={theme}
                        onSave={saveDraft}
                        onCancel={cancelDraft}
                      />
                    ) : null}
                    {(gapByBefore.get(line.id) ?? []).map((gap) => (
                      <ExpandButton
                        key={gap.id}
                        gapId={gap.id}
                        startLine={gap.startLine}
                        endLine={gap.endLine}
                        totalLines={totalLines}
                        expanding={expandingKey === `${gap.startLine}:${gap.endLine}`}
                        theme={theme}
                        onExpand={(gapId, start, end) => void onExpand(gapId, start, end, gap.side)}
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}
