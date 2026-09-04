<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LibNode, ModelExt, ModelStats } from '../types'
import { ModelViewer } from '../viewer/ModelViewer'
import ModelInfoBar from './ModelInfoBar.vue'
import { useLibrary } from '../composables/useLibrary'

const props = defineProps<{ selected: LibNode | null; selectedVersion: number }>()

const { orientations, setOrientation } = useLibrary()

const container = ref<HTMLElement | null>(null)
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const errorMessage = ref('')
const stats = ref<ModelStats | null>(null)
const gizmoOn = ref(false)

let viewer: ModelViewer | null = null
let loadToken = 0

onMounted(() => {
  if (!container.value) return
  viewer = new ModelViewer(container.value, {
    onDimsChange: (dims) => {
      if (stats.value) stats.value = { ...stats.value, dims }
    },
    onOrientationChange: (orientation) => {
      const path = props.selected?.path
      if (path) setOrientation(path, orientation)
    },
  })
  // A selection may have been restored from settings before mount.
  const initial = props.selected
  if (initial?.ext) void loadNode(initial)
})

onBeforeUnmount(() => {
  viewer?.dispose()
  viewer = null
})

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function loadNode(node: LibNode): Promise<void> {
  if (!viewer || !node.ext) return
  const token = ++loadToken
  status.value = 'loading'
  errorMessage.value = ''
  stats.value = null
  // Let the loading overlay paint before the potentially heavy parse.
  await nextPaint()
  await nextPaint()
  if (token !== loadToken) return
  try {
    const saved = orientations.value[node.path] ?? null
    const result = await viewer.load(node.path, node.ext as ModelExt, saved)
    if (token !== loadToken) return
    stats.value = result
    status.value = 'ready'
  } catch (error) {
    if (token !== loadToken) return
    // Drop whatever stale model is on screen so the error state is honest.
    viewer.clear()
    errorMessage.value = error instanceof Error ? error.message : String(error)
    status.value = 'error'
  }
}

watch(
  () => props.selectedVersion,
  () => {
    const node = props.selected
    if (node && node.ext) {
      void loadNode(node)
    } else {
      loadToken += 1
      status.value = 'idle'
      errorMessage.value = ''
      stats.value = null
    }
  },
)

function rotate90(axis: 'x' | 'y' | 'z'): void {
  viewer?.rotate90(axis)
}

function resetOrientation(): void {
  viewer?.resetOrientation()
}

function toggleGizmo(): void {
  gizmoOn.value = !gizmoOn.value
  viewer?.setGizmoEnabled(gizmoOn.value)
}

function resetCamera(): void {
  viewer?.reset()
}

async function retry(): Promise<void> {
  if (props.selected) await loadNode(props.selected)
}

const loadingLabel = () => props.selected?.name ?? ''
</script>

<template>
  <section class="viewer-pane">
    <div class="viewer-area">
      <div ref="container" class="viewer-canvas" />

      <div v-if="status === 'idle'" class="overlay">
        <div class="overlay-card">
          <svg class="overlay-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
            <path d="M3.4 7.3 12 11.6l8.6-4.3M12 11.6V21" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
          </svg>
          <p class="overlay-title">Select a model to preview it.</p>
          <p class="overlay-sub">Click any .stl or .3mf file in your library.</p>
        </div>
      </div>

      <div v-else-if="status === 'loading'" class="overlay overlay-translucent">
        <div class="loading-box">
          <span class="spinner" />
          <span class="loading-name">{{ loadingLabel() }}</span>
        </div>
      </div>

      <div v-else-if="status === 'error'" class="overlay">
        <div class="error-card">
          <svg class="overlay-icon error" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3.2 21.5 19.5H2.5L12 3.2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
            <path d="M12 9.4v4.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="12" cy="16.6" r="0.9" fill="currentColor" />
          </svg>
          <p class="overlay-title">Couldn't render this model</p>
          <p class="error-detail">{{ errorMessage }}</p>
          <p class="overlay-sub">The file may be corrupted, empty or not a valid {{ props.selected?.ext?.toUpperCase() }}.</p>
          <button class="btn" @click="retry">Try Again</button>
        </div>
      </div>

      <div v-if="status === 'ready'" class="orient-bar">
        <button class="orient-btn" title="Rotate the model +90° around X" @click="rotate90('x')">X+90°</button>
        <button class="orient-btn" title="Rotate the model +90° around Y" @click="rotate90('y')">Y+90°</button>
        <button class="orient-btn" title="Rotate the model +90° around Z" @click="rotate90('z')">Z+90°</button>
        <span class="orient-divider" />
        <button
          class="orient-btn icon-btn"
          :class="{ active: gizmoOn }"
          title="Rotation gizmo — drag the rings to rotate the model"
          @click="toggleGizmo"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.2" />
            <ellipse cx="8" cy="8" rx="5.6" ry="2.3" stroke="currentColor" stroke-width="1.2" />
            <circle cx="13.4" cy="8" r="1.5" fill="currentColor" />
          </svg>
        </button>
        <button class="orient-btn" title="Reset orientation to as-loaded" @click="resetOrientation">Reset</button>
      </div>

      <button v-if="status === 'ready'" class="reset-btn" title="Reset camera" @click="resetCamera">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3.2 8a4.8 4.8 0 1 1 1.4 3.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          <path d="M3 7.2v2.6h2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
        </svg>
      </button>

      <div v-if="status === 'ready'" class="hint-strip">Drag to orbit · Scroll to zoom · Right-drag to pan</div>
    </div>

    <ModelInfoBar v-if="status === 'ready' && selected" :node="selected" :stats="stats" />
  </section>
</template>

<style scoped>
.viewer-pane {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  background: var(--bg-panel);
}

.viewer-area {
  position: relative;
  flex: 1;
  min-height: 0;
}

.viewer-canvas {
  position: absolute;
  inset: 0;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.overlay > * {
  pointer-events: auto;
}

.overlay-translucent {
  background: rgba(16, 17, 20, 0.45);
}

.overlay-card,
.error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  max-width: 420px;
  padding: 28px 36px;
  text-align: center;
}

.overlay-icon {
  width: 34px;
  height: 34px;
  margin-bottom: 10px;
  color: var(--text-3);
}

.overlay-icon.error {
  color: #e08c78;
}

.overlay-title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text);
}

.overlay-sub {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-3);
}

.error-detail {
  margin: 2px 0 6px;
  padding: 7px 12px;
  border-radius: 6px;
  background: rgba(224, 140, 120, 0.09);
  border: 1px solid rgba(224, 140, 120, 0.22);
  color: #e8a894;
  font-size: 11.5px;
  font-family: var(--font-mono);
  word-break: break-word;
}

.loading-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 18px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(23, 24, 27, 0.9);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
}

.loading-name {
  font-size: 12.5px;
  color: var(--text-2);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--text-3);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.reset-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-2);
  cursor: pointer;
}

.orient-bar {
  position: absolute;
  top: 14px;
  left: 14px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: rgba(23, 24, 27, 0.88);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  -webkit-user-select: none;
  user-select: none;
}

.orient-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
}

.orient-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text);
}

.orient-btn.active {
  background: rgba(76, 141, 255, 0.22);
  color: var(--accent);
}

.orient-btn.icon-btn {
  width: 26px;
  padding: 0;
}

.orient-btn svg {
  width: 14px;
  height: 14px;
}

.orient-divider {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: var(--border);
}

.reset-btn svg {
  width: 15px;
  height: 15px;
}

.reset-btn:hover {
  color: var(--text);
  background: #2c2e34;
}

.hint-strip {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(23, 24, 27, 0.75);
  border: 1px solid var(--border-subtle);
  color: var(--text-3);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}
</style>
