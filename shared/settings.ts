import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_PROMPT_TEMPLATE = `Review the following unstaged changes in {{workspace}}.

Files reviewed (seen): {{seenCount}} / {{totalCount}}
Ignored: {{ignoredCount}}

## Comments
{{comments}}

## Seen files without comments (will be staged after send)
{{seenUncommented}}

Please summarize risks, suggest follow-ups, and call out anything that should not be staged yet.`;

const LineCommentSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  side: z.enum(["old", "new"]),
  body: z.string(),
});

const FileProgressSchema = z.object({
  status: z.enum(["unread", "seen", "ignored"]).default("unread"),
  fileComment: z.string().optional(),
  lineComments: z.array(LineCommentSchema).default([]),
});

const WorkspaceProgressSchema = z.object({
  files: z.record(z.string(), FileProgressSchema).default({}),
});

export const reviewSettings = defineSettings({
  id: "diff-review",
  scope: "host",
  version: 1,
  schema: z.object({
    promptTemplate: z.string().default(DEFAULT_PROMPT_TEMPLATE),
    progressByWorkspace: z.record(z.string(), WorkspaceProgressSchema).default({}),
  }),
});

export type ReviewSettingsValues = z.infer<typeof reviewSettings.schema>;
export type FileProgress = z.infer<typeof FileProgressSchema>;
export type LineComment = z.infer<typeof LineCommentSchema>;
