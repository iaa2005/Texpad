export type ViewMode = "editor" | "split" | "pdf";
export type SidebarMode =
  | "structure"
  | "files"
  | "browser"
  | "issues"
  | "search"
  | "todos";
export type Severity = "error" | "warning" | "info";
export type ThemeSetting = "system" | "light" | "dark";
export type LanguageSetting = "system" | "en" | "ru";
export type Engine =
  | "pdflatex"
  | "xelatex"
  | "lualatex"
  | "latexmk"
  | "tectonic"
  | "pandoc";
export type FileEncoding = "UTF-8" | "windows-1251" | "UTF-16LE" | "UTF-16BE" | "ISO-8859-1";

export interface TexEngineStatus {
  pdflatex: string | null;
  xelatex: string | null;
  lualatex: string | null;
  latexmk: string | null;
  tectonic: string | null;
  tectonicManaged: boolean;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

export type SectionKind =
  | "part"
  | "chapter"
  | "section"
  | "subsection"
  | "subsubsection"
  | "paragraph"
  | "subparagraph";

export interface ParsedSection {
  kind: SectionKind;
  title: string;
  line: number;
  starred: boolean;
}

export interface LabelInfo {
  name: string;
  file: string;
  line: number;
  context: string;
  kind: "section" | "float" | "document";
  floatKind?: "figure" | "table";
}

export interface FloatItem {
  kind: "figure" | "table";
  title: string;
  line: number;
  file: string;
  label?: string;
}

export interface IncludeRef {
  name: string;
  line: number;
}

export interface TodoItem {
  text: string;
  line: number;
  file: string;
}

export interface ParsedTexFile {
  path: string;
  content: string;
  sections: ParsedSection[];
  events: TexEvent[];
  includes: IncludeRef[];
  graphics: { name: string; line: number }[];
  bibs: { name: string; line: number }[];
  dependencies: { name: string; line: number }[];
  labels: LabelInfo[];
  floats: FloatItem[];
  citations: string[];
  todos: TodoItem[];
  words: number;
  documentClass?: string;
  packages: string[];
  title?: string;
  author?: string;
  date?: string;
}

export type TexEvent =
  | { type: "section"; section: ParsedSection }
  | { type: "include"; name: string; line: number }
  | { type: "document"; line: number };

export interface OutlineNode {
  id: string;
  kind: SectionKind | "document" | "group";
  title: string;
  file: string;
  line: number;
  starred?: boolean;
  children: OutlineNode[];
}

export interface GroupNode {
  id: string;
  title: string;
  kind: "floats" | "labels" | "figures" | "tables";
  children: OutlineNode[];
}

export interface CitationInfo {
  key: string;
  title?: string;
  author?: string;
  year?: string;
  file?: string;
}

export interface ProjectFile {
  path: string;
  name: string;
  kind: "tex" | "bib" | "image" | "style" | "other";
  root: boolean;
  exists: boolean;
  relative: string;
}

export interface Issue {
  file: string;
  line: number;
  severity: Severity;
  message: string;
  raw?: string;
}

export interface CompileResult {
  success: boolean;
  log: string;
  pdfPath: string | null;
  synctexPath: string | null;
  logPath: string | null;
  durationMs: number;
  exitCode: number | null;
  passes: number;
  engine: string;
  tools: string[];
  cancelled: boolean;
}

export interface BuildInfo {
  status: "idle" | "building" | "success" | "failed";
  durationMs: number;
  passes: number;
  lastBuiltAt: number | null;
  engine: string;
  log: string;
  pdfPath: string | null;
  pdfVersion: number;
  errorMessage: string | null;
  tools: string[];
}

export interface Settings {
  engine: Engine;
  encoding: FileEncoding;
  shellEscape: boolean;
  customBuildCommand: string;
  autoTypeset: boolean;
  autoTypesetDelay: number;
  autoSave: boolean;
  autoSaveDelay: number;
  fontSize: number;
  wordWrap: boolean;
  showLineNumbers: boolean;
  pdfDarkMode: boolean;
  pdfGrading: "all" | "no-images" | "off";
  scrollLock: boolean;
  showSidebarCounts: boolean;
  sidebarStartsOnSubfiles: boolean;
  theme: ThemeSetting;
  editorFont: string;
  autoCloseEnvironment: boolean;
  autoItemize: boolean;
  language: LanguageSetting;
}

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
  modifiedMs?: number;
}

export interface JumpRequest {
  path: string;
  line: number;
  nonce: number;
}

export interface Toast {
  id: number;
  type: "info" | "success" | "error";
  text: string;
}
