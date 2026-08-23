// Per-user settings persistence.
//
// Location on Windows: %AppData%\app.bmark.viewer\settings.json
// Nothing is written to Program Files, HKLM, or any system path, so the app
// runs fine without Administrator and stays portable-friendly.

use tauri::Manager;

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no_config_dir:{e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir_failed:{e}"))?;
    Ok(dir.join("settings.json"))
}

/// Returns the raw JSON blob. The frontend owns the schema and merges it with
/// its own defaults, so adding a setting never requires a Rust change.
#[tauri::command]
pub async fn load_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("read_failed:{e}"))
}

#[tauri::command]
pub async fn save_settings(app: tauri::AppHandle, json: String) -> Result<(), String> {
    // Validate before touching disk so a bug can never write garbage.
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| format!("invalid_json:{e}"))?;

    let path = settings_path(&app)?;
    // Write to a temp file then rename — never leaves a truncated settings file.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json.as_bytes()).map_err(|e| format!("write_failed:{e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename_failed:{e}"))
}
