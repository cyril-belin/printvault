<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TreeItem from './TreeItem.vue'
import GalleryView from './GalleryView.vue'
import { useLibrary } from '../composables/useLibrary'
import { openSupportPage } from '../services/support'
import type { BrowseMode, LibNode } from '../types'

defineEmits<{ 'show-about': [] }>()

const { search, notice, roots, filteredRoots, browseMode, setBrowseMode } = useLibrary()

const items = computed(() => filteredRoots())

const searching = computed(() => search.value.trim().length > 0)

const hasAnyMatch = computed(() => items.value.some((item) => item.node !== null))

const totalModels = computed(() => {
  let count = 0
  const walk = (node: LibNode): number => {
    if (!node.isDir) return 1
    let sum = 0
    for (const child of node.children) sum += walk(child)
    return sum
  }
  for (const entry of roots.value) {
    if (entry.tree) count += walk(entry.tree)
  }
  return count
})

const searchInput = ref<HTMLInputElement | null>(null)

function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    searchInput.value?.focus()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const modes: { mode: BrowseMode; title: string; icon: 'list' | 'grid' }[] = [
  { mode: 'tree', title: 'List view', icon: 'list' },
  { mode: 'gallery', title: 'Gallery view', icon: 'grid' },
]
</script>

<template>
  <aside class="sidebar">
    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.4" />
        <path d="m10.4 10.4 2.8 2.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
      <input
        ref="searchInput"
        v-model="search"
        class="search-field"
        type="text"
        placeholder="Search files"
        spellcheck="false"
      />
      <button v-if="search" class="clear-btn" title="Clear search" @click="search = ''">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m5.5 5.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="section-label">
      <span>Library</span>
      <span class="label-right">
        <span v-if="totalModels" class="count">{{ totalModels }}</span>
        <span class="mode-toggle" role="group" aria-label="Browsing mode">
          <button
            v-for="entry in modes"
            :key="entry.mode"
            class="mode-btn"
            :class="{ active: browseMode === entry.mode }"
            :title="entry.title"
            :aria-pressed="browseMode === entry.mode"
            @click="setBrowseMode(entry.mode)"
          >
            <svg v-if="entry.icon === 'list'" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5.5 4h8M5.5 8h8M5.5 12h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <circle cx="2.6" cy="4" r="0.9" fill="currentColor" />
              <circle cx="2.6" cy="8" r="0.9" fill="currentColor" />
              <circle cx="2.6" cy="12" r="0.9" fill="currentColor" />
            </svg>
            <svg v-else viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2.2" y="2.2" width="4.8" height="4.8" rx="1.1" stroke="currentColor" stroke-width="1.3" fill="none" />
              <rect x="9" y="2.2" width="4.8" height="4.8" rx="1.1" stroke="currentColor" stroke-width="1.3" fill="none" />
              <rect x="2.2" y="9" width="4.8" height="4.8" rx="1.1" stroke="currentColor" stroke-width="1.3" fill="none" />
              <rect x="9" y="9" width="4.8" height="4.8" rx="1.1" stroke="currentColor" stroke-width="1.3" fill="none" />
            </svg>
          </button>
        </span>
      </span>
    </div>

    <div v-if="notice" class="notice">{{ notice }}</div>

    <GalleryView v-if="browseMode === 'gallery'" />

    <div v-else class="tree-scroll">
      <ul v-if="hasAnyMatch" class="tree">
        <template v-for="item in items" :key="item.entry.path">
          <TreeItem
            v-if="item.node"
            :node="item.node"
            :depth="0"
            :is-root="true"
            :root-state="item.entry"
          />
          <div v-else-if="item.missing" class="root-error" :title="item.entry.error ?? undefined">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2.2 14.6 13H1.4L8 2.2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
              <path d="M8 6.6v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              <circle cx="8" cy="11.4" r="0.7" fill="currentColor" />
            </svg>
            <span>“{{ item.entry.name }}” is missing or unreadable</span>
          </div>
        </template>
      </ul>

      <div v-else-if="searching" class="side-empty">
        No files match “{{ search.trim() }}”
      </div>

      <div v-else class="side-empty">
        <template v-if="roots.length === 0">
          <p>No folders yet.</p>
          <p class="hint">Click <strong>Add Folder</strong> to index a folder<br />with your STL and 3MF files.</p>
        </template>
        <template v-else>
          <p>No models found here.</p>
        </template>
      </div>
    </div>

    <div class="side-footer">
      <button
        class="footer-link"
        title="Support PrintVault's development with a voluntary tip — opens in your browser"
        @click="openSupportPage"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Support PrintVault
      </button>
      <button class="footer-link" title="About PrintVault" @click="$emit('show-about')">About</button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex: none;
  flex-direction: column;
  min-width: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  padding: 12px 12px 10px;
}

.search-icon {
  position: absolute;
  left: 21px;
  width: 13px;
  height: 13px;
  color: var(--text-3);
  pointer-events: none;
}

.search-field {
  width: 100%;
  height: 28px;
  padding: 0 26px 0 30px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-input);
  color: var(--text);
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
}

.search-field::placeholder {
  color: var(--text-3);
}

.search-field:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2.5px rgba(76, 141, 255, 0.22);
}

.clear-btn {
  position: absolute;
  right: 17px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.clear-btn svg {
  width: 10px;
  height: 10px;
}

.clear-btn:hover {
  color: var(--text);
}

.section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px 6px 18px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-3);
  -webkit-user-select: none;
  user-select: none;
}

.label-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.count {
  font-weight: 500;
  letter-spacing: 0;
  color: var(--text-3);
}

.mode-toggle {
  display: flex;
  gap: 1px;
  padding: 2px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg-input);
}

.mode-btn {
  display: grid;
  place-items: center;
  width: 20px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.mode-btn svg {
  width: 11px;
  height: 11px;
}

.mode-btn:hover {
  color: var(--text);
}

.mode-btn.active {
  background: rgba(76, 141, 255, 0.22);
  color: var(--accent);
}

.notice {
  margin: 0 12px 8px;
  padding: 6px 9px;
  border: 1px solid rgba(255, 176, 67, 0.35);
  border-radius: 6px;
  background: rgba(255, 176, 67, 0.1);
  color: #ffcf8f;
  font-size: 11.5px;
  line-height: 1.35;
}

.tree-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 12px;
}

.tree {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tree-children {
  list-style: none;
  margin: 0;
  padding: 0;
}

.root-error {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 12px 4px;
  padding: 5px 8px;
  border-radius: 6px;
  background: rgba(255, 120, 100, 0.08);
  color: #f0a08e;
  font-size: 11.5px;
}

.root-error svg {
  flex: none;
  width: 13px;
  height: 13px;
}

.side-empty {
  padding: 22px 18px;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.side-empty .hint {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--text-3);
}

.side-empty strong {
  color: var(--text-2);
  font-weight: 600;
}

.side-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding: 6px 10px 7px;
  border-top: 1px solid var(--border-subtle);
  -webkit-user-select: none;
  user-select: none;
}

.footer-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.footer-link svg {
  width: 11px;
  height: 11px;
}

.footer-link:hover {
  color: var(--text-2);
  background: var(--hover);
}
</style>
