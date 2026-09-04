<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import markUrl from '../assets/printvault-mark.png'
import { loadAppVersion } from '../services/appInfo'
import { openSupportPage } from '../services/support'

const emit = defineEmits<{ close: [] }>()

const version = ref<string | null>(null)
const card = ref<HTMLDivElement | null>(null)

let restoreFocusTo: HTMLElement | null = null

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(async () => {
  restoreFocusTo = document.activeElement as HTMLElement | null
  window.addEventListener('keydown', onKeydown)
  card.value?.focus()
  version.value = await loadAppVersion()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  restoreFocusTo?.focus()
})
</script>

<template>
  <div class="about-overlay" @click.self="emit('close')">
    <div
      ref="card"
      class="about-card"
      role="dialog"
      aria-modal="true"
      aria-label="About PrintVault"
      tabindex="-1"
    >
      <button class="about-close" title="Close" aria-label="Close" @click="emit('close')">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m5.5 5.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>

      <img class="about-mark" :src="markUrl" alt="" aria-hidden="true" draggable="false" />
      <h1>PrintVault</h1>
      <p v-if="version" class="about-version">Version {{ version }}</p>

      <p class="about-description">A fast local library and viewer for STL and 3MF files.</p>

      <p class="about-note">
        PrintVault is free and runs locally on your computer. If it saves you
        time managing your 3D-printing library, you can support its
        development with a small tip.
      </p>

      <button class="btn about-support" @click="openSupportPage">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Support PrintVault
      </button>
    </div>
  </div>
</template>

<style scoped>
.about-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
}

.about-card {
  position: relative;
  width: 330px;
  padding: 26px 26px 22px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--bg-sidebar);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
  text-align: center;
  outline: none;
  -webkit-user-select: none;
  user-select: none;
}

.about-close {
  position: absolute;
  top: 9px;
  right: 9px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.about-close svg {
  width: 11px;
  height: 11px;
}

.about-close:hover {
  background: var(--hover);
  color: var(--text);
}

.about-mark {
  width: 56px;
  height: 56px;
  -webkit-user-drag: none;
}

.about-card h1 {
  margin: 10px 0 2px;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text);
}

.about-version {
  margin: 0 0 12px;
  font-size: 11px;
  color: var(--text-3);
}

.about-description {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--text-2);
}

.about-note {
  margin: 0 0 16px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-3);
}

.about-support {
  width: 100%;
  justify-content: center;
}
</style>
