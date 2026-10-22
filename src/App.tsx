import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import Workspace from "./components/Workspace";
import Welcome from "./components/Welcome";
import SettingsModal from "./components/SettingsModal";
import TemplatePicker from "./components/TemplatePicker";
import TexSetupModal from "./components/TexSetupModal";
import Toast from "./components/Toast";
import TabBar from "./components/TabBar";
import { useAppStore } from "./store/useAppStore";
import { resolveLanguage, setLanguage } from "./i18n";

export default function App() {
  const hydrated = useAppStore((state) => state.hydrated);
  const hydrate = useAppStore((state) => state.hydrate);
  const rootFile = useAppStore((state) => state.rootFile);
  const activePath = useAppStore((state) => state.activePath);
  const files = useAppStore((state) => state.files);
  const loading = useAppStore((state) => state.loading);
  const theme = useAppStore((state) => state.settings.theme);
  const languageSetting = useAppStore((state) => state.settings.language);
  const language = resolveLanguage(languageSetting);
  // Set before rendering children so every t() call below uses it; the
  // shell is keyed by language, so switching languages re-renders all text.
  setLanguage(language);
  const cursor = useAppStore((state) => state.cursor);

  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  const resolvedDark =
    theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedDark ? "dark" : "light";
    document.documentElement.style.colorScheme = resolvedDark ? "dark" : "light";
  }, [resolvedDark]);

  useEffect(() => {
    if (!hydrated) return;
    const active = files.find((file) => file.path === activePath);
    document.title = active
      ? `${active.dirty ? "• " : ""}${active.name} — Texpad`
      : "Texpad";
  }, [activePath, files, hydrated]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.repeat) return;
      const store = useAppStore.getState();
      const key = event.key.toLowerCase();

      const switchTab = (delta: number) => {
        const { files, activePath } = store;
        if (files.length < 2 || !activePath) return;
        const index = files.findIndex((file) => file.path === activePath);
        if (index < 0) return;
        const next = files[(index + delta + files.length) % files.length];
        store.setActiveFile(next.path);
      };

      if (event.shiftKey && key === "f") {
        event.preventDefault();
        store.focusSearch("text");
      } else if (event.shiftKey && key === "o") {
        event.preventDefault();
        store.focusSearch("tag");
      } else if (event.shiftKey && key === "l") {
        event.preventDefault();
        store.setSettings({ autoTypeset: !store.settings.autoTypeset });
      } else if (event.shiftKey && key === "t") {
        event.preventDefault();
        if (store.rootFile) void store.openFileDialog();
      } else if (event.code === "BracketLeft" && event.shiftKey) {
        event.preventDefault();
        switchTab(-1);
      } else if (event.code === "BracketRight" && event.shiftKey) {
        event.preventDefault();
        switchTab(1);
      } else if (key === "o") {
        event.preventDefault();
        void store.openProjectDialog();
      } else if (key === "n") {
        event.preventDefault();
        void store.newDocument();
      } else if (key === "s" && event.shiftKey) {
        event.preventDefault();
        if (store.rootFile) void store.saveAll(false);
      } else if (key === "s") {
        event.preventDefault();
        if (store.activePath) void store.saveFile(store.activePath);
      } else if (key === "d" && event.shiftKey) {
        event.preventDefault();
        if (store.rootFile) void store.savePdfAs();
      } else if (key === "enter" || key === "t" || key === "r") {
        event.preventDefault();
        if (store.rootFile) void store.runTypeset(true);
      } else if (key === "w" && event.shiftKey) {
        event.preventDefault();
        if (store.rootFile) {
          void store.saveAll(true).then(() => store.closeProject());
        }
      } else if (key === "w") {
        event.preventDefault();
        if (store.activePath) void store.closeFile(store.activePath);
      } else if (key === "8" && store.rootFile) {
        event.preventDefault();
        store.focusIssues("issues");
      } else if (key === "9" && store.rootFile) {
        event.preventDefault();
        store.focusIssues("log");
      } else if (key === "d" && store.rootFile) {
        event.preventDefault();
        store.requestForwardSync();
      } else if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("texpad:pdf-zoom", { detail: 1 }),
        );
      } else if (event.key === "-") {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("texpad:pdf-zoom", { detail: -1 }),
        );
      } else if (event.key === "0") {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("texpad:pdf-zoom", { detail: 0 }),
        );
      } else if (key === ",") {
        event.preventDefault();
        store.setShowSettings(true);
      } else if (key === "b" || key === "1") {
        if (!store.rootFile) return;
        event.preventDefault();
        store.setSidebarVisible(!store.sidebarVisible);
      } else if (key === "2" && store.rootFile) {
        event.preventDefault();
        store.setViewMode("editor");
      } else if (key === "3" && store.rootFile) {
        event.preventDefault();
        store.setViewMode("split");
      } else if (key === "4" && store.rootFile) {
        event.preventDefault();
        store.setViewMode("pdf");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!rootFile) return;
    const interval = window.setInterval(() => {
      void useAppStore.getState().checkExternalChanges();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [rootFile]);

  useEffect(() => {
    if (!hydrated) return;
    if (!rootFile) {
      try {
        localStorage.removeItem("texpad.session.v1");
      } catch {
        // ignore
      }
      return;
    }
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(
          "texpad.session.v1",
          JSON.stringify({
            rootFile,
            files: files.map((file) => file.path),
            activePath,
            cursor,
          }),
        );
      } catch {
        // ignore quota errors
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [hydrated, rootFile, files, activePath, cursor]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        const store = useAppStore.getState();
        if (!store.files.some((file) => file.dirty)) return;
        event.preventDefault();
        void store.saveAll(true).then(() => getCurrentWindow().destroy());
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

  return (
    <div className="app-shell" key={language}>
      <TitleBar />
      {loading && <div className="app-loading-bar" />}
      {rootFile ? (
        <>
          <TabBar />
          <div className="app-body">
            <Sidebar />
            <Workspace dark={resolvedDark} />
          </div>
        </>
      ) : (
        <Welcome />
      )}
      <SettingsModal />
      <TemplatePicker />
      <TexSetupModal />
      <Toast />
    </div>
  );
}
