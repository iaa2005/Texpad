import { useEffect, useRef, type MutableRefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Compartment,
  EditorState,
  type ChangeSpec,
  type Extension,
  type Line,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  hoverTooltip,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  indentWithTab,
  redo,
  undo,
} from "@codemirror/commands";
import {
  highlightSelectionMatches,
  searchKeymap,
} from "@codemirror/search";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  bracketMatching,
  indentOnInput,
  StreamLanguage,
} from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { setDiagnostics } from "@codemirror/lint";
import { editorTheme } from "../editor/theme";
import {
  makeLatexCompletionSource,
  type CompletionData,
} from "../lib/completions";
import { extname, isAbsolutePath, joinPath, pathKey, relativePath, samePath } from "../lib/path";
import { readBinaryFile } from "../lib/tauri";
import type { Issue, Settings } from "../types";
import { t } from "../i18n";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".pdf",
  ".eps",
  ".svg",
  ".gif",
  ".webp",
]);

const latexLanguage = StreamLanguage.define(stex);

const themeCompartment = new Compartment();
const fontCompartment = new Compartment();
const wrapCompartment = new Compartment();
const gutterCompartment = new Compartment();

const SECTION_COMMANDS = new Set([
  "part",
  "chapter",
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
]);

const REF_COMMANDS = new Set([
  "label",
  "ref",
  "eqref",
  "pageref",
  "autoref",
  "cref",
  "Cref",
  "vref",
  "nameref",
  "cite",
  "citep",
  "citet",
  "parencite",
  "textcite",
  "autocite",
  "footcite",
  "bibitem",
]);

function latexReferenceFor(path: string, rootDir: string): string | null {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  const relative = relativePath(rootDir, path).replace(/\\/g, "/");
  if (IMAGE_EXTENSIONS.has(ext)) return `\\includegraphics{${relative}}`;
  if (ext === ".tex" || ext === ".ltx") return `\\input{${relative}}`;
  if (ext === ".bib") return `\\bibliography{${relative.replace(/\.bib$/i, "")}}`;
  return null;
}

function insertDroppedFiles(
  view: EditorView,
  rootDir: string,
  paths: string[],
  position?: { x: number; y: number },
) {
  if (position) {
    const rect = view.dom.getBoundingClientRect();
    if (
      position.x < rect.left ||
      position.x > rect.right ||
      position.y < rect.top ||
      position.y > rect.bottom
    ) {
      return;
    }
  }
  const references = paths
    .map((path) => latexReferenceFor(path, rootDir))
    .filter((value): value is string => Boolean(value));
  if (!references.length) return;

  let insertPos = view.state.selection.main.head;
  if (position) {
    const pos = view.posAtCoords({ x: position.x, y: position.y });
    if (pos != null) insertPos = pos;
  }
  const insert = references.join("\n");
  view.dispatch({
    changes: { from: insertPos, insert },
    selection: { anchor: insertPos + insert.length },
  });
  view.focus();
}

function insertTextAtSelection(
  view: EditorView,
  text: string,
  useMarker = true,
) {
  const range = view.state.selection.main;
  // The caret marker is a "|" after "{" or whitespace, so literal bars
  // such as \left| or \| are inserted as typed.
  const marker = useMarker ? text.search(/(?<=[{\s])\|/) : -1;
  const selected = view.state.sliceDoc(range.from, range.to);
  const insert =
    marker >= 0 ? text.slice(0, marker) + selected + text.slice(marker + 1) : text;
  const anchor =
    range.from +
    (marker >= 0 ? marker + selected.length + (selected ? text.length - marker - 1 : 0) : insert.length);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor },
  });
  view.focus();
}

function toggleLineComments(view: EditorView) {
  const { state } = view;
  const range = state.selection.main;
  const firstLine = state.doc.lineAt(range.from);
  const lastLine = state.doc.lineAt(range.to);
  const lines: Line[] = [];
  for (let number = firstLine.number; number <= lastLine.number; number++) {
    lines.push(state.doc.line(number));
  }
  if (!lines.length) return;
  const allCommented = lines.every((line) => /^\s*%/.test(line.text));
  const changes: ChangeSpec[] = [];
  for (const line of lines) {
    if (allCommented) {
      const match = line.text.match(/^(\s*)%[ ]?/);
      if (match) {
        changes.push({
          from: line.from + match[1].length,
          to: line.from + match[0].length,
          insert: "",
        });
      }
    } else {
      const indent = line.text.match(/^\s*/)?.[0].length ?? 0;
      changes.push({ from: line.from + indent, insert: "% " });
    }
  }
  if (changes.length) view.dispatch({ changes });
  view.focus();
}

function wrapSelectionWithMath(view: EditorView) {
  const { state } = view;
  const range = state.selection.main;
  if (range.empty) {
    view.dispatch({
      changes: { from: range.from, insert: "$$" },
      selection: { anchor: range.from + 1 },
    });
  } else {
    view.dispatch({
      changes: [
        { from: range.from, insert: "$" },
        { from: range.to, insert: "$" },
      ],
      selection: { anchor: range.from + 1, head: range.to + 1 },
    });
  }
  view.focus();
}

export interface EditorActions {
  toggleComment: () => void;
  indent: () => void;
  outdent: () => void;
  wrapMath: () => void;
  insertText: (text: string) => void;
  insertRaw: (text: string) => void;
  autocomplete: () => void;
  focus: () => void;
  undo: () => void;
  redo: () => void;
}

function buildCommandDecorations(view: EditorView): DecorationSetLike {
  const decos: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    const re = /\\([a-zA-Z@]+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const name = match[1];
      let className = "";
      if (name === "begin" || name === "end") className = "cm-latex-envcommand";
      else if (SECTION_COMMANDS.has(name)) className = "cm-latex-sectioncommand";
      else if (REF_COMMANDS.has(name)) className = "cm-latex-refcommand";
      if (!className) continue;
      const abs = from + match.index;
      const lineStart = view.state.doc.lineAt(abs).from;
      const prefix = view.state.doc.sliceString(lineStart, abs);
      if (/(^|[^\\])%/.test(prefix)) continue;
      decos.push(Decoration.mark({ class: className }).range(abs, abs + match[0].length));
    }
  }
  return Decoration.set(decos, true);
}

type DecorationSetLike = ReturnType<typeof Decoration.set>;

const latexCommandDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSetLike;
    constructor(view: EditorView) {
      this.decorations = buildCommandDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildCommandDecorations(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations },
);

const HOVER_COMMAND_RE =
  /\\(ref|eqref|autoref|pageref|cref|Cref|vref|nameref|cite|citep|citet|parencite|textcite|autocite|includegraphics)\*?(?:\[[^\]]*\])?\{([^}]*)\}/g;

function latexHoverInfo(
  getData: () => CompletionData,
  getRootDir: () => string,
) {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const prefix = line.text.slice(0, pos - line.from);
    if (/(^|[^\\])%/.test(prefix)) return null;
    const data = getData();
    HOVER_COMMAND_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HOVER_COMMAND_RE.exec(line.text))) {
      const start = line.from + match.index;
      const end = start + match[0].length;
      if (pos < start || pos > end) continue;
      const command = match[1];
      const key = match[2].trim();
      if (!key) return null;
      let title = key;
      let meta = "";
      if (
        ["ref", "eqref", "autoref", "pageref", "cref", "Cref", "vref", "nameref"].includes(
          command,
        )
      ) {
        const label = data.labels.find((item) => item.name === key);
        title = label?.context ?? key;
        meta = label
          ? `${t("Label")} ${key} · ${label.file}:${label.line}`
          : t("Unknown label {key}", { key });
      } else if (command === "includegraphics") {
        title = key;
        meta = t("Image file");
      } else {
        const citation = data.citations.find((item) => item.key === key);
        title = citation?.title ?? key;
        meta = [citation?.author, citation?.year, `${t("Citation")} ${key}`]
          .filter(Boolean)
          .join(" · ");
      }
      return {
        pos: start,
        end,
        above: false,
        create() {
          const dom = document.createElement("div");
          dom.className = "texpad-hover-info";
          const titleElement = document.createElement("div");
          titleElement.className = "hover-info-title";
          titleElement.textContent = title;
          dom.appendChild(titleElement);
          if (meta) {
            const metaElement = document.createElement("div");
            metaElement.className = "hover-info-meta";
            metaElement.textContent = meta;
            dom.appendChild(metaElement);
          }

          let objectUrl: string | null = null;
          let disposed = false;
          if (command === "includegraphics") {
            const image = document.createElement("img");
            image.className = "hover-info-image";
            image.alt = key;
            dom.appendChild(image);
            const candidates = extname(key)
              ? [key]
              : [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].map(
                  (extension) => `${key}${extension}`,
                );
            void (async () => {
              for (const candidate of candidates) {
                const fullPath = isAbsolutePath(candidate)
                  ? candidate
                  : joinPath(getRootDir(), candidate);
                try {
                  const bytes = await readBinaryFile(fullPath);
                  if (disposed) return;
                  const extension = extname(fullPath).toLowerCase();
                  const type =
                    extension === ".png"
                      ? "image/png"
                      : extension === ".jpg" || extension === ".jpeg"
                        ? "image/jpeg"
                        : extension === ".gif"
                          ? "image/gif"
                          : extension === ".webp"
                            ? "image/webp"
                            : extension === ".svg"
                              ? "image/svg+xml"
                              : "application/octet-stream";
                  objectUrl = URL.createObjectURL(new Blob([bytes], { type }));
                  image.src = objectUrl;
                  return;
                } catch {
                  // Try the next candidate extension.
                }
              }
            })();
          }

          return {
            dom,
            destroy() {
              disposed = true;
              if (objectUrl) URL.revokeObjectURL(objectUrl);
            },
          };
        },
      };
    }
    return null;
  });
}

function fontTheme(settings: Settings): Extension {
  return EditorView.theme({
    "&": { fontSize: `${settings.fontSize}px` },
    ".cm-scroller": { fontFamily: settings.editorFont },
  });
}

function latexEnter(view: EditorView, settings: Settings): boolean {
  const { state } = view;
  const selection = state.selection.main;
  if (!selection.empty) return false;
  const line = state.doc.lineAt(selection.head);
  const before = line.text.slice(0, selection.head - line.from);
  const after = line.text.slice(selection.head - line.from);

  if (settings.autoCloseEnvironment) {
    const begin = before.match(/^(\s*)\\begin\{([^}]+)\}\s*$/);
    if (begin && after.trim() === "") {
      const indent = begin[1];
      const env = begin[2];
      const nextLine =
        line.number < state.doc.lines ? state.doc.line(line.number + 1).text : "";
      if (nextLine.trim() === `\\end{${env}}`) {
        const insert = `\n${indent}    `;
        view.dispatch({
          changes: { from: selection.head, insert },
          selection: { anchor: selection.head + insert.length },
        });
      } else {
        const insert = `\n${indent}    \n${indent}\\end{${env}}`;
        view.dispatch({
          changes: { from: selection.head, insert },
          selection: { anchor: selection.head + 1 + indent.length + 4 },
        });
      }
      return true;
    }
  }

  if (settings.autoItemize) {
    const item = before.match(/^(\s*)\\item\s+.*$/);
    if (item && after.trim() === "") {
      const insert = `\n${item[1]}\\item `;
      view.dispatch({
        changes: { from: selection.head, insert },
        selection: { anchor: selection.head + insert.length },
      });
      return true;
    }
  }

  return false;
}

function applyDiagnostics(view: EditorView, path: string, issues: Issue[]) {
  const diagnostics = issues
    .filter((issue) => samePath(issue.file, path) && issue.line > 0)
    .map((issue) => {
      const lineNumber = Math.min(Math.max(1, issue.line), view.state.doc.lines);
      const line = view.state.doc.line(lineNumber);
      const to = Math.min(view.state.doc.length, Math.max(line.from + 1, line.to));
      return {
        from: line.from,
        to,
        severity:
          issue.severity === "error"
            ? "error"
            : issue.severity === "warning"
              ? "warning"
              : "info",
        message: issue.message,
        source: "LaTeX",
      } as const;
    });
  view.dispatch(setDiagnostics(view.state, diagnostics));
}

export interface EditorProps {
  path: string;
  content: string;
  rootDir: string;
  dark: boolean;
  settings: Settings;
  completionData: CompletionData;
  issues: Issue[];
  jump: { path: string; line: number; nonce: number } | null;
  onChange: (path: string, content: string) => void;
  onSave: () => void;
  onTypeset: () => void;
  onCursorChange: (line: number, column: number) => void;
  onForwardSync: (line: number, column: number) => void;
  onClearJump: () => void;
  actionsRef?: MutableRefObject<EditorActions | null>;
}

export default function Editor({
  path,
  content,
  rootDir,
  dark,
  settings,
  completionData,
  issues,
  jump,
  onChange,
  onSave,
  onTypeset,
  onCursorChange,
  onForwardSync,
  onClearJump,
  actionsRef,
}: EditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef<Map<string, EditorState>>(new Map());
  const currentPathRef = useRef<string>(path);
  const suppressRef = useRef(false);
  const contentRef = useRef(content);
  const rootDirRef = useRef(rootDir);
  const settingsRef = useRef(settings);
  const completionRef = useRef(completionData);
  const issuesRef = useRef(issues);
  const callbacksRef = useRef({
    onChange,
    onSave,
    onTypeset,
    onCursorChange,
    onForwardSync,
  });

  contentRef.current = content;
  rootDirRef.current = rootDir;
  settingsRef.current = settings;
  completionRef.current = completionData;
  issuesRef.current = issues;
  callbacksRef.current = {
    onChange,
    onSave,
    onTypeset,
    onCursorChange,
    onForwardSync,
  };

  const buildExtensions = (): Extension[] => [
    gutterCompartment.of(
      settingsRef.current.showLineNumbers
        ? [lineNumbers(), highlightActiveLineGutter()]
        : [],
    ),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    latexLanguage,
    latexCommandDecorations,
    latexHoverInfo(
      () => completionRef.current,
      () => rootDirRef.current,
    ),
    themeCompartment.of([
      editorTheme(dark).theme,
      editorTheme(dark).highlight,
    ]),
    fontCompartment.of(fontTheme(settingsRef.current)),
    wrapCompartment.of(
      settingsRef.current.wordWrap ? EditorView.lineWrapping : [],
    ),
    autocompletion({
      override: [
        makeLatexCompletionSource(() => completionRef.current),
      ],
      activateOnTyping: true,
      maxRenderedOptions: 40,
      closeOnBlur: true,
      icons: true,
    }),
    keymap.of([
      ...completionKeymap,
      ...closeBracketsKeymap,
      { key: "Mod-s", preventDefault: true, run: () => (callbacksRef.current.onSave(), true) },
      {
        key: "Mod-Enter",
        preventDefault: true,
        run: () => (callbacksRef.current.onTypeset(), true),
      },
      {
        key: "Enter",
        run: (view) => latexEnter(view, settingsRef.current),
      },
      {
        key: "Mod-/",
        preventDefault: true,
        run: (view) => {
          toggleLineComments(view);
          return true;
        },
      },
      {
        key: "Mod-]",
        preventDefault: true,
        run: (view) => {
          indentMore(view);
          return true;
        },
      },
      {
        key: "Mod-[",
        preventDefault: true,
        run: (view) => {
          indentLess(view);
          return true;
        },
      },
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !suppressRef.current) {
        callbacksRef.current.onChange(
          currentPathRef.current,
          update.state.doc.toString(),
        );
      }
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        callbacksRef.current.onCursorChange(line.number, pos - line.from + 1);
      }
    }),
    EditorView.contentAttributes.of({
      spellcheck: "false",
      autocapitalize: "off",
      autocomplete: "off",
    }),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        const line = view.state.doc.lineAt(pos);
        event.preventDefault();
        callbacksRef.current.onForwardSync(line.number, pos - line.from + 1);
        return true;
      },
      dragover(event) {
        if (event.dataTransfer?.types.includes("application/x-texpad-file")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          return true;
        }
        return false;
      },
      drop(event, view) {
        const path = event.dataTransfer?.getData("application/x-texpad-file");
        if (!path) return false;
        event.preventDefault();
        insertDroppedFiles(view, rootDirRef.current, [path], {
          x: event.clientX,
          y: event.clientY,
        });
        return true;
      },
    }),
  ];

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const state = EditorState.create({
      doc: contentRef.current,
      extensions: buildExtensions(),
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    currentPathRef.current = path;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is created once; all dynamic settings are handled by compartments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const view = viewRef.current;
        if (!view) return;
        const scale = window.devicePixelRatio || 1;
        insertDroppedFiles(view, rootDirRef.current, event.payload.paths, {
          x: event.payload.position.x / scale,
          y: event.payload.position.y / scale,
        });
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      toggleComment: () => {
        const view = viewRef.current;
        if (view) toggleLineComments(view);
      },
      indent: () => {
        const view = viewRef.current;
        if (view) {
          indentMore(view);
          view.focus();
        }
      },
      outdent: () => {
        const view = viewRef.current;
        if (view) {
          indentLess(view);
          view.focus();
        }
      },
      wrapMath: () => {
        const view = viewRef.current;
        if (view) wrapSelectionWithMath(view);
      },
      insertText: (text: string) => {
        const view = viewRef.current;
        if (view) insertTextAtSelection(view, text);
      },
      insertRaw: (text: string) => {
        const view = viewRef.current;
        if (view) insertTextAtSelection(view, text, false);
      },
      autocomplete: () => {
        const view = viewRef.current;
        if (view) {
          view.focus();
          startCompletion(view);
        }
      },
      focus: () => viewRef.current?.focus(),
      undo: () => {
        const view = viewRef.current;
        if (view) {
          undo(view);
          view.focus();
        }
      },
      redo: () => {
        const view = viewRef.current;
        if (view) {
          redo(view);
          view.focus();
        }
      },
    };
    return () => {
      if (actionsRef) actionsRef.current = null;
    };
  }, [actionsRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const previousPath = currentPathRef.current;
    if (previousPath && pathKey(previousPath) !== pathKey(path)) {
      statesRef.current.set(pathKey(previousPath), view.state);
    }
    const key = pathKey(path);
    let state = statesRef.current.get(key);
    if (!state) {
      state = EditorState.create({
        doc: contentRef.current,
        extensions: buildExtensions(),
      });
    }
    currentPathRef.current = path;
    suppressRef.current = true;
    if (view.state !== state) view.setState(state);
    suppressRef.current = false;

    const bundle = editorTheme(dark);
    view.dispatch({
      effects: [
        themeCompartment.reconfigure([bundle.theme, bundle.highlight]),
        fontCompartment.reconfigure(fontTheme(settingsRef.current)),
        wrapCompartment.reconfigure(
          settingsRef.current.wordWrap ? EditorView.lineWrapping : [],
        ),
        gutterCompartment.reconfigure(
          settingsRef.current.showLineNumbers
            ? [lineNumbers(), highlightActiveLineGutter()]
            : [],
        ),
      ],
    });
    applyDiagnostics(view, path, issuesRef.current);
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    callbacksRef.current.onCursorChange(line.number, pos - line.from + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const bundle = editorTheme(dark);
    view.dispatch({
      effects: [
        themeCompartment.reconfigure([bundle.theme, bundle.highlight]),
        fontCompartment.reconfigure(fontTheme(settings)),
        wrapCompartment.reconfigure(
          settings.wordWrap ? EditorView.lineWrapping : [],
        ),
        gutterCompartment.reconfigure(
          settings.showLineNumbers
            ? [lineNumbers(), highlightActiveLineGutter()]
            : [],
        ),
      ],
    });
  }, [
    dark,
    settings,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!samePath(currentPathRef.current, path)) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    suppressRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
    });
    suppressRef.current = false;
  }, [content, path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    applyDiagnostics(view, path, issues);
  }, [issues, path]);

  useEffect(() => {
    if (!jump || !samePath(jump.path, path)) return;
    const view = viewRef.current;
    if (!view) return;
    const lineNumber = Math.min(
      Math.max(1, jump.line),
      view.state.doc.lines,
    );
    const line = view.state.doc.line(lineNumber);
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
    onClearJump();
  }, [jump, path, onClearJump]);

  return <div className="editor-host" ref={hostRef} />;
}
