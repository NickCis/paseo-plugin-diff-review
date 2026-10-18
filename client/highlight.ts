/** Lightweight syntax spans for plugin diffs — no highlighter dependency. */

export interface HighlightSpan {
  text: string;
  role: "plain" | "comment" | "string" | "keyword" | "number" | "punct";
  start: number;
}

const KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "of",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "fn",
  "impl",
  "mut",
  "pub",
  "struct",
  "trait",
  "use",
  "mod",
  "match",
  "crate",
  "self",
  "Self",
  "def",
  "elif",
  "except",
  "lambda",
  "None",
  "True",
  "False",
  "pass",
  "raise",
  "with",
]);

export function highlightLine(content: string): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  let i = 0;
  while (i < content.length) {
    const ch = content[i]!;

    if (ch === "/" && content[i + 1] === "/") {
      spans.push({ text: content.slice(i), role: "comment", start: i });
      break;
    }
    if (ch === "#") {
      spans.push({ text: content.slice(i), role: "comment", start: i });
      break;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < content.length) {
        if (content[j] === "\\") {
          j += 2;
          continue;
        }
        if (content[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      spans.push({ text: content.slice(i, j), role: "string", start: i });
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < content.length && /[0-9_.]/.test(content[j]!)) j += 1;
      spans.push({ text: content.slice(i, j), role: "number", start: i });
      i = j;
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < content.length && /[A-Za-z0-9_$]/.test(content[j]!)) j += 1;
      const word = content.slice(i, j);
      spans.push({
        text: word,
        role: KEYWORDS.has(word) ? "keyword" : "plain",
        start: i,
      });
      i = j;
      continue;
    }

    if (/[{}()[\];,.<>]=*|&|\||!|\?|:|\+|-|\*|\/|%/.test(ch)) {
      spans.push({ text: ch, role: "punct", start: i });
      i += 1;
      continue;
    }

    spans.push({ text: ch, role: "plain", start: i });
    i += 1;
  }
  return spans.length > 0 ? spans : [{ text: content, role: "plain", start: 0 }];
}

export function roleColor(
  role: HighlightSpan["role"],
  colors: {
    foreground: string;
    foregroundMuted: string;
    accent: string;
    statusSuccess: string;
    statusWarning: string;
  },
): string {
  switch (role) {
    case "comment":
      return colors.foregroundMuted;
    case "string":
      return colors.statusSuccess;
    case "keyword":
      return colors.accent;
    case "number":
      return colors.statusWarning;
    case "punct":
      return colors.foregroundMuted;
    default:
      return colors.foreground;
  }
}
