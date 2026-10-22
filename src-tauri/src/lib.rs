use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::ipc::Response;

static CURRENT_PID: AtomicU32 = AtomicU32::new(0);
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CompileResult {
    success: bool,
    log: String,
    pdf_path: Option<String>,
    synctex_path: Option<String>,
    log_path: Option<String>,
    duration_ms: u64,
    exit_code: Option<i32>,
    passes: u32,
    engine: String,
    tools: Vec<String>,
    cancelled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PathInfo {
    exists: bool,
    is_file: bool,
    is_dir: bool,
    size: u64,
    modified_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntryInfo {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct TexEngineStatus {
    pdflatex: Option<String>,
    xelatex: Option<String>,
    lualatex: Option<String>,
    latexmk: Option<String>,
    tectonic: Option<String>,
    tectonic_managed: bool,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncTexHit {
    page: Option<u32>,
    x: Option<f64>,
    y: Option<f64>,
    file: Option<String>,
    line: Option<u32>,
    column: Option<u32>,
    raw: String,
}

fn resolve_encoding(label: Option<&str>) -> &'static encoding_rs::Encoding {
    label
        .and_then(|value| encoding_rs::Encoding::for_label(value.as_bytes()))
        .unwrap_or(encoding_rs::UTF_8)
}

#[tauri::command]
fn read_text_file(path: String, encoding: Option<String>) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Cannot read {}: {e}", path))?;
    let encoding = resolve_encoding(encoding.as_deref());
    let (text, _, _) = encoding.decode(&bytes);
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_string())
}

#[tauri::command]
fn write_text_file(
    path: String,
    content: String,
    encoding: Option<String>,
) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }
    let encoding = resolve_encoding(encoding.as_deref());
    let (bytes, _, had_errors) = encoding.encode(&content);
    if had_errors {
        return Err(format!(
            "The selected encoding ({}) cannot represent every character in {path}.",
            encoding.name()
        ));
    }
    fs::write(&path, &*bytes).map_err(|e| format!("Cannot write {}: {e}", path))
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Response, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Cannot read {}: {e}", path))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
fn path_info(path: String) -> PathInfo {
    match fs::metadata(&path) {
        Ok(m) => PathInfo {
            exists: true,
            is_file: m.is_file(),
            is_dir: m.is_dir(),
            size: m.len(),
            modified_ms: m.modified().ok().and_then(|t| {
                t.duration_since(UNIX_EPOCH)
                    .ok()
                    .map(|d| d.as_millis() as u64)
            }),
        },
        Err(_) => PathInfo {
            exists: false,
            is_file: false,
            is_dir: false,
            size: 0,
            modified_ms: None,
        },
    }
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let mut out = Vec::new();
    let rd = fs::read_dir(&path).map_err(|e| format!("Cannot list {}: {e}", path))?;
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".texpad" {
            continue;
        }
        let p = entry.path();
        let meta = entry.metadata().ok();
        out.push(DirEntryInfo {
            name,
            path: p.to_string_lossy().to_string(),
            is_dir: meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
            size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
        });
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

fn needs_rerun(output: &str) -> bool {
    [
        "Rerun to get",
        "Rerun LaTeX",
        "Label(s) may have changed",
        "There were undefined references",
        "Please rerun LaTeX",
        "Please (re)run BibTeX",
        "Please (re)run Biber",
    ]
    .iter()
    .any(|hint| output.contains(hint))
}

fn run_aux_tool(
    program: &str,
    args: &[String],
    cwd: &Path,
    envs: &[(&str, String)],
) -> Result<std::process::Output, String> {
    let mut cmd = Command::new(program);
    cmd.args(args).current_dir(cwd);
    for (key, value) in envs {
        cmd.env(key, value);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd.output()
        .map_err(|e| format!("Could not start {program}: {e}"))
}

fn append_tool_log(
    log: &mut String,
    name: &str,
    result: Result<std::process::Output, String>,
) {
    log.push_str(&format!("===== {name} =====\n"));
    match result {
        Ok(output) => {
            log.push_str(&String::from_utf8_lossy(&output.stdout));
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.trim().is_empty() {
                log.push_str("\n[stderr]\n");
                log.push_str(&stderr);
            }
        }
        Err(error) => {
            log.push_str("[error] ");
            log.push_str(&error);
            log.push('\n');
        }
    }
    log.push('\n');
}

fn find_in_directory(dir: &Path, name: &str) -> Option<PathBuf> {
    let direct = dir.join(name);
    if direct.is_file() {
        return Some(direct);
    }
    for extension in [".exe", ".cmd", ".bat", ".com"] {
        let candidate = dir.join(format!("{name}{extension}"));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn find_executable(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        if let Some(found) = find_in_directory(&dir, name) {
            return Some(found);
        }
    }
    None
}

fn managed_tectonic_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    let exe = app
        .path()
        .app_data_dir()
        .ok()?
        .join("tools")
        .join("tectonic")
        .join("tectonic.exe");
    exe.is_file().then_some(exe)
}

fn find_tectonic(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Some(managed) = managed_tectonic_path(app) {
        return Some(managed);
    }
    if let Some(found) = find_executable("tectonic") {
        return Some(found);
    }

    let mut candidates = Vec::new();
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let local = PathBuf::from(local);
        candidates.push(
            local
                .join("Microsoft")
                .join("WinGet")
                .join("Links")
                .join("tectonic.exe"),
        );
        candidates.push(local.join("Programs").join("Tectonic").join("tectonic.exe"));
        candidates.push(local.join("Tectonic").join("tectonic.exe"));
    }
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        candidates.push(
            PathBuf::from(profile)
                .join(".cargo")
                .join("bin")
                .join("tectonic.exe"),
        );
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

fn collect_engine_status(app: &tauri::AppHandle) -> TexEngineStatus {
    TexEngineStatus {
        pdflatex: find_executable("pdflatex").map(path_string),
        xelatex: find_executable("xelatex").map(path_string),
        lualatex: find_executable("lualatex").map(path_string),
        latexmk: find_executable("latexmk").map(path_string),
        tectonic: find_tectonic(app).map(path_string),
        tectonic_managed: managed_tectonic_path(app).is_some(),
    }
}

#[tauri::command]
fn tex_engine_status(app: tauri::AppHandle) -> TexEngineStatus {
    collect_engine_status(&app)
}

fn find_file_recursive(dir: &Path, name: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_file_recursive(&path, name) {
                return Some(found);
            }
        } else if path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(name))
        {
            return Some(path);
        }
    }
    None
}

fn install_tectonic_impl(app: &tauri::AppHandle) -> Result<TexEngineStatus, String> {
    use tauri::Manager;

    let install_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data directory: {e}"))?
        .join("tools")
        .join("tectonic");
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let temp_dir = std::env::temp_dir().join(format!("texpad-tectonic-{stamp}"));
    let zip_path = temp_dir.join("tectonic.zip");
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Cannot create temporary directory: {e}"))?;

    #[cfg(windows)]
    {
        // Tectonic ships a single self-contained executable. Download the
        // official Windows build from its GitHub releases so no TeX Live or
        // administrator rights are required.
        let script = r#"
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$headers = @{ 'User-Agent' = 'Texpad-for-Windows' }
$url = $null
try {
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/tectonic-typesetting/tectonic/releases/latest' -Headers $headers
  $asset = $release.assets | Where-Object { $_.name -like '*x86_64-pc-windows-msvc.zip' } | Select-Object -First 1
  if ($asset) { $url = $asset.browser_download_url }
} catch { }
if (-not $url) {
  $url = 'https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-x86_64-pc-windows-msvc.zip'
}
Invoke-WebRequest -Uri $url -OutFile $env:TEXPAD_TECTONIC_ZIP -UseBasicParsing
Expand-Archive -LiteralPath $env:TEXPAD_TECTONIC_ZIP -DestinationPath $env:TEXPAD_TECTONIC_TMP -Force
"#;
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .env("TEXPAD_TECTONIC_ZIP", &zip_path)
        .env("TEXPAD_TECTONIC_TMP", &temp_dir)
        .creation_flags(0x0800_0000);
        let output = cmd
            .output()
            .map_err(|e| format!("Could not start the Tectonic installer: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let detail = if stderr.trim().is_empty() { stdout } else { stderr };
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!(
                "Tectonic download failed: {}",
                detail.trim().chars().take(600).collect::<String>()
            ));
        }
    }

    #[cfg(not(windows))]
    {
        let _ = &zip_path;
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("Automatic Tectonic installation is only implemented on Windows.".to_string());
    }

    let downloaded = match find_file_recursive(&temp_dir, "tectonic.exe") {
        Some(path) => path,
        None => {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err("The Tectonic archive did not contain tectonic.exe.".to_string());
        }
    };
    fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Cannot create {}: {e}", install_dir.display()))?;
    let destination = install_dir.join("tectonic.exe");
    if let Err(error) = fs::copy(&downloaded, &destination) {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!(
            "Cannot install Tectonic to {}: {error}",
            destination.display()
        ));
    }
    let _ = fs::remove_dir_all(&temp_dir);
    Ok(collect_engine_status(app))
}

#[tauri::command]
async fn install_tectonic(app: tauri::AppHandle) -> Result<TexEngineStatus, String> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || install_tectonic_impl(&handle))
        .await
        .map_err(|e| format!("Tectonic installation failed: {e}"))?
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:"))
    {
        return Err("Only http, https and mailto links can be opened.".to_string());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("rundll32.exe");
        cmd.arg("url.dll,FileProtocolHandler")
            .arg(trimmed)
            .creation_flags(0x0800_0000);
        cmd.spawn()
            .map_err(|e| format!("Could not open {trimmed}: {e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = trimmed;
        Err("Opening links is only implemented on Windows".to_string())
    }
}

fn compile_impl(
    root_file: String,
    engine: Option<String>,
    shell_escape: Option<bool>,
    extra_args: Option<Vec<String>>,
    max_passes: Option<u32>,
    custom_command: Option<String>,
    engine_path: Option<String>,
) -> Result<CompileResult, String> {
    let root = PathBuf::from(&root_file);
    if !root.is_file() {
        return Err(format!("Root file not found: {root_file}"));
    }
    let project_dir = root
        .parent()
        .ok_or_else(|| "Root file has no parent directory".to_string())?
        .to_path_buf();
    let stem = root
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid root file name".to_string())?
        .to_string();

    let build_dir = project_dir.join(".texpad").join("build");
    // TeX treats `~`, `%`, `#` and spaces in file names specially, so the
    // engine runs inside the project folder and only sees relative paths;
    // an absolute path such as C:\Users\ALEXIV~1\... breaks the build.
    let root_name = root
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid root file name".to_string())?
        .to_string();
    let rel_build_dir = ".texpad/build";
    fs::create_dir_all(&build_dir)
        .map_err(|e| format!("Cannot create build directory {}: {e}", build_dir.display()))?;

    let engine_name = engine
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "pdflatex".to_string());
    let shell_escape = shell_escape.unwrap_or(false);
    let extra_args = extra_args.unwrap_or_default();
    let max_passes = max_passes.unwrap_or(4).clamp(1, 6);
    let is_latexmk = engine_name.eq_ignore_ascii_case("latexmk");
    let is_pandoc = engine_name.eq_ignore_ascii_case("pandoc");
    let is_tectonic = engine_name.eq_ignore_ascii_case("tectonic");

    // A stale log is misleading when a build fails before TeX starts.
    let log_path = build_dir.join(format!("{stem}.log"));
    let _ = fs::remove_file(&log_path);

    let started = Instant::now();
    let mut combined_log = String::new();
    let mut passes = 0u32;
    let mut exit_code: Option<i32> = None;
    let mut tools: Vec<String> = Vec::new();
    let mut extra_passes = 0u32;
    let mut cancelled = false;
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);
    CURRENT_PID.store(0, Ordering::SeqCst);

    if let Some(custom) = custom_command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", custom]);
        cmd.current_dir(&project_dir);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let child = cmd
            .spawn()
            .map_err(|e| format!("Could not start custom build command: {e}"))?;
        CURRENT_PID.store(child.id(), Ordering::SeqCst);
        let output = child
            .wait_with_output()
            .map_err(|e| format!("Custom build command failed: {e}"))?;
        CURRENT_PID.store(0, Ordering::SeqCst);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        combined_log.push_str(&stdout);
        if !stderr.trim().is_empty() {
            combined_log.push_str("
[stderr]
");
            combined_log.push_str(&stderr);
        }
        exit_code = output.status.code();
        passes = 1;
        let build_pdf = build_dir.join(format!("{stem}.pdf"));
        let project_pdf = project_dir.join(format!("{stem}.pdf"));
        let pdf = if build_pdf.is_file() {
            Some(build_pdf)
        } else if project_pdf.is_file() {
            Some(project_pdf)
        } else {
            None
        };
        let synctex_gz = build_dir.join(format!("{stem}.synctex.gz"));
        let project_synctex_gz = project_dir.join(format!("{stem}.synctex.gz"));
        let synctex = if synctex_gz.is_file() {
            Some(synctex_gz)
        } else if project_synctex_gz.is_file() {
            Some(project_synctex_gz)
        } else {
            None
        };
        return Ok(CompileResult {
            success: output.status.success() && pdf.is_some(),
            log: combined_log,
            pdf_path: pdf.map(|value| value.to_string_lossy().to_string()),
            synctex_path: synctex.map(|value| value.to_string_lossy().to_string()),
            log_path: None,
            duration_ms: started.elapsed().as_millis() as u64,
            exit_code,
            passes,
            engine: "custom".to_string(),
            tools: vec!["custom".to_string()],
            cancelled: CANCEL_REQUESTED.load(Ordering::SeqCst),
        });
    }

    let pass_limit = if is_latexmk || is_pandoc || is_tectonic {
        1
    } else {
        max_passes
    };
    for pass in 1..=pass_limit {
        if CANCEL_REQUESTED.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }
        let mut cmd = if is_pandoc {
            let mut c = Command::new("pandoc");
            c.arg(&root_file)
                .arg("-o")
                .arg(build_dir.join(format!("{stem}.pdf")))
                .arg("--pdf-engine=pdflatex");
            c
        } else if is_latexmk {
            let mut c = Command::new("latexmk");
            c.arg("-pdf")
                .arg("-synctex=1")
                .arg("-interaction=nonstopmode")
                .arg("-file-line-error")
                .arg(format!("-outdir={rel_build_dir}"));
            if shell_escape {
                c.arg("-shell-escape");
            }
            c
        } else if is_tectonic {
            let program = engine_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty() && Path::new(value).is_file())
                .unwrap_or("tectonic");
            let mut c = Command::new(program);
            c.arg("--print")
                .arg("--keep-logs")
                .arg("--synctex")
                .arg("--outdir")
                .arg(rel_build_dir);
            if shell_escape {
                c.arg("-Z").arg("shell-escape");
            }
            c
        } else {
            let mut c = Command::new(&engine_name);
            c.arg("-interaction=nonstopmode")
                .arg("-file-line-error")
                .arg("-synctex=1")
                .arg(format!("-output-directory={rel_build_dir}"));
            if shell_escape {
                c.arg("-shell-escape");
            }
            c
        };
        cmd.current_dir(&project_dir);
        for arg in &extra_args {
            cmd.arg(arg);
        }
        // pandoc already received its input path above.
        if !is_pandoc {
            cmd.arg(&root_name);
        }

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        let child = cmd.spawn().map_err(|e| {
            if is_tectonic {
                format!(
                    "Could not start Tectonic: {e}.\n\
                     Install Tectonic from Settings → Typesetting, or choose another engine."
                )
            } else {
                format!(
                    "Could not start \"{engine_name}\": {e}.\n\
                     Make sure TeX Live (or another TeX distribution) is installed and that \
                     the engine is available in PATH."
                )
            }
        })?;
        CURRENT_PID.store(child.id(), Ordering::SeqCst);
        let output = child.wait_with_output().map_err(|e| {
            format!("The typesetter process could not be waited on: {e}")
        })?;
        CURRENT_PID.store(0, Ordering::SeqCst);

        passes = pass;
        exit_code = output.status.code();
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        combined_log.push_str(&format!("===== Pass {pass} =====\n"));
        combined_log.push_str(&stdout);
        if !stderr.trim().is_empty() {
            combined_log.push_str("\n[stderr]\n");
            combined_log.push_str(&stderr);
        }
        combined_log.push('\n');

        if CANCEL_REQUESTED.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }
        if !output.status.success() {
            break;
        }

        // After the first pass, inspect the auxiliary files to detect a
        // bibliography engine or an index that needs an extra tool run.
        if !is_latexmk && !is_tectonic && pass == 1 {
            let aux_path = build_dir.join(format!("{stem}.aux"));
            let aux = fs::read_to_string(&aux_path).unwrap_or_default();
            let bcf_path = build_dir.join(format!("{stem}.bcf"));
            let idx_path = build_dir.join(format!("{stem}.idx"));
            let mut ran_tool = false;

            if bcf_path.is_file() {
                let args = vec![
                    "--input-directory".to_string(),
                    build_dir.to_string_lossy().to_string(),
                    "--output-directory".to_string(),
                    build_dir.to_string_lossy().to_string(),
                    stem.clone(),
                ];
                append_tool_log(
                    &mut combined_log,
                    "biber",
                    run_aux_tool("biber", &args, &project_dir, &[]),
                );
                tools.push("biber".to_string());
                ran_tool = true;
            } else if aux.contains("\\bibdata") {
                // TeX Live's openout_any setting refuses absolute output
                // paths, so pass a project-relative job name instead.
                let job = format!(".texpad/build/{stem}");
                let existing = std::env::var("BIBINPUTS").unwrap_or_default();
                let bibinputs = if existing.is_empty() {
                    project_dir.to_string_lossy().to_string()
                } else {
                    format!("{};{existing}", project_dir.display())
                };
                append_tool_log(
                    &mut combined_log,
                    "bibtex",
                    run_aux_tool(
                        "bibtex",
                        &[job],
                        &project_dir,
                        &[("BIBINPUTS", bibinputs)],
                    ),
                );
                tools.push("bibtex".to_string());
                ran_tool = true;
            }

            if idx_path.is_file() {
                append_tool_log(
                    &mut combined_log,
                    "makeindex",
                    run_aux_tool(
                        "makeindex",
                        &[
                            format!(".texpad/build/{stem}.idx"),
                            "-o".to_string(),
                            format!(".texpad/build/{stem}.ind"),
                        ],
                        &project_dir,
                        &[],
                    ),
                );
                tools.push("makeindex".to_string());
                ran_tool = true;
            }

            if ran_tool {
                extra_passes = 2;
            }
        }

        let rerun = needs_rerun(&stdout) || extra_passes > 0;
        if extra_passes > 0 {
            extra_passes -= 1;
        }
        if is_latexmk || is_pandoc || is_tectonic || !rerun {
            break;
        }
    }

    let pdf_path = build_dir.join(format!("{stem}.pdf"));
    let synctex_gz = build_dir.join(format!("{stem}.synctex.gz"));
    let synctex_plain = build_dir.join(format!("{stem}.synctex"));

    if combined_log.trim().is_empty() {
        if let Ok(file_log) = fs::read_to_string(&log_path) {
            combined_log = file_log;
        }
    }

    let success = exit_code == Some(0) && pdf_path.is_file();
    Ok(CompileResult {
        success,
        log: combined_log,
        pdf_path: pdf_path
            .is_file()
            .then(|| pdf_path.to_string_lossy().to_string()),
        synctex_path: if synctex_gz.is_file() {
            Some(synctex_gz.to_string_lossy().to_string())
        } else if synctex_plain.is_file() {
            Some(synctex_plain.to_string_lossy().to_string())
        } else {
            None
        },
        log_path: log_path.is_file().then(|| log_path.to_string_lossy().to_string()),
        duration_ms: started.elapsed().as_millis() as u64,
        exit_code,
        passes,
        engine: engine_name,
        tools,
        cancelled,
    })
}

#[tauri::command]
async fn compile_project(
    root_file: String,
    engine: Option<String>,
    shell_escape: Option<bool>,
    extra_args: Option<Vec<String>>,
    max_passes: Option<u32>,
    custom_command: Option<String>,
    engine_path: Option<String>,
) -> Result<CompileResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        compile_impl(
            root_file,
            engine,
            shell_escape,
            extra_args,
            max_passes,
            custom_command,
            engine_path,
        )
    })
    .await
    .map_err(|e| format!("Typeset task failed: {e}"))?
}

fn parse_number_after<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    line.strip_prefix(key).map(str::trim)
}

fn run_synctex(args: &[String]) -> Result<String, String> {
    let mut cmd = Command::new("synctex");
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let output = cmd.output().map_err(|e| {
        format!("Could not start synctex: {e}. It normally ships with TeX Live.")
    })?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if !output.status.success() && stdout.trim().is_empty() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(stdout)
}

fn parse_synctex_output(raw: String) -> SyncTexHit {
    let mut hit = SyncTexHit {
        raw: raw.clone(),
        ..Default::default()
    };
    for line in raw.lines() {
        let line = line.trim();
        if let Some(v) = parse_number_after(line, "Page:") {
            hit.page = v.parse().ok();
        } else if let Some(v) = parse_number_after(line, "x:") {
            hit.x = v.parse().ok();
        } else if let Some(v) = parse_number_after(line, "y:") {
            hit.y = v.parse().ok();
        } else if let Some(v) = parse_number_after(line, "Input:") {
            hit.file = Some(v.to_string());
        } else if let Some(v) = parse_number_after(line, "Line:") {
            hit.line = v.parse().ok();
        } else if let Some(v) = parse_number_after(line, "Column:") {
            hit.column = v.parse().ok();
        }
    }
    hit
}

#[tauri::command]
fn synctex_view(pdf: String, file: String, line: u32, column: u32) -> Result<SyncTexHit, String> {
    let out = run_synctex(&[
        "view".into(),
        "-i".into(),
        format!("{line}:{column}:{file}"),
        "-o".into(),
        pdf,
    ])?;
    Ok(parse_synctex_output(out))
}

#[tauri::command]
fn synctex_edit(pdf: String, page: u32, x: f64, y: f64) -> Result<SyncTexHit, String> {
    let out = run_synctex(&[
        "edit".into(),
        "-o".into(),
        format!("{page}:{x}:{y}:{pdf}"),
    ])?;
    Ok(parse_synctex_output(out))
}



fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == ".texpad" {
            continue;
        }
        let from = entry.path();
        let to = dst.join(&name);
        if entry.file_type()?.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}


#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserTemplate {
    name: String,
    content: String,
}


fn outlook_send(attachment: Option<&str>, subject: &str) -> Result<(), String> {
    let subject = subject.replace('\'', "''");
    let attach = attachment
        .map(|path| {
            format!(
                "$m.Attachments.Add('{}') | Out-Null;",
                path.replace('\'', "''")
            )
        })
        .unwrap_or_default();
    let script = format!(
        "$ErrorActionPreference='Stop'; $ol = New-Object -ComObject Outlook.Application; $m = $ol.CreateItem(0); $m.Subject = '{}'; {} $m.Display()",
        subject, attach
    );
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
        cmd.creation_flags(0x0800_0000);
        let output = cmd
            .output()
            .map_err(|e| format!("Could not start Outlook: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (subject, attach, script);
        Err("Email integration is only implemented on Windows".to_string())
    }
}

#[tauri::command]
fn email_file(path: String, subject: String) -> Result<(), String> {
    if !Path::new(&path).is_file() {
        return Err(format!("File not found: {path}"));
    }
    outlook_send(Some(&path), &subject)
}

#[tauri::command]
fn email_project_zip(root_file: String, subject: String) -> Result<(), String> {
    let root = PathBuf::from(&root_file);
    let project_dir = root
        .parent()
        .ok_or_else(|| "Root file has no parent directory".to_string())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System clock error: {e}"))?
        .as_secs();
    let zip_path = std::env::temp_dir().join(format!("Texpad-{stamp}.zip"));
    let source = project_dir.to_string_lossy().replace('\'', "''");
    let target = zip_path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop'; $items = Get-ChildItem -LiteralPath '{}' -Force | Where-Object {{ $_.Name -ne '.texpad' }}; Compress-Archive -Path $items.FullName -DestinationPath '{}' -Force",
        source, target
    );
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
        cmd.creation_flags(0x0800_0000);
        let output = cmd
            .output()
            .map_err(|e| format!("Could not start archive tool: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
    }
    outlook_send(Some(&zip_path.to_string_lossy()), &subject)
}

#[tauri::command]
fn templates_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data directory: {e}"))?
        .join("Templates");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn list_user_templates(app: tauri::AppHandle) -> Result<Vec<UserTemplate>, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data directory: {e}"))?
        .join("Templates");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    let mut templates = Vec::new();
    for entry in fs::read_dir(&dir)
        .map_err(|e| format!("Cannot read {}: {e}", dir.display()))?
        .flatten()
    {
        let path = entry.path();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_lowercase();
        if extension != "tex" && extension != "md" {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            let name = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Template")
                .to_string();
            templates.push(UserTemplate { name, content });
        }
    }
    templates.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(templates)
}


#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserSnippet {
    name: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserConfig {
    autocomplete: String,
    snippets: Vec<UserSnippet>,
}


#[tauri::command]
fn open_external(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err(format!("Path not found: {path}"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", &path]);
        cmd.creation_flags(0x0800_0000);
        cmd.spawn()
            .map_err(|e| format!("Could not open {path}: {e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Opening files is only implemented on Windows".to_string())
    }
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("Path not found: {path}"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("explorer");
        if target.is_dir() {
            cmd.arg(&target);
        } else {
            cmd.arg(format!("/select,{}", target.display()));
        }
        cmd.creation_flags(0x0800_0000);
        cmd.spawn()
            .map_err(|e| format!("Could not reveal {path}: {e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = target;
        Err("Revealing files is only implemented on Windows".to_string())
    }
}

#[tauri::command]
fn user_config_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data directory: {e}"))?;
    fs::create_dir_all(dir.join("Snippets"))
        .map_err(|e| format!("Cannot create snippets directory: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

fn snippet_body(content: &str) -> String {
    let mut body = String::new();
    let mut collecting = false;
    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('%') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            if key.trim().eq_ignore_ascii_case("insert at cursor") {
                if value.trim().is_empty() {
                    collecting = true;
                } else {
                    collecting = false;
                    body.push_str(value.trim_start());
                    body.push('\n');
                }
            } else {
                collecting = false;
            }
        } else if collecting {
            body.push_str(line);
            body.push('\n');
        }
    }
    if body.trim().is_empty() {
        content.to_string()
    } else {
        body.trim_end().to_string()
    }
}

#[tauri::command]
fn load_user_config(app: tauri::AppHandle) -> Result<UserConfig, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data directory: {e}"))?;
    let autocomplete = fs::read_to_string(dir.join("autocompleted_commands.txt"))
        .unwrap_or_default();
    let snippet_dir = dir.join("Snippets");
    fs::create_dir_all(&snippet_dir)
        .map_err(|e| format!("Cannot create snippets directory: {e}"))?;
    let mut snippets = Vec::new();
    for entry in fs::read_dir(&snippet_dir)
        .map_err(|e| format!("Cannot read snippets: {e}"))?
        .flatten()
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            let name = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Snippet")
                .to_string();
            snippets.push(UserSnippet {
                name,
                content: snippet_body(&content),
            });
        }
    }
    snippets.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(UserConfig {
        autocomplete,
        snippets,
    })
}

#[tauri::command]
fn export_project_zip(root_file: String, destination: String) -> Result<(), String> {
    let root = PathBuf::from(&root_file);
    let project_dir = root
        .parent()
        .ok_or_else(|| "Root file has no parent directory".to_string())?;
    let source = project_dir.to_string_lossy().replace('\'', "''");
    let target = destination.replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop'; $items = Get-ChildItem -LiteralPath '{}' -Force | Where-Object {{ $_.Name -ne '.texpad' }}; Compress-Archive -Path $items.FullName -DestinationPath '{}' -Force",
        source, target
    );
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
        cmd.creation_flags(0x0800_0000);
        let output = cmd
            .output()
            .map_err(|e| format!("Could not start archive tool: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (source, target, script);
        Err("ZIP export is only implemented on Windows".to_string())
    }
}

/// Copies a file, e.g. the typeset PDF to a location the user picked.
#[tauri::command]
fn copy_file(source: String, destination: String) -> Result<(), String> {
    fs::copy(&source, &destination)
        .map(|_| ())
        .map_err(|e| format!("Could not copy {source} to {destination}: {e}"))
}

/// Picks the root document of an unpacked project: `main.tex` when it
/// declares a document class, otherwise the shallowest `.tex` file that does.
fn find_root_tex(dir: &Path) -> Option<PathBuf> {
    fn walk(dir: &Path, depth: usize, found: &mut Vec<(usize, PathBuf)>) {
        let Ok(entries) = fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if depth < 4 {
                    walk(&path, depth + 1, found);
                }
            } else if path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("tex"))
            {
                let text = fs::read_to_string(&path).unwrap_or_default();
                let declares = text
                    .lines()
                    .any(|line| !line.trim_start().starts_with('%') && line.contains("\\documentclass"));
                if declares {
                    found.push((depth, path));
                }
            }
        }
    }
    let mut found = Vec::new();
    walk(dir, 0, &mut found);
    found.sort_by_key(|(depth, path)| {
        let is_main = path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("main.tex"));
        (!is_main, *depth, path.to_string_lossy().to_lowercase())
    });
    found.into_iter().next().map(|(_, path)| path)
}

/// Unpacks a project archive (for example an Overleaf "Download Source"
/// ZIP) next to the archive and returns its root `.tex` file.
#[tauri::command]
fn import_project_zip(zip_path: String) -> Result<String, String> {
    let zip = PathBuf::from(&zip_path);
    if !zip.is_file() {
        return Err(format!("Archive not found: {zip_path}"));
    }
    let parent = zip
        .parent()
        .ok_or_else(|| "Archive has no parent directory".to_string())?;
    let stem = zip
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    let mut target = parent.join(stem);
    let mut counter = 2;
    while target.exists() {
        target = parent.join(format!("{stem} ({counter})"));
        counter += 1;
    }
    let script = format!(
        "$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '{}' -DestinationPath '{}'",
        zip_path.replace('\'', "''"),
        target.to_string_lossy().replace('\'', "''")
    );
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
        cmd.creation_flags(0x0800_0000);
        let output = cmd
            .output()
            .map_err(|e| format!("Could not start archive tool: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
    }
    #[cfg(not(windows))]
    {
        let _ = script;
        return Err("ZIP import is only implemented on Windows".to_string());
    }
    #[allow(unreachable_code)]
    find_root_tex(&target)
        .map(|path| path.to_string_lossy().to_string())
        .ok_or_else(|| {
            format!(
                "Unpacked to {}, but no .tex file with \\documentclass was found.",
                target.display()
            )
        })
}

#[tauri::command]
fn export_project_folder(root_file: String, destination: String) -> Result<String, String> {
    let root = PathBuf::from(&root_file);
    let project_dir = root
        .parent()
        .ok_or_else(|| "Root file has no parent directory".to_string())?;
    let name = project_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    let target = PathBuf::from(destination).join(name);
    if target.exists() {
        return Err(format!("{} already exists.", target.display()));
    }
    copy_dir_all(project_dir, &target)
        .map_err(|e| format!("Could not export project: {e}"))?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn print_file(path: String) -> Result<(), String> {
    print_pdf(path)
}

#[tauri::command]
fn backup_document(
    app: tauri::AppHandle,
    path: String,
    content: String,
) -> Result<(), String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data directory: {e}"))?
        .join("Editor-Archive");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    let stem = Path::new(&path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("document");
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System clock error: {e}"))?
        .as_secs();
    let target = dir.join(format!("{stem}-{stamp}.tex"));
    fs::write(&target, content)
        .map_err(|e| format!("Cannot write backup {}: {e}", target.display()))?;

    // Keep the archive bounded: at most 40 snapshots per document.
    let prefix = format!("{stem}-");
    let mut snapshots: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| format!("Cannot read {}: {e}", dir.display()))?
        .flatten()
        .map(|entry| entry.path())
        .filter(|entry| {
            entry
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with(&prefix) && name.ends_with(".tex"))
                .unwrap_or(false)
        })
        .collect();
    snapshots.sort();
    while snapshots.len() > 40 {
        let oldest = snapshots.remove(0);
        let _ = fs::remove_file(oldest);
    }
    Ok(())
}

#[tauri::command]
fn editor_archive_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data directory: {e}"))?
        .join("Editor-Archive");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn cancel_typeset() -> Result<(), String> {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
    let pid = CURRENT_PID.load(Ordering::SeqCst);
    if pid != 0 {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let mut cmd = Command::new("taskkill");
            cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
            cmd.creation_flags(0x0800_0000);
            let _ = cmd.output();
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output();
        }
    }
    Ok(())
}

#[tauri::command]
fn clean_build(root_file: String) -> Result<(), String> {
    let root = PathBuf::from(&root_file);
    let project_dir = root
        .parent()
        .ok_or_else(|| "Root file has no parent directory".to_string())?;
    let build_dir = project_dir.join(".texpad").join("build");
    if build_dir.exists() {
        fs::remove_dir_all(&build_dir)
            .map_err(|e| format!("Could not remove {}: {e}", build_dir.display()))?;
    }
    Ok(())
}

#[tauri::command]
fn print_pdf(path: String) -> Result<(), String> {
    if !Path::new(&path).is_file() {
        return Err(format!("PDF not found: {path}"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let escaped = path.replace('\'', "''");
        let script = format!("Start-Process -FilePath '{}' -Verb Print", escaped);
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
        cmd.creation_flags(0x0800_0000);
        let output = cmd
            .output()
            .map_err(|e| format!("Could not start printing: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Printing is only implemented on Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(name: &str) -> String {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(name)
            .join("main.tex")
            .to_string_lossy()
            .to_string()
    }

    #[test]
    #[ignore = "requires TeX Live with pdflatex, bibtex and makeindex"]
    fn compiles_bibtex_and_index_sample() {
        let result = compile_impl(
            sample("sample"),
            Some("pdflatex".into()),
            Some(false),
            None,
            Some(4),
            None,
            None,
        )
        .expect("compile should run");
        println!("{}", result.log);
        assert!(result.success, "sample should produce a PDF");
        assert!(result.tools.contains(&"bibtex".to_string()));
        assert!(result.tools.contains(&"makeindex".to_string()));
    }

    #[test]
    #[ignore = "requires TeX Live with pdflatex and biber"]
    fn compiles_biblatex_sample() {
        let result = compile_impl(
            sample("sample-biber"),
            Some("pdflatex".into()),
            Some(false),
            None,
            Some(4),
            None,
            None,
        )
        .expect("compile should run");
        println!("{}", result.log);
        assert!(result.success, "biblatex sample should produce a PDF");
        assert!(result.tools.contains(&"biber".to_string()));
    }

    #[test]
    #[ignore = "requires a Tectonic executable in TECTONIC_TEST_BIN"]
    fn compiles_sample_with_tectonic() {
        let binary = std::env::var("TECTONIC_TEST_BIN")
            .expect("set TECTONIC_TEST_BIN to a tectonic executable");
        let result = compile_impl(
            sample("sample"),
            Some("tectonic".into()),
            Some(false),
            None,
            Some(4),
            None,
            Some(binary),
        )
        .expect("compile should run");
        println!("{}", result.log);
        assert!(result.success, "sample should produce a PDF with Tectonic");
        assert_eq!(result.engine, "tectonic");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            read_binary_file,
            path_info,
            list_directory,
            tex_engine_status,
            install_tectonic,
            open_url,
            compile_project,
            synctex_view,
            synctex_edit,
            cancel_typeset,
            clean_build,
            print_pdf,
            backup_document,
            editor_archive_dir,
            export_project_zip,
            import_project_zip,
            copy_file,
            export_project_folder,
            print_file,
            templates_dir,
            list_user_templates,
            user_config_dir,
            load_user_config,
            email_file,
            email_project_zip,
            open_external,
            reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Texpad");
}
