import { useEffect, type RefObject } from "react";

type ScrollRef = {
  scrollToEnd(options?: { animated?: boolean }): void;
};

export function useScrollComposerIntoView(
  scrollRef: RefObject<ScrollRef | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [active, scrollRef]);
}
