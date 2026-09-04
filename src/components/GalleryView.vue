<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { CtxTarget, LibNode } from '../types'
import { useLibrary } from '../composables/useLibrary'
import { isSameOrUnder, joinPath, segmentsUnder } from '../services/paths'
import { requestThumbnail, thumbEntry } from '../thumbs/thumbnails'
import { cancelVisibilityWatch, whenVisible } from '../thumbs/lazy'

/**
 * Thumbnail gallery for the currently selected directory (or for the whole
 * filtered library while a search is active). Selecting a tile goes through
 * the exact same code path as clicking the file in the tree.
 */

const {
  search,
  roots,
  selected,
  selectFile,
  filteredRoots,
  expanded,
  persist,
  renamingPath,
  commitRename,
  cancelRename,
  openContextMenu,
  galleryDir,
} = useLibrary()

const searching = computed(() => search.value.trim().length > 0)

// `v-thumb="node"` — lazily requests the thumbnail once the tile is visible.
// Re-renders that bring a changed file (new mtime/size) re-request visible
// tiles so thumbnails never go stale; offscreen tiles stay lazy.
const watched = new Set<HTMLElement>()
interface ThumbEl extends HTMLElement {
  __pvNode?: LibNode
  __pvFired?: boolean
}
const vThumb = {
  mounted(el: ThumbEl, binding: { value: LibNode }): void {
    watched.add(el)
    el.__pvNode = binding.value
    whenVisible(el, () => {
      el.__pvFired = true
      requestThumbnail(el.__pvNode!)
    })
  },
  updated(el: ThumbEl, binding: { value: LibNode }): void {
    el.__pvNode = binding.value
    if (el.__pvFired) requestThumbnail(binding.value)
  },
  unmounted(el: ThumbEl): void {
    watched.delete(el)
    cancelVisibilityWatch(el)
  },
}

function findDirInTree(node: LibNode, path: string): LibNode | null {
  if (!node.isDir) return null
  if (node.path === path) return node
  for (const child of node.children) {
    if (!child.isDir) continue
    const hit = findDirInTree(child, path)
    if (hit) return hit
  }
  return null
}

/** Directory shown in browse mode; falls back to the first root when the
 *  remembered directory no longer exists (deleted, unmounted…). */
const currentNode = computed<LibNode | null>(() => {
  const dir = galleryDir.value
  if (dir) {
    for (const entry of roots.value) {
      if (entry.tree) {
        const hit = findDirInTree(entry.tree, dir)
        if (hit) return hit
      }
    }
  }
  return roots.value.find((r) => r.tree)?.tree ?? null
})

function collectFiles(node: LibNode, out: LibNode[]): void {
  if (!node.isDir) {
    out.push(node)
    return
  }
  for (const child of node.children) collectFiles(child, out)
}

interface Crumb {
  name: string
  path: string
}

const crumbs = computed<Crumb[]>(() => {
  const node = currentNode.value
  if (!node) return []
  const rootEntry = roots.value.find((r) => isSameOrUnder(node.path, r.path))
  if (!rootEntry) return [{ name: node.name, path: node.path }]
  const rest = segmentsUnder(node.path, rootEntry.path)
  const list: Crumb[] = [{ name: rootEntry.name, path: rootEntry.path }]
  let prefix = rootEntry.path
  for (const segment of rest) {
    prefix = joinPath(prefix, segment)
    list.push({ name: segment, path: prefix })
  }
  return list
})

/** Deep paths collapse to root › … › parent › current so the current folder
 *  always stays visible in the narrow sidebar. */
const visibleCrumbs = computed(() => {
  const list = crumbs.value
  if (list.length <= 3) return { list, collapsed: false }
  return { list: [list[0], list[list.length - 2], list[list.length - 1]], collapsed: true }
})

const browseDirs = computed<LibNode[]>(() =>
  searching.value ? [] : (currentNode.value?.children.filter((c) => c.isDir) ?? []),
)
const browseFiles = computed<LibNode[]>(() =>
  searching.value ? [] : (currentNode.value?.children.filter((c) => !c.isDir) ?? []),
)
const searchFiles = computed<LibNode[]>(() => {
  if (!searching.value) return []
  const out: LibNode[] = []
  for (const item of filteredRoots()) {
    if (item.node) collectFiles(item.node, out)
  }
  return out
})

const files = computed<LibNode[]>(() => (searching.value ? searchFiles.value : browseFiles.value))

// --- Navigation ------------------------------------------------------------

function openDir(node: LibNode): void {
  galleryDir.value = node.path
  // The tree follows gallery navigation.
  expanded.value[node.path] = true
  persist()
}

function openCrumb(path: string): void {
  galleryDir.value = path
}

// --- Selection / context menu ----------------------------------------------

const isSelected = (node: LibNode): boolean => !node.isDir && selected.value?.path === node.path

function onClickFile(node: LibNode): void {
  if (renamingFile.value) return
  selectFile(node)
}

function onContextMenu(event: MouseEvent, node: LibNode): void {
  if (renamingFile.value) return
  event.preventDefault()
  const target: CtxTarget = { path: node.path, name: node.name, kind: 'file' }
  void openContextMenu(target)
}

// --- Inline rename (same flow as the tree rows) -----------------------------

const renamingFile = computed<LibNode | null>(
  () => files.value.find((f) => renamingPath.value === f.path) ?? null,
)
const renaming = (node: LibNode): boolean => renamingPath.value === node.path

const renameValue = ref('')
const renameError = ref<string | null>(null)
// Rendered inside v-for, so Vue collects template refs into an array.
const renameInput = ref<HTMLInputElement[]>([])

watch(renamingFile, async (node, previous) => {
  if (!node || previous?.path === node.path) return
  renameValue.value = node.name
  renameError.value = null
  await nextTick()
  const input = renameInput.value[0]
  if (!input) return
  input.focus()
  const ext = node.ext
  if (ext && node.name.length > ext.length) {
    input.setSelectionRange(0, node.name.length - ext.length - 1)
  } else {
    input.select()
  }
})

async function confirmRename(node: LibNode): Promise<void> {
  const error = await commitRename(node.path, renameValue.value)
  renameError.value = error
}

function onBlurRename(node: LibNode): void {
  if (!renaming(node)) return
  if (renameError.value) cancelRename()
  else void confirmRename(node)
}

// --- Card meta -------------------------------------------------------------

function tileClass(node: LibNode): string {
  return node.ext === 'stl' ? 'is-stl' : 'is-3mf'
}

function thumbFor(node: LibNode) {
  return thumbEntry(node.path)
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`
}

onBeforeUnmount(() => {
  for (const el of watched) cancelVisibilityWatch(el)
  watched.clear()
})
</script>

<template>
  <div class="gallery">
    <div class="gallery-header">
      <template v-if="searching">
        <span class="crumb-label">Results</span>
        <span class="crumb-count">{{ files.length }}</span>
      </template>
      <template v-else>
        <template v-for="(crumb, index) in visibleCrumbs.list" :key="crumb.path">
          <span v-if="index === 1 && visibleCrumbs.collapsed" class="crumb-ellipsis" title="…">…</span>
          <button
            class="crumb"
            :class="{ current: index === visibleCrumbs.list.length - 1 }"
            type="button"
            :title="crumb.path"
            @click="openCrumb(crumb.path)"
          >
            {{ crumb.name }}
          </button>
        </template>
        <span class="crumb-count">{{ files.length }}</span>
      </template>
    </div>

    <div class="gallery-scroll">
      <div v-if="files.length === 0 && browseDirs.length === 0" class="gallery-empty">
        <template v-if="searching">
          <p>No files match “{{ search.trim() }}”</p>
        </template>
        <template v-else>
          <p>No models in this folder.</p>
        </template>
      </div>

      <template v-else>
        <div v-if="browseDirs.length" class="dir-chips">
          <button
            v-for="dir in browseDirs"
            :key="dir.path"
            class="dir-chip"
            type="button"
            :title="dir.path"
            @click="openDir(dir)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M1.8 4.2c0-.66.54-1.2 1.2-1.2h3l1.5 1.6h5.5c.66 0 1.2.54 1.2 1.2v6c0 .66-.54 1.2-1.2 1.2H3c-.66 0-1.2-.54-1.2-1.2v-7.6Z"
                fill="currentColor"
                opacity="0.55"
              />
            </svg>
            <span>{{ dir.name }}</span>
          </button>
        </div>

        <div class="tiles">
          <div
            v-for="file in files"
            :key="file.path"
            v-thumb="file"
            class="tile"
            :class="{ selected: isSelected(file), renaming: renaming(file) }"
            :title="file.path"
            @click="onClickFile(file)"
            @contextmenu="onContextMenu($event, file)"
          >
            <div class="tile-thumb">
              <img
                v-if="thumbFor(file)?.status === 'ready' && thumbFor(file)?.url"
                :src="thumbFor(file)?.url ?? undefined"
                :alt="file.name"
                draggable="false"
              />
              <svg v-else class="tile-fallback" :class="tileClass(file)" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 1.6 14 5v6l-6 3.4L2 11V5l6-3.4Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.1"
                  stroke-linejoin="round"
                />
                <path d="M2.3 5.2 8 8.3l5.7-3.1M8 8.3v5.9" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" />
              </svg>
            </div>

            <input
              v-if="renaming(file)"
              ref="renameInput"
              v-model="renameValue"
              class="tile-rename"
              :class="{ invalid: renameError }"
              type="text"
              spellcheck="false"
              @click.stop
              @keydown.enter.prevent="confirmRename(file)"
              @keydown.esc.prevent="cancelRename"
              @blur="onBlurRename(file)"
            />
            <template v-else>
              <span class="tile-name">{{ file.name }}</span>
              <span class="tile-meta">
                <span class="tile-ext" :class="tileClass(file)">{{ file.ext?.toUpperCase() }}</span>
                <span class="tile-size">{{ formatBytes(file.size) }}</span>
              </span>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.gallery {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.gallery-header {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: none;
  min-width: 0;
  padding: 8px 12px 6px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-user-select: none;
  user-select: none;
}

.gallery-header::-webkit-scrollbar {
  display: none;
}

.crumb {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 110px;
  padding: 2px 5px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.crumb::after {
  content: '›';
  margin-left: 4px;
  color: var(--text-3);
  opacity: 0.6;
}

.crumb:hover {
  background: var(--hover);
  color: var(--text);
}

.crumb.current {
  flex: none;
  max-width: 160px;
  color: var(--text);
  font-weight: 600;
  cursor: default;
}

.crumb.current:hover {
  background: transparent;
}

.crumb-ellipsis {
  flex: none;
  padding: 0 1px;
  color: var(--text-3);
  font-size: 11.5px;
}

.crumb-count {
  flex: none;
  margin-left: auto;
  padding-left: 6px;
  font-size: 10.5px;
  color: var(--text-3);
}

.crumb-label {
  flex: none;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text);
}

.gallery-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 10px 12px;
}

.gallery-empty {
  padding: 26px 14px;
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}

.dir-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 2px 2px 10px;
}

.dir-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  height: 22px;
  padding: 0 8px 0 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 11px;
  background: var(--bg-input);
  color: var(--text-2);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.dir-chip svg {
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--text-3);
}

.dir-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-chip:hover {
  background: var(--hover);
  color: var(--text);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
  gap: 8px;
}

.tile {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 4px 4px 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-input);
  cursor: default;
  -webkit-user-select: none;
  user-select: none;
}

.tile:hover {
  border-color: var(--border);
  background: var(--hover);
}

.tile.selected {
  border-color: var(--accent);
  background: rgba(76, 141, 255, 0.1);
}

.tile-thumb {
  display: grid;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 5px;
  background: #202227;
  overflow: hidden;
}

.tile-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.tile-fallback {
  width: 34%;
  height: 34%;
  color: var(--text-3);
  opacity: 0.55;
}

.tile-fallback.is-stl {
  color: var(--stl-color);
}

.tile-fallback.is-3mf {
  color: var(--threemf-color);
}

.tile-name {
  margin-top: 5px;
  padding: 0 2px;
  font-size: 11px;
  line-height: 1.3;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile.selected .tile-name {
  color: var(--text);
}

.tile-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  padding: 0 2px 1px;
  min-width: 0;
}

.tile-ext {
  flex: none;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.tile-ext.is-stl {
  color: var(--stl-color);
}

.tile-ext.is-3mf {
  color: var(--threemf-color);
}

.tile-size {
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile.renaming {
  border-color: var(--accent);
}

.tile-rename {
  width: 100%;
  height: 20px;
  margin-top: 5px;
  padding: 0 4px;
  border: none;
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  outline: none;
}

.tile-rename.invalid {
  box-shadow: 0 0 0 1.5px rgba(255, 120, 100, 0.7);
}
</style>
