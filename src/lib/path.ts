/** Path helpers for the Windows-first workspace. All functions accept / or \. */

export function basename(path: string): string {
  const s = path.replace(/[\\/]+$/, "");
  const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  return i >= 0 ? s.slice(i + 1) : s;
}

export function dirname(path: string): string {
  const s = path.replace(/[\\/]+$/, "");
  const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  if (i > 0) return s.slice(0, i);
  if (i === 0) return s.slice(0, 1);
  return s;
}

export function extname(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i).toLowerCase() : "";
}

export function stem(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function isAbsolutePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\") || path.startsWith("/");
}

export function joinPath(dir: string, rel: string): string {
  if (!rel) return dir;
  if (isAbsolutePath(rel)) return rel;
  const left = dir.replace(/[\\/]+$/, "");
  const right = rel.replace(/^[\\/]+/, "");
  return `${left}\\${right}`;
}

export function normalizePath(path: string): string {
  let p = path.replace(/\//g, "\\").replace(/\\{2,}/g, "\\");
  // Collapse .\ and ..\ segments without touching drive roots or UNC prefixes.
  const driveMatch = p.match(/^([a-zA-Z]:\\|\\\\[^\\]+\\[^\\]+\\?)/);
  const prefix = driveMatch ? driveMatch[1] : "";
  const rest = p.slice(prefix.length);
  const parts: string[] = [];
  for (const part of rest.split("\\")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") parts.pop();
      else parts.push("..");
    } else {
      parts.push(part);
    }
  }
  const joined = parts.join("\\");
  if (prefix.endsWith("\\")) return prefix + joined;
  return prefix ? `${prefix}\\${joined}` : joined;
}

export function pathKey(path: string): string {
  return normalizePath(path).toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}

export function relativePath(fromDir: string, to: string): string {
  const from = normalizePath(fromDir).split("\\").filter(Boolean);
  const target = normalizePath(to).split("\\").filter(Boolean);
  let i = 0;
  while (i < from.length && i < target.length && from[i].toLowerCase() === target[i].toLowerCase()) {
    i++;
  }
  return [...from.slice(i).map(() => ".."), ...target.slice(i)].join("\\");
}

export function displayPath(path: string, rootDir?: string | null): string {
  if (rootDir) {
    const rel = relativePath(rootDir, path);
    if (!rel.startsWith("..")) return rel;
  }
  return basename(path);
}

export function resolveTexInclude(rootDir: string, includeName: string): string {
  let name = includeName.trim().replace(/^["']|["']$/g, "");
  if (!isAbsolutePath(name)) {
    if (!extname(name)) name = `${name}.tex`;
    return normalizePath(joinPath(rootDir, name));
  }
  return normalizePath(name);
}

export function resolveAssetPath(rootDir: string, assetName: string): string {
  const name = assetName.trim().replace(/^["']|["']$/g, "");
  if (isAbsolutePath(name)) return normalizePath(name);
  if (!extname(name)) {
    for (const ext of [".pdf", ".png", ".jpg", ".jpeg", ".eps", ".svg"]) {
      return normalizePath(joinPath(rootDir, name + ext));
    }
  }
  return normalizePath(joinPath(rootDir, name));
}

export function fileKind(path: string): "tex" | "bib" | "image" | "style" | "other" {
  const ext = extname(path);
  if (ext === ".tex" || ext === ".ltx") return "tex";
  if (ext === ".bib") return "bib";
  if ([".png", ".jpg", ".jpeg", ".pdf", ".eps", ".svg", ".gif", ".webp"].includes(ext))
    return "image";
  if (ext === ".sty" || ext === ".cls" || ext === ".bst") return "style";
  return "other";
}
