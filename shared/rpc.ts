import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const DiffFileSchema = z.object({
  pathKey: z.string(),
  path: z.string(),
  submodulePath: z.string().nullable(),
  kind: z.enum(["file", "submodule"]),
  status: z.enum(["modified", "added", "deleted", "renamed", "untracked", "binary", "too_large"]),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  oldPath: z.string().optional(),
});

const DiffLineSchema = z.object({
  type: z.enum(["context", "add", "del", "header"]),
  content: z.string(),
  oldLineNumber: z.number().int().positive().nullable(),
  newLineNumber: z.number().int().positive().nullable(),
});

const DiffHunkSchema = z.object({
  header: z.string(),
  oldStart: z.number().int().nonnegative(),
  oldCount: z.number().int().nonnegative(),
  newStart: z.number().int().nonnegative(),
  newCount: z.number().int().nonnegative(),
  lines: z.array(DiffLineSchema),
});

export const diffSnapshotRpc = defineRpc({
  name: "diff.snapshot",
  input: z.object({ cwd: z.string().min(1) }),
  output: z.object({
    files: z.array(DiffFileSchema),
    error: z.string().nullable(),
  }),
});

export const diffHunksRpc = defineRpc({
  name: "diff.hunks",
  input: z.object({
    cwd: z.string().min(1),
    pathKey: z.string().min(1),
  }),
  output: z.object({
    pathKey: z.string(),
    status: z.enum(["ok", "binary", "too_large", "missing"]),
    hunks: z.array(DiffHunkSchema),
    error: z.string().nullable(),
  }),
});

export const diffStageRpc = defineRpc({
  name: "diff.stage",
  input: z.object({
    cwd: z.string().min(1),
    pathKeys: z.array(z.string().min(1)),
  }),
  output: z.object({
    staged: z.array(z.string()),
    failed: z.array(z.object({ pathKey: z.string(), error: z.string() })),
  }),
});

export const diffContextRpc = defineRpc({
  name: "diff.context",
  input: z.object({
    cwd: z.string().min(1),
    pathKey: z.string().min(1),
    /** Which file side to read. `new` = worktree (HEAD fallback); `old` = HEAD. */
    side: z.enum(["old", "new"]).default("new"),
    /** 1-based inclusive line range on that side. */
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
  output: z.object({
    pathKey: z.string(),
    status: z.enum(["ok", "missing"]),
    side: z.enum(["old", "new"]),
    totalLines: z.number().int().nonnegative(),
    lines: z.array(
      z.object({
        content: z.string(),
        oldLineNumber: z.number().int().positive().nullable(),
        newLineNumber: z.number().int().positive().nullable(),
      }),
    ),
    error: z.string().nullable(),
  }),
});

export type DiffFile = z.infer<typeof DiffFileSchema>;
export type DiffHunk = z.infer<typeof DiffHunkSchema>;
export type DiffLine = z.infer<typeof DiffLineSchema>;
