import { create } from "zustand";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { revealPath } from "../lib/tauri";
import {
  basename,
  dirname,
  extname,
  fileKind,
  isAbsolutePath,
  joinPath,
  normalizePath,
  pathKey,
  relativePath,
  resolveAssetPath,
  resolveTexInclude,
  samePath,
  stem,
} from "../lib/path";
import {
  buildOutline,
  countOutline,
  engineFromDirective,
  parseBibFile,
  parseMagicComments,
  parseTexFile,
} from "../lib/texParser";
import { parseLatexLog } from "../lib/logParser";
import { templateById } from "../lib/templates";
import * as api from "../lib/tauri";
import type { UserSnippet } from "../lib/tauri";
import type {
  BuildInfo,
  CitationInfo,
  CompileResult,
  Engine,
  FileEncoding,
  FloatItem,
  Issue,
  LabelInfo,
  OpenFile,
  OutlineNode,
  ParsedTexFile,
  ProjectFile,
  RecentProject,
  Settings,
  SidebarMode,
  TexEngineStatus,
  Toast,
  TodoItem,
  ViewMode,
} from "../types";
import { t } from "../i18n";

const SETTINGS_KEY = "texpad.settings.v1";
const RECENT_KEY = "texpad.recent.v1";
const SESSION_KEY = "texpad.session.v1";

interface SessionState {
  rootFile: string;
  files: string[];
  activePath: string | null;
  cursor?: { line: number; column: number };
}

function loadSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

function persistSession(session: SessionState) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

const lastBackupAt = new Map<string, number>();
const savingPaths = new Set<string>();

const DEFAULT_SETTINGS: Settings = {
  language: "system",
  engine: "pdflatex",
  encoding: "UTF-8",
  shellEscape: false,
  customBuildCommand: "",
  autoTypeset: true,
  autoTypesetDelay: 900,
  autoSave: true,
  autoSaveDelay: 700,
  fontSize: 13.5,
  wordWrap: true,
  showLineNumbers: true,
  pdfDarkMode: false,
  pdfGrading: "all",
  scrollLock: false,
  showSidebarCounts: true,
  sidebarStartsOnSubfiles: false,
  theme: "system",
  editorFont: '"SF Mono", "Cascadia Code", Consolas, monospace',
  autoCloseEnvironment: true,
  autoItemize: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const settings = { ...DEFAULT_SETTINGS, ...parsed };
    if (
      parsed.editorFont &&
      !parsed.editorFont.includes("SF Mono") &&
      (parsed.editorFont.includes("Cascadia Code") ||
        parsed.editorFont.includes("JetBrains"))
    ) {
      settings.editorFont = DEFAULT_SETTINGS.editorFont;
    }
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadRecent(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentProject[]).slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function engineLabel(engine: Engine | string): string {
  switch (engine) {
    case "pdflatex":
      return "pdfLaTeX";
    case "xelatex":
      return "XeLaTeX";
    case "lualatex":
      return "LuaLaTeX";
    case "latexmk":
      return "latexmk";
    case "tectonic":
      return "Tectonic";
    case "pandoc":
      return "Pandoc";
    default:
      return engine || "pdfLaTeX";
  }
}

const DETECTABLE_ENGINES = [
  "pdflatex",
  "xelatex",
  "lualatex",
  "latexmk",
  "tectonic",
] as const;

type DetectableEngine = (typeof DETECTABLE_ENGINES)[number];

function engineInstalled(
  status: TexEngineStatus,
  engine: Engine,
): boolean {
  if (engine === "pandoc") return true;
  return Boolean(status[engine as DetectableEngine]);
}

function installedEnginePath(
  status: TexEngineStatus,
  engine: Engine,
): string | undefined {
  if (engine === "pandoc") return undefined;
  return status[engine as DetectableEngine] ?? undefined;
}

function anyTexEngineInstalled(status: TexEngineStatus): boolean {
  return DETECTABLE_ENGINES.some((engine) => Boolean(status[engine]));
}

export function effectiveEngineFor(
  engine: Engine,
  status: TexEngineStatus | null,
): Engine {
  if (
    status &&
    !engineInstalled(status, engine) &&
    (engine === "pdflatex" || engine === "xelatex") &&
    status.tectonic
  ) {
    return "tectonic";
  }
  return engine;
}

let tectonicFallbackNotified = false;

function emptyBuild(engine: Engine): BuildInfo {
  return {
    status: "idle",
    durationMs: 0,
    passes: 0,
    lastBuiltAt: null,
    engine: engineLabel(engine),
    log: "",
    pdfPath: null,
    pdfVersion: 0,
    errorMessage: null,
    tools: [],
  };
}

interface CachedFile {
  path: string;
  content: string;
}

interface AppStore {
  hydrated: boolean;
  loading: boolean;
  rootFile: string | null;
  rootDir: string | null;
  projectEngine: Engine | null;
  metadata: {
    title?: string;
    author?: string;
    date?: string;
    documentClass?: string;
    packages: number;
    words: number;
  } | null;
  files: OpenFile[];
  activePath: string | null;
  fileCache: Record<string, CachedFile>;
  savedContents: Record<string, string>;
  parsedFiles: Record<string, ParsedTexFile>;
  outline: OutlineNode[];
  labels: LabelInfo[];
  floats: FloatItem[];
  todos: TodoItem[];
  citations: CitationInfo[];
  customEnvironments: string[];
  customCommands: string[];
  userAutocomplete: string;
  userSnippets: UserSnippet[];
  projectFiles: ProjectFile[];
  words: number;
  bibFiles: string[];
  graphicFiles: string[];
  localPackages: string[];
  issues: Issue[];
  build: BuildInfo;
  sidebarVisible: boolean;
  sidebarMode: SidebarMode;
  sidebarTab: "structure" | "subfiles";
  viewMode: ViewMode;
  searchTab: "text" | "tag";
  searchNonce: number;
  issuesTab: "issues" | "log";
  syncNonce: number;
  insertRequest: { text: string; nonce: number } | null;
  cursor: { line: number; column: number };
  diskMtimes: Record<string, number>;
  externalChanged: Record<string, boolean>;
  settings: Settings;
  recent: RecentProject[];
  jump: { path: string; line: number; nonce: number } | null;
  navHistory: Array<{ path: string; line: number }>;
  navIndex: number;
  toast: Toast | null;
  showSettings: boolean;
  showTemplates: boolean;
  engineStatus: TexEngineStatus | null;
  texSetupOpen: boolean;

  hydrate: () => void;
  openProject: (path: string) => Promise<void>;
  openProjectDialog: () => Promise<void>;
  importProjectZipDialog: () => Promise<void>;
  savePdfAs: () => Promise<void>;
  openFileDialog: () => Promise<void>;
  newDocument: (templateId?: string) => Promise<void>;
  newDocumentFromContent: (content: string) => Promise<void>;
  closeProject: () => void;
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => Promise<void>;
  setActiveFile: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  saveFile: (path: string, silent?: boolean) => Promise<boolean>;
  saveAll: (silent?: boolean) => Promise<void>;
  applyFileContents: (
    updates: Array<{ path: string; content: string }>,
  ) => Promise<void>;
  runTypeset: (manual?: boolean) => Promise<void>;
  cancelTypeset: () => Promise<void>;
  cleanBuild: () => Promise<void>;
  refreshAnalysis: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setSidebarTab: (tab: "structure" | "subfiles") => void;
  setViewMode: (mode: ViewMode) => void;
  setSearchTab: (tab: "text" | "tag") => void;
  focusSearch: (tab: "text" | "tag") => void;
  focusIssues: (tab: "issues" | "log") => void;
  requestForwardSync: () => void;
  insertIntoEditor: (text: string) => void;
  clearInsertRequest: () => void;
  setCursor: (line: number, column: number) => void;
  checkExternalChanges: () => Promise<void>;
  reloadWithEncoding: (encoding: FileEncoding) => Promise<void>;
  reloadUserConfig: () => Promise<void>;
  openUserConfigFolder: () => Promise<void>;
  openEditorArchive: () => Promise<void>;
  refreshEngineStatus: () => Promise<TexEngineStatus | null>;
  installTectonic: () => Promise<TexEngineStatus>;
  setTexSetupOpen: (open: boolean) => void;
  setSettings: (partial: Partial<Settings>) => void;
  setShowSettings: (show: boolean) => void;
  setShowTemplates: (show: boolean) => void;
  jumpTo: (path: string, line: number) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  clearJump: () => void;
  notify: (text: string, type?: Toast["type"]) => void;
  dismissToast: () => void;
  removeRecent: (path: string) => void;
}

let analysisTimer: number | undefined;
let saveTimer: number | undefined;
let typesetTimer: number | undefined;
let toastTimer: number | undefined;
let pendingBuild = false;
let openingToken = 0;
let redirectDepth = 0;

function persistSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}

function persistRecent(recent: RecentProject[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // ignore quota errors
  }
}

function isTexPath(path: string): boolean {
  const ext = extname(path);
  return ext === ".tex" || ext === ".ltx";
}

function resolveBibPath(rootDir: string, name: string): string {
  const clean = name.trim().replace(/^["']|["']$/g, "");
  if (!clean) return "";
  const withExt = extname(clean) ? clean : `${clean}.bib`;
  return isAbsolutePath(withExt)
    ? normalizePath(withExt)
    : normalizePath(joinPath(rootDir, withExt));
}

function collectReachable(
  rootFile: string,
  rootDir: string,
  parsed: Map<string, ParsedTexFile>,
): ParsedTexFile[] {
  const out: ParsedTexFile[] = [];
  const visited = new Set<string>();
  const walk = (path: string) => {
    const key = pathKey(path);
    if (visited.has(key)) return;
    visited.add(key);
    const file = parsed.get(key);
    if (!file) return;
    out.push(file);
    for (const include of file.includes) {
      const resolved = resolveTexInclude(rootDir, include.name);
      if (parsed.has(pathKey(resolved))) walk(resolved);
    }
  };
  walk(rootFile);
  return out;
}

/**
 * Earlier TeX passes legitimately warn about undefined references that the
 * next pass resolves, so issues come from the last "===== Pass N =====" only,
 * plus the BibTeX / Biber / makeindex sections.
 */
function issuesLogOf(log: string): string {
  const sections = log.split(/^(?====== .+ =====$)/m);
  const passes = sections.filter((section) => /^===== Pass \d+ =====/.test(section));
  if (passes.length < 2) return log;
  const tools = sections.filter((section) => /^===== (?!Pass )/.test(section));
  return [passes[passes.length - 1], ...tools].join("\n");
}

export const useAppStore = create<AppStore>()((set, get) => ({
  hydrated: false,
  loading: false,
  rootFile: null,
  rootDir: null,
  projectEngine: null,
  metadata: null,
  files: [],
  activePath: null,
  fileCache: {},
  savedContents: {},
  parsedFiles: {},
  outline: [],
  labels: [],
  floats: [],
  todos: [],
  citations: [],
  customEnvironments: [],
  customCommands: [],
  userAutocomplete: "",
  userSnippets: [],
  projectFiles: [],
  words: 0,
  bibFiles: [],
  graphicFiles: [],
  localPackages: [],
  issues: [],
  build: emptyBuild(DEFAULT_SETTINGS.engine),
  sidebarVisible: true,
  sidebarMode: "structure",
  sidebarTab: "structure",
  viewMode: "split",
  searchTab: "text",
  searchNonce: 0,
  issuesTab: "issues",
  syncNonce: 0,
  insertRequest: null,
  cursor: { line: 1, column: 1 },
  diskMtimes: {},
  externalChanged: {},
  settings: DEFAULT_SETTINGS,
  recent: [],
  jump: null,
  navHistory: [],
  navIndex: -1,
  toast: null,
  showSettings: false,
  showTemplates: false,
  engineStatus: null,
  texSetupOpen: false,

  hydrate: () => {
    const settings = loadSettings();
    set({
      settings,
      recent: loadRecent(),
      build: emptyBuild(settings.engine),
      hydrated: true,
    });
    void get().reloadUserConfig();
    void get().refreshEngineStatus();

    const session = loadSession();
    if (session?.rootFile) {
      void (async () => {
        try {
          const info = await api.pathInfo(session.rootFile);
          if (!info.exists) return;
          await get().openProject(session.rootFile);
          for (const path of session.files ?? []) {
            if (!samePath(path, session.rootFile)) {
              await get().openFile(path);
            }
          }
          if (session.activePath) {
            await get().openFile(session.activePath);
            set({ activePath: session.activePath });
          }
          if (session.activePath && session.cursor) {
            set({
              cursor: session.cursor,
              jump: {
                path: session.activePath,
                line: session.cursor.line,
                nonce: Date.now(),
              },
            });
          }
        } catch {
          // Corrupt or stale session: fall back to the welcome screen.
        }
      })();
    }
  },

  notify: (text, type = "info") => {
    const id = Date.now();
    set({ toast: { id, type, text } });
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => set({ toast: null }), 4200);
  },

  dismissToast: () => {
    if (toastTimer) window.clearTimeout(toastTimer);
    set({ toast: null });
  },

  openProject: async (path: string) => {
    const token = ++openingToken;
    const normalized = normalizePath(path);
    set({ loading: true });
    try {
      const rootContent = await api.readTextFile(normalized, get().settings.encoding);
      if (token !== openingToken) return;
      const rootDir = dirname(normalized);

      // TeX magic comments: `% !TEX root = ../main.tex` and
      // `% !TEX program = xelatex`.
      const magic = parseMagicComments(rootContent);
      if (magic.root && redirectDepth < 3) {
        const redirect = normalizePath(joinPath(rootDir, magic.root));
        if (!samePath(redirect, normalized)) {
          const info = await api.pathInfo(redirect);
          if (info.exists) {
            redirectDepth += 1;
            try {
              await get().openProject(redirect);
            } finally {
              redirectDepth -= 1;
            }
            if (!samePath(redirect, normalized)) {
              await get().openFile(normalized);
            }
            return;
          }
        }
      }

      const cache: Record<string, CachedFile> = {
        [pathKey(normalized)]: { path: normalized, content: rootContent },
      };
      const saved: Record<string, string> = { [pathKey(normalized)]: rootContent };
      const rootParsed = parseTexFile(normalized, rootContent);
      const queue = [...rootParsed.includes];
      const visited = new Set<string>([pathKey(normalized)]);
      const bibPaths = new Set<string>();
      for (const bib of rootParsed.bibs) bibPaths.add(resolveBibPath(rootDir, bib.name));

      let guard = 0;
      while (queue.length && guard++ < 400) {
        if (token !== openingToken) return;
        const include = queue.shift()!;
        const resolved = resolveTexInclude(rootDir, include.name);
        const key = pathKey(resolved);
        if (visited.has(key)) continue;
        visited.add(key);
        try {
          const content = await api.readTextFile(resolved, get().settings.encoding);
          cache[key] = { path: resolved, content };
          saved[key] = content;
          const parsed = parseTexFile(resolved, content);
          for (const child of parsed.includes) queue.push(child);
          for (const bib of parsed.bibs) bibPaths.add(resolveBibPath(rootDir, bib.name));
        } catch {
          // Missing includes are normal while a document is being written.
        }
      }

      let citations: CitationInfo[] = [];
      for (const bibPath of bibPaths) {
        if (!bibPath) continue;
        try {
          const content = await api.readTextFile(bibPath, get().settings.encoding);
          cache[pathKey(bibPath)] = { path: bibPath, content };
          citations = citations.concat(parseBibFile(bibPath, content));
        } catch {
          // Missing bibliography files are ignored.
        }
      }

      // Pick up local .sty/.cls files referenced by the project so they
      // appear in the Subfiles pane, as Texifier does.
      const localStyles = new Set<string>();
      for (const cached of Object.values(cache)) {
        if (!isTexPath(cached.path)) continue;
        const parsed = parseTexFile(cached.path, cached.content);
        for (const packageName of parsed.packages) {
          localStyles.add(`${packageName}.sty`);
        }
        if (parsed.documentClass) {
          localStyles.add(`${parsed.documentClass}.cls`);
        }
      }
      for (const name of localStyles) {
        const stylePath = normalizePath(joinPath(rootDir, name));
        const key = pathKey(stylePath);
        if (cache[key]) continue;
        try {
          const content = await api.readTextFile(stylePath, get().settings.encoding);
          cache[key] = { path: stylePath, content };
          saved[key] = content;
        } catch {
          // Not a local style file.
        }
      }
      if (token !== openingToken) return;

      const openFile: OpenFile = {
        path: normalized,
        name: basename(normalized),
        content: rootContent,
        dirty: false,
      };
      set({
        loading: false,
        rootFile: normalized,
        rootDir,
        projectEngine: engineFromDirective(magic.program),
        metadata: null,
        files: [openFile],
        activePath: normalized,
        fileCache: cache,
        savedContents: saved,
        citations,
        issues: [],
        build: emptyBuild(get().settings.engine),
        jump: null,
        navHistory: [],
        navIndex: -1,
        sidebarTab: get().settings.sidebarStartsOnSubfiles
          ? "subfiles"
          : "structure",
      });

      get().refreshAnalysis();
      void api.pathInfo(normalized).then((info) => {
        if (info.modifiedMs != null) {
          set((state) => ({
            diskMtimes: {
              ...state.diskMtimes,
              [pathKey(normalized)]: info.modifiedMs!,
            },
          }));
        }
      });

      const pdfPath = normalizePath(
        joinPath(rootDir, `.texpad\\build\\${stem(normalized)}.pdf`),
      );
      void api.pathInfo(pdfPath).then((info) => {
        if (info.exists && samePath(get().rootFile ?? "", normalized)) {
          set((state) => ({
            build: { ...state.build, pdfPath, pdfVersion: Date.now() },
          }));
        }
      });

      const recent = [
        {
          path: normalized,
          name: basename(normalized),
          lastOpened: Date.now(),
          modifiedMs: (await api.pathInfo(normalized)).modifiedMs ?? undefined,
        },
        ...get().recent.filter((item) => !samePath(item.path, normalized)),
      ].slice(0, 8);
      persistRecent(recent);
      set({ recent });

      if (get().settings.autoTypeset) {
        window.setTimeout(() => {
          if (samePath(get().rootFile ?? "", normalized)) void get().runTypeset(false);
        }, 650);
      }
    } catch (error) {
      if (token !== openingToken) return;
      set({ loading: false });
      const message = error instanceof Error ? error.message : String(error);
      get().notify(message, "error");
    }
  },

  openProjectDialog: async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        title: t("Open LaTeX document"),
        filters: [
          { name: t("LaTeX documents"), extensions: ["tex", "ltx"] },
          { name: t("All files"), extensions: ["*"] },
        ],
      });
      if (typeof selected === "string") await get().openProject(selected);
    } catch (error) {
      get().notify(String(error), "error");
    }
  },

  importProjectZipDialog: async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        title: t("Import project from ZIP (Overleaf, latexted…)"),
        filters: [{ name: t("ZIP archive"), extensions: ["zip"] }],
      });
      if (typeof selected !== "string") return;
      set({ loading: true });
      const rootFile = await api.importProjectZip(selected);
      await get().openProject(rootFile);
      get().notify(t("Project imported from ZIP."), "success");
    } catch (error) {
      set({ loading: false });
      get().notify(String(error), "error");
    }
  },

  savePdfAs: async () => {
    const { build, rootFile } = get();
    if (!build.pdfPath || !rootFile) {
      get().notify(t("Typeset the document first."), "info");
      return;
    }
    try {
      const selected = await saveDialog({
        title: t("Save PDF As"),
        defaultPath: joinPath(dirname(rootFile), basename(build.pdfPath)),
        filters: [{ name: t("PDF document"), extensions: ["pdf"] }],
      });
      if (typeof selected !== "string") return;
      await api.copyFile(build.pdfPath, selected);
      get().notify(t("PDF saved."), "success");
    } catch (error) {
      get().notify(String(error), "error");
    }
  },

  openFileDialog: async () => {
    try {
      const selected = await openDialog({
        multiple: true,
        directory: false,
        title: t("Open file"),
        filters: [
          { name: t("LaTeX project files"), extensions: ["tex", "ltx", "bib", "sty", "cls"] },
          { name: t("All files"), extensions: ["*"] },
        ],
      });
      const paths = Array.isArray(selected)
        ? selected
        : typeof selected === "string"
          ? [selected]
          : [];
      if (!paths.length) return;
      if (!get().rootFile) {
        const firstTex = paths.find(isTexPath) ?? paths[0];
        await get().openProject(firstTex);
        for (const path of paths) {
          if (!samePath(path, firstTex) && isTexPath(path)) await get().openFile(path);
        }
        return;
      }
      for (const path of paths) {
        if (isTexPath(path) || extname(path) === ".bib" || extname(path) === ".sty") {
          await get().openFile(path);
        } else {
          await api.openExternal(path);
        }
      }
    } catch (error) {
      get().notify(String(error), "error");
    }
  },

  newDocument: async (templateId = "blank") => {
    await get().newDocumentFromContent(templateById(templateId).content);
  },

  newDocumentFromContent: async (content: string) => {
    try {
      const defaultPath = get().rootDir
        ? joinPath(get().rootDir!, "Untitled.tex")
        : "Untitled.tex";
      const selected = await saveDialog({
        title: t("New LaTeX document"),
        defaultPath,
        filters: [{ name: t("LaTeX document"), extensions: ["tex"] }],
      });
      if (typeof selected !== "string") return;
      const path = normalizePath(
        selected.endsWith(".tex") ? selected : `${selected}.tex`,
      );
      await api.writeTextFile(path, content, get().settings.encoding);
      await get().openProject(path);
    } catch (error) {
      get().notify(String(error), "error");
    }
  },

  closeProject: () => {
    openingToken++;
    if (typesetTimer) window.clearTimeout(typesetTimer);
    if (saveTimer) window.clearTimeout(saveTimer);
    if (analysisTimer) window.clearTimeout(analysisTimer);
    pendingBuild = false;
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    set({
      rootFile: null,
      rootDir: null,
      projectEngine: null,
      metadata: null,
      files: [],
      activePath: null,
      fileCache: {},
      savedContents: {},
      parsedFiles: {},
      outline: [],
      labels: [],
      floats: [],
      todos: [],
      citations: [],
      customEnvironments: [],
      customCommands: [],
      userAutocomplete: "",
      userSnippets: [],
      projectFiles: [],
      words: 0,
      bibFiles: [],
      graphicFiles: [],
      localPackages: [],
      issues: [],
      build: emptyBuild(get().settings.engine),
      jump: null,
      navHistory: [],
      navIndex: -1,
      cursor: { line: 1, column: 1 },
      diskMtimes: {},
      externalChanged: {},
      sidebarMode: "structure",
      sidebarTab: "structure",
      viewMode: "split",
    });
  },

  openFile: async (path: string) => {
    const normalized = normalizePath(path);
    const state = get();
    if (!state.rootFile) {
      await state.openProject(normalized);
      return;
    }
    if (state.files.some((file) => samePath(file.path, normalized))) {
      set({ activePath: normalized });
      return;
    }
    if (fileKind(normalized) === "image") {
      try {
        await api.openExternal(normalized);
      } catch (error) {
        get().notify(String(error), "error");
      }
      return;
    }
    try {
      const cached = state.fileCache[pathKey(normalized)];
      const content = cached ? cached.content : await api.readTextFile(normalized, get().settings.encoding);
      const openFile: OpenFile = {
        path: normalized,
        name: basename(normalized),
        content,
        dirty: false,
      };
      set((current) => ({
        files: current.files.some((file) => samePath(file.path, normalized))
          ? current.files
          : [...current.files, openFile],
        activePath: normalized,
        fileCache: {
          ...current.fileCache,
          [pathKey(normalized)]: { path: normalized, content },
        },
        savedContents: {
          ...current.savedContents,
          [pathKey(normalized)]: current.savedContents[pathKey(normalized)] ?? content,
        },
      }));
      get().refreshAnalysis();
      void api.pathInfo(normalized).then((info) => {
        if (info.modifiedMs != null) {
          set((state) => ({
            diskMtimes: {
              ...state.diskMtimes,
              [pathKey(normalized)]: info.modifiedMs!,
            },
          }));
        }
      });
    } catch (error) {
      get().notify(String(error), "error");
    }
  },

  closeFile: async (path: string) => {
    const state = get();
    const file = state.files.find((item) => samePath(item.path, path));
    if (file?.dirty) await get().saveFile(path, true);
    const remaining = get().files.filter((item) => !samePath(item.path, path));
    if (!remaining.length) {
      get().closeProject();
      return;
    }
    let active = get().activePath;
    if (active && samePath(active, path)) {
      active = remaining[Math.max(0, remaining.length - 1)].path;
    }
    set({ files: remaining, activePath: active });
  },

  setActiveFile: (path: string) => {
    set({ activePath: path });
  },

  updateContent: (path: string, content: string) => {
    const key = pathKey(path);
    set((state) => {
      const saved = state.savedContents[key];
      return {
        files: state.files.map((file) =>
          samePath(file.path, path)
            ? { ...file, content, dirty: saved !== content }
            : file,
        ),
        fileCache: { ...state.fileCache, [key]: { path, content } },
      };
    });

    if (analysisTimer) window.clearTimeout(analysisTimer);
    analysisTimer = window.setTimeout(() => get().refreshAnalysis(), 180);

    const settings = get().settings;
    if (settings.autoSave) {
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(
        () => void get().saveFile(path, true),
        settings.autoSaveDelay,
      );
    }
    if (settings.autoTypeset) {
      if (typesetTimer) window.clearTimeout(typesetTimer);
      typesetTimer = window.setTimeout(
        () => void get().runTypeset(false),
        settings.autoTypesetDelay + 120,
      );
    }
  },

  saveFile: async (path: string, silent = false) => {
    const file = get().files.find((item) => samePath(item.path, path));
    if (!file) return false;
    const content = file.content;
    const key = pathKey(file.path);
    savingPaths.add(key);
    try {
      await api.writeTextFile(file.path, content, get().settings.encoding);
      set((state) => ({
        files: state.files.map((item) =>
          samePath(item.path, path)
            ? { ...item, dirty: item.content !== content }
            : item,
        ),
        savedContents: { ...state.savedContents, [key]: content },
        fileCache: {
          ...state.fileCache,
          [key]: { path: file.path, content },
        },
        externalChanged: { ...state.externalChanged, [key]: false },
      }));
      void api.pathInfo(file.path).then((info) => {
        if (info.modifiedMs != null) {
          set((state) => ({
            diskMtimes: { ...state.diskMtimes, [key]: info.modifiedMs! },
          }));
        }
      });
      const now = Date.now();
      const lastBackup = lastBackupAt.get(key) ?? 0;
      if (extname(file.path) === ".tex" && now - lastBackup > 120_000) {
        lastBackupAt.set(key, now);
        void api.backupDocument(file.path, content).catch(() => {});
      }
      if (!silent) get().notify(t("Saved"), "success");
      return true;
    } catch (error) {
      get().notify(String(error), "error");
      return false;
    } finally {
      savingPaths.delete(key);
    }
  },

  saveAll: async (silent = true) => {
    const dirty = get().files.filter((file) => file.dirty);
    await Promise.all(dirty.map((file) => get().saveFile(file.path, silent)));
  },

  applyFileContents: async (updates) => {
    for (const update of updates) {
      const writeKey = pathKey(update.path);
      savingPaths.add(writeKey);
      try {
        await api.writeTextFile(update.path, update.content, get().settings.encoding);
      } catch (error) {
        get().notify(String(error), "error");
        savingPaths.delete(writeKey);
        continue;
      }
      savingPaths.delete(writeKey);
      const key = pathKey(update.path);
      set((state) => ({
        fileCache: {
          ...state.fileCache,
          [key]: { path: update.path, content: update.content },
        },
        savedContents: { ...state.savedContents, [key]: update.content },
        files: state.files.map((file) =>
          samePath(file.path, update.path)
            ? { ...file, content: update.content, dirty: false }
            : file,
        ),
        externalChanged: { ...state.externalChanged, [key]: false },
      }));
      void api.pathInfo(update.path).then((info) => {
        if (info.modifiedMs != null) {
          set((state) => ({
            diskMtimes: { ...state.diskMtimes, [key]: info.modifiedMs! },
          }));
        }
      });
    }
    get().refreshAnalysis();
  },

  runTypeset: async (manual = false) => {
    const state = get();
    if (!state.rootFile) return;
    if (state.build.status === "building") {
      pendingBuild = true;
      return;
    }
    if (typesetTimer) {
      window.clearTimeout(typesetTimer);
      typesetTimer = undefined;
    }

    const rootFile = state.rootFile;
    const rootDir = state.rootDir!;
    const customCommand = state.settings.customBuildCommand.trim();
    const requestedEngine = state.projectEngine ?? state.settings.engine;
    let engine = requestedEngine;
    let resolvedEnginePath: string | undefined;

    if (!customCommand) {
      let status = get().engineStatus;
      if (!status || manual) {
        status = (await get().refreshEngineStatus()) ?? status;
      }
      if (status && !engineInstalled(status, requestedEngine)) {
        const canUseTectonic =
          (requestedEngine === "pdflatex" || requestedEngine === "xelatex") &&
          Boolean(status.tectonic);
        if (canUseTectonic) {
          engine = "tectonic";
          resolvedEnginePath = status.tectonic ?? undefined;
          if (!tectonicFallbackNotified) {
            tectonicFallbackNotified = true;
            get().notify(
              t("{engine} was not found — typesetting with Tectonic instead.", { engine: engineLabel(requestedEngine) }),
              "info",
            );
          }
        } else {
          set((current) => ({
            build: {
              ...current.build,
              status: "idle",
              errorMessage: null,
            },
          }));
          set({ texSetupOpen: true });
          if (!anyTexEngineInstalled(status)) {
            get().notify(
              t("No TeX engine was found. Install Tectonic to start typesetting."),
              "error",
            );
          } else {
            get().notify(
              t("{engine} was not found. Choose another engine in Settings.", { engine: engineLabel(requestedEngine) }),
              "error",
            );
          }
          return;
        }
      } else if (status) {
        resolvedEnginePath = installedEnginePath(status, engine);
      }
    }

    set((current) => ({
      build: { ...current.build, status: "building", errorMessage: null },
    }));
    await get().saveAll(true);

    try {
      const result: CompileResult = await api.compileProject(rootFile, {
        engine,
        enginePath: resolvedEnginePath,
        shellEscape: get().settings.shellEscape,
        maxPasses: 4,
        customCommand: customCommand || undefined,
      });
      const knownFiles = [
        rootFile,
        ...get().projectFiles.map((file) => file.path),
        ...Object.values(get().fileCache).map((file) => file.path),
      ];
      const parsedLog = parseLatexLog(issuesLogOf(result.log), rootDir, rootFile, knownFiles);
      if (result.cancelled) {
        pendingBuild = false;
        set((current) => ({
          build: {
            ...current.build,
            status: "idle",
            errorMessage: null,
            log: result.log,
            lastBuiltAt: Date.now(),
          },
        }));
        get().notify(t("Typesetting aborted."), "info");
        return;
      }
      set((current) => ({
        issues: parsedLog.issues,
        build: {
          ...current.build,
          status: result.success ? "success" : "failed",
          durationMs: result.durationMs,
          passes: result.passes,
          lastBuiltAt: Date.now(),
          engine: result.engine,
          log: result.log,
          tools: result.tools ?? [],
          pdfPath:
            result.success && result.pdfPath ? result.pdfPath : current.build.pdfPath,
          pdfVersion:
            result.success && result.pdfPath ? Date.now() : current.build.pdfVersion,
          errorMessage: null,
        },
        sidebarMode:
          manual && parsedLog.errors > 0 ? "issues" : current.sidebarMode,
        sidebarVisible:
          manual && parsedLog.errors > 0 ? true : current.sidebarVisible,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((current) => ({
        build: {
          ...current.build,
          status: "failed",
          errorMessage: message,
          lastBuiltAt: Date.now(),
        },
      }));
      get().notify(message, "error");
    } finally {
      if (pendingBuild) {
        pendingBuild = false;
        if (get().settings.autoTypeset) {
          window.setTimeout(() => void get().runTypeset(false), 300);
        }
      }
    }
  },

  cancelTypeset: async () => {
    try {
      await api.cancelTypeset();
    } catch (error) {
      get().notify(String(error), "error");
    }
  },

  cleanBuild: async () => {
    const rootFile = get().rootFile;
    if (!rootFile) return;
    try {
      await api.cleanBuild(rootFile);
      set((state) => ({
        issues: [],
        build: {
          ...emptyBuild(get().settings.engine),
          lastBuiltAt: state.build.lastBuiltAt,
        },
      }));
      get().notify(t("Intermediate files removed."), "success");
    } catch (error) {
      get().notify(String(error), "error");
    }
  },

  refreshAnalysis: () => {
    const state = get();
    if (!state.rootFile || !state.rootDir) return;
    const parsed: Record<string, ParsedTexFile> = {};
    for (const [key, cached] of Object.entries(state.fileCache)) {
      if (isTexPath(cached.path)) parsed[key] = parseTexFile(cached.path, cached.content);
    }
    const parsedMap = new Map<string, ParsedTexFile>(Object.entries(parsed));
    const rootDir = state.rootDir;
    const resolveInclude = (name: string) => {
      const resolved = resolveTexInclude(rootDir, name);
      return parsedMap.has(pathKey(resolved)) ? resolved : undefined;
    };
    const outline = buildOutline(state.rootFile, parsedMap, resolveInclude);
    const reachable = collectReachable(state.rootFile, rootDir, parsedMap);
    const labels = reachable.flatMap((file) => file.labels);
    const floats = reachable.flatMap((file) => file.floats);
    const todos = reachable.flatMap((file) => file.todos);
    const words = reachable.reduce((sum, file) => sum + file.words, 0);

    const citationMap = new Map<string, CitationInfo>();
    for (const citation of state.citations) citationMap.set(citation.key, citation);
    for (const file of reachable) {
      for (const key of file.citations) {
        if (!citationMap.has(key)) citationMap.set(key, { key, file: file.path });
      }
    }

    const envs = new Set<string>();
    const commands = new Set<string>();
    for (const file of Object.values(parsed)) {
      for (const match of file.content.matchAll(/\\newenvironment\{([^}]+)\}/g)) {
        if (match[1].trim()) envs.add(match[1].trim());
      }
      for (const match of file.content.matchAll(/\\newtheorem\{([^}]+)\}/g)) {
        if (match[1].trim()) envs.add(match[1].trim());
      }
      for (const match of file.content.matchAll(/\\newcommand\*?\{\\([^}]+)\}/g)) {
        if (match[1].trim()) commands.add(match[1].trim());
      }
      for (const match of file.content.matchAll(/\\DeclareMathOperator\*?\{\\([^}]+)\}/g)) {
        if (match[1].trim()) commands.add(match[1].trim());
      }
    }

    const projectMap = new Map<string, ProjectFile>();
    const addProjectFile = (
      path: string,
      kind: ProjectFile["kind"],
      root: boolean,
      exists: boolean,
    ) => {
      const normalized = normalizePath(path);
      const key = pathKey(normalized);
      if (projectMap.has(key)) return;
      projectMap.set(key, {
        path: normalized,
        name: basename(normalized),
        kind,
        root,
        exists,
        relative: relativePath(rootDir, normalized),
      });
    };

    addProjectFile(state.rootFile, "tex", true, true);
    for (const file of reachable) {
      for (const include of file.includes) {
        const resolved = resolveTexInclude(rootDir, include.name);
        addProjectFile(resolved, "tex", false, parsedMap.has(pathKey(resolved)));
      }
      for (const graphic of file.graphics) {
        const resolved = resolveAssetPath(rootDir, graphic.name);
        addProjectFile(resolved, "image", false, true);
      }
      for (const bib of file.bibs) {
        const resolved = resolveBibPath(rootDir, bib.name);
        if (resolved) addProjectFile(resolved, "bib", false, true);
      }
      for (const dependency of file.dependencies) {
        const resolved = isAbsolutePath(dependency.name)
          ? normalizePath(dependency.name)
          : normalizePath(joinPath(rootDir, dependency.name));
        addProjectFile(resolved, fileKind(resolved), false, true);
      }
    }
    for (const cached of Object.values(state.fileCache)) {
      const extension = extname(cached.path);
      if (extension === ".sty" || extension === ".cls" || extension === ".bst") {
        addProjectFile(cached.path, "style", false, true);
      }
    }
    const projectFiles = [...projectMap.values()].sort((a, b) => {
      if (a.root !== b.root) return a.root ? -1 : 1;
      const order = (kind: ProjectFile["kind"]) =>
        kind === "tex" ? 0 : kind === "bib" ? 1 : kind === "image" ? 2 : 3;
      const byKind = order(a.kind) - order(b.kind);
      if (byKind !== 0) return byKind;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    const localPackages = projectFiles
      .filter((file) => file.name.toLowerCase().endsWith(".sty"))
      .map((file) => stem(file.path))
      .sort((a, b) => a.localeCompare(b));

    const bibNames = new Set<string>();
    const graphicNames = new Set<string>();
    for (const file of reachable) {
      for (const bib of file.bibs) bibNames.add(bib.name);
      for (const graphic of file.graphics) graphicNames.add(graphic.name);
    }

    const rootParsed = parsed[pathKey(state.rootFile)];
    const metadata = {
      title: rootParsed?.title,
      author: rootParsed?.author,
      date: rootParsed?.date,
      documentClass: rootParsed?.documentClass,
      packages: rootParsed?.packages.length ?? 0,
      words,
    };

    set({
      parsedFiles: parsed,
      outline,
      labels,
      floats,
      todos,
      words,
      metadata,
      citations: [...citationMap.values()],
      customEnvironments: [...envs].sort((a, b) => a.localeCompare(b)),
      customCommands: [...commands].sort((a, b) => a.localeCompare(b)),
      projectFiles,
      bibFiles: [...bibNames].sort((a, b) => a.localeCompare(b)),
      graphicFiles: [...graphicNames].sort((a, b) => a.localeCompare(b)),
      localPackages,
    });
  },

  setSidebarVisible: (visible: boolean) => set({ sidebarVisible: visible }),
  setSidebarMode: (mode: SidebarMode) => set({ sidebarMode: mode, sidebarVisible: true }),
  setSidebarTab: (tab: "structure" | "subfiles") => set({ sidebarTab: tab }),
  setViewMode: (mode: ViewMode) => set({ viewMode: mode }),
  setSearchTab: (tab: "text" | "tag") => set({ searchTab: tab }),
  focusSearch: (tab: "text" | "tag") =>
    set((state) => ({
      sidebarVisible: true,
      sidebarMode: "search",
      searchTab: tab,
      searchNonce: state.searchNonce + 1,
    })),

  focusIssues: (tab: "issues" | "log") =>
    set({
      sidebarVisible: true,
      sidebarMode: "issues",
      issuesTab: tab,
    }),

  requestForwardSync: () =>
    set((state) => ({ syncNonce: state.syncNonce + 1 })),

  insertIntoEditor: (text: string) =>
    set({ insertRequest: { text, nonce: Date.now() } }),

  clearInsertRequest: () => set({ insertRequest: null }),

  setCursor: (line: number, column: number) => set({ cursor: { line, column } }),

  checkExternalChanges: async () => {
    const state = get();
    if (!state.rootFile) return;
    for (const file of state.files) {
      const key = pathKey(file.path);
      if (savingPaths.has(key)) continue;
      let info;
      try {
        info = await api.pathInfo(file.path);
      } catch {
        continue;
      }
      if (!info.exists) continue;
      const modified = info.modifiedMs ?? 0;
      const previous = state.diskMtimes[key];
      if (previous === undefined) {
        set((current) => ({
          diskMtimes: { ...current.diskMtimes, [key]: modified },
        }));
        continue;
      }
      if (modified <= previous) continue;
      if (file.dirty) {
        if (!state.externalChanged[key]) {
          set((current) => ({
            externalChanged: { ...current.externalChanged, [key]: true },
          }));
          get().notify(
            t("{name} changed on disk; your unsaved version is open.", { name: file.name }),
            "info",
          );
        }
        continue;
      }
      try {
        const content = await api.readTextFile(file.path, get().settings.encoding);
        set((current) => ({
          files: current.files.map((item) =>
            samePath(item.path, file.path)
              ? { ...item, content, dirty: false }
              : item,
          ),
          fileCache: {
            ...current.fileCache,
            [key]: { path: file.path, content },
          },
          savedContents: { ...current.savedContents, [key]: content },
          diskMtimes: { ...current.diskMtimes, [key]: modified },
          externalChanged: { ...current.externalChanged, [key]: false },
        }));
        get().notify(t("Reloaded {name} after an external change.", { name: file.name }), "success");
        get().refreshAnalysis();
      } catch {
        // Keep the editor content if the file cannot be read.
      }
    }
  },

  reloadWithEncoding: async (encoding: FileEncoding) => {
    get().setSettings({ encoding });
    const files = [...get().files];
    for (const file of files) {
      try {
        const content = await api.readTextFile(file.path, encoding);
        const key = pathKey(file.path);
        set((state) => ({
          files: state.files.map((item) =>
            samePath(item.path, file.path)
              ? { ...item, content, dirty: false }
              : item,
          ),
          fileCache: {
            ...state.fileCache,
            [key]: { path: file.path, content },
          },
          savedContents: { ...state.savedContents, [key]: content },
          externalChanged: { ...state.externalChanged, [key]: false },
        }));
      } catch (error) {
        get().notify(String(error), "error");
      }
    }
    get().refreshAnalysis();
    get().notify(t("Reloaded files as {encoding}.", { encoding }), "success");
  },

  reloadUserConfig: async () => {
    try {
      const config = await api.loadUserConfig();
      set({
        userAutocomplete: config.autocomplete,
        userSnippets: config.snippets,
      });
    } catch {
      // User configuration is optional.
    }
  },

  openUserConfigFolder: async () => {
    try {
      const dir = await api.userConfigDir();
      await revealPath(dir);
    } catch (error) {
      get().notify(String(error), "error");
    }
  },

  openEditorArchive: async () => {
    try {
      const dir = await api.editorArchiveDir();
      await revealPath(dir);
    } catch (error) {
      get().notify(String(error), "error");
    }
  },

  refreshEngineStatus: async () => {
    try {
      const status = await api.texEngineStatus();
      set({ engineStatus: status });
      return status;
    } catch (error) {
      console.error("Could not check installed TeX engines", error);
      return null;
    }
  },

  installTectonic: async () => {
    const status = await api.installTectonic();
    set({ engineStatus: status, texSetupOpen: false });
    if (status.tectonic) {
      get().setSettings({ engine: "tectonic" });
      get().notify(
        t("Tectonic installed. The first typeset run will download the packages it needs."),
        "success",
      );
    }
    return status;
  },

  setTexSetupOpen: (open: boolean) => set({ texSetupOpen: open }),

  setSettings: (partial: Partial<Settings>) => {
    const settings = { ...get().settings, ...partial };
    persistSettings(settings);
    set({
      settings,
      ...(partial.engine !== undefined ? { projectEngine: null } : {}),
    });
  },

  setShowSettings: (show: boolean) => set({ showSettings: show }),
  setShowTemplates: (show: boolean) => set({ showTemplates: show }),

  jumpTo: async (path: string, line: number) => {
    const normalized = normalizePath(path);
    if (!get().activePath || !samePath(get().activePath!, normalized)) {
      await get().openFile(normalized);
    }
    set((state) => {
      const history = state.navHistory.slice(0, state.navIndex + 1);
      const last = history[history.length - 1];
      if (!last || !samePath(last.path, normalized) || last.line !== line) {
        history.push({ path: normalized, line });
      }
      const trimmed = history.slice(-60);
      return {
        navHistory: trimmed,
        navIndex: trimmed.length - 1,
        jump: { path: normalized, line, nonce: Date.now() },
      };
    });
  },

  goBack: async () => {
    const { navHistory, navIndex } = get();
    if (navIndex <= 0) return;
    const target = navHistory[navIndex - 1];
    set({ navIndex: navIndex - 1 });
    if (!get().activePath || !samePath(get().activePath!, target.path)) {
      await get().openFile(target.path);
    }
    set({ jump: { ...target, nonce: Date.now() } });
  },

  goForward: async () => {
    const { navHistory, navIndex } = get();
    if (navIndex < 0 || navIndex >= navHistory.length - 1) return;
    const target = navHistory[navIndex + 1];
    set({ navIndex: navIndex + 1 });
    if (!get().activePath || !samePath(get().activePath!, target.path)) {
      await get().openFile(target.path);
    }
    set({ jump: { ...target, nonce: Date.now() } });
  },

  clearJump: () => set({ jump: null }),

  removeRecent: (path: string) => {
    const recent = get().recent.filter((item) => !samePath(item.path, path));
    persistRecent(recent);
    set({ recent });
  },
}));

export function outlineCount(outline: OutlineNode[]): number {
  return countOutline(outline);
}

// Dev builds expose the store so the UI can be driven from DevTools.
if (import.meta.env.DEV) {
  (window as unknown as { __texpadStore: typeof useAppStore }).__texpadStore = useAppStore;
}
