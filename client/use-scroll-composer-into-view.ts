import { useEffect, type RefObject } from "react";
import type { View } from "react-native";

type ScrollRef = {
  scrollTo(options: { x?: number; y?: number; animated?: boolean }): void;
};

/** Scroll a diff list so an inline composer sits in view (not scroll-to-end). */
export function useScrollComposerIntoView(
  scrollRef: RefObject<ScrollRef | null>,
  contentRef: RefObject<View | null>,
  anchorRef: RefObject<View | null>,
  activeKey: string | null,
  offset = 56,
) {
  useEffect(() => {
    if (!activeKey) return;
    const timer = setTimeout(() => {
      const anchor = anchorRef.current;
      const content = contentRef.current;
      const scroll = scrollRef.current;
      if (!anchor || !content || !scroll) return;

      anchor.measureLayout(
        content,
        (_x, y) => {
          scroll.scrollTo({ y: Math.max(0, y - offset), animated: true });
        },
        () => {},
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [activeKey, anchorRef, contentRef, offset, scrollRef]);
}
