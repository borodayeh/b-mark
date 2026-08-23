// B mark — Windows Markdown viewer.
//
// Design notes (see docs/00-research.md):
//   * No hidden processes, no telemetry, no network access of any kind.
//   * File reads are limited to paths the user explicitly opens (picker,
//     drag & drop, CLI argument, or file association).
//   * Settings live in the per-user config dir (%AppData%\app.bmark.viewer),
//     never in Program Files or the global registry.

// Hide the console window in release builds on Windows.
#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod files;
mod settings;
mod watcher;
#[cfg(windows)]
mod webview2;

use tauri::{Emitter, Manager};

/// Files handed to us on the command line (association / "Open with" / drag onto exe).
fn collect_cli_files() -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    for arg in std::env::args().skip(1) {
        // Skip flags — we never interpret unknown flags as paths.
        if arg.starts_with('-') {
            continue;
        }
        // Windows shells may hand us a file:// URL.
        if let Ok(url) = url::Url::parse(&arg) {
            if url.scheme() == "file" {
                if let Ok(path) = url.to_file_path() {
                    files.push(path);
                    continue;
                }
            }
            // Any other URL scheme is ignored on purpose.
            if url.scheme().len() > 1 {
                continue;
            }
        }
        files.push(std::path::PathBuf::from(arg));
    }
    files.retain(|p| files::is_supported_markdown(p));
    files
}

fn main() {
    // Without WebView2 the window would never appear and the user would get no
    // explanation at all. Check first and say so, in Persian and English.
    #[cfg(windows)]
    if !webview2::ensure_available() {
        std::process::exit(1);
    }

    tauri::Builder::default()
        .manage(watcher::new_state())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // The updater only ever contacts the endpoint declared in
        // tauri.conf.json, and only when the user asks. There is no
        // background polling: an app that phones home on a timer is exactly
        // what SECURITY.md promises this one does not do.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            files::read_markdown_file,
            files::write_markdown_file,
            files::write_export_file,
            files::reveal_in_explorer,
            files::list_folder,
            files::parent_folder,
            settings::load_settings,
            settings::save_settings,
            watcher::watch_file,
            watcher::unwatch_all,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let opened = collect_cli_files();
            if !opened.is_empty() {
                let scope = app.asset_protocol_scope();
                for f in &opened {
                    let _ = scope.allow_file(f);
                }
                let paths: Vec<String> =
                    opened.iter().map(|p| p.to_string_lossy().to_string()).collect();
                // The frontend listens for this once it is ready.
                let _ = handle.emit("b-mark://open-files", paths);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running B mark");
}
