import { useEffect, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openExternal, revealPath } from "../../lib/tauri";
import SfIcon from "../SfIcon";
import {
  basename,
  dirname,
  fileKind,
  joinPath,
  normalizePath,
  relativePath,
  samePath,
} from "../../lib/path";
import { listDirectory, writeTextFile, type DirEntry } from "../../lib/tauri";
import { useAppStore } from "../../store/useAppStore";
import { t } from "../../i18n";

function EntryIcon({ entry }: { entry: DirEntry }) {
  if (entry.isDir) return <SfIcon name="folder" size={14} />;
  switch (fileKind(entry.path)) {
    case "tex":
      return <SfIcon name="document" size={14} />;
    case "bib":
      return <SfIcon name="book.closed" size={14} />;
    case "image":
      return <SfIcon name="photo" size={14} />;
    case "style":
      return <SfIcon name="curlybraces" size={14} />;
    default:
      return <SfIcon name="document" size={14} />;
  }
}

/** Texpad tags each entry with the role it plays in the project. */
function entryRole(
  entry: DirEntry,
  rootFile: string | null,
  projectPaths: string[],
  pdfPath: string | null,
): string | null {
  if (rootFile && samePath(entry.path, rootFile)) return "ROOT";
  if (pdfPath && samePath(entry.path, pdfPath)) return "OUTPUT";
  if (entry.isDir) {
    if (/^\.(texpad|texpadtmp)$/i.test(entry.name)) return "TEMP";
    const prefix = `${entry.path.replace(/[\\/]+$/, "")}\\`.toLowerCase();
    return projectPaths.some((path) => path.toLowerCase().startsWith(prefix))
      ? "SUB"
      : null;
  }
  if (projectPaths.some((path) => samePath(path, entry.path))) return "SUB";
  if (rootFile && entry.name.toLowerCase() === `${basename(rootFile).replace(/\.[^.]+$/, "")}.pdf`.toLowerCase()) {
    return "OUTPUT";
  }
  return null;
}

export default function FileBrowserView() {
  const rootDir = useAppStore((state) => state.rootDir);
  const rootFile = useAppStore((state) => state.rootFile);
  const projectFiles = useAppStore((state) => state.projectFiles);
  const pdfPath = useAppStore((state) => state.build.pdfPath);
  const projectPaths = projectFiles.map((file) => file.path);
  const openFile = useAppStore((state) => state.openFile);
  const jumpTo = useAppStore((state) => state.jumpTo);
  const notify = useAppStore((state) => state.notify);

  const [currentDir, setCurrentDir] = useState(rootDir ?? "");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (rootDir) setCurrentDir(rootDir);
  }, [rootDir]);

  const load = async (dir: string) => {
    if (!dir) return;
    setLoading(true);
    try {
      const result = await listDirectory(dir);
      setEntries(result);
    } catch (error) {
      notify(String(error), "error");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(currentDir);
  }, [currentDir]);

  const atRoot = !rootDir || samePath(currentDir, rootDir);
  const relative = rootDir ? relativePath(rootDir, currentDir) : "";

  const goUp = () => {
    if (!rootDir || atRoot) return;
    const next = normalizePath(dirname(currentDir));
    const rootPrefix = `${rootDir.replace(/[\\/]+$/, "")}\\`.toLowerCase();
    if (
      next.toLowerCase() === rootDir.toLowerCase() ||
      next.toLowerCase().startsWith(rootPrefix)
    ) {
      setCurrentDir(next);
    } else {
      setCurrentDir(rootDir);
    }
  };

  const openEntry = async (entry: DirEntry) => {
    if (entry.isDir) {
      setCurrentDir(entry.path);
      return;
    }
    const kind = fileKind(entry.path);
    if (kind === "tex" || kind === "bib" || kind === "style") {
      await jumpTo(entry.path, 1);
    } else {
      try {
        await openExternal(entry.path);
      } catch (error) {
        notify(String(error), "error");
      }
    }
  };

  const createFile = async () => {
    try {
      const selected = await saveDialog({
        title: t("New file"),
        defaultPath: joinPath(currentDir, "untitled.tex"),
        filters: [
          { name: t("LaTeX document"), extensions: ["tex"] },
          { name: t("All files"), extensions: ["*"] },
        ],
      });
      if (typeof selected !== "string") return;
      await writeTextFile(selected, "");
      await load(currentDir);
      await openFile(selected);
    } catch (error) {
      notify(String(error), "error");
    }
  };

  return (
    <div className="browser-panel">
      <div className="browser-toolbar">
        <button
          className="pane-header-button"
          title={t("Parent folder")}
          disabled={atRoot}
          onClick={goUp}
        >
          <SfIcon name="arrow.up" size={14} />
        </button>
        <button
          className="pane-header-button"
          title={t("Refresh")}
          onClick={() => void load(currentDir)}
        >
          <SfIcon name="arrow.clockwise" size={13} />
        </button>
        <span className="browser-path" title={currentDir}>
          {relative || basename(currentDir) || t("Project")}
        </span>
        <button
          className="pane-header-button"
          title={t("New file")}
          onClick={() => void createFile()}
        >
          <SfIcon name="plus.square" size={14} />
        </button>
        <button
          className="pane-header-button"
          title={t("Show in Explorer")}
          onClick={() => void revealPath(currentDir)}
        >
          <SfIcon name="folder" size={14} />
        </button>
      </div>

      <div className="browser-list">
        {loading && (
          <div className="browser-empty">
            <SfIcon name="arrow.clockwise" size={17} className="spin" />
            <span>{t("Loading…")}</span>
          </div>
        )}
        {!loading &&
          entries.map((entry) => (
            <button
              key={entry.path}
              className="browser-row"
              title={entry.path}
              draggable={!entry.isDir && ["tex", "bib", "image"].includes(fileKind(entry.path))}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/x-texpad-file", entry.path);
                event.dataTransfer.setData("text/plain", entry.path);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => void openEntry(entry)}
            >
              <span
                className={`browser-icon${entry.isDir ? " is-dir" : ` kind-${fileKind(entry.path)}`}`}
              >
                <EntryIcon entry={entry} />
              </span>
              <span className="browser-name">{entry.name}</span>
              {(() => {
                const role = entryRole(entry, rootFile, projectPaths, pdfPath);
                return role ? <span className="browser-role">{role}</span> : null;
              })()}
            </button>
          ))}
        {!loading && !entries.length && (
          <div className="browser-empty">
            <SfIcon name="folder" size={20} />
            <span>{t("This folder is empty.")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
