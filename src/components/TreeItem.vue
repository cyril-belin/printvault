<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CtxTarget, LibNode, RootEntry } from '../types'
import { useLibrary } from '../composables/useLibrary'
import { requestThumbnail, thumbEntry } from '../thumbs/thumbnails'
import { cancelVisibilityWatch, whenVisible } from '../thumbs/lazy'

const props = defineProps<{
  node: LibNode
  depth: number
  isRoot: boolean
  rootState?: RootEntry
}>()

const {
  search,
  selected,
  toggleDir,
  isOpen,
  selectFile,
  removeRoot,
  renamingPath,
  commitRename,
  cancelRename,
  openContextMenu,
} = useLibrary()

const searching = () => search.value.trim().length > 0

const open = () => isOpen(props.node.path, props.isRoot, searching())

const isSelected = () => !props.node.isDir && selected.value?.path === props.node.path

const renaming = computed(() => renamingPath.value === props.node.path)

// "3mf" is not a valid CSS class name, so map extensions to safe classes.
const extClass = () => (props.node.ext === 'stl' ? 'is-stl' : 'is-3mf')

// --- Lazy thumbnail --------------------------------------------------------

const rowEl = ref<HTMLElement | null>(null)
const thumb = computed(() => (props.node.ext ? thumbEntry(props.node.path) : undefined))

function requestWhenVisible(): void {
  if (!rowEl.value || props.node.isDir || !props.node.ext) return
  whenVisible(rowEl.value, () => requestThumbnail(props.node))
}

onMounted(requestWhenVisible)
watch(
  () => [props.node.path, props.node.modified, props.node.size] as const,
  () => {
    if (rowEl.value) requestThumbnail(props.node)
  },
)
onBeforeUnmount(() => cancelVisibilityWatch(rowEl.value ?? undefined))

const renameValue = ref('')
const renameError = ref<string | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)

watch(renaming, async (active) => {
  if (!active) return
  renameValue.value = props.node.name
  renameError.value = null
  await nextTick()
  const input = renameInput.value
  if (!input) return
  input.focus()
  // Pre-select the basename, leaving the extension out for model files.
  const ext = props.node.ext
  if (!props.node.isDir && ext && props.node.name.length > ext.length) {
    input.setSelectionRange(0, props.node.name.length - ext.length - 1)
  } else {
    input.select()
  }
})

async function confirmRename(): Promise<void> {
  const error = await commitRename(props.node.path, renameValue.value)
  renameError.value = error
}

function onBlur(): void {
  if (!renaming.value) return
  if (renameError.value) {
    cancelRename()
  } else {
    void confirmRename()
  }
}

function onClick(): void {
  if (renaming.value) return
  if (props.node.isDir) {
    toggleDir(props.node.path)
  } else {
    selectFile(props.node)
  }
}

function onContextMenu(event: MouseEvent): void {
  if (renaming.value) return
  event.preventDefault()
  const target: CtxTarget = {
    path: props.node.path,
    name: props.node.name,
    kind: props.isRoot ? 'root' : props.node.isDir ? 'dir' : 'file',
  }
  void openContextMenu(target)
}
</script>

<template>
  <li class="tree-item">
    <div
      ref="rowEl"
      class="tree-row"
      :class="{
        dir: node.isDir,
        file: !node.isDir,
        selected: isSelected(),
        'root-row': isRoot,
        renaming,
      }"
      :style="{ paddingLeft: 10 + depth * 14 + 'px' }"
      :title="renaming ? undefined : node.path"
      @click="onClick"
      @contextmenu="onContextMenu"
    >
      <span class="chevron" :class="{ open: open(), leaf: !node.isDir }">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 4.5 10 8l-4 3.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>

      <svg v-if="node.isDir" class="icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M1.8 4.2c0-.66.54-1.2 1.2-1.2h3l1.5 1.6h5.5c.66 0 1.2.54 1.2 1.2v6c0 .66-.54 1.2-1.2 1.2H3c-.66 0-1.2-.54-1.2-1.2v-7.6Z"
          fill="currentColor"
          opacity="0.55"
        />
      </svg>
      <img
        v-else-if="thumb?.status === 'ready' && thumb.url"
        class="thumb"
        :class="extClass()"
        :src="thumb.url"
        alt=""
        draggable="false"
      />
      <svg v-else class="icon model" :class="extClass()" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 1.6 14 5v6l-6 3.4L2 11V5l6-3.4Z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.25"
          stroke-linejoin="round"
        />
        <path d="M2.3 5.2 8 8.3l5.7-3.1M8 8.3v5.9" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" />
      </svg>

      <input
        v-if="renaming"
        ref="renameInput"
        v-model="renameValue"
        class="rename-input"
        :class="{ invalid: renameError }"
        type="text"
        spellcheck="false"
        @click.stop
        @keydown.enter.prevent="confirmRename"
        @keydown.esc.prevent="cancelRename"
        @blur="onBlur"
      />
      <span v-else class="label">{{ node.name }}</span>

      <span v-if="rootState?.scanning && !renaming" class="spinner" title="Indexing…" />
      <button
        v-if="isRoot && !renaming"
        class="remove-btn"
        title="Remove folder from PrintVault"
        @click.stop="removeRoot(node.path)"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m5.2 5.2 5.6 5.6m0-5.6-5.6 5.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div v-if="renaming && renameError" class="rename-error">{{ renameError }}</div>

    <ul v-if="node.isDir && open()" class="tree-children">
      <TreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :is-root="false"
      />
    </ul>
  </li>
</template>

<style scoped>
/* li rendered as block: prevents the marker from creating an extra line box */
.tree-item {
  display: block;
  position: relative;
}

.tree-children {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding-right: 8px;
  border-radius: 6px;
  margin: 0 6px 1px 6px;
  color: var(--text-2);
  cursor: default;
  -webkit-user-select: none;
  user-select: none;
}

.tree-row:hover {
  background: var(--hover);
}

.tree-row.selected {
  background: var(--selected-bg);
  color: var(--text);
}

.tree-row.dir {
  color: var(--text);
  font-weight: 500;
}

.tree-row.renaming {
  background: var(--selected-bg);
  outline: 1.5px solid var(--accent);
}

.chevron {
  flex: none;
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  color: var(--text-3);
  transition: transform 0.12s ease;
}

.chevron.open {
  transform: rotate(90deg);
}

.chevron.leaf {
  visibility: hidden;
}

.chevron svg {
  width: 13px;
  height: 13px;
}

.icon {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--text-3);
}

/* Rendered model thumbnail: same footprint as the icon, keeps rows compact. */
.thumb {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 3.5px;
  object-fit: contain;
  background: #202227;
}

.icon.model.is-stl {
  color: var(--stl-color);
}

.icon.model.is-3mf {
  color: var(--threemf-color);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  line-height: 1;
}

.rename-input {
  flex: 1;
  min-width: 0;
  height: 20px;
  padding: 0 5px;
  border: none;
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
}

.rename-input.invalid {
  box-shadow: 0 0 0 1.5px rgba(255, 120, 100, 0.7);
}

.rename-error {
  position: absolute;
  left: 12px;
  top: 27px;
  z-index: 30;
  max-width: calc(100% - 24px);
  padding: 5px 9px;
  border-radius: 6px;
  border: 1px solid rgba(255, 120, 100, 0.35);
  background: #2a1d1c;
  color: #ffb3a3;
  font-size: 11px;
  line-height: 1.35;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

.spinner {
  flex: none;
  width: 11px;
  height: 11px;
  border: 1.5px solid var(--text-3);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.remove-btn {
  flex: none;
  display: none;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.remove-btn svg {
  width: 11px;
  height: 11px;
}

.tree-row:hover .remove-btn {
  display: grid;
}

.remove-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}
</style>
