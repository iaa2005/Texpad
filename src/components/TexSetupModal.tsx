import { useEffect, useState } from "react";
import SfIcon from "./SfIcon";
import { openUrl } from "../lib/tauri";
import { engineLabel, useAppStore } from "../store/useAppStore";
import type { Engine } from "../types";
import { t } from "../i18n";

const TECTONIC_URL = "https://tectonic-typesetting.github.io/";
const TEXLIVE_URL = "https://tug.org/texlive/windows.html";

function EngineRow({
  name,
  found,
  detail,
}: {
  name: string;
  found: boolean | null;
  detail?: string;
}) {
  return (
    <div className={`tex-setup-engine${found ? " is-found" : ""}`}>
      <span className="tex-setup-engine-icon">
        {found === null ? (
          <SfIcon name="hourglass" size={14} />
        ) : found ? (
          <SfIcon name="checkmark.circle" size={15} />
        ) : (
          <SfIcon name="xmark.circle" size={15} />
        )}
      </span>
      <span className="tex-setup-engine-name">{name}</span>
      <span className="tex-setup-engine-state">
        {found === null ? t("Checking…") : found ? t("Found") : t("Not found")}
      </span>
      {detail && (
        <span className="tex-setup-engine-path" title={detail}>
          {detail}
        </span>
      )}
    </div>
  );
}

export default function TexSetupModal() {
  const open = useAppStore((state) => state.texSetupOpen);
  const setOpen = useAppStore((state) => state.setTexSetupOpen);
  const engineStatus = useAppStore((state) => state.engineStatus);
  const refreshEngineStatus = useAppStore(
    (state) => state.refreshEngineStatus,
  );
  const installTectonic = useAppStore((state) => state.installTectonic);
  const runTypeset = useAppStore((state) => state.runTypeset);
  const setSettings = useAppStore((state) => state.setSettings);
  const notify = useAppStore((state) => state.notify);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void refreshEngineStatus();
  }, [open, refreshEngineStatus]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !installing) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, installing, setOpen]);

  if (!open) return null;

  const tectonic = engineStatus?.tectonic ?? null;
  const checking = engineStatus === null;
  const availableEngine: Engine | null = engineStatus
    ? engineStatus.pdflatex
      ? "pdflatex"
      : engineStatus.xelatex
        ? "xelatex"
        : engineStatus.lualatex
          ? "lualatex"
          : engineStatus.latexmk
            ? "latexmk"
            : null
    : null;

  const useInstalledEngine = () => {
    if (!availableEngine) return;
    setSettings({ engine: availableEngine });
    setOpen(false);
    void runTypeset(true);
  };

  const useTectonic = () => {
    setSettings({ engine: "tectonic" });
    setOpen(false);
    void runTypeset(true);
  };

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      await installTectonic();
      if (useAppStore.getState().rootFile) {
        void runTypeset(true);
      }
    } catch (installError) {
      setError(
        installError instanceof Error
          ? installError.message
          : String(installError),
      );
    } finally {
      setInstalling(false);
    }
  };

  const checkAgain = async () => {
    const status = await refreshEngineStatus();
    if (!status) {
      notify(t("Could not check the installed TeX engines."), "error");
      return;
    }
    if (status.pdflatex || status.xelatex || status.lualatex || status.latexmk) {
      notify(t("TeX engines found. You can typeset now."), "success");
      setOpen(false);
    } else if (status.tectonic) {
      notify(t("Tectonic is installed and ready."), "success");
    } else {
      notify(t("Still no TeX engine found."), "info");
    }
  };

  return (
    <div
      className="settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !installing) setOpen(false);
      }}
    >
      <div className="tex-setup-modal" role="dialog" aria-label={t("Install a typesetter")}>
        <div className="tex-setup-header">
          <div className="tex-setup-heading">
            <span className="tex-setup-icon">
              <SfIcon name="square.and.arrow.down" size={24} />
            </span>
            <div>
              <h2>{t("Install a typesetter")}</h2>
              <span>
                {t("Texpad needs a TeX engine on this computer to produce PDFs.")}
              </span>
            </div>
          </div>
          <button
            className="settings-close"
            onClick={() => setOpen(false)}
            title={t("Close")}
            disabled={installing}
          >
            <SfIcon name="xmark" size={16} />
          </button>
        </div>

        <div className="tex-setup-body">
          <div className="tex-setup-engines">
            <EngineRow
              name="pdfLaTeX"
              found={checking ? null : Boolean(engineStatus?.pdflatex)}
              detail={engineStatus?.pdflatex ?? undefined}
            />
            <EngineRow
              name="XeLaTeX"
              found={checking ? null : Boolean(engineStatus?.xelatex)}
              detail={engineStatus?.xelatex ?? undefined}
            />
            <EngineRow
              name="LuaLaTeX"
              found={checking ? null : Boolean(engineStatus?.lualatex)}
              detail={engineStatus?.lualatex ?? undefined}
            />
            <EngineRow
              name="Tectonic"
              found={checking ? null : Boolean(tectonic)}
              detail={tectonic ?? undefined}
            />
          </div>

          <div className={`tex-setup-card${tectonic ? " is-installed" : ""}`}>
            <div className="tex-setup-card-heading">
              <div>
                <strong>{t("Tectonic")}</strong>
                <span>{t("Self-contained typesetter · no TeX Live required")}</span>
              </div>
              <span className="tex-setup-badge">
                {tectonic ? t("Installed") : t("Recommended")}
              </span>
            </div>
            <p>
              {t("Tectonic is a modern engine that runs pdfLaTeX-compatible documents and downloads only the packages it needs on the first run. It is a single executable, so it needs no administrator rights.")}
            </p>
            <p className="tex-setup-note">
              {tectonic
                ? t("Tectonic is available on this computer and can be used for this project.")
                : t("The official Windows build (about 25 MB) is downloaded from the Tectonic GitHub releases page.")}
            </p>
          </div>

          {error && (
            <div className="tex-setup-error">
              <SfIcon name="exclamationmark.triangle" size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="tex-setup-footer">
          <div className="tex-setup-links">
            <button onClick={() => void openUrl(TECTONIC_URL)}>
              {t("Tectonic website")}
            </button>
            <span>·</span>
            <button onClick={() => void openUrl(TEXLIVE_URL)}>
              {t("Install TeX Live instead")}
            </button>
          </div>
          <div className="tex-setup-actions">
            {availableEngine && (
              <button
                className="settings-inline-button"
                onClick={useInstalledEngine}
                disabled={installing}
              >
                {t("Use {engine}", { engine: engineLabel(availableEngine) })}
              </button>
            )}
            <button
              className="settings-inline-button"
              onClick={() => void checkAgain()}
              disabled={installing}
            >
              {t("Check again")}
            </button>
            {tectonic ? (
              <button className="tex-setup-primary" onClick={useTectonic}>
                {t("Use Tectonic")}
              </button>
            ) : (
              <button
                className="tex-setup-primary"
                onClick={() => void handleInstall()}
                disabled={installing}
              >
                {installing && (
                  <SfIcon name="arrow.clockwise" size={14} className="spin" />
                )}
                {installing ? t("Downloading Tectonic…") : t("Install Tectonic")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
