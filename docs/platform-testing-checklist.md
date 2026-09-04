# PrintVault — cross-platform manual test checklist

Run this checklist on a real machine for each platform before calling a
release validated. A GitHub Actions build only proves that PrintVault
**compiles and packages** on an OS — it does not prove the app runs, renders,
or behaves correctly there.

Legend: `[x]` pass · `[!]` issue found (note it) · `[n/a]` not applicable.

## Install & first launch
1. [ ] App installs cleanly (macOS: drag to /Applications · Windows: NSIS installer · Linux: .deb install / AppImage runs)
2. [ ] App launches from the normal launcher (Dock / Start menu / app menu)
3. [ ] Application icon is correct in Finder/Dock · taskbar/Start menu · desktop/launcher
4. [ ] Uninstall removes the app cleanly and leaves library folders and files untouched

## Library
5. [ ] Add Folder opens the native folder picker
6. [ ] Recursive directory tree matches the real folder hierarchy
7. [ ] Unicode / accented / spaced filenames display and open (e.g. `boîte épices.stl`, ` tour de calibrage 20mm.3mf`)

## Viewer
8. [ ] Binary STL preview renders
9. [ ] ASCII STL preview renders
10. [ ] 3MF preview renders
11. [ ] Multi-object 3MF renders as one rigid body
12. [ ] Model metadata correct: size, dimensions, triangles, objects, modified date
13. [ ] X+90° / Y+90° / Z+90° rotation buttons work and re-seat the model on the ground
14. [ ] Rotation gizmo rotates the model; orbit is suspended while dragging it
15. [ ] Orientation survives: switching files, closing/reopening the file, and full app restart

## Browse
16. [ ] Gallery mode lists thumbnails
17. [ ] Thumbnails generate lazily while scrolling
18. [ ] Thumbnails load from cache after an app restart (no re-render pause)
19. [ ] Search finds files case-insensitively, independent of path separators

## File management
20. [ ] Rename a file (inline, Enter confirms / Esc cancels); thumbnail and orientation follow the rename
21. [ ] Rename a directory; expanded state follows the rename
22. [ ] Delete a file → moves to OS trash (Trash / Recycle Bin), recoverable
23. [ ] Delete a directory → contents included, recoverable
24. [ ] Reveal in file manager selects the item (Finder / File Explorer / File Manager)
25. [ ] Library roots can be removed from PrintVault but are never renamed or deleted from disk

## Watcher & persistence
26. [ ] New file added externally appears without manual rescan
27. [ ] External deletion disappears without manual rescan
28. [ ] Roots, expanded folders, selection and sidebar width survive restart

## Misc
29. [ ] Support PrintVault opens https://buymeacoffee.com/printvault in the default browser
30. [ ] About dialog shows the correct version (0.1.0)

## Recorded validation status (0.1.0)

| Platform | Compile/build | Packaging | Runtime |
|----------|---------------|-----------|---------|
| macOS (Apple Silicon) | ✅ local + CI | ✅ local + CI (.app + .dmg) | ✅ local + RC pass 2026-09-04 (see notes below) |
| Windows | ✅ CI | ✅ CI (NSIS .exe + MSI) | ❌ pending — no Windows runtime available |
| Linux | ✅ CI | ✅ CI (.AppImage + .deb + .rpm) | ❌ pending — no Linux runtime available |

CI evidence: GitHub Actions workflow `.github/workflows/build.yml` compiles,
type-checks, lints and packages PrintVault on `macos-latest`, `windows-latest`
and `ubuntu-latest` (first fully green run: 2026-09-04, artifacts
`PrintVault-macOS` / `PrintVault-Windows` / `PrintVault-Linux`; re-verified
green the same day after updating the workflow to checkout@v7 /
setup-node@v7 / upload-artifact@v7). CI proves compile/build and packaging
only — it is not a runtime test. The runtime column may only be checked
after a human runs this checklist on a real machine. Update this table
honestly whenever a platform is validated.

## RC validation pass — 2026-09-04 (macOS, automated)

Release-candidate pass on the production build
(`src-tauri/target/release/bundle/macos/PrintVault.app`), driven through the
macOS accessibility tree against a scratch test library (fixtures from
`dev-assets/test-library` plus an extra Unicode file `pièce démo éàü —
ünïcode.stl`). The user's real library was only read, never modified.

**Verified ✅**

- 2 · launch (three separate launches, no crash reports)
- 5 · Add Folder opens the native folder picker; adding a root re-indexed 19
  new files instantly (library count 54 → 73)
- 6 · recursive tree matches the real hierarchy, incl. deep branches
  (`Elegoo/Centauri Carbon/{Mods,Tests}`, `organisateur/petits bacs`)
- 7 · Unicode/accented filenames display and open
- 9 · ASCII STL renders (cube: 20 × 20 × 20 mm, 12 triangles, OBJECTS 1)
- 10/11 · multi-object 3MF renders as one rigid body: `assemblage 2
  pieces.3mf` shows OBJECTS 2, combined bbox 164 × 76 × 60 mm, 124 triangles
  — all exactly correct
- 12 · metadata (size, dimensions, triangles, objects, modified date) correct
  on every fixture; non-model files (`notes.txt`) are never listed
- 13 · X+90° rotation: model rotates, re-seats on the grid, info-bar
  dimensions update live (164 × 76 × 60 → 164 × 60 × 76); multi-object 3MF
  stays rigid
- 15 · orientation survives a full app restart (file re-opened already
  rotated, dimensions 164 × 60 × 76)
- 16/18 · gallery thumbnails render and load instantly after restart (cache)
- 19 · search is case-insensitive, path-separator independent and
  accent-tolerant ("bac" finds nested files in both roots; "démo" finds the
  accented file); ⌘F focuses the field
- 26/27 · watcher: external file add appears automatically (73 → 74), external
  delete disappears automatically (74 → 73); no manual rescan
- 28 · roots, expanded folders, view mode, selection persist across restarts
- 29 · Support PrintVault opens `https://buymeacoffee.com/printvault` in the
  default browser
- 30 · About dialog shows Version 0.1.0 (read from Tauri metadata, not
  hardcoded)

8 (binary STL) is covered indirectly: gallery thumbnails render binary STLs
through the same loader path, and the earlier local smoke test opened binary
STLs directly.

**Not covered by this pass — needs a short human pass**

Items 20–25 (rename incl. case-only and invalid-name rejection, delete →
Trash, Reveal in Finder, root removal) and 14 (gizmo drag) are reached only
through the native context menu or real pointer drags. Synthetic right-clicks
(AXShowMenu, HID-level CGEvent, window-scoped events) never produced the DOM
`contextmenu` event in WKWebView, so these flows could not be driven
automatically on a machine that was in active human use. The Rust commands
behind them (`rename_item`, `delete_item`, `reveal_in_finder`) compile clean,
were previously exercised in local testing, and no errors were logged during
this pass — but per policy they stay unchecked until a human runs them.

**Windows / Linux runtime — pending**

No genuine Windows or Linux environment (physical, VM or cloud) was available
during this pass, so runtime validation was **not** faked. When a machine is
available, run the full checklist; on Windows pay particular attention to
`C:\…` paths, nested directories, Windows invalid-name rejection, case-only
rename behavior, Recycle Bin integration, Show in File Explorer, the Start
Menu shortcut/icon, and the WebView2 bootstrap on a clean profile; on Linux
to WebKitGTK rendering, WebGL behavior, native dialogs, trash integration and
file-manager reveal.
