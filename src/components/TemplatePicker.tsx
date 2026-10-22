import { useEffect, useState } from "react";
import { revealPath } from "../lib/tauri";
import SfIcon from "./SfIcon";
import { BUILTIN_TEMPLATES } from "../lib/templates";
import { listUserTemplates, templatesDir, type UserTemplate } from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";
import { t } from "../i18n";

export default function TemplatePicker() {
  const open = useAppStore((state) => state.showTemplates);
  const setOpen = useAppStore((state) => state.setShowTemplates);
  const newDocument = useAppStore((state) => state.newDocument);
  const newDocumentFromContent = useAppStore(
    (state) => state.newDocumentFromContent,
  );
  const notify = useAppStore((state) => state.notify);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void listUserTemplates()
      .then(setUserTemplates)
      .catch((error) => notify(String(error), "error"))
      .finally(() => setLoading(false));
  }, [open, notify]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  const chooseBuiltIn = (id: string) => {
    setOpen(false);
    void newDocument(id);
  };

  const chooseUser = (template: UserTemplate) => {
    setOpen(false);
    void newDocumentFromContent(template.content);
  };

  const openFolder = async () => {
    try {
      const dir = await templatesDir();
      await revealPath(dir);
    } catch (error) {
      notify(String(error), "error");
    }
  };

  return (
    <div
      className="settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="template-modal" role="dialog" aria-label={t("New from template")}>
        <div className="settings-header">
          <div>
            <h2>{t("New from Template")}</h2>
            <span>{t("Start with a structure instead of a blank page.")}</span>
          </div>
          <button className="settings-close" onClick={() => setOpen(false)} title={t("Close")}>
            <SfIcon name="xmark" size={16} />
          </button>
        </div>

        <div className="template-grid">
          {BUILTIN_TEMPLATES.map((template) => (
            <button
              key={template.id}
              className="template-card"
              onClick={() => chooseBuiltIn(template.id)}
            >
              <span className="template-card-icon">
                <SfIcon name="document.badge.plus" size={22} />
              </span>
              <span className="template-card-name">{t(template.name)}</span>
              <span className="template-card-description">{t(template.description)}</span>
            </button>
          ))}

          {userTemplates.map((template) => (
            <button
              key={`user:${template.name}`}
              className="template-card"
              onClick={() => chooseUser(template)}
            >
              <span className="template-card-icon">
                <SfIcon name="document" size={22} />
              </span>
              <span className="template-card-name">{template.name}</span>
              <span className="template-card-description">{t("User template")}</span>
            </button>
          ))}

          {loading && (
            <div className="template-loading">
              <SfIcon name="arrow.clockwise" size={18} className="spin" />
              <span>{t("Loading templates…")}</span>
            </div>
          )}
        </div>

        <div className="settings-footer">
          <span>{t("Custom templates are .tex or .md files in the Templates folder.")}</span>
          <button className="template-folder-button" onClick={() => void openFolder()}>
            <SfIcon name="folder" size={13} />
            {t("Open Templates Folder")}
          </button>
        </div>
      </div>
    </div>
  );
}
