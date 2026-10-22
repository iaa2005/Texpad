import { useEffect, useState, type ReactNode } from "react";
import SfIcon from "./SfIcon";
import { useAppStore } from "../store/useAppStore";
import type { Engine, FileEncoding, LanguageSetting, ThemeSetting } from "../types";
import { t } from "../i18n";

const ENGINES: Array<{ value: Engine; label: string; hint: string }> = [
  { value: "pdflatex", label: "pdfLaTeX", hint: "Classic and fast; best package support" },
  { value: "xelatex", label: "XeLaTeX", hint: "Unicode and system fonts" },
  { value: "lualatex", label: "LuaLaTeX", hint: "Modern engine with Lua scripting" },
  { value: "latexmk", label: "latexmk", hint: "Automatically runs BibTeX and reruns" },
  {
    value: "tectonic",
    label: "Tectonic",
    hint: "Self-contained; downloads packages on demand",
  },
  {
    value: "pandoc",
    label: "Pandoc (Markdown)",
    hint: "Markdown to PDF; requires pandoc in PATH",
  },
];

const EDITOR_FONTS: Array<[string, string]> = [
  ['"SF Mono", "Cascadia Code", Consolas, monospace', "SF Mono"],
  ['"Cascadia Code", "JetBrains Mono", Consolas, monospace', "Cascadia Code"],
  ['"JetBrains Mono", Consolas, monospace', "JetBrains Mono"],
  ['Consolas, "Courier New", monospace', "Consolas"],
  ['"Courier New", monospace', "Courier New"],
];

type SettingsTab = "general" | "sidebar" | "editor" | "viewer" | "typesetting";

// Texpad's preferences window: a toolbar of large icons with labels, and
// a row of sub-tabs for the panes that have more than one page.
const TABS: Array<{
  id: SettingsTab;
  label: string;
  icon: string;
  pages?: string[];
}> = [
  { id: "general", label: "General", icon: "gearshape" },
  { id: "sidebar", label: "Sidebar", icon: "sidebar.left" },
  {
    id: "editor",
    label: "Editor",
    icon: "pencil.line",
    pages: ["Editing Aids", "Editor Look & Feel"],
  },
  { id: "viewer", label: "Document Viewer", icon: "richtext.page" },
  {
    id: "typesetting",
    label: "Typesetting",
    icon: "gearshape.2",
    pages: ["General Preferences", "External Typesetter"],
  },
];

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      {children}
    </section>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-title">{title}</span>
        {description && <span className="settings-row-description">{description}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

/** Highlighted sample shown under "Editor Look & Feel", as in Texpad. */
function EditorPreview({ font, size }: { font: string; size: number }) {
  return (
    <pre className="settings-preview" style={{ fontFamily: font, fontSize: size }}>
      <span className="pv-comment">{t("% Sample text to demonstrate highlighting using the selected theme")}</span>
      {"\n{"}
      <span className="pv-command">{t("\\bf")}</span>
      {t(" Lemma.} Let ")}
      <span className="pv-math">$F(k_+, k_-)$</span>
      {t(" be a positive Lorentz-invariant distribution.\n  ")}
      <span className="pv-command">{t("\\begin")}</span>
      {t("{equation}\n  ")}
      <span className="pv-command">{t("\\lim")}</span>
      {"_{"}
      <span className="pv-command">{t("\\lambda \\rightarrow \\infty")}</span>
      {t("} dk_- f(")}
      <span className="pv-command">{t("\\lambda")}</span>
      {" k_-) = c "}
      <span className="pv-command">{t("\\delta")}</span>
      {"(k_+),\n  "}
      <span className="pv-command">{t("\\end")}</span>
      {t("{equation}\nwith ")}
      <span className="pv-math">$c$</span>
      {t(" some positive number.")}
    </pre>
  );
}

export default function SettingsModal() {
  const open = useAppStore((state) => state.showSettings);
  const setOpen = useAppStore((state) => state.setShowSettings);
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const reloadWithEncoding = useAppStore((state) => state.reloadWithEncoding);
  const openEditorArchive = useAppStore((state) => state.openEditorArchive);
  const openUserConfigFolder = useAppStore(
    (state) => state.openUserConfigFolder,
  );
  const engineStatus = useAppStore((state) => state.engineStatus);
  const refreshEngineStatus = useAppStore(
    (state) => state.refreshEngineStatus,
  );
  const setTexSetupOpen = useAppStore((state) => state.setTexSetupOpen);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  const current = TABS.find((item) => item.id === tab) ?? TABS[0];
  const engine = ENGINES.find((item) => item.value === settings.engine) ?? ENGINES[0];
  const fontLabel =
    EDITOR_FONTS.find(([value]) => value === settings.editorFont)?.[1] ?? t("Custom");
  const detectedEngines = engineStatus
    ? (
        [
          engineStatus.pdflatex ? "pdfLaTeX" : null,
          engineStatus.xelatex ? "XeLaTeX" : null,
          engineStatus.lualatex ? "LuaLaTeX" : null,
          engineStatus.latexmk ? "latexmk" : null,
          engineStatus.tectonic ? "Tectonic" : null,
        ].filter(Boolean) as string[]
      )
    : [];
  const engineStatusDescription = !engineStatus
    ? t("Checking installed engines…")
    : detectedEngines.length
      ? t("Detected: {list}.", { list: detectedEngines.join(", ") })
      : t("No TeX engine found. Install Tectonic to typeset.");

  return (
    <div
      className="settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="settings-modal" role="dialog" aria-label={t("Preferences")}>
        <div className="settings-toolbar">
          <div className="settings-toolbar-tabs">
            {TABS.map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "is-active" : ""}
                onClick={() => {
                  setTab(item.id);
                  setPage(0);
                }}
              >
                <SfIcon name={item.icon} size={26} />
                <span>{t(item.label)}</span>
              </button>
            ))}
          </div>
          <button className="settings-close" onClick={() => setOpen(false)} title={t("Close")}>
            <SfIcon name="xmark" size={15} />
          </button>
        </div>

        {current.pages && (
          <div className="settings-pages">
            {current.pages.map((label, index) => (
              <button
                key={label}
                className={page === index ? "is-active" : ""}
                onClick={() => setPage(index)}
              >
                {t(label)}
              </button>
            ))}
          </div>
        )}

        <div className="settings-body">
          {tab === "general" && (
            <>
              <Section title={t("Appearance")}>
                <Row title={t("Theme")} description={t("Follow Windows or choose a fixed appearance.")}>
                  <div className="theme-segmented">
                    {(
                      [
                        ["system", "System"],
                        ["light", "Light"],
                        ["dark", "Dark"],
                      ] as Array<[ThemeSetting, string]>
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        className={settings.theme === value ? "is-active" : ""}
                        onClick={() => setSettings({ theme: value })}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>
                </Row>
              </Section>

              <Section title={t("Language")}>
                <Row
                  title={t("Interface language")}
                  description={t("“System” follows the Windows display language.")}
                >
                  <div className="theme-segmented">
                    {(
                      [
                        ["system", t("System")],
                        ["en", "English"],
                        ["ru", "Русский"],
                      ] as Array<[LanguageSetting, string]>
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        className={settings.language === value ? "is-active" : ""}
                        onClick={() => setSettings({ language: value })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Row>
              </Section>

              <Section title={t("Files")}>
                <Row title={t("Auto save")} description={t("Write changes to disk while you type.")}>
                  <Toggle
                    checked={settings.autoSave}
                    onChange={(value) => setSettings({ autoSave: value })}
                  />
                </Row>
                <Row
                  title={t("File encoding")}
                  description={t("Used when opening and saving project files.")}
                >
                  <select
                    value={settings.encoding}
                    onChange={(event) =>
                      setSettings({ encoding: event.target.value as FileEncoding })
                    }
                  >
                    <option value="UTF-8">{t("UTF-8")}</option>
                    <option value="windows-1251">{t("Windows-1251")}</option>
                    <option value="UTF-16LE">{t("UTF-16 LE")}</option>
                    <option value="UTF-16BE">{t("UTF-16 BE")}</option>
                    <option value="ISO-8859-1">{t("ISO-8859-1")}</option>
                  </select>
                  <button
                    className="settings-inline-button"
                    onClick={() => void reloadWithEncoding(settings.encoding)}
                  >
                    {t("Reload files")}
                  </button>
                </Row>
              </Section>

              <Section title={t("Backups & Configuration")}>
                <Row
                  title={t("Editor archive")}
                  description={t("Snapshots of documents are kept automatically.")}
                >
                  <button
                    className="settings-inline-button"
                    onClick={() => void openEditorArchive()}
                  >
                    {t("Open Archive")}
                  </button>
                </Row>
                <Row
                  title={t("Snippets & autocomplete")}
                  description={t("Custom snippets and autocompleted_commands.txt.")}
                >
                  <button
                    className="settings-inline-button"
                    onClick={() => void openUserConfigFolder()}
                  >
                    {t("Open Folder")}
                  </button>
                </Row>
              </Section>
            </>
          )}

          {tab === "sidebar" && (
            <Section title={t("Contents")}>
              <Row
                title={t("Show file and word counts")}
                description={t("Display the Files and Words rows above the document structure.")}
              >
                <Toggle
                  checked={settings.showSidebarCounts}
                  onChange={(value) => setSettings({ showSidebarCounts: value })}
                />
              </Row>
              <Row
                title={t("Open on Subfiles")}
                description={t("Start new projects on the Subfiles tab instead of Structure.")}
              >
                <Toggle
                  checked={settings.sidebarStartsOnSubfiles}
                  onChange={(value) => setSettings({ sidebarStartsOnSubfiles: value })}
                />
              </Row>
            </Section>
          )}

          {tab === "editor" && page === 0 && (
            <>
              <Section title={t("Editing Aids")}>
                <Row
                  title={t("Auto-close environments")}
                  description={t("Insert \\end{\u2026} when you press Enter after \\begin{\u2026}.")}
                >
                  <Toggle
                    checked={settings.autoCloseEnvironment}
                    onChange={(value) => setSettings({ autoCloseEnvironment: value })}
                  />
                </Row>
                <Row
                  title={t("Continue lists")}
                  description={t("Start a new \\item when you press Enter in a list.")}
                >
                  <Toggle
                    checked={settings.autoItemize}
                    onChange={(value) => setSettings({ autoItemize: value })}
                  />
                </Row>
              </Section>
              <Section title={t("Layout")}>
                <Row title={t("Word wrap")} description={t("Wrap long lines to the editor width.")}>
                  <Toggle
                    checked={settings.wordWrap}
                    onChange={(value) => setSettings({ wordWrap: value })}
                  />
                </Row>
                <Row title={t("Line numbers")}>
                  <Toggle
                    checked={settings.showLineNumbers}
                    onChange={(value) => setSettings({ showLineNumbers: value })}
                  />
                </Row>
              </Section>
            </>
          )}

          {tab === "editor" && page === 1 && (
            <>
              <Section title={t("Theme")}>
                <Row title={t("Select a theme")}>
                  <select
                    value={settings.theme}
                    onChange={(event) =>
                      setSettings({ theme: event.target.value as ThemeSetting })
                    }
                  >
                    <option value="system">{t("Texpad Default (System)")}</option>
                    <option value="light">{t("Texpad Default (Light)")}</option>
                    <option value="dark">{t("Texpad Default (Dark)")}</option>
                  </select>
                </Row>
              </Section>
              <Section title={t("Font")}>
                <Row title={t("Current font")}>
                  <span className="settings-value">
                    {fontLabel} ({settings.fontSize} {t("pt")})
                  </span>
                </Row>
                <Row title={t("Select a new font")}>
                  <div className="settings-stack">
                    <select
                      value={settings.editorFont}
                      onChange={(event) => setSettings({ editorFont: event.target.value })}
                    >
                      {EDITOR_FONTS.map(([value, label]) => (
                        <option key={label} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={settings.fontSize}
                      onChange={(event) =>
                        setSettings({ fontSize: Number(event.target.value) })
                      }
                    >
                      {[...new Set([11, 12, 13, 14, 15, 16, 17, 18, 20, settings.fontSize])]
                        .sort((a, b) => a - b)
                        .map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                </Row>
              </Section>
              <Section title={t("Preview")}>
                <EditorPreview font={settings.editorFont} size={settings.fontSize} />
              </Section>
            </>
          )}

          {tab === "viewer" && (
            <>
              <Section title={t("Dark Mode")}>
                <Row
                  title={t("Dark PDF")}
                  description={t("Grade the PDF for comfortable night reading.")}
                >
                  <Toggle
                    checked={settings.pdfDarkMode}
                    onChange={(value) => setSettings({ pdfDarkMode: value })}
                  />
                </Row>
                <Row title={t("Grading")} description={t("What to grade when dark PDF is enabled.")}>
                  <select
                    value={settings.pdfGrading}
                    onChange={(event) =>
                      setSettings({
                        pdfGrading: event.target.value as "all" | "no-images" | "off",
                      })
                    }
                    disabled={!settings.pdfDarkMode}
                  >
                    <option value="all">{t("Entire viewer output")}</option>
                    <option value="no-images">{t("Everything apart from images")}</option>
                    <option value="off">{t("No grading")}</option>
                  </select>
                </Row>
              </Section>
              <Section title={t("Syncing")}>
                <Row
                  title={t("Scroll lock")}
                  description={t("Keep the editor and PDF scrolling together.")}
                >
                  <Toggle
                    checked={settings.scrollLock}
                    onChange={(value) => setSettings({ scrollLock: value })}
                  />
                </Row>
              </Section>
            </>
          )}

          {tab === "typesetting" && page === 0 && (
            <>
              <Section title={t("Typesetter")}>
                <Row title={t("Engine")} description={t(engine.hint)}>
                  <select
                    value={settings.engine}
                    onChange={(event) => setSettings({ engine: event.target.value as Engine })}
                  >
                    {ENGINES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {t(item.label)}
                      </option>
                    ))}
                  </select>
                </Row>
              </Section>
              <Section title={t("Live Typesetting")}>
                <Row
                  title={t("Live typesetting")}
                  description={t("Typeset automatically after you stop typing.")}
                >
                  <Toggle
                    checked={settings.autoTypeset}
                    onChange={(value) => setSettings({ autoTypeset: value })}
                  />
                </Row>
                <Row title={t("Live delay")} description={t("How long to wait after the last keystroke.")}>
                  <select
                    value={settings.autoTypesetDelay}
                    onChange={(event) =>
                      setSettings({ autoTypesetDelay: Number(event.target.value) })
                    }
                    disabled={!settings.autoTypeset}
                  >
                    <option value={400}>{t("0.4 seconds")}</option>
                    <option value={700}>{t("0.7 seconds")}</option>
                    <option value={900}>{t("0.9 seconds")}</option>
                    <option value={1200}>{t("1.2 seconds")}</option>
                    <option value={2000}>{t("2 seconds")}</option>
                  </select>
                </Row>
              </Section>
            </>
          )}

          {tab === "typesetting" && page === 1 && (
            <>
              <Section title={t("Status")}>
                <Row title={t("TeX installation")} description={engineStatusDescription}>
                  <div className="settings-engine-actions">
                    <button
                      className="settings-inline-button"
                      onClick={() => void refreshEngineStatus()}
                    >
                      {t("Check")}
                    </button>
                    {(!engineStatus || !engineStatus.tectonic) && (
                      <button
                        className="settings-inline-button"
                        onClick={() => {
                          setOpen(false);
                          setTexSetupOpen(true);
                        }}
                      >
                        {t("Install Tectonic")}
                      </button>
                    )}
                  </div>
                </Row>
              </Section>
              <Section title={t("Options")}>
                <Row
                  title={t("Shell escape")}
                  description={t("Allow packages such as minted to run external tools.")}
                >
                  <Toggle
                    checked={settings.shellEscape}
                    onChange={(value) => setSettings({ shellEscape: value })}
                  />
                </Row>
                <Row
                  title={t("Custom build command")}
                  description={t("Runs instead of the engine. Leave empty for the normal build.")}
                >
                  <input
                    className="settings-text-input"
                    value={settings.customBuildCommand}
                    onChange={(event) =>
                      setSettings({ customBuildCommand: event.target.value })
                    }
                    placeholder={t("e.g. latexmk -pdf main.tex")}
                    spellCheck={false}
                  />
                </Row>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
