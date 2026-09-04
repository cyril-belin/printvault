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
| macOS (Apple Silicon) | ✅ local | ✅ local (.app + .dmg) | ✅ local smoke test |
| Windows | ⏳ pending first CI run | ⏳ pending first CI run | ❌ not runtime-tested |
| Linux | ⏳ pending first CI run | ⏳ pending first CI run | ❌ not runtime-tested |

The GitHub Actions workflow (`.github/workflows/build.yml`) validates
compile/build and packaging on all three OSes once the repository is pushed to
GitHub; its runs are the source of truth for the two pending rows. Runtime
columns may only be checked after a human runs the checklist on a real
machine. Update this table honestly whenever a platform is validated.
