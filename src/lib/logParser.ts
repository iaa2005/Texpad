import { basename, joinPath, normalizePath, pathKey } from "./path";
import type { Issue, Severity } from "../types";

export interface ParsedLog {
  issues: Issue[];
  errors: number;
  warnings: number;
  pages: number | null;
}

function cleanMessage(message: string): string {
  return message
    .replace(/\s+/g, " ")
    .replace(/^!\s*/, "")
    .replace(/^LaTeX Error:\s*/i, "")
    .replace(/^Package (\S+) Error:\s*/i, "$1: ")
    .trim()
    .slice(0, 400);
}

function resolveLogPath(raw: string, rootDir: string, known: string[]): string {
  let p = raw.trim().replace(/^["']|["']$/g, "").replace(/^\(+/, "");
  if (!p || p.startsWith("<")) return "";
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\")) return normalizePath(p);
  const normalized = p.replace(/^\.\//, "").replace(/\//g, "\\");
  const lower = normalized.toLowerCase();
  const exact = known.find((file) => pathKey(file).endsWith(`\\${lower}`));
  if (exact) return exact;
  const byName = known.filter((file) => basename(file).toLowerCase() === basename(normalized).toLowerCase());
  if (byName.length === 1) return byName[0];
  return normalizePath(joinPath(rootDir, normalized));
}

function severityForMessage(message: string): Severity {
  if (/\bwarning\b/i.test(message)) return "warning";
  return "error";
}

export function parseLatexLog(
  log: string,
  rootDir: string,
  rootFile: string,
  knownFiles: string[] = [],
): ParsedLog {
  const lines = log.split(/\r?\n/);
  const issues: Issue[] = [];
  const seen = new Set<string>();
  let pages: number | null = null;
  let lastSeenFile = rootFile;

  const pushIssue = (issue: Issue) => {
    if (!issue.file) issue.file = lastSeenFile || rootFile;
    const key = `${pathKey(issue.file)}:${issue.line}:${issue.message
      .slice(0, 90)
      .toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    const outputMatch = line.match(/Output written on .*?\((\d+)\s+pages?/);
    if (outputMatch) pages = Number(outputMatch[1]);

    const opened = [...rawLine.matchAll(/\(([^()\s]+\.(?:tex|ltx|sty|cls|bib))/g)];
    if (opened.length) {
      lastSeenFile = resolveLogPath(opened[opened.length - 1][1], rootDir, knownFiles);
    }

    // Tectonic diagnostics: `error: main.tex:12: message`, optionally
    // followed by a codespan location line such as `┌─ main.tex:12:5`.
    const tectonic = line.match(/^(error|warning):\s*(.+)$/i);
    if (tectonic) {
      const severity: Severity =
        tectonic[1].toLowerCase() === "warning" ? "warning" : "error";
      const message = cleanMessage(tectonic[2]);
      const embedded = message.match(/^(.*):(\d+):\s*(.+)$/);
      if (
        embedded &&
        /\.(?:tex|ltx|sty|cls|bib|def|cfg|clo)$/i.test(embedded[1].trim())
      ) {
        pushIssue({
          file: resolveLogPath(embedded[1], rootDir, knownFiles),
          line: Number(embedded[2]),
          severity,
          message: cleanMessage(embedded[3]),
          raw: line,
        });
        continue;
      }
      let file = lastSeenFile;
      let lineNo = 0;
      for (let j = i + 1; j < Math.min(i + 9, lines.length); j++) {
        const location = lines[j].match(/[┌├]─\s*(.+?):(\d+):(\d+)/);
        if (location) {
          file = resolveLogPath(location[1], rootDir, knownFiles);
          lineNo = Number(location[2]);
          break;
        }
      }
      pushIssue({
        file,
        line: lineNo,
        severity,
        message,
        raw: lines.slice(i, Math.min(i + 6, lines.length)).join("\n"),
      });
      continue;
    }

    // -file-line-error: path:line: message
    const fileLine = line.match(/^(.*):(\d+):\s*(.+)$/);
    if (
      fileLine &&
      /\.(?:tex|ltx|sty|cls|bib|def|cfg|clo)$/i.test(fileLine[1].trim()) &&
      !/^Package\s/i.test(fileLine[3])
    ) {
      const file = resolveLogPath(fileLine[1], rootDir, knownFiles);
      const lineNo = Number(fileLine[2]);
      const message = cleanMessage(fileLine[3]);
      if (file && lineNo > 0 && message) {
        pushIssue({
          file,
          line: lineNo,
          severity: severityForMessage(message),
          message,
          raw: line,
        });
      }
      continue;
    }

    // Classic TeX error block
    if (line.startsWith("!")) {
      const message = cleanMessage(line);
      let lineNo = 0;
      let file = lastSeenFile;
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const l = lines[j];
        const lm = l.match(/^l\.(\d+)\s*(.*)$/);
        if (lm) {
          lineNo = Number(lm[1]);
          const detail = lm[2].trim();
          pushIssue({
            file,
            line: lineNo,
            severity: "error",
            message: detail && detail.length < 120 ? `${message} — ${detail}` : message,
            raw: lines.slice(i, j + 1).join("\n"),
          });
          break;
        }
        const fileMatch = l.match(/\(([^()\s]+\.(?:tex|ltx|sty|cls))/);
        if (fileMatch) file = resolveLogPath(fileMatch[1], rootDir, knownFiles);
      }
      if (lineNo === 0) {
        pushIssue({
          file,
          line: 0,
          severity: "error",
          message,
          raw: lines.slice(i, Math.min(i + 6, lines.length)).join("\n"),
        });
      }
      continue;
    }

    // Warnings
    const warning = line.match(/^(LaTeX|Package \S+|Class \S+|LaTeX Font)\s+Warning:\s*(.*)$/);
    if (warning) {
      let message = warning[2].trim();
      // Warnings often continue on following lines with `(package)` prefixes.
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const cont = lines[j];
        if (/^\([^)]+\)\s+/.test(cont)) {
          message += " " + cont.replace(/^\([^)]+\)\s+/, "").trim();
        } else break;
      }
      let lineNo = 0;
      const lineMatch = message.match(/on input line (\d+)/i);
      if (lineMatch) lineNo = Number(lineMatch[1]);
      if (!lineNo) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const m = lines[j].match(/on input line (\d+)/i);
          if (m) {
            lineNo = Number(m[1]);
            break;
          }
        }
      }
      pushIssue({
        file: lastSeenFile,
        line: lineNo,
        severity: "warning",
        message: cleanMessage(message),
        raw: line,
      });
      continue;
    }

    // Bibliography engines and index tools
    if (
      /^(ERROR|FATAL)\s*[-:]/i.test(line) ||
      /^I couldn't open /i.test(line) ||
      /^Input index file .* not found/i.test(line) ||
      /^Can't find /i.test(line)
    ) {
      pushIssue({
        file: lastSeenFile,
        line: 0,
        severity: "error",
        message: cleanMessage(line),
        raw: line,
      });
      continue;
    }

    if (/^(WARN|WARNING)\s*[-:]/i.test(line) || /^Warning--/.test(line)) {
      pushIssue({
        file: lastSeenFile,
        line: 0,
        severity: "warning",
        message: cleanMessage(line),
        raw: line,
      });
      continue;
    }

    // Box warnings are informational, but useful for layout polish.
    const box = line.match(/^(Overfull|Underfull)\s+\\[hv]box.*?(?:at lines?\s+(\d+)|in paragraph at lines\s+(\d+))/i);
    if (box) {
      const lineNo = Number(box[2] ?? box[3] ?? 0);
      pushIssue({
        file: lastSeenFile,
        line: lineNo,
        severity: "info",
        message: line.length > 220 ? `${line.slice(0, 217)}…` : line,
        raw: line,
      });
      continue;
    }

    const missingChar = line.match(/^Missing character: There is no (.+?) in font (.+?)!$/);
    if (missingChar) {
      pushIssue({
        file: lastSeenFile,
        line: 0,
        severity: "warning",
        message: `Missing glyph ${missingChar[1]} in font ${missingChar[2]}`,
        raw: line,
      });
    }
  }

  return {
    issues,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    pages,
  };
}
