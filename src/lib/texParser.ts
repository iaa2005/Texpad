import { basename, pathKey } from "./path";
import type {
  CitationInfo,
  Engine,
  FloatItem,
  IncludeRef,
  LabelInfo,
  OutlineNode,
  ParsedSection,
  ParsedTexFile,
  SectionKind,
  TexEvent,
  TodoItem,
} from "../types";

const SECTION_LEVELS: Record<SectionKind, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

const SECTION_COMMANDS: Record<string, SectionKind> = {
  part: "part",
  chapter: "chapter",
  section: "section",
  subsection: "subsection",
  subsubsection: "subsubsection",
  paragraph: "paragraph",
  subparagraph: "subparagraph",
};

const CITE_COMMANDS = new Set([
  "cite",
  "citep",
  "citet",
  "citealp",
  "citeauthor",
  "citeyear",
  "citeyearpar",
  "citenum",
  "parencite",
  "textcite",
  "autocite",
  "footcite",
  "smartcite",
  "supercite",
  "nocite",
  "Citep",
  "Citet",
  "Parencite",
  "Textcite",
  "Autocite",
  "footcitetext",
  "bibitem",
  "Bibitem",
  "RBibitem",
]);

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function lineAt(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= index) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi + 1;
}

function commentRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      for (let j = lineStart; j < i; j++) {
        if (text[j] !== "%") continue;
        let backslashes = 0;
        for (let k = j - 1; k >= lineStart && text[k] === "\\"; k--) backslashes++;
        if (backslashes % 2 === 0) {
          ranges.push([j, i]);
          break;
        }
      }
      lineStart = i + 1;
    }
  }
  return ranges;
}

function inRanges(ranges: Array<[number, number]>, index: number): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = ranges[mid];
    if (index < start) hi = mid - 1;
    else if (index >= end) lo = mid + 1;
    else return true;
  }
  return false;
}

function skipWhitespace(text: string, index: number): number {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

function findBalanced(
  text: string,
  start: number,
  open: string,
  close: string,
): { content: string; end: number } | null {
  if (text[start] !== open) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return { content: text.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

interface Args {
  optional?: string;
  required: string;
  end: number;
}

function parseOptionalAndRequired(text: string, index: number): Args | null {
  let i = skipWhitespace(text, index);
  let optional: string | undefined;
  if (text[i] === "[") {
    const opt = findBalanced(text, i, "[", "]");
    if (!opt) return null;
    optional = opt.content;
    i = skipWhitespace(text, opt.end);
  }
  if (text[i] !== "{") return null;
  const req = findBalanced(text, i, "{", "}");
  if (!req) return null;
  return { optional, required: req.content, end: req.end };
}

function parseRequired(
  text: string,
  index: number,
): { content: string; required: string; end: number } | null {
  const i = skipWhitespace(text, index);
  if (text[i] !== "{") return null;
  const found = findBalanced(text, i, "{", "}");
  if (!found) return null;
  return { content: found.content, required: found.content, end: found.end };
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\\\\/g, " ")
    .replace(/\\([a-zA-Z@]+)\*?/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/~+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  const withoutComments = text.replace(/(^|[^\\])%.*$/gm, "$1");
  const withoutCommands = withoutComments
    .replace(/\\[a-zA-Z@]+\*?/g, " ")
    .replace(/\\[^a-zA-Z]/g, " ")
    .replace(/[{}$&_^~\\[\]]/g, " ");
  const matches = withoutCommands.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
  return matches ? matches.length : 0;
}

export function parseTexFile(path: string, content: string): ParsedTexFile {
  const lineStarts = buildLineStarts(content);
  const comments = commentRanges(content);
  const sections: ParsedSection[] = [];
  const events: TexEvent[] = [];
  const includes: IncludeRef[] = [];
  const graphics: { name: string; line: number }[] = [];
  const bibs: { name: string; line: number }[] = [];
  const dependencies: { name: string; line: number }[] = [];
  const labels: LabelInfo[] = [];
  const floats: FloatItem[] = [];
  const citationKeys = new Set<string>();
  const todos: TodoItem[] = [];
  const packages: string[] = [];

  let documentClass: string | undefined;
  let title: string | undefined;
  let author: string | undefined;
  let date: string | undefined;
  let currentContext = "Document";
  let currentFloat: FloatItem | null = null;
  const envStack: string[] = [];

  const commandRe = /\\([a-zA-Z@]+)(\*)?/g;
  let match: RegExpExecArray | null;

  while ((match = commandRe.exec(content))) {
    if (inRanges(comments, match.index)) continue;
    const name = match[1];
    const starred = Boolean(match[2]);
    let cursor = commandRe.lastIndex;

    const sectionKind = SECTION_COMMANDS[name];
    if (sectionKind) {
      const args = parseOptionalAndRequired(content, cursor);
      if (args) {
        const section: ParsedSection = {
          kind: sectionKind,
          title: cleanTitle(args.required) || "(untitled)",
          line: lineAt(lineStarts, match.index),
          starred,
        };
        sections.push(section);
        events.push({ type: "section", section });
        currentContext = section.title;
        cursor = args.end;
        commandRe.lastIndex = cursor;
      }
      continue;
    }

    switch (name) {
      case "begin": {
        const arg = parseRequired(content, cursor);
        if (arg) {
          const env = arg.required.trim();
          envStack.push(env);
          if (env === "figure" || env === "table") {
            currentFloat = {
              kind: env,
              title: env === "figure" ? "Figure" : "Table",
              line: lineAt(lineStarts, match.index),
              file: path,
            };
            floats.push(currentFloat);
          }
          if (env === "document") {
            events.push({ type: "document", line: lineAt(lineStarts, match.index) });
          }
          cursor = arg.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "end": {
        const arg = parseRequired(content, cursor);
        if (arg) {
          const env = arg.required.trim();
          for (let i = envStack.length - 1; i >= 0; i--) {
            if (envStack[i] === env) {
              envStack.splice(i, 1);
              break;
            }
          }
          if (env === "figure" || env === "table") currentFloat = null;
          cursor = arg.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "caption": {
        const args = parseOptionalAndRequired(content, cursor);
        if (args) {
          if (currentFloat) {
            currentFloat.title = cleanTitle(args.required) || currentFloat.title;
            currentFloat.line = lineAt(lineStarts, match.index);
          }
          cursor = args.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "label": {
        const arg = parseRequired(content, cursor);
        if (arg) {
          const inFloat = [...envStack].reverse().find((e) => e === "figure" || e === "table");
          const label: LabelInfo = {
            name: arg.required.trim(),
            file: path,
            line: lineAt(lineStarts, match.index),
            context: currentFloat && inFloat ? currentFloat.title : currentContext,
            kind: inFloat ? "float" : currentContext === "Document" ? "document" : "section",
            floatKind: inFloat as "figure" | "table" | undefined,
          };
          labels.push(label);
          if (currentFloat && !currentFloat.label) currentFloat.label = label.name;
          cursor = arg.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "input":
      case "include": {
        const arg = parseRequired(content, cursor);
        if (arg) {
          const includeName = arg.required.trim();
          includes.push({ name: includeName, line: lineAt(lineStarts, match.index) });
          events.push({ type: "include", name: includeName, line: lineAt(lineStarts, match.index) });
          cursor = arg.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "includegraphics": {
        const args = parseOptionalAndRequired(content, cursor);
        if (args) {
          graphics.push({
            name: args.required.trim(),
            line: lineAt(lineStarts, match.index),
          });
          cursor = args.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "bibliography": {
        const arg = parseRequired(content, cursor);
        if (arg) {
          for (const item of arg.required.split(",")) {
            const trimmed = item.trim();
            if (trimmed) bibs.push({ name: trimmed, line: lineAt(lineStarts, match.index) });
          }
          cursor = arg.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "addbibresource": {
        const args = parseOptionalAndRequired(content, cursor);
        if (args) {
          bibs.push({ name: args.required.trim(), line: lineAt(lineStarts, match.index) });
          cursor = args.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "documentclass": {
        const args = parseOptionalAndRequired(content, cursor);
        if (args) {
          documentClass = args.required.trim();
          cursor = args.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "title":
      case "author":
      case "date": {
        const arg = parseRequired(content, cursor);
        if (arg) {
          const value = cleanTitle(arg.required);
          if (name === "title") title = value;
          else if (name === "author") author = value;
          else date = value;
          cursor = arg.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "usepackage": {
        const args = parseOptionalAndRequired(content, cursor);
        if (args) {
          for (const packageName of args.required.split(",")) {
            const trimmed = packageName.trim();
            if (trimmed) packages.push(trimmed);
          }
          cursor = args.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      case "todo": {
        const arg = parseRequired(content, cursor);
        if (arg) {
          todos.push({
            text: cleanTitle(arg.required),
            line: lineAt(lineStarts, match.index),
            file: path,
          });
          cursor = arg.end;
          commandRe.lastIndex = cursor;
        }
        break;
      }
      default: {
        if (CITE_COMMANDS.has(name)) {
          let i = skipWhitespace(content, cursor);
          while (content[i] === "[") {
            const opt = findBalanced(content, i, "[", "]");
            if (!opt) break;
            i = skipWhitespace(content, opt.end);
          }
          if (content[i] === "{") {
            const req = findBalanced(content, i, "{", "}");
            if (req) {
              for (const key of req.content.split(",")) {
                const trimmed = key.trim();
                if (trimmed && trimmed !== "*") citationKeys.add(trimmed);
              }
              commandRe.lastIndex = req.end;
            }
          }
        }
        break;
      }
    }
  }

  for (const [start, end] of comments) {
    const comment = content.slice(start + 1, end);
    const todoMatch = comment.match(/^\s*todo\b[:\s-]*(.*)$/i);
    if (todoMatch) {
      todos.push({
        text: todoMatch[1].trim() || "TODO",
        line: lineAt(lineStarts, start),
        file: path,
      });
    }
    const dependencyMatch = comment.match(
      /force-texpad-dependency\s*:\s*(.+)$/i,
    );
    if (dependencyMatch) {
      dependencies.push({
        name: dependencyMatch[1].trim(),
        line: lineAt(lineStarts, start),
      });
    }
  }

  return {
    path,
    content,
    sections,
    events,
    includes,
    graphics,
    bibs,
    dependencies,
    labels,
    floats,
    citations: [...citationKeys],
    todos,
    words: countWords(content),
    documentClass,
    packages,
    title,
    author,
    date,
  };
}

export function parseBibFile(path: string, content: string): CitationInfo[] {
  const out: CitationInfo[] = [];
  const entryRe = /@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(content))) {
    const entryType = match[1].toLowerCase();
    if (entryType === "string" || entryType === "comment" || entryType === "preamble") continue;
    const key = match[2];
    const rest = content.slice(entryRe.lastIndex, entryRe.lastIndex + 4000);
    const field = (name: string) => {
      const re = new RegExp(`\\b${name}\\s*=\\s*(?:[{"]([\\s\\S]*?)[}"]|([^,\\n]+))\\s*,`, "i");
      const m = rest.match(re);
      if (!m) return undefined;
      return (m[1] ?? m[2] ?? "")
        .replace(/[{}]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };
    out.push({
      key,
      title: field("title"),
      author: field("author"),
      year: field("year"),
      file: path,
    });
  }
  return out;
}

export interface MagicComments {
  root?: string;
  program?: string;
}

export function parseMagicComments(content: string): MagicComments {
  const root = content.match(/^\s*%\s*!TEX\s+(?:root|master)\s*=\s*(.+)$/im);
  const program = content.match(
    /^\s*%\s*!TEX\s+(?:program|TS-program)\s*=\s*(.+)$/im,
  );
  const clean = (value?: string) =>
    value?.trim().replace(/^["']|["']$/g, "").trim();
  return { root: clean(root?.[1]), program: clean(program?.[1]) };
}

export function engineFromDirective(value?: string): Engine | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.includes("xelatex")) return "xelatex";
  if (lower.includes("lualatex")) return "lualatex";
  if (lower.includes("latexmk")) return "latexmk";
  if (lower.includes("tectonic")) return "tectonic";
  if (lower.includes("pandoc")) return "pandoc";
  if (lower.includes("pdflatex")) return "pdflatex";
  return null;
}

export function buildOutline(
  rootPath: string,
  parsed: Map<string, ParsedTexFile>,
  resolveInclude: (includeName: string) => string | undefined,
): OutlineNode[] {
  const rootNodes: OutlineNode[] = [];
  const visited = new Set<string>();
  let counter = 0;

  const walk = (path: string, nodes: OutlineNode[], sectionStack: OutlineNode[]) => {
    const key = pathKey(path);
    if (visited.has(key)) return;
    visited.add(key);
    const file = parsed.get(key);
    if (!file) return;

    for (const event of file.events) {
      if (event.type === "document") {
        nodes.push({
          id: `doc:${counter++}`,
          kind: "document",
          title: "Begin Document",
          file: path,
          line: event.line,
          children: [],
        });
      } else if (event.type === "section") {
        const level = SECTION_LEVELS[event.section.kind];
        while (
          sectionStack.length &&
          SECTION_LEVELS[sectionStack[sectionStack.length - 1].kind as SectionKind] >= level
        ) {
          sectionStack.pop();
        }
        const node: OutlineNode = {
          id: `sec:${counter++}`,
          kind: event.section.kind,
          title: event.section.title,
          file: path,
          line: event.section.line,
          starred: event.section.starred,
          children: [],
        };
        if (sectionStack.length) sectionStack[sectionStack.length - 1].children.push(node);
        else nodes.push(node);
        sectionStack.push(node);
      } else if (event.type === "include") {
        const resolved = resolveInclude(event.name);
        if (resolved) walk(resolved, nodes, sectionStack);
      }
    }
  };

  walk(rootPath, rootNodes, []);
  return rootNodes;
}

export function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  const out: OutlineNode[] = [];
  const walk = (list: OutlineNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function countOutline(nodes: OutlineNode[]): number {
  return flattenOutline(nodes).filter((node) => node.kind !== "document").length;
}

export function outlineBadge(kind: OutlineNode["kind"]): string {
  switch (kind) {
    case "part":
      return "P";
    case "chapter":
      return "C";
    case "section":
      return "S";
    case "subsection":
    case "subsubsection":
      return "S";
    case "paragraph":
    case "subparagraph":
      return "P";
    case "document":
      return "⏳";
    default:
      return "•";
  }
}

export function projectFileName(path: string): string {
  return basename(path);
}
