//! Disk cache for model thumbnails.
//!
//! Thumbnails are rendered by the frontend (three.js, offscreen) and persisted
//! here so launches and unmodified folders never re-render. Entries live in
//! the app cache directory — never next to the user's model files — and are
//! keyed by sha256(absolute path | mtime | size), so any modification of the
//! source file naturally produces a different key. Renames are migrated
//! explicitly; orphaned entries (modified, renamed outside PrintVault,
//! deleted) are swept by `thumb_gc`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use base64::Engine as _;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::fs_service;

/// Hard cap on the cache directory; oversized caches are trimmed oldest-first.
const CACHE_MAX_BYTES: u64 = 512 * 1024 * 1024;
const CACHE_TRIM_TO_BYTES: u64 = 384 * 1024 * 1024;
/// One rendered 288px PNG is typically 15–80 KB.
const MAX_STORED_BYTES: usize = 2 * 1024 * 1024;

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    Ok(dir)
}

/// Cache key: sha256 over the absolute path, modification time (secs + nanos)
/// and file size. Any change to the source file changes the key.
fn cache_key(path: &Path) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("Cannot stat file: {e}"))?;
    let mtime = meta.modified().map_err(|e| format!("Cannot read mtime: {e}"))?;
    let since_epoch = mtime
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "File mtime is before the epoch.".to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    hasher.update([0u8]);
    hasher.update(since_epoch.as_secs().to_le_bytes());
    hasher.update(since_epoch.subsec_nanos().to_le_bytes());
    hasher.update(meta.len().to_le_bytes());
    let digest = hasher.finalize();
    Ok(digest.iter().map(|b| format!("{b:02x}")).collect())
}

fn entry_path(dir: &Path, key: &str) -> PathBuf {
    dir.join(format!("{key}.png"))
}

/// Validates a model path the same way `read_model` does, and returns it.
fn validate_model_path(roots: &[PathBuf], path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !fs_service::is_allowed(roots, &path) {
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
    Ok(path)
}

/// Returns the cached thumbnail for the current state of `path` as base64
/// PNG data, or `None` on cache miss (caller renders and calls `thumb_store`).
/// Any unreadable/corrupt entry simply counts as a miss.
#[tauri::command]
pub fn thumb_get(state: tauri::State<'_, crate::AppState>, app: AppHandle, path: String) -> Result<Option<String>, String> {
    let path = {
        let roots = state.roots.lock().map_err(|_| "state poisoned")?.clone();
        validate_model_path(&roots, &path)?
    };
    let key = cache_key(&path)?;
    let entry = entry_path(&cache_dir(&app)?, &key);
    let bytes = match std::fs::read(&entry) {
        Ok(bytes) => bytes,
        Err(_) => return Ok(None),
    };
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Persists a rendered thumbnail (base64 PNG) for the current state of `path`.
/// The key is recomputed here so a file modified between render and store
/// lands under its new key instead of poisoning the old one.
#[tauri::command]
pub fn thumb_store(state: tauri::State<'_, crate::AppState>, app: AppHandle, path: String, data_base64: String) -> Result<(), String> {
    let path = {
        let roots = state.roots.lock().map_err(|_| "state poisoned")?.clone();
        validate_model_path(&roots, &path)?
    };
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|_| "Thumbnail payload is not valid base64.".to_string())?;
    if decoded.is_empty() {
        return Err("Refusing to store an empty thumbnail.".into());
    }
    if decoded.len() > MAX_STORED_BYTES {
        return Err("Thumbnail payload is unreasonably large.".into());
    }
    // PNG magic check: the frontend only ever produces PNGs.
    if decoded.len() < 8 || decoded[..8] != [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a] {
        return Err("Thumbnail payload is not a PNG image.".into());
    }

    let key = cache_key(&path)?;
    let dir = cache_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create thumbnail cache: {e}"))?;
    let target = entry_path(&dir, &key);
    let tmp = dir.join(format!("{key}.png.tmp"));
    std::fs::write(&tmp, decoded).map_err(|e| format!("Cannot write thumbnail: {e}"))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("Cannot finalize thumbnail: {e}"))?;
    Ok(())
}

/// Copies a cache entry from the old to the new path after a rename through
/// PrintVault (mtime/size are preserved by rename, so the key stays valid).
/// Best-effort: a failure just means the thumbnail is regenerated later.
#[tauri::command]
pub fn thumb_migrate(state: tauri::State<'_, crate::AppState>, app: AppHandle, old_path: String, new_path: String) -> Result<(), String> {
    let (old, new) = {
        let roots = state.roots.lock().map_err(|_| "state poisoned")?.clone();
        (
            validate_model_path(&roots, &old_path)?,
            validate_model_path(&roots, &new_path)?,
        )
    };
    let dir = cache_dir(&app)?;
    let source = match cache_key(&old) {
        Ok(key) => entry_path(&dir, &key),
        Err(_) => return Ok(()),
    };
    let target_key = match cache_key(&new) {
        Ok(key) => key,
        Err(_) => return Ok(()),
    };
    if entry_path(&dir, &target_key).exists() {
        return Ok(());
    }
    let _ = std::fs::copy(&source, entry_path(&dir, &target_key));
    Ok(())
}

/// Removes cache entries that no longer correspond to any library file
/// (deleted files, removed roots, files modified since their render), then
/// trims the cache if it grew past CACHE_MAX_BYTES. Cheap enough to run after
/// rescans: one stat per known file plus a directory listing.
#[tauri::command]
pub fn thumb_gc(state: tauri::State<'_, crate::AppState>, app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    let roots = state.roots.lock().map_err(|_| "state poisoned")?.clone();
    let dir = match cache_dir(&app) {
        Ok(dir) => dir,
        Err(_) => return Ok(()),
    };
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };

    let valid: HashSet<String> = paths
        .iter()
        .filter_map(|p| {
            let path = PathBuf::from(p);
            if !fs_service::is_allowed(&roots, &path) || !path.is_file() {
                return None;
            }
            cache_key(&path).ok()
        })
        .collect();

    let mut kept: Vec<(PathBuf, u64, std::time::SystemTime)> = Vec::new();
    let mut total: u64 = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name.ends_with(".png") || name.ends_with(".png.tmp") {
            continue; // also sweeps abandoned .tmp leftovers
        }
        let key = name.trim_end_matches(".png");
        if !valid.contains(key) {
            let _ = std::fs::remove_file(&path);
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            total += meta.len();
            kept.push((path, meta.len(), modified));
        }
    }

    if total <= CACHE_MAX_BYTES {
        return Ok(());
    }
    kept.sort_by_key(|(_, _, modified)| *modified);
    for (path, size, _) in kept {
        if total <= CACHE_TRIM_TO_BYTES {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(size);
        }
    }
    Ok(())
}
