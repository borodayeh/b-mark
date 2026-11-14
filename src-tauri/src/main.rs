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

use std::sync::Mutex;
use tauri::Manager;

/// Files the app was launched with (double-click / "Open with" / CLI).
///
/// `setup` runs before the webview has loaded a single line of JavaScript, so
/// an event emitted there has no listener yet and is dropped. That is exactly
/// why double-clicking a .md file opened the window but not the document.
/// The paths are therefore parked here, and the frontend asks for them once
/// it is ready (`take_launch_files`).
#[derive(Default)]
struct LaunchFiles(Mutex<Vec<String>>);

/// Hand the launch files to the frontend, exactly once.
#[tauri::command]
fn take_launch_files(state: tauri::State<'_, LaunchFiles>) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut v| std::mem::take(&mut *v))
        .unwrap_or_default()
}

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
        .manage(LaunchFiles::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // The updater only ever contacts the endpoint declared in
        // tauri.conf.json, and only when the user asks. There is no
        // background polling: an app that phones home on a timer is exactly
        // what SECURITY.md promises this one does not do.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            take_launch_files,
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
            let opened = collect_cli_files();
            if !opened.is_empty() {
                let scope = app.asset_protocol_scope();
                for f in &opened {
                    let _ = scope.allow_file(f);
                }
                let paths: Vec<String> =
                    opened.iter().map(|p| p.to_string_lossy().to_string()).collect();
                // Park them for the frontend to collect when it is ready.
                if let Ok(mut pending) = app.state::<LaunchFiles>().0.lock() {
                    *pending = paths;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running B mark");
}
