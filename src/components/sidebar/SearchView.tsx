import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import SfIcon from "../SfIcon";
import { basename, extname, pathKey } from "../../lib/path";
import { flattenOutline } from "../../lib/texParser";
import { useAppStore } from "../../store/useAppStore";
import { t } from "../../i18n";
import { plural } from "../../i18n";

const SEARCHABLE = new Set([".tex", ".ltx", ".bib", ".sty", ".cls", ".txt", ".md"]);
const MAX_RESULTS = 300;
const RECENT_KEY = "texpad.search.recent.v1";

interface TextResult {
  file: string;
  line: number;
  text: string;
}

interface TagResult {
  id: string;
  title: string;
  meta: string;
  file: string;
  line: number;
  kind: "section" | "float" | "label" | "citation" | "file";
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function saveRecent(items: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function makeRegex(
  query: string,
  global: boolean,
  useRegex: boolean,
  ignoreCase: boolean,
): RegExp | null {
  if (!query) return null;
  const pattern = useRegex
    ? query
    : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(pattern, `${global ? "g" : ""}${ignoreCase ? "i" : ""}`);
  } catch {
    return null;
  }
}

function Highlighted({
  text,
  query,
  useRegex,
  ignoreCase,
}: {
  text: string;
  query: string;
  useRegex: boolean;
  ignoreCase: boolean;
}) {
  const regex = makeRegex(query, true, useRegex, ignoreCase);
  if (!regex) return <>{text}</>;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    if (match[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<mark key={`${match.index}-${match[0]}`}>{match[0]}</mark>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function TagIcon({ kind }: { kind: TagResult["kind"] }) {
  switch (kind) {
    case "citation":
      return <SfIcon name="book.closed" size={14} />;
    case "label":
      return <SfIcon name="tag" size={14} />;
    case "file":
      return <SfIcon name="document" size={14} />;
    default:
      return <SfIcon name="star" size={14} />;
  }
}

export default function SearchView() {
  const fileCache = useAppStore((state) => state.fileCache);
  const activePath = useAppStore((state) => state.activePath);
  const outline = useAppStore((state) => state.outline);
  const floats = useAppStore((state) => state.floats);
  const labels = useAppStore((state) => state.labels);
  const citations = useAppStore((state) => state.citations);
  const projectFiles = useAppStore((state) => state.projectFiles);
  const jumpTo = useAppStore((state) => state.jumpTo);
  const applyFileContents = useAppStore((state) => state.applyFileContents);
  const runTypeset = useAppStore((state) => state.runTypeset);
  const notify = useAppStore((state) => state.notify);
  const tab = useAppStore((state) => state.searchTab);
  const setTab = useAppStore((state) => state.setSearchTab);
  const searchNonce = useAppStore((state) => state.searchNonce);

  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [useRegex, setUseRegex] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ file: string; line: number } | null>(
    null,
  );
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const optionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (searchNonce === 0) return;
    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(timeout);
  }, [searchNonce]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const element = document.querySelector(
      ".search-result.is-selected, .tag-result.is-selected",
    );
    element?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!optionsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!optionsRef.current?.contains(event.target as Node)) {
        setOptionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [optionsOpen]);

  const regexValid =
    !useRegex ||
    !activeQuery ||
    makeRegex(activeQuery, true, useRegex, ignoreCase) !== null;

  const textResults = useMemo(() => {
    const regex = makeRegex(activeQuery, true, useRegex, ignoreCase);
    if (!regex) return [];
    const out: TextResult[] = [];
    for (const cached of Object.values(fileCache)) {
      if (!SEARCHABLE.has(extname(cached.path))) continue;
      const lines = cached.content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        regex.lastIndex = 0;
        if (regex.test(line)) {
          out.push({
            file: cached.path,
            line: index + 1,
            text: line.trim().slice(0, 260),
          });
          if (out.length >= MAX_RESULTS) return out;
        }
      }
    }
    return out;
  }, [activeQuery, fileCache, useRegex, ignoreCase]);

  const groups = useMemo(() => {
    const map = new Map<string, TextResult[]>();
    for (const result of textResults) {
      const list = map.get(result.file) ?? [];
      list.push(result);
      map.set(result.file, list);
    }
    return [...map.entries()].map(([file, items]) => ({ file, items }));
  }, [textResults]);

  const tagResults = useMemo(() => {
    const lower = activeQuery.toLowerCase();
    if (!lower) return [];
    const out: TagResult[] = [];
    const seen = new Set<string>();
    const add = (item: TagResult) => {
      const key = `${item.file}:${item.line}:${item.title}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };

    for (const node of flattenOutline(outline)) {
      if (node.kind === "document") continue;
      if (node.title.toLowerCase().includes(lower)) {
        add({
          id: `section:${node.id}`,
          title: node.title,
          meta: `${basename(node.file)} : ${node.line}`,
          file: node.file,
          line: node.line,
          kind: "section",
        });
      }
    }

    for (const float of floats) {
      if (float.title.toLowerCase().includes(lower)) {
        add({
          id: `float:${float.file}:${float.line}`,
          title: float.title,
          meta: `${float.kind} · ${basename(float.file)} : ${float.line}`,
          file: float.file,
          line: float.line,
          kind: "float",
        });
      }
    }

    for (const label of labels) {
      if (
        label.name.toLowerCase().includes(lower) ||
        label.context.toLowerCase().includes(lower)
      ) {
        add({
          id: `label:${label.file}:${label.line}:${label.name}`,
          title: label.name,
          meta: `${label.context} · ${basename(label.file)} : ${label.line}`,
          file: label.file,
          line: label.line,
          kind: "label",
        });
      }
    }

    for (const citation of citations) {
      const meta = [citation.title, citation.author, citation.year]
        .filter(Boolean)
        .join(" · ");
      if (
        citation.key.toLowerCase().includes(lower) ||
        meta.toLowerCase().includes(lower)
      ) {
        if (!citation.file) continue;
        add({
          id: `cite:${citation.key}`,
          title: citation.key,
          meta: meta || basename(citation.file),
          file: citation.file,
          line: 1,
          kind: "citation",
        });
      }
    }

    for (const file of projectFiles) {
      if (file.name.toLowerCase().includes(lower)) {
        add({
          id: `file:${file.path}`,
          title: file.name,
          meta: file.relative,
          file: file.path,
          line: 1,
          kind: "file",
        });
      }
    }

    if (/^\d+$/.test(activeQuery) && activePath) {
      const cached = fileCache[pathKey(activePath)];
      const requested = Number(activeQuery);
      if (cached) {
        const lineCount = cached.content.split(/\r?\n/).length;
        if (requested >= 1 && requested <= lineCount) {
          add({
            id: `line:${activePath}:${requested}`,
            title: t("Line {n}", { n: requested }),
            meta: basename(activePath),
            file: activePath,
            line: requested,
            kind: "file",
          });
        }
      }
    }

    return out.slice(0, MAX_RESULTS);
  }, [activeQuery, activePath, fileCache, outline, floats, labels, citations, projectFiles]);

  const activeResults = tab === "text" ? textResults : tagResults;

  const runSearch = () => {
    const value = query.trim();
    setActiveQuery(value);
    setActiveIndex(-1);
    setSelected(null);
    if (value) {
      const next = [value, ...recent.filter((item) => item !== value)].slice(0, 10);
      setRecent(next);
      saveRecent(next);
    }
  };

  const jumpToResult = (file: string, line: number) => {
    setSelected({ file, line });
    void jumpTo(file, line);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!activeResults.length) return;
      setActiveIndex((index) => Math.min(activeResults.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = activeResults[activeIndex];
      if (target && activeIndex >= 0) {
        jumpToResult(target.file, target.line);
      } else {
        runSearch();
      }
    } else if (event.key === "Escape") {
      setActiveIndex(-1);
      setOptionsOpen(false);
    }
  };

  const toggleGroup = (file: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const replaceAll = async () => {
    const regex = makeRegex(activeQuery, true, useRegex, ignoreCase);
    if (!regex) return;
    const updates: Array<{ path: string; content: string }> = [];
    for (const group of groups) {
      const cached = fileCache[pathKey(group.file)];
      if (!cached) continue;
      const next = cached.content.replace(regex, replacement);
      if (next !== cached.content) updates.push({ path: group.file, content: next });
    }
    if (!updates.length) return;
    await applyFileContents(updates);
    notify(
      plural(updates.length, ["Replaced matches in {n} file.", "Replaced matches in {n} files."], ["Заменено в {n} файле.", "Заменено в {n} файлах.", "Заменено в {n} файлах."]),
      "success",
    );
    if (useAppStore.getState().settings.autoTypeset) void runTypeset(false);
  };

  const replaceOne = async () => {
    const target =
      selected ??
      (textResults[0]
        ? { file: textResults[0].file, line: textResults[0].line }
        : null);
    if (!target) return;
    const cached = fileCache[pathKey(target.file)];
    if (!cached) return;
    const lineStarts = [0];
    for (let i = 0; i < cached.content.length; i++) {
      if (cached.content[i] === "\n") lineStarts.push(i + 1);
    }
    const lineStart = lineStarts[target.line - 1];
    if (lineStart == null) return;
    const lineEnd = cached.content.indexOf("\n", lineStart);
    const lineText = cached.content.slice(
      lineStart,
      lineEnd < 0 ? cached.content.length : lineEnd,
    );
    const regex = makeRegex(activeQuery, false, useRegex, ignoreCase);
    if (!regex) return;
    const match = regex.exec(lineText);
    if (!match) return;
    const start = lineStart + match.index;
    const after = cached.content.slice(start);
    const next = cached.content.slice(0, start) + after.replace(regex, replacement);
    if (next === cached.content) return;
    await applyFileContents([{ path: target.file, content: next }]);
    notify(t("Replaced one match."), "success");
    if (useAppStore.getState().settings.autoTypeset) void runTypeset(false);
  };

  const resultCount = activeQuery ? activeResults.length : 0;

  return (
    <div className="search-panel">
      <div className="search-tabs">
        <button
          className={tab === "text" ? "is-active" : ""}
          onClick={() => setTab("text")}
        >
          {t("Text Search")}
        </button>
        <button
          className={tab === "tag" ? "is-active" : ""}
          onClick={() => setTab("tag")}
        >
          {t("Tag Search")}
        </button>
      </div>

      <div className="search-field-row">
        <div className="search-field-wrap">
          <div className="search-field">
            <SfIcon name="magnifyingglass" size={14} />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={
                tab === "text"
                  ? t("Find in project")
                  : t("Section, label, citation, file…")
              }
              spellCheck={false}
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setActiveQuery("");
                  setActiveIndex(-1);
                }}
                title={t("Clear search")}
              >
                <SfIcon name="xmark" size={13} />
              </button>
            )}
            <button
              className={`search-options-toggle${optionsOpen ? " is-active" : ""}`}
              title={t("Search options")}
              onClick={() => setOptionsOpen((open) => !open)}
            >
              <SfIcon name="chevron.down" size={12} />
            </button>
          </div>

          {optionsOpen && (
            <div className="search-options-menu" ref={optionsRef}>
              <label className="search-option-row">
                <input
                  type="checkbox"
                  checked={ignoreCase}
                  onChange={(event) => setIgnoreCase(event.target.checked)}
                />
                <span>{t("Ignoring Case")}</span>
              </label>
              <label className="search-option-row">
                <input
                  type="checkbox"
                  checked={useRegex}
                  onChange={(event) => setUseRegex(event.target.checked)}
                />
                <span>{t("Treat search term as a regex")}</span>
              </label>
              {recent.length > 0 && (
                <>
                  <div className="search-options-separator" />
                  <div className="search-options-title">{t("Recent searches")}</div>
                  {recent.map((term) => (
                    <button
                      key={term}
                      className="search-recent-row"
                      onClick={() => {
                        setQuery(term);
                        setActiveQuery(term);
                        setActiveIndex(-1);
                        setOptionsOpen(false);
                      }}
                    >
                      {term}
                    </button>
                  ))}
                  <button
                    className="search-clear-recent"
                    onClick={() => {
                      setRecent([]);
                      saveRecent([]);
                    }}
                  >
                    {t("Clear recent searches")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <button className="search-submit" onClick={runSearch}>
          {t("Search")}
        </button>
      </div>

      {tab === "text" && (
        <div className="search-replace">
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder={t("Replacement Text, using $1, $2, ... for regex")}
            spellCheck={false}
          />
          <div className="search-replace-actions">
            <button onClick={() => void replaceAll()} disabled={!textResults.length}>
              {t("Replace All")}
            </button>
            <button onClick={() => void replaceOne()} disabled={!textResults.length}>
              {t("Replace")}
            </button>
          </div>
        </div>
      )}

      {!activeQuery ? (
        <div className="search-hint">
          <SfIcon name="magnifyingglass" size={22} />
          <span>
            {tab === "text"
              ? t("Enter a query and press Search to search every file in the project.")
              : t("Search sections, labels, citations and project files.")}
          </span>
        </div>
      ) : (
        <>
          <div className="search-summary">
            {!regexValid
              ? t("Invalid regular expression")
              : tab === "text"
                ? `${textResults.length} result${textResults.length === 1 ? "" : "s"} in ${groups.length} file${groups.length === 1 ? "" : "s"}`
                : `${tagResults.length} result${tagResults.length === 1 ? "" : "s"}`}
          </div>

          <div className="search-results">
            {tab === "text" &&
              groups.map((group) => {
                const isCollapsed = collapsed.has(group.file);
                return (
                  <div className="search-file-group" key={group.file}>
                    <button
                      className="search-file-header"
                      title={group.file}
                      onClick={() => toggleGroup(group.file)}
                    >
                      {isCollapsed ? (
                        <SfIcon name="chevron.right" size={12} />
                      ) : (
                        <SfIcon name="chevron.down" size={12} />
                      )}
                      <SfIcon name="document" size={14} className="search-file-icon" />
                      <span className="search-file-name">
                        {basename(group.file)}
                      </span>
                      <span className="search-file-count">{group.items.length}</span>
                    </button>
                    {!isCollapsed &&
                      group.items.map((result) => {
                        const index = textResults.indexOf(result);
                        const isActive =
                          activeIndex === index ||
                          (selected?.file === result.file &&
                            selected.line === result.line);
                        return (
                          <button
                            key={`${result.file}:${result.line}`}
                            className={`search-result${isActive ? " is-selected" : ""}`}
                            onClick={() => {
                              setActiveIndex(index);
                              jumpToResult(result.file, result.line);
                            }}
                          >
                            <span className="search-line-number">{result.line}</span>
                            <span className="search-result-text">
                              <Highlighted
                                text={result.text}
                                query={activeQuery}
                                useRegex={useRegex}
                                ignoreCase={ignoreCase}
                              />
                            </span>
                          </button>
                        );
                      })}
                  </div>
                );
              })}

            {tab === "tag" &&
              tagResults.map((result, index) => (
                <button
                  key={result.id}
                  className={`tag-result${activeIndex === index ? " is-selected" : ""}`}
                  title={result.meta}
                  onClick={() => {
                    setActiveIndex(index);
                    jumpToResult(result.file, result.line);
                  }}
                >
                  <span className="tag-result-icon">
                    <TagIcon kind={result.kind} />
                  </span>
                  <span className="tag-result-text">
                    <span className="tag-result-title">{result.title}</span>
                    <span className="tag-result-meta">{result.meta}</span>
                  </span>
                </button>
              ))}

            {!resultCount && regexValid && (
              <div className="search-hint">
                <SfIcon name="magnifyingglass" size={20} />
                <span>
                  {tab === "text"
                    ? t("No matches for “{q}”.", { q: activeQuery })
                    : t("No tags match “{q}”.", { q: activeQuery })}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
