use std::collections::BTreeSet;
use std::path::PathBuf;
use std::time::Duration;

use notify_debouncer_full::notify::{RecursiveMode, RecommendedWatcher};
use notify_debouncer_full::{
    new_debouncer, DebounceEventResult, Debouncer, RecommendedCache,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::AppState;

const DEBOUNCE: Duration = Duration::from_millis(600);

type Debouncer_ = Debouncer<RecommendedWatcher, RecommendedCache>;

#[derive(Serialize, Clone)]
pub struct FsChangedPayload {
    /// Library roots affected by the filesystem change.
    pub roots: Vec<String>,
}

/// Owns the notify debouncer and keeps track of which roots are watched.
pub struct LibraryWatcher {
    inner: Option<Debouncer_>,
    watched: BTreeSet<PathBuf>,
}

impl LibraryWatcher {
    pub fn new() -> Self {
        Self {
            inner: None,
            watched: BTreeSet::new(),
        }
    }

    /// Aligns the watched set with the configured roots and (re)starts the
    /// debouncer on first use. Safe to call on every settings change.
    pub fn sync(&mut self, roots: &[PathBuf], app: &AppHandle) {
        let desired: BTreeSet<PathBuf> = roots.iter().cloned().collect();

        if self.inner.is_none() {
            let handle = app.clone();
            let debouncer = new_debouncer(DEBOUNCE, None, move |result: DebounceEventResult| {
                let events = match result {
                    Ok(events) => events,
                    Err(errors) => {
                        for error in errors {
                            eprintln!("PrintVault: watcher error: {error}");
                        }
                        return;
                    }
                };
                let affected = map_events_to_roots(&handle, events);
                if !affected.is_empty() {
                    let _ = handle.emit(
                        "fs-changed",
                        FsChangedPayload {
                            roots: affected.into_iter().collect(),
                        },
                    );
                }
            });
            match debouncer {
                Ok(d) => self.inner = Some(d),
                Err(e) => {
                    eprintln!("PrintVault: could not start filesystem watcher: {e}");
                    return;
                }
            }
        }

        let debouncer = self.inner.as_mut().expect("debouncer just created");
        for removed in self.watched.difference(&desired) {
            if let Err(e) = debouncer.unwatch(removed) {
                eprintln!("PrintVault: unwatch failed for {}: {e}", removed.display());
            }
        }
        for added in desired.difference(&self.watched) {
            let result = debouncer.watch(added, RecursiveMode::Recursive);
            if let Err(e) = result {
                // Missing or unreadable folders still show up in the UI as
                // "missing" roots; watching simply stays off for them.
                eprintln!("PrintVault: cannot watch {}: {e}", added.display());
            }
        }
        self.watched = desired;
    }
}

/// Maps raw debounced events to the library roots they belong to.
fn map_events_to_roots(app: &AppHandle, events: Vec<notify_debouncer_full::DebouncedEvent>) -> BTreeSet<String> {
    let state = app.state::<AppState>();
    let roots = match state.roots.lock() {
        Ok(guard) => guard,
        Err(_) => return BTreeSet::new(),
    };
    let mut affected = BTreeSet::new();
    for event in events {
        for path in &event.paths {
            for root in roots.iter() {
                if path.starts_with(root) {
                    affected.insert(root.to_string_lossy().to_string());
                }
            }
        }
    }
    affected
}
