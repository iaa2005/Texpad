import SfIcon from "../SfIcon";
import { openExternal } from "../../lib/tauri";
import { relativePath, stem } from "../../lib/path";
import { useAppStore } from "../../store/useAppStore";
import type { ProjectFile } from "../../types";
import { t } from "../../i18n";

function FileKindIcon({ kind }: { kind: ProjectFile["kind"] }) {
  switch (kind) {
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

export default function ProjectFilesView() {
  const projectFiles = useAppStore((state) => state.projectFiles);
  const rootDir = useAppStore((state) => state.rootDir);
  const jumpTo = useAppStore((state) => state.jumpTo);
  const insertIntoEditor = useAppStore((state) => state.insertIntoEditor);
  const notify = useAppStore((state) => state.notify);

  const openProjectFile = async (file: ProjectFile) => {
    if (!file.exists) {
      notify(t("File not found: {path}", { path: file.path }), "error");
      return;
    }
    try {
      if (file.kind === "image") {
        await openExternal(file.path);
      } else {
        await jumpTo(file.path, 1);
      }
    } catch (error) {
      notify(String(error), "error");
    }
  };

  const insertFile = (file: ProjectFile) => {
    if (!rootDir) return;
    const relative = relativePath(rootDir, file.path).replace(/\\/g, "/");
    const text =
      file.kind === "image"
        ? `\\includegraphics{${relative}}`
        : file.kind === "bib"
          ? `\\bibliography{${relative.replace(/\.bib$/i, "")}}`
          : file.kind === "style"
            ? `\\usepackage{${stem(file.path)}}`
            : `\\input{${relative}}`;
    insertIntoEditor(text);
  };

  return (
    <div className="files-panel">
      <div className="files-header">
        <span>{t("Project Files")}</span>
        <span className="files-count">{projectFiles.length}</span>
      </div>
      <div className="files-scroll">
        {projectFiles.map((file) => (
          <button
            key={file.path}
            className={`project-file-row${file.exists ? "" : " is-missing"}`}
            title={file.path}
            draggable={file.kind === "tex" || file.kind === "image" || file.kind === "bib"}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/x-texpad-file", file.path);
              event.dataTransfer.setData("text/plain", file.path);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => void openProjectFile(file)}
          >
            <span className={`project-file-icon kind-${file.kind}`}>
              <FileKindIcon kind={file.kind} />
            </span>
            <span className="project-file-text">
              <span className="project-file-name">{file.name}</span>
              <span className="project-file-path">{file.relative}</span>
            </span>
            {file.root && <span className="root-badge">{t("root")}</span>}
            {!file.exists && <SfIcon name="exclamationmark.triangle" size={13} className="missing-icon" />}
            {file.exists && (
              <span
                className="file-insert-button"
                role="button"
                title={t("Insert into editor")}
                onClick={(event) => {
                  event.stopPropagation();
                  insertFile(file);
                }}
              >
                <SfIcon name="plus" size={12} />
              </span>
            )}
          </button>
        ))}
        {!projectFiles.length && (
          <div className="files-empty">{t("No files in this project yet")}</div>
        )}
      </div>
    </div>
  );
}
