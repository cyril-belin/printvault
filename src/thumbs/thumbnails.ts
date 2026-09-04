import { reactive } from 'vue'
import type { LibNode } from '../types'
import { readModelBytes, thumbGet, thumbStore } from '../services/backend'
import { renderThumbnail } from './ThumbnailRenderer'

/**
 * Session-wide thumbnail store: path -> entry, shared by the tree and the
 * gallery. Cache lookups and rendering are asynchronous and bounded by a
 * small semaphore, so scanning through a large folder never floods the
 * main thread or the GPU.
 */

export type ThumbStatus = 'pending' | 'ready' | 'failed'

export interface ThumbEntry {
  status: ThumbStatus
  /** PNG data URL when ready. */
  url: string | null
  /** Source metadata the entry was produced for; a mismatch triggers a refresh. */
  mtime: number | null | undefined
  size: number | null | undefined
}

const thumbs = reactive(new Map<string, ThumbEntry>())

/** Renders are the expensive step (read + parse + GPU): at most two at a time. */
const MAX_CONCURRENT = 2

class Semaphore {
  private count = 0
  private waiters: (() => void)[] = []

  async acquire(): Promise<void> {
    if (this.count < MAX_CONCURRENT) {
      this.count += 1
      return
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
  }

  release(): void {
    const next = this.waiters.shift()
    if (next) next() // hand the slot straight over; count stays at max
    else this.count -= 1
  }
}

const slots = new Semaphore()

const DATA_URL_PREFIX = 'data:image/png;base64,'
const PENDING: Omit<ThumbEntry, 'mtime' | 'size'> = { status: 'pending', url: null }
const FAILED: Omit<ThumbEntry, 'mtime' | 'size'> = { status: 'failed', url: null }

function sameSource(node: LibNode, entry: ThumbEntry): boolean {
  return entry.mtime === node.modified && entry.size === node.size
}

/**
 * Ensures a thumbnail exists for a model node. Safe to call on every render
 * of a component: existing entries (matching the file's mtime/size) are
 * reused, misses are queued once.
 */
export function requestThumbnail(node: LibNode): void {
  if (node.isDir || !node.ext) return
  const existing = thumbs.get(node.path)
  if (existing && sameSource(node, existing)) return
  thumbs.set(node.path, { ...PENDING, mtime: node.modified, size: node.size })
  void loadThumbnail(node)
}

export function thumbEntry(path: string): ThumbEntry | undefined {
  return thumbs.get(path)
}

async function loadThumbnail(node: LibNode): Promise<void> {
  try {
    // Fast path: unchanged files hit the disk cache immediately.
    const cached = await thumbGet(node.path)
    if (cached) {
      setEntry(node.path, { status: 'ready', url: DATA_URL_PREFIX + cached, mtime: node.modified, size: node.size })
      return
    }

    // Miss: queue the real render so many visible items don't parse at once.
    await slots.acquire()
    try {
      const bytes = await readModelBytes(node.path)
      const dataUrl = await renderThumbnail(node.ext as 'stl' | '3mf', bytes)
      const base64 = dataUrl.slice(DATA_URL_PREFIX.length)
      void thumbStore(node.path, base64).catch(() => undefined)
      setEntry(node.path, { status: 'ready', url: dataUrl, mtime: node.modified, size: node.size })
    } finally {
      slots.release()
    }
  } catch {
    // A broken file must never break navigation: neutral fallback icon.
    setEntry(node.path, { ...FAILED, mtime: node.modified, size: node.size })
  }
}

function setEntry(path: string, entry: ThumbEntry): void {
  // Ignore stale completions (file changed while we were rendering).
  const current = thumbs.get(path)
  if (current && (current.mtime !== entry.mtime || current.size !== entry.size)) return
  thumbs.set(path, entry)
}
