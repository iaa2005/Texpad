import SfIcon from "./SfIcon";
import { useAppStore } from "../store/useAppStore";
import OutlineView from "./sidebar/OutlineView";
import ProjectFilesView from "./sidebar/ProjectFilesView";
import IssuesView from "./sidebar/IssuesView";
import SearchView from "./sidebar/SearchView";
import TodosView from "./sidebar/TodosView";
import FileBrowserView from "./sidebar/FileBrowserView";
import { t } from "../i18n";

export default function Sidebar() {
  const visible = useAppStore((state) => state.sidebarVisible);
  const mode = useAppStore((state) => state.sidebarMode);
  const tab = useAppStore((state) => state.sidebarTab);
  const setMode = useAppStore((state) => state.setSidebarMode);
  const setTab = useAppStore((state) => state.setSidebarTab);
  const projectFiles = useAppStore((state) => state.projectFiles);
  const words = useAppStore((state) => state.words);
  const issues = useAppStore((state) => state.issues);
  const showCounts = useAppStore(
    (state) => state.settings.showSidebarCounts,
  );
  const todos = useAppStore((state) => state.todos);

  if (!visible) return null;

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const isStructure = mode === "structure";

  return (
    <aside className="sidebar">
      <div className="sidebar-topbar">
        <button
          className={`sidebar-mode${isStructure && tab === "structure" ? " is-active" : ""}`}
          title={t("Contents")}
          onClick={() => {
            setMode("structure");
            setTab("structure");
          }}
        >
          <SfIcon name="doc.text.viewfinder" size={19} />
        </button>
        <button
          className={`sidebar-mode${mode === "todos" ? " is-active" : ""}`}
          title={`${t("TODOs")}${todos.length ? ` (${todos.length})` : ""}`}
          onClick={() => setMode("todos")}
        >
          <SfIcon name="checkmark.square" size={18} />
        </button>
        <button
          className={`sidebar-mode${isStructure && tab === "subfiles" ? " is-active" : ""}`}
          title={t("Linked project files")}
          onClick={() => {
            setMode("structure");
            setTab("subfiles");
          }}
        >
          <SfIcon name="infinity" size={19} />
        </button>
        <button
          className={`sidebar-mode${mode === "browser" ? " is-active" : ""}`}
          title={t("File browser")}
          onClick={() => setMode("browser")}
        >
          <SfIcon name="folder" size={18} />
        </button>
        <button
          className={`sidebar-mode${mode === "issues" ? " is-active" : ""}`}
          title={t("Typeset issues")}
          onClick={() => setMode("issues")}
        >
          <SfIcon name="exclamationmark.triangle" size={18} />
          {errors > 0 && <span className="sidebar-mode-badge">{errors}</span>}
        </button>
        <button
          className={`sidebar-mode${mode === "search" ? " is-active" : ""}`}
          title={t("Search project")}
          onClick={() => setMode("search")}
        >
          <SfIcon name="magnifyingglass" size={18} />
        </button>
      </div>

      {showCounts && isStructure && (
        <div className="sidebar-counts">
          {projectFiles.length > 1 && (
            <div>
              <span>{t("Files")}</span>
              <span>{projectFiles.length}</span>
            </div>
          )}
          <div>
            <span>{t("Words")}</span>
            <span>{words.toLocaleString()}</span>
          </div>
        </div>
      )}

      {isStructure && (
        <div className="sidebar-segmented">
          <button
            className={tab === "structure" ? "is-active" : ""}
            onClick={() => setTab("structure")}
          >
            {t("Structure")}
          </button>
          <button
            className={tab === "subfiles" ? "is-active" : ""}
            onClick={() => setTab("subfiles")}
          >
            {t("Subfiles")}
          </button>
        </div>
      )}

      <div className="sidebar-content">
        {isStructure && tab === "structure" && <OutlineView />}
        {isStructure && tab === "subfiles" && <ProjectFilesView />}
        {mode === "browser" && <FileBrowserView />}
        {mode === "todos" && <TodosView />}
        {mode === "issues" && <IssuesView />}
        {mode === "search" && <SearchView />}
      </div>
    </aside>
  );
}
