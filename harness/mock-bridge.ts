/**
 * Browser-only harness: fakes the Tauri IPC surface so the real PrintVault
 * frontend (real Vue components, real three.js thumbnails, real model bytes
 * served by Vite) can be exercised outside the Tauri shell.
 *
 * Loaded before /src/main.ts from harness.html. Not part of the production
 * build (tsconfig only includes src/).
 */

type LibNode = {
  name: string
  path: string
  isDir: boolean
  ext?: string
  size?: number
  modified?: number
  children: LibNode[]
}

/**
 * Synthetic project root. harness/manifest.json stores paths relative to the
 * repository root, so the harness works from any checkout location; the
 * relative paths are re-anchored below to look like absolute FS paths.
 */
const PROJECT = '/printvault-harness'
const ROOT_REL = 'dev-assets/test-library/Impression 3D'
const ROOT_PATH = `${PROJECT}/${ROOT_REL}`

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ManifestNode extends LibNode {
  children: ManifestNode[]
}

function anchorManifest(node: ManifestNode): void {
  node.path = `${PROJECT}/${node.path}`
  for (const child of node.children) anchorManifest(child)
}

let manifest: ManifestNode = JSON.parse(
  // @ts-expect-error Vite raw import; this file is excluded from tsconfig.
  (await import('./manifest.json?raw')).default,
) as ManifestNode
anchorManifest(manifest)

const pkgVersion = (
  JSON.parse(
    // @ts-expect-error Vite raw import; this file is excluded from tsconfig.
    (await import('../package.json?raw')).default,
  ) as { version: string }
).version

const settings = {
  version: 1,
  roots: [ROOT_PATH],
  expanded: {} as Record<string, boolean>,
  selectedPath: null as string | null,
  sidebarWidth: 300,
  orientations: {} as Record<string, unknown>,
  browseMode: 'tree' as 'tree' | 'gallery',
}

// v2: manifest paths are project-relative, so pre-v2 persisted settings with
// machine-specific absolute paths are intentionally invalidated.
const settingsKey = 'pv-harness-settings-v2'
const thumbKey = 'pv-harness-thumbs-v2'

try {
  const saved = localStorage.getItem(settingsKey)
  if (saved) Object.assign(settings, JSON.parse(saved))
} catch {
  /* fresh harness */
}

/** Simulated disk thumbnail cache: key -> base64 PNG. */
const thumbCache = new Map<string, string>(
  Object.entries(JSON.parse(localStorage.getItem(thumbKey) ?? '{}') as Record<string, string>),
)

function persistThumbs(): void {
  try {
    localStorage.setItem(thumbKey, JSON.stringify(Object.fromEntries(thumbCache)))
  } catch (error) {
    console.warn('harness: thumb cache too large for localStorage', error)
  }
}

// ---------------------------------------------------------------------------
// Event plumbing
// ---------------------------------------------------------------------------

let callbackId = 0
const callbacks = new Map<number, (payload: unknown) => void>()
const eventHandlers = new Map<string, Set<number>>()

function emit(event: string, payload: unknown): void {
  const ids = eventHandlers.get(event)
  if (!ids) return
  for (const id of [...ids]) {
    const cb = callbacks.get(id)
    if (cb) cb({ event, id, payload })
  }
}

// ---------------------------------------------------------------------------
// FS operations on the in-memory manifest
// ---------------------------------------------------------------------------

function findNode(path: string, node: ManifestNode = manifest): ManifestNode | null {
  if (node.path === path) return node
  for (const child of node.children) {
    const hit = findNode(path, child)
    if (hit) return hit
  }
  return null
}

function findParent(path: string): ManifestNode | null {
  const index = path.lastIndexOf('/')
  return index > 0 ? findNode(path.slice(0, index)) : null
}

function removeFromManifest(path: string): void {
  const parent = findParent(path)
  if (!parent) return
  parent.children = parent.children.filter((c) => c.path !== path)
}

function cloneTree(node: ManifestNode): LibNode {
  return { ...node, children: node.children.map(cloneTree) }
}

/** Metadata of pre-rename paths, so thumb_migrate can key the old entry
 *  even though the manifest was already re-keyed (mirrors the real backend,
 *  which stats the file at its new location). */
const tombstones = new Map<string, { modified?: number; size?: number }>()

function metaFor(path: string): { modified?: number; size?: number } | null {
  const node = findNode(path)
  if (node && !node.isDir) return { modified: node.modified, size: node.size }
  return tombstones.get(path) ?? null
}

function pathToUrl(path: string): string {
  return encodeURI(path.replace(PROJECT, ''))
}

function sanitizeName(raw: string, ext: string | undefined): string {
  const name = raw.trim()
  if (!ext) return name
  const canonical = `.${ext}`
  if (name.toLowerCase().endsWith(canonical)) return name
  const stem = /\.(stl|3mf)$/i.test(name) ? name.slice(0, -4) : name
  return `${stem}${canonical}`
}

// ---------------------------------------------------------------------------
// The IPC surface
// ---------------------------------------------------------------------------

;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  transformCallback(callback: (payload: unknown) => void, once = false): number {
    const id = ++callbackId
    callbacks.set(id, (payload) => {
      callback(payload)
      if (once) callbacks.delete(id)
    })
    return id
  },
  invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    switch (cmd) {
      case 'load_settings':
        return Promise.resolve(localStorage.getItem(settingsKey) ? settings : null)

      case 'save_settings':
        localStorage.setItem(settingsKey, JSON.stringify(args.settings))
        return Promise.resolve()

      case 'sync_roots':
        return Promise.resolve()

      case 'scan_root':
        return Promise.resolve(cloneTree(manifest))

      case 'read_model': {
        const virtual = (window as unknown as Record<string, unknown>).__virtualFiles as Map<string, string> | undefined
        const mapped = virtual?.get(String(args.path))
        const url = pathToUrl(mapped ?? String(args.path))
        return fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            return r.arrayBuffer()
          })
          .catch(() => {
            throw new Error('Could not read file (harness fetch failed).')
          })
      }

      case 'thumb_get': {
        const path = String(args.path)
        const node = findNode(path)
        if (!node || node.isDir) return Promise.resolve(null)
        const key = `${path}|${node.modified}|${node.size}`
        return Promise.resolve(thumbCache.get(key) ?? null)
      }

      case 'thumb_store': {
        const path = String(args.path)
        const node = findNode(path)
        if (!node || node.isDir) return Promise.reject(new Error('not a file'))
        const key = `${path}|${node.modified}|${node.size}`
        thumbCache.set(key, String(args.dataBase64))
        persistThumbs()
        return Promise.resolve()
      }

      case 'thumb_migrate': {
        const oldPath = String(args.oldPath)
        const newPath = String(args.newPath)
        const oldMeta = metaFor(oldPath)
        const newMeta = metaFor(newPath)
        if (!oldMeta || !newMeta) return Promise.resolve()
        const from = `${oldPath}|${oldMeta.modified}|${oldMeta.size}`
        const to = `${newPath}|${newMeta.modified}|${newMeta.size}`
        const data = thumbCache.get(from)
        if (data && !thumbCache.has(to)) thumbCache.set(to, data)
        persistThumbs()
        return Promise.resolve()
      }

      case 'thumb_gc': {
        const valid = new Set<string>()
        for (const p of args.paths as string[]) {
          const node = findNode(p)
          if (node && !node.isDir) valid.add(`${p}|${node.modified}|${node.size}`)
        }
        for (const key of [...thumbCache.keys()]) {
          if (!valid.has(key)) thumbCache.delete(key)
        }
        persistThumbs()
        return Promise.resolve()
      }

      case 'plugin:event|listen': {
        const event = String(args.event)
        const handler = Number(args.handler)
        if (!eventHandlers.has(event)) eventHandlers.set(event, new Set())
        eventHandlers.get(event)!.add(handler)
        return Promise.resolve(handler)
      }

      case 'plugin:event|unbind': {
        const event = String(args.event)
        eventHandlers.get(event)?.delete(Number(args.id))
        return Promise.resolve()
      }

      case 'show_context_menu':
        ;(window as unknown as Record<string, unknown>).__harnessCtxTarget = args.target
        console.info('[harness] context menu for', args.target)
        return Promise.resolve()

      case 'reveal_in_finder':
        console.info('[harness] reveal in Finder:', args.path)
        return Promise.resolve()

      // Support (tip) link — the opener plugin would hand this to the OS
      // default browser; the harness just logs it.
      case 'plugin:opener|open_url':
        console.info('[harness] open URL in default browser:', args.url)
        return Promise.resolve()

      // Real app metadata, so the About dialog shows the packaged version.
      case 'plugin:app|version':
        return Promise.resolve(pkgVersion)

      case 'rename_item': {
        const oldPath = String(args.oldPath)
        const node = findNode(oldPath)
        if (!node) return Promise.reject(new Error('Item no longer exists.'))
        const ext = node.isDir ? undefined : node.ext
        const finalName = sanitizeName(String(args.newName), ext)
        const parent = findParent(oldPath)
        if (parent?.children.some((c) => c !== node && c.name.toLowerCase() === finalName.toLowerCase())) {
          return Promise.reject(new Error(`“${finalName}” already exists in this folder.`))
        }
        tombstones.set(oldPath, { modified: node.modified, size: node.size })
        const newPath = `${oldPath.slice(0, oldPath.lastIndexOf('/') + 1)}${finalName}`
        node.name = finalName
        node.path = newPath
        const rekey = (n: ManifestNode): void => {
          for (const child of n.children) {
            child.path = `${n.path}/${child.name}`
            rekey(child)
          }
        }
        rekey(node)
        setTimeout(() => emit('fs-changed', { roots: settings.roots }), 100)
        return Promise.resolve(newPath)
      }

      case 'delete_item': {
        const path = String(args.path)
        removeFromManifest(path)
        setTimeout(() => emit('fs-changed', { roots: settings.roots }), 100)
        return Promise.resolve()
      }

      case 'plugin:dialog|ask':
      case 'plugin:dialog|message': {
        // The plugin resolves `ask()` to (pressedButton === okLabel): return
        // the ok label string, or null for plain message dialogs.
        if (window.__harnessConfirm === false) return Promise.resolve(null)
        const buttons = args.buttons as string | { OkCancelCustom?: [string, string] } | undefined
        if (typeof buttons === 'string') return Promise.resolve(buttons.split('No')[0])
        if (buttons?.OkCancelCustom) return Promise.resolve(buttons.OkCancelCustom[0])
        return Promise.resolve('Ok')
      }

      case 'plugin:dialog|open':
        return Promise.resolve(null)

      default:
        console.warn('[harness] unhandled command', cmd, args)
        return Promise.reject(new Error(`harness: unhandled command ${cmd}`))
    }
  },
}

// Test-drive helpers.
declare global {
  interface Window {
    __emit: typeof emit
    __ctxAction: (action: string) => void
    __manifest: () => ManifestNode
    __thumbCacheSize: () => number
    __harnessCtxTarget?: unknown
    __harnessConfirm?: boolean
  }
}
window.__emit = emit
window.__ctxAction = (action: string): void => {
  emit('ctx-action', { action, target: window.__harnessCtxTarget })
}
window.__manifest = () => manifest
window.__thumbCacheSize = () => thumbCache.size
;(window as unknown as Record<string, unknown>).__virtualFiles = new Map<string, string>()

export {}
