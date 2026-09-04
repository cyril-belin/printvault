# PrintVault 0.1.0 — release notes (draft)

> Draft for the future GitHub Release. **Not published yet** — no tag, no
> release, no auto-updater metadata has been created. Trim or adjust before
> publishing.

---

## PrintVault 0.1.0

PrintVault is a local desktop library for browsing and previewing STL and
3MF files. Point it at folders you already have — it never copies, moves or
modifies your models.

### Highlights

- Visual STL/3MF library: add one or more folders and browse the real,
  recursive directory tree — no import, no duplication
- Folder tree + gallery views with live filename search (⌘F / Ctrl+F)
- Automatic thumbnails for every model, generated lazily and cached locally
- Interactive 3D viewer (Three.js): orbit, zoom, pan, auto-framing
- Multi-object 3MF support, including materials — previewed as one rigid body
- Model orientation controls: X/Y/Z +90° buttons and a rotation gizmo, with
  per-file orientation that persists across restarts and follows renames
- File management from the app: rename (with collision and invalid-name
  protection), delete to the OS trash, reveal in Finder / File Explorer /
  file manager
- Local-first: no cloud, no accounts, no telemetry — files are watched live
  and stay exactly where they are

### Platforms

- macOS (Apple Silicon): `.app` and `.dmg`
- Windows: NSIS installer (`.exe`, per-user) and MSI; WebView2 is
  bootstrapped automatically when missing
- Linux: `.AppImage`, `.deb`, `.rpm` (standard Tauri v2 runtime dependencies:
  WebKitGTK 4.1, GTK 3)

### Privacy

PrintVault works locally and does not upload your 3D model library. Settings
and the thumbnail cache live in the OS app-config/app-cache directories;
nothing is sent anywhere.

### Support

If PrintVault saves you time, you can support its development at
<https://buymeacoffee.com/printvault>.
