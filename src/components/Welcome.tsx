import { useState } from "react";
import SfIcon from "./SfIcon";
import { revealPath } from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";
import { BUILTIN_TEMPLATES } from "../lib/templates";
import type { RecentProject } from "../types";
import { t } from "../i18n";
import { locale } from "../i18n";

function TexFileIcon() {
  return (
    <svg
      className="tex-file-icon"
      viewBox="0 0 24 30"
      width="23"
      height="29"
      aria-hidden="true"
    >
      <path
        d="M3.2 1.5h11.4l6.2 6.2v20.8H3.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14.6 1.5v6.2h6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <text
        x="12"
        y="23.5"
        textAnchor="middle"
        fontSize="6.4"
        fontFamily="Segoe UI, sans-serif"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
      >
        {t("TEX")}
      </text>
    </svg>
  );
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

function formatModified(project: RecentProject): string {
  const timestamp = project.modifiedMs ?? project.lastOpened;
  const date = new Date(timestamp);
  const now = new Date();
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (sameDay(date, now)) return t("Last Modified Today at {time}", { time });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return t("Last Modified Yesterday at {time}", { time });
  const day = date.toLocaleDateString(locale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return t("Last Modified on {day} at {time}", { day, time });
}

export default function Welcome() {
  const recent = useAppStore((state) => state.recent);
  const openProject = useAppStore((state) => state.openProject);
  const openProjectDialog = useAppStore((state) => state.openProjectDialog);
  const importProjectZipDialog = useAppStore((state) => state.importProjectZipDialog);
  const newDocument = useAppStore((state) => state.newDocument);
  const removeRecent = useAppStore((state) => state.removeRecent);
  const loading = useAppStore((state) => state.loading);

  const [tab, setTab] = useState<"documents" | "about">("documents");
  const [filter, setFilter] = useState("");
  const [templateId, setTemplateId] = useState(BUILTIN_TEMPLATES[0].id);

  const filtered = recent.filter((project) => {
    const query = filter.trim().toLowerCase();
    if (!query) return true;
    return (
      project.name.toLowerCase().includes(query) ||
      project.path.toLowerCase().includes(query)
    );
  });

  return (
    <div className="welcome organiser-welcome">
      <div className="organiser-shell">
        <div className="organiser-left">
          <div className="organiser-mark">
            <img
              className="organiser-mark-image"
              src="/organiser-mark.png"
              alt=""
              draggable={false}
            />
          </div>
          <div className="organiser-version">{t("Texpad for Windows v0.1.0 (1)")}</div>

          <div className="organiser-tabs">
            <button
              className={tab === "documents" ? "is-active" : ""}
              onClick={() => setTab("documents")}
            >
              {t("Documents")}
            </button>
            <button
              className={tab === "about" ? "is-active" : ""}
              onClick={() => setTab("about")}
            >
              {t("About")}
            </button>
          </div>

          {tab === "documents" ? (
            <div className="organiser-actions">
              <button
                className="organiser-action"
                onClick={() => void openProjectDialog()}
              >
                <SfIcon name="plus" size={21} />
                <span className="organiser-action-text">
                  <span className="organiser-action-title">
                    {t("Open a local file or project…")}
                  </span>
                  <span className="organiser-action-subtitle">
                    {t("Open an existing local file or project.")}
                  </span>
                </span>
              </button>

              <button
                className="organiser-action"
                onClick={() => void importProjectZipDialog()}
              >
                <SfIcon name="square.and.arrow.down" size={19} />
                <span className="organiser-action-text">
                  <span className="organiser-action-title">{t("Import a ZIP project…")}</span>
                  <span className="organiser-action-subtitle">
                    {t("Unpack an Overleaf or latexted export and open it.")}
                  </span>
                </span>
              </button>

              <div className="organiser-template">
                <span>{t("Template")}</span>
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  {BUILTIN_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>
                      {t(template.name)}
                    </option>
                  ))}
                </select>
              </div>

              <button className="organiser-action" onClick={() => void newDocument(templateId)}>
                <SfIcon name="plus" size={21} />
                <span className="organiser-action-text">
                  <span className="organiser-action-title">{t("Create a local file…")}</span>
                  <span className="organiser-action-subtitle">
                    {t("Create a single file on your local disk.")}
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <div className="organiser-about">
              <h3>{t("Texpad for Windows")}</h3>
              <p>
                {t("A fast, focused LaTeX workspace built with Tauri, CodeMirror 6 and PDF.js. Typesetting is handled by your local TeX Live installation.")}
              </p>
              <div className="organiser-about-rows">
                <div>
                  <span>{t("Open document")}</span>
                  <kbd>{t("Ctrl+O")}</kbd>
                </div>
                <div>
                  <span>{t("New document")}</span>
                  <kbd>{t("Ctrl+N")}</kbd>
                </div>
                <div>
                  <span>{t("Typeset")}</span>
                  <kbd>{t("Ctrl+Enter")}</kbd>
                </div>
                <div>
                  <span>{t("Toggle sidebar")}</span>
                  <kbd>{t("Ctrl+B")}</kbd>
                </div>
                <div>
                  <span>{t("Editor / split / PDF")}</span>
                  <kbd>{t("Ctrl+1 2 3")}</kbd>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="organiser-right">
          <div className="organiser-right-header">
            <span className="organiser-recent-pill">{t("Recent Documents")}</span>
          </div>

          <div className="organiser-recent-scroll">
            {filtered.map((project) => (
              <div
                key={project.path}
                className="organiser-recent-row"
                role="button"
                tabIndex={0}
                title={project.path}
                onClick={() => void openProject(project.path)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void openProject(project.path);
                }}
              >
                <span className="organiser-recent-icon">
                  <TexFileIcon />
                </span>
                <span className="organiser-recent-text">
                  <span className="organiser-recent-name">{project.name}</span>
                  <span className="organiser-recent-meta">
                    {formatModified(project)}
                  </span>
                </span>
                <span className="organiser-recent-actions">
                  <button
                    title={t("Show in Explorer")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void revealPath(project.path);
                    }}
                  >
                    <SfIcon name="folder" size={13} />
                  </button>
                  <button
                    title={t("Remove from recent")}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeRecent(project.path);
                    }}
                  >
                    <SfIcon name="xmark" size={13} />
                  </button>
                </span>
              </div>
            ))}

            {!filtered.length && (
              <div className="organiser-recent-empty">
                <SfIcon name="plus.square" size={23} />
                <span>
                  {filter
                    ? t("No documents match the filter.")
                    : t("Your recent documents will appear here.")}
                </span>
              </div>
            )}
          </div>

          <div className="organiser-filter">
            <SfIcon name="magnifyingglass" size={14} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("Filter")}
              spellCheck={false}
            />
            {filter && (
              <button onClick={() => setFilter("")} title={t("Clear filter")}>
                <SfIcon name="xmark" size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="welcome-loading">
          <SfIcon name="arrow.clockwise" size={24} className="spin" />
          <span>{t("Opening document…")}</span>
        </div>
      )}
    </div>
  );
}
