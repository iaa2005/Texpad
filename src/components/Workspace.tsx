import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  ArrowLeftRight,
  Bold,
  Braces,
  ChevronDown,
  Heading,
  Ellipsis,
  IndentDecrease,
  IndentIncrease,
  Italic,
  LineSquiggle,
  List,
  ListOrdered,
  MessageSquareText,
  Redo2,
  SquareFunction,
  Table,
  Underline,
  Undo2,
  WrapText,
  type LucideIcon,
} from "lucide-react";
import SfIcon from "./SfIcon";
import Editor, { type EditorActions } from "./Editor";
import PdfViewer from "./PdfViewer";
import SymbolTable from "./SymbolTable";
import { useWidthClasses } from "../lib/useWidthClasses";
import { useAppStore } from "../store/useAppStore";
import { basename, isAbsolutePath, joinPath, samePath } from "../lib/path";
import { synctexEdit, synctexView } from "../lib/tauri";
import { pinnedSymbols, rememberSymbol } from "../lib/symbols";
import { t } from "../i18n";

const FORMAT_ICON = { size: 17, strokeWidth: 1.6 } as const;

const FORMAT_BUTTONS: Array<{ title: string; Icon: LucideIcon; code: string; group: "text" | "lists" }> = [
  { title: "Bold (\\textbf)", Icon: Bold, code: "\\textbf{|}", group: "text" },
  { title: "Italic (\\textit)", Icon: Italic, code: "\\textit{|}", group: "text" },
  { title: "Underline (\\underline)", Icon: Underline, code: "\\underline{|}", group: "text" },
  {
    title: "Bulleted list",
    group: "lists",
    Icon: List,
    code: "\\begin{itemize}\n\t\\item |\n\\end{itemize}",
  },
  {
    title: "Numbered list",
    group: "lists",
    Icon: ListOrdered,
    code: "\\begin{enumerate}\n\t\\item |\n\\end{enumerate}",
  },
  {
    title: "Table",
    group: "lists",
    Icon: Table,
    code: "\\begin{table}[htbp]\n\t\\centering\n\t\\begin{tabular}{ll}\n\t\t\\hline\n\t\t| & \\\\\n\t\t\\hline\n\t\\end{tabular}\n\t\\caption{}\n\\end{table}",
  },
];

const HEADINGS: Array<[string, string]> = [
  ["Part", "part"],
  ["Chapter", "chapter"],
  ["Section", "section"],
  ["Subsection", "subsection"],
  ["Subsubsection", "subsubsection"],
  ["Paragraph", "paragraph"],
];

const SNIPPETS: Array<{ label: string; description: string; code: string }> = [
  {
    label: "Section",
    description: "\\section{…}",
    code: "\\section{|}",
  },
  {
    label: "Itemize",
    description: "Bulleted list",
    code: "\\begin{itemize}\n\t\\item |\n\\end{itemize}",
  },
  {
    label: "Equation",
    description: "Numbered equation",
    code: "\\begin{equation}\n\t|\n\\end{equation}",
  },
  {
    label: "Aligned equations",
    description: "\\begin{align} … \\end{align}",
    code: "\\begin{align}\n\t| &= \\\\\n\t &= \n\\end{align}",
  },
  {
    label: "Figure",
    description: "Centred figure with caption",
    code: "\\begin{figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\textwidth]{|}\n\t\\caption{}\n\t\\label{fig:}\n\\end{figure}",
  },
  {
    label: "Table",
    description: "Two-column table",
    code: "\\begin{table}[htbp]\n\t\\centering\n\t\\begin{tabular}{ll}\n\t\t| & \\\\\n\t\t & \n\t\\end{tabular}\n\t\\caption{}\n\t\\label{tab:}\n\\end{table}",
  },
  {
    label: "Matrix",
    description: "pmatrix environment",
    code: "\\begin{pmatrix}\n\t| & \\\\\n\t & \n\\end{pmatrix}",
  },
  {
    label: "Fraction",
    description: "\\frac{…}{…}",
    code: "\\frac{|}{}",
  },
  {
    label: "Footnote",
    description: "\\footnote{…}",
    code: "\\footnote{|}",
  },
];

/** √x: Lucide's "radical" stroke with an x under the bar. */
function RadicalIcon() {
  return (
    <svg
      className="radical-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12h3.28a1 1 0 0 1 .948.684l2.298 7.934a.5.5 0 0 0 .96-.044L13.32 4.771A1 1 0 0 1 14.292 4H22" />
      <path d="M15 9.5l5 6M20 9.5l-5 6" />
    </svg>
  );
}

export default function Workspace({ dark }: { dark: boolean }) {
  const rootFile = useAppStore((state) => state.rootFile);
  const rootDir = useAppStore((state) => state.rootDir);
  const activePath = useAppStore((state) => state.activePath);
  const files = useAppStore((state) => state.files);
  const settings = useAppStore((state) => state.settings);
  const issues = useAppStore((state) => state.issues);
  const jump = useAppStore((state) => state.jump);
  const build = useAppStore((state) => state.build);
  const viewMode = useAppStore((state) => state.viewMode);
  const labels = useAppStore((state) => state.labels);
  const citations = useAppStore((state) => state.citations);
  const customEnvironments = useAppStore((state) => state.customEnvironments);
  const customCommands = useAppStore((state) => state.customCommands);
  const bibFiles = useAppStore((state) => state.bibFiles);
  const graphicFiles = useAppStore((state) => state.graphicFiles);
  const localPackages = useAppStore((state) => state.localPackages);
  const userAutocomplete = useAppStore((state) => state.userAutocomplete);
  const syncNonce = useAppStore((state) => state.syncNonce);
  const insertRequest = useAppStore((state) => state.insertRequest);
  const clearInsertRequest = useAppStore((state) => state.clearInsertRequest);
  const userSnippets = useAppStore((state) => state.userSnippets);

  const updateContent = useAppStore((state) => state.updateContent);
  const saveFile = useAppStore((state) => state.saveFile);
  const runTypeset = useAppStore((state) => state.runTypeset);
  const setSettings = useAppStore((state) => state.setSettings);
  const setViewMode = useAppStore((state) => state.setViewMode);
  const jumpTo = useAppStore((state) => state.jumpTo);
  const clearJump = useAppStore((state) => state.clearJump);
  const notify = useAppStore((state) => state.notify);

  const cursor = useAppStore((state) => state.cursor);
  const setCursor = useAppStore((state) => state.setCursor);
  const [symbolMode, setSymbolMode] = useState<"table" | "draw" | null>(null);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [headingOpen, setHeadingOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const editorActionsRef = useRef<EditorActions | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  // Narrow panes fold the bar: labels first, then lists, then B/I/U.
  const formatBarWidth = useWidthClasses(toolbarRef, [
    [620, "is-compact"],
    [500, "is-narrow"],
    [400, "is-tiny"],
    [300, "is-mini"],
    [220, "is-micro"],
  ]);
  const symbolRef = useRef<HTMLDivElement | null>(null);

  // The editor pane clips overflow, so the symbol panel is positioned
  // against the window, under its buttons and kept on screen.
  const symbolPopoverStyle = (): CSSProperties => {
    const rect = symbolRef.current?.getBoundingClientRect();
    if (!rect) return {};
    const width = 480;
    return {
      position: "fixed",
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      right: "auto",
      height: Math.min(760, window.innerHeight - rect.bottom - 20),
    };
  };
  const scrollSyncRef = useRef(false);
  const forwardSyncTimerRef = useRef<number | undefined>(undefined);
  const [syncTarget, setSyncTarget] = useState<{
    page: number;
    x: number;
    y: number;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    if (!symbolMode && !snippetOpen && !headingOpen && !moreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!toolbarRef.current?.contains(target) && !symbolRef.current?.contains(target)) {
        setSymbolMode(null);
        setSnippetOpen(false);
        setHeadingOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [symbolMode, snippetOpen, headingOpen, moreOpen]);

  // Alt+1…Alt+9 insert the pinned symbols (latexted's quick symbols).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (!digit) return;
      const command = pinnedSymbols()[Number(digit[1]) - 1];
      if (!command || !editorActionsRef.current) return;
      event.preventDefault();
      rememberSymbol(command);
      editorActionsRef.current.insertText(command);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setSyncTarget(null);
  }, [build.pdfVersion]);

  const activeFile = files.find(
    (file) => activePath && samePath(file.path, activePath),
  );

  const completionData = useMemo(
    () => ({
      labels,
      citations,
      customEnvironments,
      customCommands,
      userAutocomplete,
      bibFiles,
      graphicFiles,
      localPackages,
    }),
    [
      labels,
      citations,
      customEnvironments,
      customCommands,
      userAutocomplete,
      bibFiles,
      graphicFiles,
      localPackages,
    ],
  );

  const handleForwardSync = async (line: number, column: number) => {
    if (!activePath) return;
    if (!build.pdfPath) {
      notify(t("Typeset the document, then try syncing again."), "info");
      return;
    }
    if (scrollSyncRef.current) return;
    scrollSyncRef.current = true;
    try {
      const hit = await synctexView(build.pdfPath, activePath, line, column);
      if (hit.page != null && hit.x != null && hit.y != null) {
        setSyncTarget({ page: hit.page, x: hit.x, y: hit.y, nonce: Date.now() });
        if (viewMode === "editor") setViewMode("split");
      } else {
        notify(t("SyncTeX found no matching position in the PDF."), "info");
      }
    } catch (error) {
      notify(String(error), "error");
    } finally {
      window.setTimeout(() => {
        scrollSyncRef.current = false;
      }, 650);
    }
  };

  const handleInverseSync = async (page: number, x: number, y: number) => {
    if (!build.pdfPath || !rootDir) return;
    if (scrollSyncRef.current) return;
    scrollSyncRef.current = true;
    try {
      const hit = await synctexEdit(build.pdfPath, page, x, y);
      if (hit.file && hit.line) {
        const file = isAbsolutePath(hit.file)
          ? hit.file
          : joinPath(rootDir, hit.file);
        await jumpTo(file, hit.line);
        if (viewMode === "pdf") setViewMode("split");
      }
    } catch (error) {
      notify(String(error), "error");
    } finally {
      window.setTimeout(() => {
        scrollSyncRef.current = false;
      }, 650);
    }
  };

  useEffect(() => {
    if (syncNonce === 0) return;
    void handleForwardSync(cursor.line, cursor.column);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncNonce]);

  useEffect(() => {
    if (!insertRequest) return;
    editorActionsRef.current?.insertRaw(insertRequest.text);
    clearInsertRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequest?.nonce]);

  useEffect(() => {
    const onEditorCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      const actions = editorActionsRef.current;
      if (!actions) return;
      if (command === "comment") actions.toggleComment();
      else if (command === "indent") actions.indent();
      else if (command === "outdent") actions.outdent();
      else if (command === "autocomplete") actions.autocomplete();
      else if (command === "sync") void handleForwardSync(cursor.line, cursor.column);
    };
    window.addEventListener("texpad:editor-command", onEditorCommand);
    return () =>
      window.removeEventListener("texpad:editor-command", onEditorCommand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settings.scrollLock || !build.pdfPath || !activePath) return;
    if (forwardSyncTimerRef.current) {
      window.clearTimeout(forwardSyncTimerRef.current);
    }
    forwardSyncTimerRef.current = window.setTimeout(() => {
      void handleForwardSync(cursor.line, cursor.column);
    }, 350);
    return () => {
      if (forwardSyncTimerRef.current) {
        window.clearTimeout(forwardSyncTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.line, cursor.column, settings.scrollLock, build.pdfPath, activePath]);

  const rootName = rootFile ? basename(rootFile) : "";
  const breadcrumb =
    activeFile && rootFile && !samePath(activeFile.path, rootFile)
      ? activeFile.name
      : null;

  const editorPane = (
    <div className="editor-pane">
      <div className="pane-header editor-header">
        <div className="breadcrumbs">
          <span className="breadcrumb-root-icon">
            <SfIcon name="circle" size={12} />
          </span>
          <span className={`breadcrumb-root${breadcrumb ? "" : " is-current"}`}>
            {rootName}
          </span>
          {breadcrumb && (
            <>
              <SfIcon name="chevron.right" size={11} className="breadcrumb-separator" />
              <SfIcon name="document" size={12} className="breadcrumb-file-icon" />
              <span className="breadcrumb-current">{breadcrumb}</span>
            </>
          )}
        </div>
      </div>
      {/* latexted-style formatting bar: one flat, always visible row */}
      <div className={`format-bar ${formatBarWidth}`} ref={toolbarRef}>
        <button className="format-button fmt-history" title={t("Undo (Ctrl+Z)")} onClick={() => editorActionsRef.current?.undo()}>
          <Undo2 {...FORMAT_ICON} />
        </button>
        <button className="format-button fmt-history" title={t("Redo (Ctrl+Y)")} onClick={() => editorActionsRef.current?.redo()}>
          <Redo2 {...FORMAT_ICON} />
        </button>
        <span className="format-divider fmt-text fmt-history" />
        {FORMAT_BUTTONS.map(({ title, Icon, code, group }) => (
          <button
            key={title}
            className={`format-button fmt-${group}`}
            title={t(title)}
            onClick={() => editorActionsRef.current?.insertText(code)}
          >
            <Icon {...FORMAT_ICON} />
          </button>
        ))}
        <span className="format-divider fmt-headings" />
        <div className="editor-tool-wrap fmt-headings">
          <button
            className={`format-button format-text-button${headingOpen ? " is-active" : ""}`}
            title={t("Insert a heading")}
            onClick={() => {
              setHeadingOpen((open) => !open);
              setSnippetOpen(false);
              setSymbolMode(null);
            }}
          >
            <Heading className="fmt-icon-compact" {...FORMAT_ICON} />
            <span className="fmt-label">{t("Headings")}</span>
            <ChevronDown size={14} strokeWidth={1.8} />
          </button>
          {headingOpen && (
            <div className="editor-popover headings-popover">
              {HEADINGS.map(([label, command], index) => (
                <button
                  key={command}
                  className="heading-row"
                  style={{ fontSize: 15 - index * 0.8, fontWeight: index < 3 ? 600 : 500 }}
                  onClick={() => {
                    editorActionsRef.current?.insertText(`\\${command}{|}`);
                    setHeadingOpen(false);
                  }}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="format-divider fmt-headings" />
        <div className="editor-tool-wrap" ref={symbolRef}>
          <button
            className={`format-button${symbolMode === "table" ? " is-active" : ""}`}
            title={t("Symbol table")}
            onClick={() => {
              setSymbolMode((mode) => (mode === "table" ? null : "table"));
              setSnippetOpen(false);
              setHeadingOpen(false);
            }}
          >
            <RadicalIcon />
          </button>
          <button
            className={`format-button format-draw-button${symbolMode === "draw" ? " is-active" : ""}`}
            title={t("Find a symbol by drawing it")}
            onClick={() => {
              setSymbolMode((mode) => (mode === "draw" ? null : "draw"));
              setSnippetOpen(false);
              setHeadingOpen(false);
            }}
          >
            <LineSquiggle {...FORMAT_ICON} />
            <span className="fmt-label">{t("Draw")}</span>
          </button>
          {symbolMode && (
            <SymbolTable
              key={symbolMode}
              style={symbolPopoverStyle()}
              initialDraw={symbolMode === "draw"}
              onInsert={(command) => {
                editorActionsRef.current?.insertText(command);
                setSymbolMode(null);
              }}
            />
          )}
        </div>
        <div className="format-bar-spacer" />
        <div className="editor-tool-wrap">
          <button
            className={`format-button${snippetOpen ? " is-active" : ""}`}
            title={t("Snippets")}
            onClick={() => {
              setSnippetOpen((open) => !open);
              setSymbolMode(null);
              setHeadingOpen(false);
              setMoreOpen(false);
            }}
          >
            <Braces {...FORMAT_ICON} />
          </button>
          {snippetOpen && (
            <div className="editor-popover snippets-popover">
              <div className="popover-title">{t("Snippets")}</div>
              {SNIPPETS.map((snippet) => (
                <button
                  key={snippet.label}
                  className="snippet-row"
                  onClick={() => {
                    editorActionsRef.current?.insertText(snippet.code);
                    setSnippetOpen(false);
                  }}
                >
                  <span className="snippet-label">{t(snippet.label)}</span>
                  <span className="snippet-description">{t(snippet.description)}</span>
                </button>
              ))}
              {userSnippets.map((snippet) => (
                <button
                  key={`user:${snippet.name}`}
                  className="snippet-row"
                  onClick={() => {
                    editorActionsRef.current?.insertRaw(snippet.content);
                    setSnippetOpen(false);
                  }}
                >
                  <span className="snippet-label">{snippet.name}</span>
                  <span className="snippet-description">{t("User snippet")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="editor-tool-wrap">
          <button
            className={`format-button${moreOpen ? " is-active" : ""}`}
            title={t("More editing tools")}
            onClick={() => {
              setMoreOpen((open) => !open);
              setSnippetOpen(false);
              setHeadingOpen(false);
              setSymbolMode(null);
            }}
          >
            <Ellipsis {...FORMAT_ICON} />
          </button>
          {moreOpen && (
            <div className="menu-popover format-more-popover">
              {[
                { label: "Undo", shortcut: "Ctrl+Z", Icon: Undo2, run: () => editorActionsRef.current?.undo() },
                { label: "Redo", shortcut: "Ctrl+Y", Icon: Redo2, run: () => editorActionsRef.current?.redo() },
              ].map(({ label, shortcut, Icon, run }) => (
                <button
                  key={label}
                  className="menu-item more-history"
                  onClick={() => {
                    setMoreOpen(false);
                    run();
                  }}
                >
                  <span className="menu-item-icon">
                    <Icon size={15} strokeWidth={1.7} />
                  </span>
                  <span className="menu-item-label">{t(label)}</span>
                  <span className="menu-item-shortcut">{shortcut}</span>
                </button>
              ))}
              {HEADINGS.map(([label, command]) => (
                <button
                  key={command}
                  className="menu-item more-headings"
                  onClick={() => {
                    setMoreOpen(false);
                    editorActionsRef.current?.insertText(`\\${command}{|}`);
                  }}
                >
                  <span className="menu-item-icon">
                    <Heading size={15} strokeWidth={1.7} />
                  </span>
                  <span className="menu-item-label">{t(label)}</span>
                </button>
              ))}
              {FORMAT_BUTTONS.map(({ title, Icon, code, group }) => (
                <button
                  key={title}
                  className={`menu-item more-${group}`}
                  onClick={() => {
                    setMoreOpen(false);
                    editorActionsRef.current?.insertText(code);
                  }}
                >
                  <span className="menu-item-icon">
                    <Icon size={15} strokeWidth={1.7} />
                  </span>
                  <span className="menu-item-label">{t(title)}</span>
                </button>
              ))}
              <div className="menu-separator more-lists" />
              {[
                { label: "Comment / Uncomment", shortcut: "Ctrl+/", Icon: MessageSquareText, run: () => editorActionsRef.current?.toggleComment() },
                { label: "Indent", shortcut: "Ctrl+]", Icon: IndentIncrease, run: () => editorActionsRef.current?.indent() },
                { label: "Unindent", shortcut: "Ctrl+[", Icon: IndentDecrease, run: () => editorActionsRef.current?.outdent() },
                { label: "Wrap in $…$", shortcut: "", Icon: SquareFunction, run: () => editorActionsRef.current?.wrapMath() },
                { label: "Sync with PDF", shortcut: "Ctrl+D", Icon: ArrowLeftRight, run: () => void handleForwardSync(cursor.line, cursor.column) },
                {
                  label: settings.wordWrap ? "Turn Word Wrap Off" : "Turn Word Wrap On",
                  shortcut: "",
                  Icon: WrapText,
                  run: () => setSettings({ wordWrap: !settings.wordWrap }),
                },
              ].map(({ label, shortcut, Icon, run }) => (
                <button
                  key={label}
                  className="menu-item"
                  onClick={() => {
                    setMoreOpen(false);
                    run();
                  }}
                >
                  <span className="menu-item-icon">
                    <Icon size={15} strokeWidth={1.7} />
                  </span>
                  <span className="menu-item-label">{t(label)}</span>
                  {shortcut && <span className="menu-item-shortcut">{shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {activeFile ? (
        <Editor
          path={activeFile.path}
          content={activeFile.content}
          rootDir={rootDir ?? ""}
          dark={dark}
          settings={settings}
          completionData={completionData}
          issues={issues}
          jump={jump}
          onChange={updateContent}
          onSave={() => void saveFile(activeFile.path)}
          onTypeset={() => void runTypeset(true)}
          onCursorChange={(line, column) => setCursor(line, column)}
          onForwardSync={(line, column) => void handleForwardSync(line, column)}
          onClearJump={clearJump}
          actionsRef={editorActionsRef}
        />
      ) : (
        <div className="editor-empty">
          <SfIcon name="questionmark.circle" size={28} />
          <span>{t("No file is open")}</span>
          <button className="primary-button" onClick={() => void useAppStore.getState().openFileDialog()}>
            {t("Open a file")}
          </button>
        </div>
      )}
    </div>
  );

  const pdfPane = (
    <div className="pdf-pane">
      <PdfViewer
        pdfPath={build.pdfPath}
        pdfVersion={build.pdfVersion}
        dark={settings.pdfDarkMode}
        grading={settings.pdfGrading}
        onToggleDark={() => setSettings({ pdfDarkMode: !settings.pdfDarkMode })}
        onTypeset={() => void runTypeset(true)}
        onInverseSync={(page, x, y) => void handleInverseSync(page, x, y)}
        onScrollSync={(page, x, y) => void handleInverseSync(page, x, y)}
        scrollLock={settings.scrollLock}
        onToggleScrollLock={() =>
          setSettings({ scrollLock: !settings.scrollLock })
        }
        syncTarget={syncTarget}
      />
    </div>
  );

  return (
    <div className="workspace">
      <div className="workspace-content">
        {viewMode === "editor" && editorPane}
        {viewMode === "pdf" && pdfPane}
        {viewMode === "split" && (
          <PanelGroup
            direction="horizontal"
            autoSaveId="texpad-split-layout"
            className="split-group"
          >
            <Panel defaultSize={52} minSize={26} className="split-panel">
              {editorPane}
            </Panel>
            <PanelResizeHandle className="split-handle" />
            <Panel defaultSize={48} minSize={22} className="split-panel">
              {pdfPane}
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  );
}
