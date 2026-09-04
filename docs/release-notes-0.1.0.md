# PrintVault 0.1.0

PrintVault is a local desktop library and viewer for STL and 3MF files.
Point it at folders you already have — it never copies, moves or modifies
your models.

## Highlights

- Visual STL / 3MF library: add one or more folders and browse the real,
  recursive directory tree — no import, no duplication
- Folder tree and gallery views with live filename search (⌘F / Ctrl+F)
- Automatic thumbnails for every model, generated lazily and cached locally
- Interactive 3D preview (Three.js): orbit, zoom, pan, auto-framing
- Binary and ASCII STL support
- Multi-object 3MF support, including materials — previewed as one rigid body
- Model info bar: dimensions, triangle count, object count, file size,
  modified date
- Model orientation: X/Y/Z +90° buttons and a free rotation gizmo, with
  per-file orientation that persists across restarts and follows renames
- File management from the app: rename (with collision and invalid-name
  protection), delete to Trash / Recycle Bin, reveal in Finder /
  File Explorer / file manager
- Filesystem watcher: added, changed and removed files appear live
- Local-first: no cloud, no accounts, no telemetry — files are watched live
  and stay exactly where they are

## Install

**macOS (Apple Silicon)** — download `PrintVault_0.1.0_aarch64.dmg`, open
it and drag PrintVault to Applications.

**Windows** — download `PrintVault_0.1.0_x64-setup.exe` and run it (per-user
install). If you prefer MSI, `PrintVault_0.1.0_x64_en-US.msi` is also
available. WebView2 is bootstrapped automatically when missing.

**Linux** — `PrintVault_0.1.0_amd64.AppImage` is the simplest portable
option. `.deb` and `.rpm` packages are also available. Standard Tauri v2
runtime dependencies apply (WebKitGTK 4.1, GTK 3).

## Security warnings on first launch

PrintVault 0.1.0 is not code-signed or notarized, so your operating system
may show a one-time warning when you first open it — Gatekeeper on macOS
("app can't be verified") or SmartScreen on Windows. This is normal for
unsigned apps; use "Open anyway" (macOS: System Settings → Privacy &
Security, or right-click → Open) or "More info → Run anyway" (Windows) to
continue.

## Privacy

PrintVault works locally on your computer and does not upload your 3D model
library. Settings and the thumbnail cache live in the OS app-config /
app-cache directories; nothing is sent anywhere.

## Support

If PrintVault saves you time, you can support its development at
<https://buymeacoffee.com/printvault>.
