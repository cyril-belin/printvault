mod fs_service;
mod thumbs;
mod watcher;

pub use thumbs::{thumb_get, thumb_gc, thumb_migrate, thumb_store};

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::Response;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

use watcher::LibraryWatcher;

/// User-facing name of the platform file manager, for menus and errors.
fn file_manager_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "Finder"
    } else if cfg!(target_os = "windows") {
        "File Explorer"
    } else {
        "File Manager"
    }
}

/// User-facing name of the platform trash (delete is recoverable everywhere).
fn trash_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "Recycle Bin"
    } else {
        "Trash"
    }
}

/// In-memory mirror of the configured library roots. The frontend owns the
/// persisted settings document and pushes the root list here on every change;
/// Rust uses it for path validation and to drive the filesystem watcher.
pub struct AppState {
    pub roots: Mutex<Vec<PathBuf>>,
    pub watcher: Mutex<LibraryWatcher>,
    /// Item the native context menu was opened for.
    pub ctx_target: Mutex<Option<CtxTarget>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CtxTarget {
    pub path: String,
    pub name: String,
    /// "file" | "dir" | "root"
    pub kind: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CtxAction {
    action: String,
    target: CtxTarget,
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<Value, String> {
    fs_service::load_settings(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Value) -> Result<(), String> {
    fs_service::save_settings(&app, &settings)
}

/// Called by the frontend whenever the root list changes (including at startup).
/// Updates validation state and aligns filesystem watchers.
#[tauri::command]
fn sync_roots(state: State<'_, AppState>, app: AppHandle, roots: Vec<String>) -> Result<(), String> {
    let paths: Vec<PathBuf> = roots.iter().map(PathBuf::from).collect();
    *state.roots.lock().map_err(|_| "state poisoned")? = paths.clone();
    state
        .watcher
        .lock()
        .map_err(|_| "state poisoned")?
        .sync(&paths, &app);
    Ok(())
}

#[tauri::command]
fn scan_root(state: State<'_, AppState>, path: String) -> Result<fs_service::LibNode, String> {
    let path = PathBuf::from(path);
    let roots = state.roots.lock().map_err(|_| "state poisoned")?.clone();
    if !fs_service::is_allowed(&roots, &path) {
        return Err("Folder is not part of the configured library.".into());
    }
    fs_service::scan_root(&path)
}

/// Returns raw model bytes. Uses the IPC binary channel so multi-megabyte
/// STL/3MF files are not serialized as JSON arrays.
#[tauri::command]
fn read_model(state: State<'_, AppState>, path: String) -> Result<Response, String> {
    let path = PathBuf::from(&path);
    let roots = state.roots.lock().map_err(|_| "state poisoned")?.clone();
    if !fs_service::is_allowed(&roots, &path) {
        return Err("File is not inside a configured library folder.".into());
    }
    let ext_ok = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("stl") || e.eq_ignore_ascii_case("3mf"))
        .unwrap_or(false);
    if !ext_ok {
        return Err("Unsupported file type.".into());
    }
    if !path.is_file() {
        return Err("This file no longer exists on disk.".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read file: {e}"))?;
    Ok(Response::new(bytes))
}

/// Opens a native context menu for the item. The chosen action is emitted
/// back to the frontend as `ctx-action` (mutations stay UI-orchestrated).
#[tauri::command]
fn show_context_menu(
    state: State<'_, AppState>,
    window: WebviewWindow,
    target: CtxTarget,
) -> Result<(), String> {
    {
        let roots = state.roots.lock().map_err(|_| "state poisoned")?.clone();
        fs_service::validate_inside_root(&roots, Path::new(&target.path))?;
    }
    let kind = target.kind.clone();
    *state.ctx_target.lock().map_err(|_| "state poisoned")? = Some(target);

    let window_for_thread = window.clone();
    if let Err(e) = window.run_on_main_thread(move || {
        let result: tauri::Result<Menu<tauri::Wry>> = (|| {
            let reveal = MenuItemBuilder::with_id("ctx-reveal", format!("Reveal in {}", file_manager_name()))
                .build(&window_for_thread)?;
            if kind == "root" {
                let remove = MenuItemBuilder::with_id("ctx-remove-root", "Remove from PrintVault")
                    .build(&window_for_thread)?;
                MenuBuilder::new(&window_for_thread)
                    .item(&reveal)
                    .separator()
                    .item(&remove)
                    .build()
            } else {
                let rename =
                    MenuItemBuilder::with_id("ctx-rename", "Rename").build(&window_for_thread)?;
                let delete =
                    MenuItemBuilder::with_id("ctx-delete", "Delete").build(&window_for_thread)?;
                MenuBuilder::new(&window_for_thread)
                    .item(&reveal)
                    .separator()
                    .item(&rename)
                    .item(&delete)
                    .build()
            }
        })();
        match result {
            Ok(menu) => {
                if let Err(e) = window_for_thread.popup_menu(&menu) {
                    eprintln!("PrintVault: could not show context menu: {e}");
                }
            }
            Err(e) => eprintln!("PrintVault: could not build context menu: {e}"),
        }
    }) {
        eprintln!("PrintVault: could not schedule context menu: {e}");
    }
    Ok(())
}

/// Routes native context-menu selections to the frontend, which owns the
/// dialogs, inline rename editor and rescans.
fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let action = match event.id().0.as_str() {
        "ctx-reveal" => "reveal",
        "ctx-rename" => "rename",
        "ctx-delete" => "delete",
        "ctx-remove-root" => "remove-root",
        _ => return,
    };
    let state = app.state::<AppState>();
    let target = match state.ctx_target.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => return,
    };
    if let Some(target) = target {
        let _ = app.emit(
            "ctx-action",
            CtxAction {
                action: action.to_string(),
                target,
            },
        );
    }
}

#[tauri::command]
fn reveal_in_finder(state: State<'_, AppState>, app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    let roots = state.roots.lock().map_err(|_| "state poisoned")?.clone();
    fs_service::validate_inside_root(&roots, &path)?;
    if !path.exists() {
        return Err("This item no longer exists on disk.".into());
    }
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| format!("Could not reveal in {}: {e}", file_manager_name()))
}

/// Renames a file or directory on disk. Files keep their `.stl`/`.3mf`
/// extension; collisions in the destination folder are rejected.
#[tauri::command]
fn rename_item(
    state: State<'_, AppState>,
    old_path: String,
    new_name: String,
) -> Result<String, String> {
    let old = PathBuf::from(old_path);
    let roots = state.roots.lock().map_err(|_| "state poisoned")?.clone();
    fs_service::validate_mutation_target(&roots, &old)?;

    let meta = std::fs::symlink_metadata(&old)
        .map_err(|_| "This item no longer exists on disk.".to_string())?;
    if meta.file_type().is_symlink() {
        return Err("Cannot rename a symbolic link.".into());
    }

    let final_name = fs_service::sanitize_name(
        &new_name,
        meta.is_dir(),
        old.extension().and_then(|e| e.to_str()),
    )?;

    let parent = old.parent().ok_or("Invalid path.")?.to_path_buf();
    // The parent is inside a root (validated above), and the new name is a
    // single component, so the destination can never leave the library.
    let target = parent.join(&final_name);
    let old_name = old.file_name().ok_or("Invalid path.")?.to_os_string();
    fs_service::ensure_no_collision(&parent, &final_name, &old_name)?;
    std::fs::rename(&old, &target).map_err(|e| format!("Rename failed: {e}"))?;
    Ok(target.to_string_lossy().to_string())
}

/// Moves a file or directory to the OS trash (Recycle Bin on Windows,
/// Trash on macOS/Linux — recoverable on all of them).
#[tauri::command]
fn delete_item(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    let roots = state.roots.lock().map_err(|_| "state poisoned")?.clone();
    fs_service::validate_mutation_target(&roots, &path)?;

    let meta = std::fs::symlink_metadata(&path)
        .map_err(|_| "This item no longer exists on disk.".to_string())?;
    if meta.file_type().is_symlink() {
        return Err("Cannot delete a symbolic link.".into());
    }
    trash::delete(&path).map_err(|e| format!("Could not move to {}: {e}", trash_name()))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            roots: Mutex::new(Vec::new()),
            watcher: Mutex::new(LibraryWatcher::new()),
            ctx_target: Mutex::new(None),
        })
        .on_menu_event(handle_menu_event)
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            sync_roots,
            scan_root,
            read_model,
            show_context_menu,
            reveal_in_finder,
            rename_item,
            delete_item,
            thumb_get,
            thumb_store,
            thumb_migrate,
            thumb_gc
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
