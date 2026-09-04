# PrintVault

A local desktop library for 3D printing files. PrintVault indexes folders that
already contain your `.stl` and `.3mf` files, shows their real directory
hierarchy, and previews any model in an interactive 3D viewer — without ever
copying, moving or modifying your files.

Built with **Tauri 2 + Vue 3 + TypeScript + Vite + Three.js**.
Runs natively on **macOS, Windows and Linux**. Current version: **0.1.0**.

## Features

- Add one or more library folders via the native folder picker (no import, no duplication)
- Recursive, expandable tree of the real filesystem — only `.stl` / `.3mf` files are listed
- Instant filename search (Cmd+F on macOS, Ctrl+F elsewhere, focuses the search field)
- Interactive 3D viewport (Three.js): orbit, zoom, pan, auto-framing, reset camera,
  neutral lighting, ground grid
- **Model orientation** (viewing preference, per file): X/Y/Z +90° buttons, an optional
  TransformControls rotation gizmo (orbit is suspended while dragging it) and reset.
  The model rotates inside a dedicated parent group — multi-object 3MF files stay rigid —
  and is automatically re-seated on the grid after every change, with the info-bar
  dimensions updating live. Orientations persist locally across restarts, follow renames
  and are removed on delete; model files themselves are never modified.
- Binary **and** ASCII STL support, 3MF support (multi-object + materials)
- Model info: filename, format, file size, dimensions in mm, modification date,
  triangle count and object count
- Graceful error states for corrupted/unsupported files
- File management from the tree (right-click):
  - **Reveal in Finder / Show in File Explorer / Show in File Manager** — reveals and
    selects the real item, with the label matching the platform
  - **Rename** — inline, renames the real file/folder (STL/3MF extensions are preserved,
    collisions are rejected — including case-only collisions on case-insensitive
    filesystems; Windows-invalid names are rejected; `Enter` confirms / `Escape` cancels)
  - **Delete** — moves the real item to the system trash (Trash on macOS and Linux,
    Recycle Bin on Windows — recoverable), with a confirmation dialog; folders warn
    that their contents are included
  - Library roots can only be revealed or removed *from PrintVault* — never renamed
    or deleted from disk
  - All mutations run through validated Rust commands that only operate inside
    configured roots (no traversal, no symlink escape, no accidental overwrite)
- Live updates: folders are watched — files added, removed or renamed appear automatically
- Roots, expanded folders, last selection and sidebar width persist across restarts
- Nothing leaves your machine: no cloud, no accounts, no database

## Platforms & build artifacts

| Platform | Bundles (`npm run tauri build`) |
|----------|--------------------------------|
| macOS    | `PrintVault.app`, `PrintVault_0.1.0_aarch64.dmg` |
| Windows  | NSIS installer (`…-setup.exe`, per-user install) and MSI; WebView2 is bootstrapped automatically when missing |
| Linux    | `…_amd64.AppImage`, `…_amd64.deb`, `…_amd64.rpm` |

Settings live in the OS-appropriate app-config directory and thumbnails in the
app-cache directory on every platform (Application Support / Caches on macOS,
AppData on Windows, XDG config/cache on Linux); nothing is hardcoded.

Linux runtime dependencies are the standard Tauri v2 set — WebKitGTK 4.1 and
GTK 3 with their libraries (`libwebkit2gtk-4.1-0`, `libgtk-3-0`); the `.deb`
declares them automatically, AppImage bundles what it can.

### Local development

```bash
npm install
npm run tauri dev
```

### Production build

```bash
npm run tauri build
```

The TypeScript check (`vue-tsc`) runs as part of the frontend build.

### Cross-platform CI

`.github/workflows/build.yml` builds PrintVault independently on
`macos-latest`, `windows-latest` and `ubuntu-latest` on every push and PR:
type check + frontend build, `cargo check`, `cargo clippy --all-targets`,
then full Tauri bundles, uploaded as artifacts. No signing or publishing yet.

### Runtime validation status

GitHub Actions only proves PrintVault **compiles and packages** per OS — it is
not a runtime test. Real-machine validation is tracked in
[docs/platform-testing-checklist.md](docs/platform-testing-checklist.md):

- **macOS** — runtime-tested and packaging-tested locally
- **Windows** — compile/build + packaging via CI; runtime **not** tested
- **Linux** — compile/build + packaging via CI; runtime **not** tested

## Brand assets

`logo.png` in the project root is the canonical master artwork. All other
branding assets are derived from it:

```
logo.png                              master artwork (full logo, keep at root)
src-tauri/icons/app-icon.png          symbol-only icon source (no text/tagline)
src-tauri/icons/                      generated platform icons (.icns/.ico/PNGs)
src/assets/printvault-mark.png        in-app header mark
src/assets/printvault-logo.png        full master copy for About/README/website use
public/favicon.png                    web favicon
```

To regenerate every platform icon after changing the master artwork, update
`src-tauri/icons/app-icon.png` and run:

```bash
npm run tauri icon src-tauri/icons/app-icon.png
```

## Project layout

```
src/                     frontend (Vue 3 + TypeScript)
  components/            app shell, sidebar tree, viewer pane, info bar
  composables/
    useLibrary.ts        library store: roots, scanning, search, selection,
                         expansion, persistence and live-refresh wiring
  services/
    backend.ts           the only place that talks to Tauri (invoke/dialog)
    settings.ts          settings load/save (debounced) + validation
    paths.ts             cross-platform path helpers (separator-aware)
  viewer/
    ModelViewer.ts       self-contained Three.js scene (orbit, lights, framing, disposal)
    loaders.ts           STL/3MF parsing + stats (triangles, objects, bbox)
  types.ts               shared types (LibNode, ModelStats, Settings)

src-tauri/               backend (Rust, only what native access requires)
  src/fs_service.rs      recursive scanning, settings file IO, path validation
  src/watcher.rs         debounced filesystem watcher (notify)
  src/lib.rs             Tauri commands: load/save settings, sync_roots,
                         scan_root, read_model (binary IPC)

scripts/make-fixtures.mjs            generates a demo library with real STL/3MF files
scripts/make-multi-object-fixture.mjs  regenerates the two-object 3MF used for orientation tests
dev-assets/test-library/             generated demo library (add it in the app to try PrintVault)
```

Notes on the architecture:

- All filesystem access lives in the Rust layer; UI components never call Tauri directly
  (only `services/backend.ts` does).
- The viewer is fully isolated from library logic — it receives a path + extension and
  returns statistics.
- Model bytes are transferred over Tauri's binary IPC channel, not JSON-serialized.
- `read_model` only serves paths inside configured roots and only for `.stl`/`.3mf`.

## Support PrintVault

If you find PrintVault useful, you can support its development at
[buymeacoffee.com/printvault](https://buymeacoffee.com/printvault).
