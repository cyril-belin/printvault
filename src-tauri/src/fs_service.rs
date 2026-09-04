use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

/// Extensions handled by the viewer.
const MODEL_EXTENSIONS: &[&str] = &["stl", "3mf"];

/// Directory names that are never part of a print library.
const IGNORED_DIRS: &[&str] = &["node_modules", "__pycache__"];

/// Hard cap so a pathological tree (or a whole-disk root) cannot exhaust memory.
const MAX_NODES: usize = 200_000;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// "stl" | "3mf" for files, absent for directories.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ext: Option<String>,
    /// File size in bytes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    /// Last modification time, unix seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<i64>,
    pub children: Vec<LibNode>,
}

pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

/// Returns the persisted settings document, or `null` when none exists yet.
pub fn load_settings(app: &AppHandle) -> Result<Value, String> {
    let path = settings_path(app)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("Corrupt settings file: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Value::Null),
        Err(e) => Err(e.to_string()),
    }
}

/// Atomically persists the settings document (tmp file + rename).
pub fn save_settings(app: &AppHandle, settings: &Value) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// True when `path` is (or lives under) one of the configured library roots.
pub fn is_allowed(roots: &[PathBuf], path: &Path) -> bool {
    roots.iter().any(|root| path.starts_with(root))
}

/// True if the path is absolute and contains no `..` components that could
/// lexically escape a configured root.
fn is_lexically_safe(path: &Path) -> bool {
    path.is_absolute()
        && !path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
}

/// Validates a path that may be a root itself (e.g. Reveal in Finder).
pub fn validate_inside_root(roots: &[PathBuf], path: &Path) -> Result<(), String> {
    if !is_lexically_safe(path) {
        return Err("Invalid path.".into());
    }
    if !is_allowed(roots, path) {
        return Err("Item is not part of the configured library.".into());
    }
    Ok(())
}

/// Validates a mutation target: must be strictly inside a configured root,
/// never a root itself, and lexically safe.
pub fn validate_mutation_target(roots: &[PathBuf], path: &Path) -> Result<(), String> {
    validate_inside_root(roots, path)?;
    if roots.iter().any(|root| path.as_os_str() == root.as_os_str()) {
        return Err("Library roots cannot be renamed or deleted from PrintVault.".into());
    }
    Ok(())
}

/// Windows-only name rules: reserved punctuation, control characters,
/// trailing dots/spaces and reserved device names (CON, NUL, COM1…).
#[cfg(target_os = "windows")]
fn validate_windows_name(name: &str) -> Result<(), String> {
    if name.chars().any(|c| ['\\', '<', '>', '"', '|', '?', '*'].contains(&c)) {
        return Err("Name cannot contain \\ < > \" | ? or *.".into());
    }
    if name.chars().any(|c| (c as u32) < 32) {
        return Err("Name cannot contain control characters.".into());
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Err("Names cannot end with a dot or a space on Windows.".into());
    }
    let stem = name.split('.').next().unwrap_or("");
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
        "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if RESERVED.iter().any(|r| stem.eq_ignore_ascii_case(r)) {
        return Err(format!("“{stem}” is a reserved Windows device name."));
    }
    Ok(())
}

/// Cleans up a user-typed name and, for model files, keeps the canonical
/// extension so a file can never lose its `.stl`/`.3mf` suffix.
pub fn sanitize_name(
    raw: &str,
    is_dir: bool,
    old_extension: Option<&str>,
) -> Result<String, String> {
    let name = raw.trim();
    if name.is_empty() {
        return Err("Name cannot be empty.".into());
    }
    if name == "." || name == ".." {
        return Err("“.” and “..” are not valid names.".into());
    }
    if name.contains('/') || name.contains(':') {
        return Err("Name cannot contain “/” or “:”.".into());
    }
    if name.starts_with('.') {
        return Err("Names starting with “.” are hidden and would disappear from the library.".into());
    }
    if name.len() > 255 {
        return Err("Name is too long.".into());
    }
    #[cfg(target_os = "windows")]
    validate_windows_name(name)?;
    if is_dir || old_extension.is_none() {
        return Ok(name.to_string());
    }

    // Files: keep the original extension. If the user typed another model
    // extension, strip it; then always append the canonical one.
    let ext = old_extension.unwrap().to_ascii_lowercase();
    let canonical = format!(".{ext}");
    if name.to_lowercase().ends_with(&canonical) {
        return Ok(name.to_string());
    }
    let lower = name.to_lowercase();
    let stem = if (lower.ends_with(".stl") || lower.ends_with(".3mf")) && name.len() > 4 {
        &name[..name.len() - 4]
    } else {
        name
    };
    Ok(format!("{stem}{canonical}"))
}

/// Rejects renames that would overwrite another item in the same folder
/// (checked case-insensitively, matching default APFS behaviour).
pub fn ensure_no_collision(
    parent: &Path,
    final_name: &str,
    old_name: &std::ffi::OsStr,
) -> Result<(), String> {
    let entries = std::fs::read_dir(parent).map_err(|e| format!("Cannot read folder: {e}"))?;
    for entry in entries.flatten() {
        let candidate = entry.file_name();
        if candidate == old_name {
            continue; // the item being renamed itself (case-only renames stay allowed)
        }
        if candidate.to_string_lossy().eq_ignore_ascii_case(final_name) {
            return Err(format!("“{final_name}” already exists in this folder."));
        }
    }
    Ok(())
}

/// Recursively scans a library root into the serializable tree the UI renders.
pub fn scan_root(root: &Path) -> Result<LibNode, String> {
    let meta = std::fs::metadata(root).map_err(|e| format!("Cannot access folder: {e}"))?;
    if !meta.is_dir() {
        return Err("The selected path is not a folder.".into());
    }
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string_lossy().to_string());
    let mut budget = MAX_NODES;
    scan_dir(root, &name, &mut budget)
}

fn scan_dir(dir: &Path, name: &str, budget: &mut usize) -> Result<LibNode, String> {
    let mut dirs: Vec<LibNode> = Vec::new();
    let mut files: Vec<LibNode> = Vec::new();

    if *budget > 0 {
        // A subdirectory that cannot be read (permissions, transient) shows up
        // as an empty folder instead of failing the entire scan.
        let entries = std::fs::read_dir(dir).map_err(|e| format!("Cannot read {}: {e}", dir.display()))?;
        for entry in entries.flatten() {
            if *budget == 0 {
                break;
            }
            let file_type = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };
            // Never follow symlinks: avoids cycles and touching files outside the root.
            if file_type.is_symlink() {
                continue;
            }
            let raw_name = entry.file_name();
            let entry_name = raw_name.to_string_lossy();
            if entry_name.starts_with('.') {
                continue;
            }
            let path = entry.path();
            if file_type.is_dir() {
                let lowered = entry_name.to_lowercase();
                if IGNORED_DIRS.contains(&lowered.as_str()) {
                    continue;
                }
                if let Ok(child) = scan_dir(&path, &entry_name, budget) {
                    *budget = budget.saturating_sub(1);
                    dirs.push(child);
                }
            } else if file_type.is_file() {
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_ascii_lowercase());
                if !ext.as_deref().is_some_and(|e| MODEL_EXTENSIONS.contains(&e)) {
                    continue;
                }
                let (size, modified) = match entry.metadata() {
                    Ok(md) => (Some(md.len()), modified_secs(&md)),
                    Err(_) => (None, None),
                };
                *budget = budget.saturating_sub(1);
                files.push(LibNode {
                    name: entry_name.to_string(),
                    path: path.to_string_lossy().to_string(),
                    is_dir: false,
                    ext,
                    size,
                    modified,
                    children: Vec::new(),
                });
            }
        }
    }

    dirs.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    files.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    dirs.extend(files);

    Ok(LibNode {
        name: name.to_string(),
        path: dir.to_string_lossy().to_string(),
        is_dir: true,
        ext: None,
        size: None,
        modified: None,
        children: dirs,
    })
}

fn modified_secs(md: &std::fs::Metadata) -> Option<i64> {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
}

/// Case-insensitive comparison with digit runs compared numerically,
/// so `part2.stl` sorts before `part10.stl`.
fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let mut ai = a.as_bytes();
    let mut bi = b.as_bytes();
    loop {
        match (ai.first(), bi.first()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(&x), Some(&y)) => {
                if x.is_ascii_digit() && y.is_ascii_digit() {
                    let (an, rest_a) = take_digits(ai);
                    let (bn, rest_b) = take_digits(bi);
                    match an.cmp(&bn) {
                        Ordering::Equal => {
                            ai = rest_a;
                            bi = rest_b;
                        }
                        other => return other,
                    }
                } else {
                    match x.to_ascii_lowercase().cmp(&y.to_ascii_lowercase()) {
                        Ordering::Equal => {
                            ai = &ai[1..];
                            bi = &bi[1..];
                        }
                        other => return other,
                    }
                }
            }
        }
    }
}

fn take_digits(bytes: &[u8]) -> (u64, &[u8]) {
    let mut value: u64 = 0;
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        value = value.saturating_mul(10).saturating_add((bytes[i] - b'0') as u64);
        i += 1;
    }
    (value, &bytes[i..])
}
