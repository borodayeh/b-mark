// File I/O commands. Every command is explicitly invoked by a user action in
// the UI; nothing here scans the disk or walks directories on its own.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Extensions B mark will open. Anything else is refused.
pub const MARKDOWN_EXTS: [&str; 6] = ["md", "markdown", "mdown", "mkd", "mdwn", "mdtxt"];

/// Hard cap so a pathological file cannot exhaust memory. 32 MiB of Markdown
/// is far beyond any realistic document.
const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;

pub fn is_supported_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| MARKDOWN_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[derive(Serialize)]
pub struct MarkdownFile {
    pub path: String,
    pub name: String,
    /// Directory of the file — used to resolve relative image paths.
    pub dir: String,
    pub content: String,
    pub bytes: u64,
    /// Unix millis of last modification, for change detection.
    pub modified_ms: u64,
}

/// One entry of a browsed folder.
#[derive(Serialize)]
pub struct FolderEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub bytes: u64,
    pub modified_ms: u64,
}

/// How deep a single `list_folder` call will look. A workspace is browsed one
/// level at a time from the UI, so there is no reason to walk a whole drive —
/// and refusing to do so is also what keeps this from being the kind of
/// filesystem-crawling behaviour that makes a program look like malware.
const MAX_ENTRIES: usize = 2000;

/// List one directory: its subdirectories, and the Markdown files in it.
///
/// Non-Markdown files are omitted rather than shown greyed out; this is a
/// Markdown viewer and a folder of a thousand photographs is noise.
#[tauri::command]
pub async fn list_folder(path: String) -> Result<Vec<FolderEntry>, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(format!("not_a_directory:{path}"));
    }

    let read = std::fs::read_dir(&dir).map_err(|e| format!("read_failed:{e}"))?;
    let mut entries: Vec<FolderEntry> = Vec::new();

    for item in read.flatten() {
        if entries.len() >= MAX_ENTRIES {
            break;
        }
        let p = item.path();
        let name = item.file_name().to_string_lossy().to_string();

        // Hidden and system directories are noise in a document tree.
        if name.starts_with('.') || name == "node_modules" || name == "$RECYCLE.BIN" {
            continue;
        }

        let meta = match item.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let is_dir = meta.is_dir();
        if !is_dir && !is_supported_markdown(&p) {
            continue;
        }

        entries.push(FolderEntry {
            path: p.to_string_lossy().to_string(),
            name,
            is_dir,
            bytes: if is_dir { 0 } else { meta.len() },
            modified_ms: modified_ms(&meta),
        });
    }

    // Folders first, then files, each alphabetically — the order every file
    // manager uses, so it needs no explanation.
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// The parent of a path, for walking up out of a browsed folder.
#[tauri::command]
pub async fn parent_folder(path: String) -> Result<Option<String>, String> {
    Ok(PathBuf::from(&path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .filter(|p| !p.is_empty()))
}

fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub async fn read_markdown_file(path: String) -> Result<MarkdownFile, String> {
    let p = PathBuf::from(&path);

    if !p.is_file() {
        return Err(format!("not_a_file:{path}"));
    }
    if !is_supported_markdown(&p) {
        return Err(format!("unsupported_extension:{path}"));
    }

    let meta = std::fs::metadata(&p).map_err(|e| format!("metadata_failed:{e}"))?;
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!("file_too_large:{}", meta.len()));
    }

    // Read as bytes then decode lossily so a stray invalid byte never panics
    // and Persian UTF-8 text always survives intact.
    let raw = std::fs::read(&p).map_err(|e| format!("read_failed:{e}"))?;
    let content = strip_bom(String::from_utf8_lossy(&raw).into_owned());

    Ok(MarkdownFile {
        name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
        dir: p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
        path: p.to_string_lossy().to_string(),
        bytes: meta.len(),
        modified_ms: modified_ms(&meta),
        content,
    })
}

/// Used only by the optional editor mode (phase 8+). Refuses anything that is
/// not an already-supported Markdown path.
#[tauri::command]
pub async fn write_markdown_file(path: String, content: String) -> Result<u64, String> {
    let p = PathBuf::from(&path);
    if !is_supported_markdown(&p) {
        return Err(format!("unsupported_extension:{path}"));
    }
    std::fs::write(&p, content.as_bytes()).map_err(|e| format!("write_failed:{e}"))?;
    let meta = std::fs::metadata(&p).map_err(|e| format!("metadata_failed:{e}"))?;
    Ok(modified_ms(&meta))
}

/// Writes an exported artefact (HTML, DOCX) to a path the user chose in the
/// save dialog.
///
/// This exists because `<a download>` does nothing in WebView2: there is no
/// browser download manager behind it, so the click is silently dropped and
/// the user is told the export succeeded when no file was ever written.
///
/// The extension allow-list keeps this from becoming a general "write any
/// bytes anywhere" primitive; the path itself still comes from the OS save
/// dialog, so the user has already consented to that location.
#[tauri::command]
pub async fn write_export_file(path: String, bytes: Vec<u8>) -> Result<u64, String> {
    const ALLOWED: [&str; 4] = ["html", "htm", "docx", "md"];
    let p = PathBuf::from(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !ALLOWED.contains(&ext.as_str()) {
        return Err(format!("unsupported_extension:{path}"));
    }
    let len = bytes.len() as u64;
    std::fs::write(&p, &bytes).map_err(|e| format!("write_failed:{e}"))?;
    Ok(len)
}

/// Opens the containing folder with the OS file manager. Uses the opener
/// plugin rather than spawning cmd.exe / PowerShell — that keeps the process
/// tree clean and avoids the single most common AV heuristic trigger.
#[tauri::command]
pub async fn reveal_in_explorer(
    app: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let p = PathBuf::from(&path);
    let dir = if p.is_dir() { p } else { p.parent().map(|d| d.to_path_buf()).ok_or("no_parent")? };
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("open_failed:{e}"))
}

fn strip_bom(s: String) -> String {
    s.strip_prefix('\u{feff}').map(|t| t.to_string()).unwrap_or(s)
}
