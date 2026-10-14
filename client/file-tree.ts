import type { DiffFile } from "../shared/rpc";

export type ChangeGlyph = "add" | "del" | "both";

export function changeGlyph(file: DiffFile): ChangeGlyph {
  if (file.status === "untracked" || file.status === "added") return "add";
  if (file.status === "deleted") return "del";
  if (file.additions > 0 && file.deletions === 0) return "add";
  if (file.deletions > 0 && file.additions === 0) return "del";
  return "both";
}

export function fileTreePath(file: DiffFile): string {
  if (file.submodulePath) return `${file.submodulePath}/${file.path}`;
  return file.path;
}

export type TreeNode =
  | {
      kind: "dir";
      id: string;
      name: string;
      depth: number;
      children: TreeNode[];
    }
  | {
      kind: "file";
      id: string;
      name: string;
      depth: number;
      file: DiffFile;
      glyph: ChangeGlyph;
    };

function ensureDir(
  children: TreeNode[],
  name: string,
  id: string,
  depth: number,
): Extract<TreeNode, { kind: "dir" }> {
  const existing = children.find(
    (child): child is Extract<TreeNode, { kind: "dir" }> =>
      child.kind === "dir" && child.name === name,
  );
  if (existing) return existing;
  const created: Extract<TreeNode, { kind: "dir" }> = {
    kind: "dir",
    id,
    name,
    depth,
    children: [],
  };
  children.push(created);
  return created;
}

/** Build a folder tree from changed files, grouped by path segments. */
export function buildFileTree(files: readonly DiffFile[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const sorted = [...files].sort((left, right) => {
    const leftPath = fileTreePath(left);
    const rightPath = fileTreePath(right);
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
  });

  for (const file of sorted) {
    const full = fileTreePath(file);
    const parts = full.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let bucket = roots;
    let prefix = "";
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      prefix = prefix ? `${prefix}/${part}` : part;
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        bucket.push({
          kind: "file",
          id: file.pathKey,
          name: part,
          depth: index,
          file,
          glyph: changeGlyph(file),
        });
      } else {
        const dir = ensureDir(bucket, part, `dir:${prefix}`, index);
        bucket = dir.children;
      }
    }
  }

  sortNodes(roots);
  return roots;
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "dir" ? -1 : 1;
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
  });
  for (const node of nodes) {
    if (node.kind === "dir") sortNodes(node.children);
  }
}

export type FlatTreeRow =
  | { kind: "dir"; id: string; name: string; depth: number; expanded: boolean }
  | {
      kind: "file";
      id: string;
      name: string;
      depth: number;
      file: DiffFile;
      glyph: ChangeGlyph;
    };

export function flattenTree(
  nodes: readonly TreeNode[],
  collapsed: ReadonlySet<string>,
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];
  const visit = (list: readonly TreeNode[]) => {
    for (const node of list) {
      if (node.kind === "dir") {
        const expanded = !collapsed.has(node.id);
        rows.push({
          kind: "dir",
          id: node.id,
          name: node.name,
          depth: node.depth,
          expanded,
        });
        if (expanded) visit(node.children);
      } else {
        rows.push(node);
      }
    }
  };
  visit(nodes);
  return rows;
}

/** Files in the same depth-first order as the tree list (all folders expanded). */
export function treeOrderedFiles(files: readonly DiffFile[]): DiffFile[] {
  const ordered: DiffFile[] = [];
  const visit = (nodes: readonly TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === "dir") visit(node.children);
      else ordered.push(node.file);
    }
  };
  visit(buildFileTree(files));
  return ordered;
}
