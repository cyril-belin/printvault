<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AboutDialog from './components/AboutDialog.vue'
import AppHeader from './components/AppHeader.vue'
import LibrarySidebar from './components/LibrarySidebar.vue'
import ViewerPane from './components/ViewerPane.vue'
import { useLibrary } from './composables/useLibrary'
import { SIDEBAR_MAX, SIDEBAR_MIN } from './services/settings'

const { ready, roots, selected, selectedVersion, sidebarWidth, init, addFolder, persist } = useLibrary()

const showAbout = ref(false)

const showOnboarding = computed(() => ready.value && roots.value.length === 0)
const sidebarStyle = computed(() => ({
  width: `${sidebarWidth.value}px`,
  flex: 'none',
}))

const isResizing = ref(false)

function onResizeStart(event: PointerEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = sidebarWidth.value
  isResizing.value = true

  const onMove = (move: PointerEvent) => {
    sidebarWidth.value = Math.min(
      SIDEBAR_MAX,
      Math.max(SIDEBAR_MIN, startWidth + move.clientX - startX),
    )
  }
  const onUp = () => {
    isResizing.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    persist()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

onMounted(() => void init())
</script>

<template>
  <div class="app-shell" :class="{ resizing: isResizing }">
    <AppHeader @add-folder="addFolder" />

    <main v-if="!ready" class="boot" />

    <main v-else-if="showOnboarding" class="onboarding">
      <div class="onboarding-card">
        <svg class="onboarding-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
          <path d="M3.4 7.3 12 11.6l8.6-4.3M12 11.6V21" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
        </svg>
        <h1>Welcome to PrintVault</h1>
        <p class="lead">Add a folder containing your STL and 3MF files.</p>
        <p class="sub">
          PrintVault indexes your folders where they live — nothing is copied, moved or modified.
        </p>
        <button class="btn primary" @click="addFolder">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          Add Folder
        </button>
      </div>
    </main>

    <main v-else class="app-main">
      <LibrarySidebar :style="sidebarStyle" @show-about="showAbout = true" />
      <div
        class="resize-handle"
        title="Drag to resize"
        @pointerdown="onResizeStart"
      />
      <ViewerPane :selected="selected" :selected-version="selectedVersion" />
    </main>

    <AboutDialog v-if="showAbout" @close="showAbout = false" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.boot {
  flex: 1;
}

.app-shell.resizing {
  cursor: col-resize;
  -webkit-user-select: none;
  user-select: none;
}

.app-main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.resize-handle {
  flex: none;
  width: 5px;
  margin: 0 -2px;
  cursor: col-resize;
  z-index: 5;
  transition: background 0.15s ease;
}

.resize-handle:hover,
.resize-handle:active {
  background: rgba(76, 141, 255, 0.35);
}

.onboarding {
  display: grid;
  flex: 1;
  place-items: center;
  background: var(--bg-panel);
}

.onboarding-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 430px;
  padding: 44px 48px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--bg-sidebar);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
  text-align: center;
}

.onboarding-icon {
  width: 52px;
  height: 52px;
  margin-bottom: 18px;
  color: var(--accent);
}

.onboarding-card h1 {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text);
}

.onboarding-card .lead {
  margin: 0 0 8px;
  font-size: 13.5px;
  color: var(--text-2);
}

.onboarding-card .sub {
  margin: 0 0 22px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-3);
}
</style>
