import { ref, watch } from 'vue'
import { listen } from '@tauri-apps/api/event'
import type { BrowseMode, CtxTarget, LibNode, Orientation, RootEntry, Settings } from '../types'
import {
  confirmRemoveRoot,
  confirmTrash,
  deleteItem,
  pickFolder,
  renameItem,
  revealInFinder,
  scanRoot,
  showContextMenu,
  syncRoots,
  thumbGc,
  thumbMigrate,
} from '../services/backend'
import { persistSettingsSoon, readSettings } from '../services/settings'
import {
  basename,
  isSameOrUnder,
  isUnder,
  joinPath,
  normalizeRootPath,
  parentDir,
  rebasePath,
  segmentsUnder,
} from '../services/paths'

// ---------------------------------------------------------------------------
// Module-level singleton store: every component importing useLibrary() shares
// the same state, which keeps the library logic in one place.
// ---------------------------------------------------------------------------

const ready = ref(false)
const roots = ref<RootEntry[]>([])
const search = ref('')
const selected = ref<LibNode | null>(null)
/** Bumped whenever the user actively requests a model load. Renaming the
 *  selected file replaces `selected` without bumping this, so the viewer
 *  keeps showing the loaded model. */
const selectedVersion = ref(0)
const notice = ref<string | null>(null)
const expanded = ref<Record<string, boolean>>({})
const sidebarWidth = ref(300)
/** File path -> viewing orientation (viewer preference, never written to files). */
const orientations = ref<Record<string, Orientation>>({})
/** Path currently being renamed inline in the tree. */
const renamingPath = ref<string | null>(null)
/** Library pane presentation (tree list vs thumbnail gallery). */
const browseMode = ref<BrowseMode>('tree')
/** Directory the gallery is showing; follows the selection, but the user can
 *  navigate it independently (folder tiles, breadcrumbs). */
const galleryDir = ref<string | null>(null)

let settingsLoaded = false
/** Suppresses persistence during init so startup rescans can't clobber the
 *  stored selection (which is not restored yet at that point). */
let restoring = true
let rescanTimer: ReturnType<typeof setTimeout> | undefined
const rescanQueue = new Set<string>()
/** Serializes rescans per root so explicit rescans and watcher bursts don't race. */
const rescanChains = new Map<string, Promise<void>>()

function persist(): void {
  if (restoring) return
  persistSettingsSoon({
    version: 1,
    roots: roots.value.map((r) => r.path),
    expanded: { ...expanded.value },
    selectedPath: selected.value?.path ?? null,
    sidebarWidth: sidebarWidth.value,
    orientations: { ...orientations.value },
    browseMode: browseMode.value,
  })
}

function setBrowseMode(mode: BrowseMode): void {
  browseMode.value = mode
  persist()
}

/** Keeps the gallery on the folder of whatever is selected in the tree. */
watch(selected, (node) => {
  if (!node) return
  galleryDir.value = node.isDir ? node.path : parentDir(node.path)
})

function setOrientation(path: string, orientation: Orientation | null): void {
  if (orientation) orientations.value[path] = orientation
  else delete orientations.value[path]
  persist()
}

function removeOrientationsUnder(path: string): void {
  for (const key of Object.keys(orientations.value)) {
    if (isSameOrUnder(key, path)) delete orientations.value[key]
  }
}

function remapOrientations(oldPath: string, newPath: string): void {
  for (const key of Object.keys(orientations.value)) {
    if (isSameOrUnder(key, oldPath)) {
      const updated = rebasePath(key, oldPath, newPath)
      orientations.value[updated] = orientations.value[key]
      if (updated !== key) delete orientations.value[key]
    }
  }
}

function showNotice(message: string): void {
  notice.value = message
  window.setTimeout(() => {
    if (notice.value === message) notice.value = null
  }, 4000)
}

function findRootPathOf(path: string): string | null {
  const root = roots.value.find((r) => isSameOrUnder(path, r.path))
  return root?.path ?? null
}

async function rescanRootInner(path: string, preserveStaleSelection: boolean): Promise<void> {
  const entry = roots.value.find((r) => r.path === path)
  if (!entry) return
  entry.scanning = true
  try {
    entry.tree = await scanRoot(path)
    entry.error = null
  } catch (error) {
    entry.error = error instanceof Error ? error.message : String(error)
  } finally {
    entry.scanning = false
  }
  // If the currently selected file disappeared, fall back to the empty state.
  // Rename flows pass preserveStaleSelection because they re-point the
  // selection themselves right after this.
  if (
    !preserveStaleSelection &&
    selected.value &&
    !findNode(selected.value.path)
  ) {
    selected.value = null
  }
}

function rescanRoot(path: string, preserveStaleSelection = false): Promise<void> {
  const previous = rescanChains.get(path) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(() => rescanRootInner(path, preserveStaleSelection))
  rescanChains.set(path, next)
  return next
}

function findInTree(node: LibNode, path: string): LibNode | null {
  if (node.path === path) return node
  for (const child of node.children) {
    const hit = findInTree(child, path)
    if (hit) return hit
  }
  return null
}

function findNode(path: string): LibNode | null {
  for (const entry of roots.value) {
    if (!entry.tree) continue
    const hit = findInTree(entry.tree, path)
    if (hit) return hit
  }
  return null
}

function expandAncestors(path: string): void {
  const rootPath = findRootPathOf(path)
  if (!rootPath) return
  const rest = segmentsUnder(path, rootPath)
  let prefix = rootPath
  for (let i = 0; i < rest.length - 1; i++) {
    prefix = joinPath(prefix, rest[i])
    expanded.value[prefix] = true
  }
}

async function afterRootsChanged(pathsToScan: string[]): Promise<void> {
  try {
    await syncRoots(roots.value.map((r) => r.path))
  } catch (error) {
    console.error('PrintVault: sync_roots failed', error)
  }
  persist()
  await Promise.all(pathsToScan.map((p) => rescanRoot(p)))
  scheduleThumbGc()
}

// --- Thumbnail cache upkeep ------------------------------------------------

let thumbGcTimer: ReturnType<typeof setTimeout> | undefined

/** Collects every model file path currently present in the scanned trees. */
function collectFilePaths(node: LibNode, out: string[]): void {
  if (!node.isDir) {
    out.push(node.path)
    return
  }
  for (const child of node.children) collectFilePaths(child, out)
}

/**
 * Asks Rust to sweep orphaned cache entries (deleted/modified/renamed-away
 * files). Debounced so rescan bursts coalesce into a single walk.
 */
function scheduleThumbGc(): void {
  if (thumbGcTimer) clearTimeout(thumbGcTimer)
  thumbGcTimer = setTimeout(() => {
    thumbGcTimer = undefined
    const paths: string[] = []
    for (const entry of roots.value) {
      if (entry.tree) collectFilePaths(entry.tree, paths)
    }
    void thumbGc(paths).catch(() => undefined)
  }, 4000)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  if (settingsLoaded) return
  settingsLoaded = true

  const settings: Settings = await readSettings()
  expanded.value = settings.expanded
  sidebarWidth.value = settings.sidebarWidth
  orientations.value = settings.orientations
  browseMode.value = settings.browseMode
  roots.value = settings.roots.map((path) => ({
    path,
    name: basename(path),
    tree: null,
    error: null,
    scanning: true,
  }))

  await afterRootsChanged(settings.roots)

  // Restore last selection once the trees exist.
  if (settings.selectedPath) {
    const node = findNode(settings.selectedPath)
    if (node && !node.isDir) {
      expandAncestors(node.path)
      selected.value = node
      selectedVersion.value += 1
    }
  }

  // The listeners intentionally live for the whole app session.
  await listen<{ roots: string[] }>('fs-changed', (event) => {
    for (const root of event.payload.roots) rescanQueue.add(root)
    if (rescanTimer) clearTimeout(rescanTimer)
    rescanTimer = setTimeout(flushRescans, 250)
  })
  await listen<{ action: string; target: CtxTarget }>('ctx-action', (event) => {
    void handleCtxAction(event.payload.action, event.payload.target)
  })

  restoring = false
  // Rewrites the settings document once per launch so migrated legacy
  // entries (Euler-based orientations) are saved back in quaternion form.
  persist()
  ready.value = true
}

function flushRescans(): void {
  rescanTimer = undefined
  const queue = [...rescanQueue]
  rescanQueue.clear()
  for (const path of queue) {
    if (roots.value.some((r) => r.path === path)) void rescanRoot(path)
  }
  // Trees changed (files added/removed externally): sweep orphaned thumbs.
  if (queue.length) scheduleThumbGc()
}

async function addFolder(): Promise<void> {
  const picked = await pickFolder('Add a folder to PrintVault')
  if (!picked) return
  const path = normalizeRootPath(picked)
  if (roots.value.some((r) => r.path === path)) {
    showNotice('That folder is already in your library.')
    return
  }
  if (roots.value.some((r) => isUnder(r.path, path) || isUnder(path, r.path))) {
    showNotice('That folder overlaps a folder already in your library.')
    return
  }
  roots.value.push({ path, name: basename(path), tree: null, error: null, scanning: true })
  expanded.value[path] = true
  await afterRootsChanged([path])
}

async function removeRoot(path: string): Promise<void> {
  const entry = roots.value.find((r) => r.path === path)
  if (!entry) return
  if (!(await confirmRemoveRoot(entry.name))) return

  roots.value = roots.value.filter((r) => r.path !== path)
  for (const key of Object.keys(expanded.value)) {
    if (isSameOrUnder(key, path)) delete expanded.value[key]
  }
  removeOrientationsUnder(path)
  if (selected.value && isSameOrUnder(selected.value.path, path)) {
    selected.value = null
  }
  await afterRootsChanged([])
}

function toggleDir(path: string): void {
  expanded.value[path] = !(expanded.value[path] ?? false)
  persist()
}

function isOpen(path: string, isRoot: boolean, searching: boolean): boolean {
  if (searching) return true
  return expanded.value[path] ?? isRoot
}

function selectFile(node: LibNode): void {
  if (renamingPath.value) return
  selected.value = node
  selectedVersion.value += 1
  persist()
}

function setSidebarWidth(width: number): void {
  sidebarWidth.value = width
}

/** Filtered roots for the current search; `null` node means "no match"
 *  (or, when `missing` is set, a root that could not be scanned). */
interface FilteredRoot {
  entry: RootEntry
  node: LibNode | null
  missing: boolean
}

function filterTree(node: LibNode, q: string): LibNode | null {
  if (!node.isDir) {
    return node.name.toLowerCase().includes(q) ? node : null
  }
  // A directory matching by name keeps its entire subtree.
  if (node.name.toLowerCase().includes(q)) return node
  const children: LibNode[] = []
  for (const child of node.children) {
    const filtered = filterTree(child, q)
    if (filtered) children.push(filtered)
  }
  if (!children.length) return null
  return { ...node, children }
}

function filteredRoots(): FilteredRoot[] {
  const q = search.value.trim().toLowerCase()
  if (!q) {
    return roots.value.map((entry) => ({
      entry,
      node: entry.tree,
      missing: !!entry.error,
    }))
  }
  return roots.value.map((entry) => ({
    entry,
    node: entry.tree ? filterTree(entry.tree, q) : null,
    missing: !!entry.error,
  }))
}

// ---------------------------------------------------------------------------
// File mutations (all disk operations happen in Rust commands)
// ---------------------------------------------------------------------------

/** Opens the native context menu for a tree item. */
async function openContextMenu(target: CtxTarget): Promise<void> {
  try {
    await showContextMenu(target)
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error))
  }
}

/** Dedupes identical context-menu actions arriving in quick succession
 *  (e.g. a double-activated native menu item), so dialogs never stack. */
let lastCtxAction: { key: string; time: number } | null = null

async function handleCtxAction(action: string, target: CtxTarget): Promise<void> {
  const key = `${action}|${target.path}`
  const now = Date.now()
  if (lastCtxAction && lastCtxAction.key === key && now - lastCtxAction.time < 600) return
  lastCtxAction = { key, time: now }

  switch (action) {
    case 'reveal':
      try {
        await revealInFinder(target.path)
      } catch (error) {
        showNotice(error instanceof Error ? error.message : String(error))
      }
      break
    case 'rename':
      renamingPath.value = target.path
      break
    case 'delete':
      await deleteFromMenu(target)
      break
    case 'remove-root':
      await removeRoot(target.path)
      break
  }
}

/**
 * Inline-rename commit. Returns an error message to keep the editor open,
 * or null on success. Keeps a renamed selection selected and loaded.
 */
async function commitRename(path: string, rawName: string): Promise<string | null> {
  const name = rawName.trim()
  if (!name) return 'Name cannot be empty.'

  const oldNode = findNode(path)
  let newPath: string
  try {
    newPath = await renameItem(path, name)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }

  // Single files keep their rendered thumbnail via cache migration; folder
  // renames are handled by regeneration + the orphan sweep instead.
  if (oldNode && !oldNode.isDir) {
    void thumbMigrate(path, newPath).catch(() => undefined)
  }

  const rootPath = findRootPathOf(path)
  if (rootPath) await rescanRoot(rootPath, true)

  // Folder renames invalidate expanded + orientation keys beneath the old path.
  if (oldNode?.isDir) {
    for (const key of Object.keys(expanded.value)) {
      if (isSameOrUnder(key, path)) {
        const updated = rebasePath(key, path, newPath)
        expanded.value[updated] = expanded.value[key]
        if (updated !== key) delete expanded.value[key]
      }
    }
  }
  // A renamed model keeps its saved viewing orientation under the new path.
  remapOrientations(path, newPath)

  // Re-point the selection at the renamed item without reloading the viewer.
  if (selected.value) {
    const sel = selected.value.path
    if (isSameOrUnder(sel, path)) {
      selected.value = findNode(rebasePath(sel, path, newPath))
    }
  }

  renamingPath.value = null
  persist()
  return null
}

function cancelRename(): void {
  renamingPath.value = null
}

async function deleteFromMenu(target: CtxTarget): Promise<void> {
  if (target.kind === 'root') return // roots are removed from the library, never trashed
  const node = findNode(target.path)
  const isDir = node?.isDir ?? target.kind === 'dir'
  const name = node?.name ?? target.name
  if (!(await confirmTrash(name, isDir))) return

  try {
    await deleteItem(target.path)
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error))
    return
  }

  // Clean up UI/persisted state under the deleted path.
  if (renamingPath.value && isSameOrUnder(renamingPath.value, target.path)) {
    renamingPath.value = null
  }
  for (const key of Object.keys(expanded.value)) {
    if (isSameOrUnder(key, target.path)) {
      delete expanded.value[key]
    }
  }
  // A deleted model's saved orientation is obsolete.
  removeOrientationsUnder(target.path)
  // The stale-selection check in rescanRoot clears the viewer when the
  // selected model (or an ancestor of it) is gone.
  const rootPath = findRootPathOf(target.path)
  if (rootPath) await rescanRoot(rootPath)
  persist()
}

export function useLibrary() {
  return {
    ready,
    roots,
    search,
    selected,
    selectedVersion,
    notice,
    expanded,
    sidebarWidth,
    renamingPath,
    orientations,
    browseMode,
    galleryDir,
    setBrowseMode,
    setOrientation,
    init,
    addFolder,
    removeRoot,
    toggleDir,
    isOpen,
    selectFile,
    filteredRoots,
    setSidebarWidth,
    persist,
    openContextMenu,
    commitRename,
    cancelRename,
  }
}
