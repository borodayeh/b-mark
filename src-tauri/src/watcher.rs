// Live reload: watch the currently open file and tell the frontend when it
// changes on disk. Only ever watches files the user has explicitly opened.

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager};

type Watchers = Mutex<HashMap<String, Debouncer<notify::RecommendedWatcher, RecommendedCache>>>;

/// Constructed once in `main` and handed to Tauri's managed state.
pub fn new_state() -> Watchers {
    Mutex::new(HashMap::new())
}

/// Debounce window. Editors often write a file in several syscalls; without
/// this we would reload two or three times per save.
const DEBOUNCE: Duration = Duration::from_millis(250);

#[tauri::command]
pub async fn watch_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(format!("not_a_file:{path}"));
    }

    // One watcher per path; re-watching is a no-op.
    let state = app.state::<Watchers>();
    {
        let map = state.lock().map_err(|_| "lock_poisoned")?;
        if map.contains_key(&path) {
            return Ok(());
        }
    }

    let handle = app.clone();
    let emit_path = path.clone();
    let mut debouncer = new_debouncer(DEBOUNCE, None, move |res: DebounceEventResult| {
        if let Ok(events) = res {
            let changed = events.iter().any(|e| {
                matches!(
                    e.kind,
                    notify::EventKind::Modify(_) | notify::EventKind::Create(_)
                )
            });
            if changed {
                let _ = handle.emit("b-mark://file-changed", emit_path.clone());
            }
        }
    })
    .map_err(|e| format!("watcher_failed:{e}"))?;

    // Watch the parent directory non-recursively: many editors replace the
    // file via rename, which drops a direct file watch.
    let parent = p.parent().ok_or("no_parent")?.to_path_buf();
    debouncer
        .watch(&parent, RecursiveMode::NonRecursive)
        .map_err(|e| format!("watch_failed:{e}"))?;

    state
        .lock()
        .map_err(|_| "lock_poisoned")?
        .insert(path, debouncer);
    Ok(())
}

#[tauri::command]
pub async fn unwatch_all(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<Watchers>()
        .lock()
        .map_err(|_| "lock_poisoned")?
        .clear();
    Ok(())
}
