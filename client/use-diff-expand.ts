import { useCallback, useEffect, useMemo, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { type DisplayLine, buildDisplay, gapsByBeforeId } from "./diff-display";
import { expandAxis } from "./diff-line-utils";
import { diffContextRpc, type DiffFile, type DiffHunk } from "../shared/rpc";

export function useDiffExpand({
  cwd,
  pathKey,
  file,
  hunks,
}: {
  cwd: string;
  pathKey: string;
  file: DiffFile;
  hunks: readonly DiffHunk[];
}) {
  const loadContext = useRpc(diffContextRpc);
  const toast = useToast();
  const axis = useMemo(() => expandAxis(file), [file]);
  const [expanded, setExpanded] = useState<Map<string, DisplayLine[]>>(() => new Map());
  const [expandingKey, setExpandingKey] = useState<string | null>(null);
  const [totalLines, setTotalLines] = useState<number | null>(null);

  useEffect(() => {
    setExpanded(new Map());
    setExpandingKey(null);
    setTotalLines(null);
  }, [pathKey]);

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

  const { lines, gaps } = useMemo(
    () => buildDisplay(hunks, expanded, totalLines, axis),
    [axis, expanded, hunks, totalLines],
  );
  const gapByBefore = useMemo(() => gapsByBeforeId(gaps), [gaps]);

  return { lines, gaps, gapByBefore, totalLines, expandingKey, onExpand };
}
