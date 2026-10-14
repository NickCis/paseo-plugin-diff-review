/** Stable key for a parent file or a file inside a submodule. */
export function makePathKey(input: { submodulePath?: string | null; path: string }): string {
  const nested = input.path.replace(/^\/+/, "");
  if (input.submodulePath) {
    return `${input.submodulePath.replace(/\/+$/, "")}:${nested}`;
  }
  return nested;
}

export function parsePathKey(pathKey: string): {
  submodulePath: string | null;
  path: string;
} {
  const separator = pathKey.indexOf(":");
  if (separator <= 0) {
    return { submodulePath: null, path: pathKey };
  }
  // Submodule paths never contain ":", so the first colon splits owner from nested path.
  return {
    submodulePath: pathKey.slice(0, separator),
    path: pathKey.slice(separator + 1),
  };
}

export function displayPathForKey(pathKey: string): string {
  const { submodulePath, path } = parsePathKey(pathKey);
  return submodulePath ? `${submodulePath}/${path}` : path;
}
