import { invoke } from "@tauri-apps/api/core";
import type { CompileResult, TexEngineStatus } from "../types";

export interface PathInfo {
  exists: boolean;
  isFile: boolean;
  isDir: boolean;
  size: number;
  modifiedMs: number | null;
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export interface SyncTexHit {
  page: number | null;
  x: number | null;
  y: number | null;
  file: string | null;
  line: number | null;
  column: number | null;
  raw: string;
}

export function readTextFile(path: string, encoding?: string): Promise<string> {
  return invoke<string>("read_text_file", { path, encoding });
}

export function writeTextFile(
  path: string,
  content: string,
  encoding?: string,
): Promise<void> {
  return invoke<void>("write_text_file", { path, content, encoding });
}

export function readBinaryFile(path: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("read_binary_file", { path });
}

export function pathInfo(path: string): Promise<PathInfo> {
  return invoke<PathInfo>("path_info", { path });
}

export function listDirectory(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_directory", { path });
}

export function texEngineStatus(): Promise<TexEngineStatus> {
  return invoke<TexEngineStatus>("tex_engine_status");
}

export function installTectonic(): Promise<TexEngineStatus> {
  return invoke<TexEngineStatus>("install_tectonic");
}

export function openUrl(url: string): Promise<void> {
  return invoke<void>("open_url", { url });
}

export interface CompileOptions {
  engine: string;
  enginePath?: string;
  shellEscape: boolean;
  extraArgs?: string[];
  maxPasses?: number;
  customCommand?: string;
}

export function compileProject(
  rootFile: string,
  options: CompileOptions,
): Promise<CompileResult> {
  return invoke<CompileResult>("compile_project", {
    rootFile,
    engine: options.engine,
    enginePath: options.enginePath ?? null,
    shellEscape: options.shellEscape,
    extraArgs: options.extraArgs ?? null,
    maxPasses: options.maxPasses ?? 3,
    customCommand: options.customCommand ?? null,
  });
}

export function synctexView(
  pdf: string,
  file: string,
  line: number,
  column: number,
): Promise<SyncTexHit> {
  return invoke<SyncTexHit>("synctex_view", { pdf, file, line, column });
}

export function synctexEdit(
  pdf: string,
  page: number,
  x: number,
  y: number,
): Promise<SyncTexHit> {
  return invoke<SyncTexHit>("synctex_edit", { pdf, page, x, y });
}

export function cancelTypeset(): Promise<void> {
  return invoke<void>("cancel_typeset");
}

export function cleanBuild(rootFile: string): Promise<void> {
  return invoke<void>("clean_build", { rootFile });
}

export function printPdf(path: string): Promise<void> {
  return invoke<void>("print_pdf", { path });
}

export function backupDocument(path: string, content: string): Promise<void> {
  return invoke<void>("backup_document", { path, content });
}

export function editorArchiveDir(): Promise<string> {
  return invoke<string>("editor_archive_dir");
}

export function copyFile(source: string, destination: string): Promise<void> {
  return invoke<void>("copy_file", { source, destination });
}

/** Unpacks a project ZIP (e.g. from Overleaf) and returns its root .tex. */
export function importProjectZip(zipPath: string): Promise<string> {
  return invoke<string>("import_project_zip", { zipPath });
}

export function exportProjectZip(
  rootFile: string,
  destination: string,
): Promise<void> {
  return invoke<void>("export_project_zip", { rootFile, destination });
}

export function exportProjectFolder(
  rootFile: string,
  destination: string,
): Promise<string> {
  return invoke<string>("export_project_folder", { rootFile, destination });
}

export function printFile(path: string): Promise<void> {
  return invoke<void>("print_file", { path });
}

export function emailFile(path: string, subject: string): Promise<void> {
  return invoke<void>("email_file", { path, subject });
}

export function emailProjectZip(
  rootFile: string,
  subject: string,
): Promise<void> {
  return invoke<void>("email_project_zip", { rootFile, subject });
}

export function openExternal(path: string): Promise<void> {
  return invoke<void>("open_external", { path });
}

export function revealPath(path: string): Promise<void> {
  return invoke<void>("reveal_path", { path });
}

export interface UserTemplate {
  name: string;
  content: string;
}

export interface UserSnippet {
  name: string;
  content: string;
}

export interface UserConfig {
  autocomplete: string;
  snippets: UserSnippet[];
}

export function templatesDir(): Promise<string> {
  return invoke<string>("templates_dir");
}

export function listUserTemplates(): Promise<UserTemplate[]> {
  return invoke<UserTemplate[]>("list_user_templates");
}

export function userConfigDir(): Promise<string> {
  return invoke<string>("user_config_dir");
}

export function loadUserConfig(): Promise<UserConfig> {
  return invoke<UserConfig>("load_user_config");
}
