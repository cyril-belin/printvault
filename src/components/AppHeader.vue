<script setup lang="ts">
import markUrl from '../assets/printvault-mark.png'

defineEmits<{ 'add-folder': [] }>()
</script>

<template>
  <header class="app-header">
    <div class="app-title">
      <img class="app-logo" :src="markUrl" alt="" aria-hidden="true" draggable="false" />
      <span>PrintVault</span>
    </div>
    <button class="btn" title="Add a folder containing STL and 3MF files" @click="$emit('add-folder')">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      Add Folder
    </button>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 50px;
  padding: 0 16px 0 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-header);
  flex: none;
  -webkit-user-select: none;
  user-select: none;
}

.app-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text);
}

.app-logo {
  width: 20px;
  height: 20px;
  -webkit-user-drag: none;
}
</style>
