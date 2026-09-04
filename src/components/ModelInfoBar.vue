<script setup lang="ts">
import type { LibNode, ModelStats } from '../types'

defineProps<{
  node: LibNode
  stats: ModelStats | null
}>()

function formatBytes(bytes?: number): string {
  if (bytes == null) return '—'
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

function formatDims(dims: { x: number; y: number; z: number }): string {
  const trim = (n: number) => String(Math.round(n * 10) / 10)
  return `${trim(dims.x)} × ${trim(dims.y)} × ${trim(dims.z)} mm`
}

function formatDate(unixSeconds?: number): string {
  if (!unixSeconds) return '—'
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatCount(value?: number): string {
  return value == null ? '—' : value.toLocaleString('en-US')
}
</script>

<template>
  <footer class="info-bar">
    <div class="info-file">
      <span class="ext-badge" :class="node.ext === 'stl' ? 'is-stl' : 'is-3mf'">{{ node.ext?.toUpperCase() }}</span>
      <span class="info-name" :title="node.path">{{ node.name }}</span>
    </div>

    <dl class="info-meta">
      <div class="meta-item">
        <dt>Size</dt>
        <dd>{{ formatBytes(node.size) }}</dd>
      </div>
      <div class="meta-item dims">
        <dt>Dimensions</dt>
        <dd>{{ stats ? formatDims(stats.dims) : '…' }}</dd>
      </div>
      <div class="meta-item">
        <dt>Triangles</dt>
        <dd>{{ stats ? formatCount(stats.triangles) : '…' }}</dd>
      </div>
      <div class="meta-item">
        <dt>Objects</dt>
        <dd>{{ stats ? formatCount(stats.meshes) : '…' }}</dd>
      </div>
      <div class="meta-item">
        <dt>Modified</dt>
        <dd>{{ formatDate(node.modified) }}</dd>
      </div>
    </dl>
  </footer>
</template>

<style scoped>
.info-bar {
  display: flex;
  align-items: center;
  gap: 26px;
  flex: none;
  height: 58px;
  padding: 0 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-user-select: none;
  user-select: none;
}

.info-file {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.ext-badge {
  flex: none;
  padding: 2.5px 6px;
  border-radius: 5px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.ext-badge.is-stl {
  background: rgba(94, 190, 172, 0.14);
  color: var(--stl-color);
}

.ext-badge.is-3mf {
  background: rgba(126, 140, 255, 0.15);
  color: var(--threemf-color);
}

.info-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-meta {
  display: flex;
  align-items: center;
  gap: 26px;
  margin: 0;
  flex: 1;
  min-width: 0;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: none;
}

.meta-item dt {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.meta-item dd {
  margin: 0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
  white-space: nowrap;
}

.meta-item.dims dd {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text);
}
</style>
