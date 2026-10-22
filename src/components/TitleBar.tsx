import { useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openExternal, revealPath } from "../lib/tauri";
import SfIcon from "./SfIcon";
import { engineLabel, effectiveEngineFor, useAppStore } from "../store/useAppStore";
import {
  emailFile,
  emailProjectZip,
  exportProjectFolder,
  exportProjectZip,
  printFile,
  printPdf,
} from "../lib/tauri";
import { joinPath, stem } from "../lib/path";
import { t } from "../i18n";
import { plural } from "../i18n";

type WindowResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

const resizeDirections: Array<{
  direction: WindowResizeDirection;
  className: string;
}> = [
  { direction: "North", className: "resize-n" },
  { direction: "South", className: "resize-s" },
  { direction: "East", className: "resize-e" },
  { direction: "West", className: "resize-w" },
  { direction: "NorthEast", className: "resize-ne" },
  { direction: "NorthWest", className: "resize-nw" },
  { direction: "SouthEast", className: "resize-se" },
  { direction: "SouthWest", className: "resize-sw" },
];

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="menu-item" onClick={onClick} disabled={disabled}>
      <span className="menu-item-icon">{icon}</span>
      <span className="menu-item-label">{label}</span>
      {shortcut && <span className="menu-item-shortcut">{shortcut}</span>}
    </button>
  );
}

function TypesetGlyph({
  building = false,
  size = 18,
}: {
  building?: boolean;
  size?: number;
}) {
  return (
    <svg
      className={`typeset-play${building ? " is-building" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path d="M7.1 4.6 16.1 10 7.1 15.4 Z" />
    </svg>
  );
}

export default function TitleBar() {
  const rootFile = useAppStore((state) => state.rootFile);
  const activePath = useAppStore((state) => state.activePath);
  const settings = useAppStore((state) => state.settings);
  const projectEngine = useAppStore((state) => state.projectEngine);
  const engineStatus = useAppStore((state) => state.engineStatus);
  const build = useAppStore((state) => state.build);
  const issues = useAppStore((state) => state.issues);
  const sidebarVisible = useAppStore((state) => state.sidebarVisible);
  const viewMode = useAppStore((state) => state.viewMode);
  const navHistory = useAppStore((state) => state.navHistory);
  const navIndex = useAppStore((state) => state.navIndex);

  const setSidebarVisible = useAppStore((state) => state.setSidebarVisible);
  const setSidebarMode = useAppStore((state) => state.setSidebarMode);
  const setViewMode = useAppStore((state) => state.setViewMode);
  const setShowSettings = useAppStore((state) => state.setShowSettings);
  const setSettings = useAppStore((state) => state.setSettings);
  const runTypeset = useAppStore((state) => state.runTypeset);
  const cancelTypeset = useAppStore((state) => state.cancelTypeset);
  const cleanBuild = useAppStore((state) => state.cleanBuild);
  const openEditorArchive = useAppStore((state) => state.openEditorArchive);
  const setShowTemplates = useAppStore((state) => state.setShowTemplates);
  const reloadWithEncoding = useAppStore((state) => state.reloadWithEncoding);
  const reloadUserConfig = useAppStore((state) => state.reloadUserConfig);
  const openUserConfigFolder = useAppStore((state) => state.openUserConfigFolder);
  const focusSearch = useAppStore((state) => state.focusSearch);
  const focusIssues = useAppStore((state) => state.focusIssues);
  const rootDir = useAppStore((state) => state.rootDir);
  const openProjectDialog = useAppStore((state) => state.openProjectDialog);
  const openFileDialog = useAppStore((state) => state.openFileDialog);
  const newDocument = useAppStore((state) => state.newDocument);
  const saveFile = useAppStore((state) => state.saveFile);
  const saveAll = useAppStore((state) => state.saveAll);
  const closeProject = useAppStore((state) => state.closeProject);
  const goBack = useAppStore((state) => state.goBack);
  const goForward = useAppStore((state) => state.goForward);
  const notify = useAppStore((state) => state.notify);

  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const shareRef = useRef<HTMLDivElement | null>(null);
  const appWindow = getCurrentWindow();
  const systemDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark =
    settings.theme === "dark" || (settings.theme === "system" && systemDark);

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const building = build.status === "building";
  const hasProject = Boolean(rootFile);
  const configuredEngine = projectEngine ?? settings.engine;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!shareOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!shareRef.current?.contains(event.target as Node)) setShareOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [shareOpen]);

  const sendEditorCommand = (command: string) => {
    window.dispatchEvent(
      new CustomEvent("texpad:editor-command", { detail: command }),
    );
  };

  const getStatusIcon = () => {
    if (building) return <SfIcon name="arrow.clockwise" size={15} className="spin" />;
    if (build.errorMessage || build.status === "failed" || errors > 0) {
      return <SfIcon name="exclamationmark.triangle" size={15} className="status-error" />;
    }
    if (warnings > 0) return <SfIcon name="exclamationmark.triangle" size={15} className="status-warning" />;
    if (build.lastBuiltAt) return <SfIcon name="checkmark.circle" size={15} className="status-ok" />;
    return <SfIcon name="checkmark.circle" size={15} className="status-idle" />;
  };

  const statusText = building
    ? t("Typesetting…")
    : build.errorMessage
      ? build.errorMessage
      : errors > 0
        ? `${plural(errors, ["{n} error", "{n} errors"], ["{n} ошибка", "{n} ошибки", "{n} ошибок"])}, ${plural(warnings, ["{n} warning", "{n} warnings"], ["{n} предупреждение", "{n} предупреждения", "{n} предупреждений"])}`
        : warnings > 0
          ? plural(warnings, ["{n} warning", "{n} warnings"], ["{n} предупреждение", "{n} предупреждения", "{n} предупреждений"])
          : build.lastBuiltAt
            ? t("Typeset successfully in {s}s", { s: (build.durationMs / 1000).toFixed(1) })
            : t("Not typeset yet");

  return (
    <>
      <div
        className="titlebar"
        data-tauri-drag-region
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          void appWindow.toggleMaximize();
        }}
      >
        <div className="titlebar-left">
          <div className="app-menu-wrap" ref={menuRef}>
            <button
              className={`icon-button titlebar-icon${menuOpen ? " is-active" : ""}`}
              title={t("Menu")}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <SfIcon name="line.3.horizontal" size={17} />
            </button>
            {menuOpen && (
              <div className="menu-popover">
                <MenuItem
                  icon={<SfIcon name="folder" size={15} />}
                  label={t("Open Document…")}
                  shortcut="Ctrl+O"
                  onClick={() => {
                    setMenuOpen(false);
                    void openProjectDialog();
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="document.badge.plus" size={15} />}
                  label={t("New Document…")}
                  shortcut="Ctrl+N"
                  onClick={() => {
                    setMenuOpen(false);
                    void newDocument();
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="document" size={15} />}
                  label={t("New from Template…")}
                  onClick={() => {
                    setMenuOpen(false);
                    setShowTemplates(true);
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="square.and.arrow.down" size={15} />}
                  label={t("Import ZIP Project…")}
                  onClick={() => {
                    setMenuOpen(false);
                    void useAppStore.getState().importProjectZipDialog();
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="magnifyingglass" size={15} />}
                  label={t("Find in Project…")}
                  shortcut="Ctrl+Shift+F"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    focusSearch("text");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="star" size={15} />}
                  label={t("Tag Search…")}
                  shortcut="Ctrl+Shift+O"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    focusSearch("tag");
                  }}
                />
                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="square.and.arrow.down" size={15} />}
                  label={t("Save")}
                  shortcut="Ctrl+S"
                  disabled={!activePath}
                  onClick={() => {
                    setMenuOpen(false);
                    if (activePath) void saveFile(activePath);
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="square.and.arrow.down" size={15} />}
                  label={t("Save All")}
                  shortcut="Ctrl+Shift+S"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    void saveAll(false);
                  }}
                />
                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="text.bubble" size={15} />}
                  label={t("Comment Block")}
                  shortcut="Ctrl+/"
                  onClick={() => {
                    setMenuOpen(false);
                    sendEditorCommand("comment");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="increase.indent" size={15} />}
                  label={t("Indent Block")}
                  shortcut="Ctrl+]"
                  onClick={() => {
                    setMenuOpen(false);
                    sendEditorCommand("indent");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="decrease.indent" size={15} />}
                  label={t("Unindent Block")}
                  shortcut="Ctrl+["
                  onClick={() => {
                    setMenuOpen(false);
                    sendEditorCommand("outdent");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="character.textbox" size={15} />}
                  label={t("Autocomplete")}
                  shortcut="Ctrl+Space"
                  onClick={() => {
                    setMenuOpen(false);
                    sendEditorCommand("autocomplete");
                  }}
                />
                <div className="menu-separator" />
                <MenuItem
                  icon={<TypesetGlyph size={15} />}
                  label={t("Typeset Now")}
                  shortcut="Ctrl+R"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    void runTypeset(true);
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="arrow.clockwise" size={15} />}
                  label={t("Toggle Live Typesetting")}
                  shortcut="Ctrl+Shift+L"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    setSettings({ autoTypeset: !settings.autoTypeset });
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="xmark" size={15} />}
                  label={t("Abort Typesetting")}
                  disabled={!building}
                  onClick={() => {
                    setMenuOpen(false);
                    void cancelTypeset();
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="printer" size={15} />}
                  label={t("Print PDF…")}
                  disabled={!build.pdfPath}
                  onClick={() => {
                    setMenuOpen(false);
                    if (build.pdfPath) {
                      void printPdf(build.pdfPath)
                        .then(() => notify(t("PDF sent to the printer."), "success"))
                        .catch((error) => notify(String(error), "error"));
                    }
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="printer" size={15} />}
                  label={t("Print LaTeX Source…")}
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    if (rootFile) {
                      void printFile(rootFile)
                        .then(() => notify(t("Source sent to the printer."), "success"))
                        .catch((error) => notify(String(error), "error"));
                    }
                  }}
                />
                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="xmark" size={15} />}
                  label={t("Close Project")}
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    void saveAll(true).then(() => closeProject());
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="trash" size={15} />}
                  label={t("Remove Intermediate Files")}
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    void cleanBuild();
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="folder" size={15} />}
                  label={t("Editor Archive…")}
                  onClick={() => {
                    setMenuOpen(false);
                    void openEditorArchive();
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="arrow.clockwise" size={15} />}
                  label={t("Reload with Encoding ({encoding})", { encoding: settings.encoding })}
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    void reloadWithEncoding(settings.encoding);
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="character.textbox" size={15} />}
                  label={t("Snippets & Autocomplete…")}
                  onClick={() => {
                    setMenuOpen(false);
                    void openUserConfigFolder();
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="arrow.clockwise" size={15} />}
                  label={t("Reload User Configuration")}
                  onClick={() => {
                    setMenuOpen(false);
                    void reloadUserConfig();
                  }}
                />
                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="rectangle" size={15} />}
                  label={t("Editor Only")}
                  shortcut="Ctrl+2"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    setViewMode("editor");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="rectangle.split.2x1" size={15} />}
                  label={t("Editor and PDF")}
                  shortcut="Ctrl+3"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    setViewMode("split");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="rectangle.fill" size={15} />}
                  label={t("PDF Only")}
                  shortcut="Ctrl+4"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    setViewMode("pdf");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="sidebar.left" size={15} />}
                  label={t("Toggle Sidebar")}
                  shortcut="Ctrl+1"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    setSidebarVisible(!sidebarVisible);
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="exclamationmark.triangle" size={15} />}
                  label={t("Typeset Issues")}
                  shortcut="Ctrl+8"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    focusIssues("issues");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="document" size={15} />}
                  label={t("Typeset Log")}
                  shortcut="Ctrl+9"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    focusIssues("log");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="plus" size={15} />}
                  label={t("Zoom PDF In")}
                  onClick={() => {
                    setMenuOpen(false);
                    window.dispatchEvent(
                      new CustomEvent("texpad:pdf-zoom", { detail: 1 }),
                    );
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="minus" size={15} />}
                  label={t("Zoom PDF Out")}
                  onClick={() => {
                    setMenuOpen(false);
                    window.dispatchEvent(
                      new CustomEvent("texpad:pdf-zoom", { detail: -1 }),
                    );
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="xmark" size={15} />}
                  label={t("Show Welcome Window")}
                  shortcut="Ctrl+Shift+W"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    void saveAll(true).then(() => closeProject());
                  }}
                />
                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="gearshape" size={15} />}
                  label={t("Settings…")}
                  shortcut="Ctrl+,"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowSettings(true);
                  }}
                />
              </div>
            )}
          </div>

          {hasProject ? (
            <>
              <button
                className={`icon-button titlebar-icon${sidebarVisible ? " is-active" : ""}`}
                title={t("Toggle sidebar (Ctrl+B)")}
                onClick={() => setSidebarVisible(!sidebarVisible)}
              >
                <SfIcon name="sidebar.left" size={17} />
              </button>

              <button
                className={`icon-button titlebar-icon typeset-trigger${building ? " is-building" : ""}`}
                title={building ? t("Abort typesetting") : t("Typeset (Ctrl+Enter)")}
                onClick={() => {
                  if (building) void cancelTypeset();
                  else void runTypeset(true);
                }}
              >
                <TypesetGlyph size={19} building={building} />
              </button>

              <button
                className={`live-button${settings.autoTypeset ? " is-on" : ""}`}
                onClick={() => setSettings({ autoTypeset: !settings.autoTypeset })}
                title={
                  settings.autoTypeset
                    ? t("Live typesetting is on")
                    : t("Live typesetting is off")
                }
              >
                {t("LIVE")}
              </button>

              <span className="titlebar-separator" />

              <button
                className="engine-button"
                onClick={() => setShowSettings(true)}
                title={t("Typesetting settings")}
              >
                {settings.customBuildCommand.trim()
                  ? t("custom")
                  : engineLabel(effectiveEngineFor(configuredEngine, engineStatus))}
              </button>

              <button
                className="icon-button titlebar-icon"
                title={t("Typesetting settings")}
                onClick={() => setShowSettings(true)}
              >
                <SfIcon name="slider.horizontal.3" size={16} />
              </button>

              <button
                className="status-button"
                onClick={() => setSidebarMode("issues")}
                title={statusText}
              >
                {getStatusIcon()}
                {(errors > 0 || warnings > 0) && (
                  <span className={`status-count${errors > 0 ? " has-errors" : ""}`}>
                    {errors > 0 ? errors : warnings}
                  </span>
                )}
              </button>
            </>
          ) : (
            <div className="welcome-brand">
              <img className="welcome-brand-mark" src="/app-icon.png" alt="" />
              <span>{t("Texpad")}</span>
            </div>
          )}
        </div>

        <div className="titlebar-drag-spacer" data-tauri-drag-region />

        <div className="titlebar-right">
          {hasProject && (
            <>
              <div className="share-wrap" ref={shareRef}>
                <button
                  className="icon-button titlebar-icon"
                  title={t("Share")}
                  onClick={() => setShareOpen((open) => !open)}
                >
                  <SfIcon name="square.and.arrow.up" size={16} />
                </button>
                {shareOpen && (
                  <div className="menu-popover share-popover">
                    <MenuItem
                      icon={<SfIcon name="square.and.arrow.down" size={15} />}
                      label={t("Save PDF As…")}
                      shortcut="Ctrl+Shift+D"
                      disabled={!build.pdfPath}
                      onClick={() => {
                        setShareOpen(false);
                        void useAppStore.getState().savePdfAs();
                      }}
                    />
                    <MenuItem
                      icon={<SfIcon name="folder" size={15} />}
                      label={t("Reveal PDF in Explorer")}
                      disabled={!build.pdfPath}
                      onClick={() => {
                        setShareOpen(false);
                        if (build.pdfPath) void revealPath(build.pdfPath);
                      }}
                    />
                    <MenuItem
                      icon={<SfIcon name="square.and.arrow.up" size={15} />}
                      label={t("Open PDF Externally")}
                      disabled={!build.pdfPath}
                      onClick={() => {
                        setShareOpen(false);
                        if (build.pdfPath)
                          void openExternal(build.pdfPath).catch((error) =>
                            notify(String(error), "error"),
                          );
                      }}
                    />
                    <MenuItem
                      icon={<SfIcon name="printer" size={15} />}
                      label={t("Print PDF…")}
                      disabled={!build.pdfPath}
                      onClick={() => {
                        setShareOpen(false);
                        if (build.pdfPath) {
                          void printPdf(build.pdfPath)
                            .then(() => notify(t("PDF sent to the printer."), "success"))
                            .catch((error) => notify(String(error), "error"));
                        }
                      }}
                    />
                    <MenuItem
                      icon={<SfIcon name="square.and.arrow.up" size={15} />}
                      label={t("Email PDF…")}
                      disabled={!build.pdfPath}
                      onClick={() => {
                        setShareOpen(false);
                        if (build.pdfPath) {
                          void emailFile(build.pdfPath, "LaTeX PDF")
                            .then(() => notify(t("Email draft opened."), "success"))
                            .catch((error) => notify(String(error), "error"));
                        }
                      }}
                    />
                    <MenuItem
                      icon={<SfIcon name="square.and.arrow.up" size={15} />}
                      label={t("Email Project as ZIP…")}
                      disabled={!rootFile}
                      onClick={() => {
                        setShareOpen(false);
                        if (rootFile) {
                          void emailProjectZip(rootFile, "LaTeX project")
                            .then(() => notify(t("Email draft opened."), "success"))
                            .catch((error) => notify(String(error), "error"));
                        }
                      }}
                    />
                    <div className="menu-separator" />
                    <MenuItem
                      icon={<SfIcon name="square.and.arrow.up" size={15} />}
                      label={t("Export Project as ZIP…")}
                      disabled={!rootFile}
                      onClick={() => {
                        setShareOpen(false);
                        void (async () => {
                          if (!rootFile || !rootDir) return;
                          const selected = await saveDialog({
                            title: t("Export project as ZIP"),
                            defaultPath: joinPath(
                              rootDir,
                              `${stem(rootFile)}.zip`,
                            ),
                            filters: [{ name: t("ZIP archive"), extensions: ["zip"] }],
                          });
                          if (typeof selected !== "string") return;
                          try {
                            await exportProjectZip(rootFile, selected);
                            notify(t("Project exported as ZIP."), "success");
                            await revealPath(selected);
                          } catch (error) {
                            notify(String(error), "error");
                          }
                        })();
                      }}
                    />
                    <MenuItem
                      icon={<SfIcon name="folder" size={15} />}
                      label={t("Export Project as Folder…")}
                      disabled={!rootFile}
                      onClick={() => {
                        setShareOpen(false);
                        void (async () => {
                          if (!rootFile) return;
                          const selected = await openDialog({
                            title: t("Export project as folder"),
                            directory: true,
                            multiple: false,
                          });
                          if (typeof selected !== "string") return;
                          try {
                            const target = await exportProjectFolder(
                              rootFile,
                              selected,
                            );
                            notify(t("Project exported as a folder."), "success");
                            await revealPath(target);
                          } catch (error) {
                            notify(String(error), "error");
                          }
                        })();
                      }}
                    />
                    <MenuItem
                      icon={<SfIcon name="printer" size={15} />}
                      label={t("Print LaTeX Source…")}
                      disabled={!rootFile}
                      onClick={() => {
                        setShareOpen(false);
                        if (rootFile) {
                          void printFile(rootFile)
                            .then(() => notify(t("Source sent to the printer."), "success"))
                            .catch((error) => notify(String(error), "error"));
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="view-switcher" role="group" aria-label={t("Workspace layout")}>
                <button
                  className={viewMode === "editor" ? "is-active" : ""}
                  title={t("Editor only")}
                  onClick={() => setViewMode("editor")}
                >
                  <span className="layout-glyph layout-editor" />
                </button>
                <button
                  className={viewMode === "split" ? "is-active" : ""}
                  title={t("Editor and PDF")}
                  onClick={() => setViewMode("split")}
                >
                  <span className="layout-glyph layout-split">
                    <i />
                  </span>
                </button>
                <button
                  className={viewMode === "pdf" ? "is-active" : ""}
                  title={t("PDF only")}
                  onClick={() => setViewMode("pdf")}
                >
                  <span className="layout-glyph layout-pdf" />
                </button>
              </div>

              <button
                className="icon-button titlebar-icon"
                title={t("Back")}
                disabled={navIndex <= 0}
                onClick={() => void goBack()}
              >
                <SfIcon name="chevron.left" size={16} />
              </button>
              <button
                className="icon-button titlebar-icon"
                title={t("Forward")}
                disabled={navIndex < 0 || navIndex >= navHistory.length - 1}
                onClick={() => void goForward()}
              >
                <SfIcon name="chevron.right" size={16} />
              </button>

              <button
                className="icon-button titlebar-icon"
                title={t("Open a file in a new tab")}
                onClick={() => void openFileDialog()}
              >
                <SfIcon name="plus.square" size={16} />
              </button>
            </>
          )}

          {!hasProject && (
            <>
              <button
                className="icon-button titlebar-icon"
                title={t("Settings")}
                onClick={() => setShowSettings(true)}
              >
                <SfIcon name="gearshape" size={17} />
              </button>
              <button
                className="icon-button titlebar-icon"
                title={isDark ? t("Use light theme") : t("Use dark theme")}
                onClick={() => setSettings({ theme: isDark ? "light" : "dark" })}
              >
                {isDark ? <SfIcon name="sun.max" size={16} /> : <SfIcon name="moon" size={16} />}
              </button>
            </>
          )}

          <div className="caption-buttons">
            <button
              className="caption-button"
              title={t("Minimize")}
              onClick={() => void appWindow.minimize()}
            >
              <SfIcon name="minus" size={14} />
            </button>
            <button
              className="caption-button"
              title={t("Maximize")}
              onClick={() => void appWindow.toggleMaximize()}
            >
              <SfIcon name="square" size={10} />
            </button>
            <button
              className="caption-button caption-close"
              title={t("Close")}
              onClick={() => void appWindow.close()}
            >
              <SfIcon name="xmark" size={14} />
            </button>
          </div>
        </div>
      </div>

      {resizeDirections.map(({ direction, className }) => (
        <div
          key={direction}
          className={`resize-handle ${className}`}
          onMouseDown={(event) => {
            event.preventDefault();
            void appWindow.startResizeDragging(direction);
          }}
        />
      ))}
    </>
  );
}
