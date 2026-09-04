import { invoke } from '@tauri-apps/api/core'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { TRASH_NAME } from './paths'
import type { CtxTarget, LibNode } from '../types'

export function loadSettingsDoc(): Promise<unknown> {
  return invoke('load_settings')
}

export function saveSettingsDoc(settings: unknown): Promise<void> {
  return invoke('save_settings', { settings })
}

export function syncRoots(roots: string[]): Promise<void> {
  return invoke('sync_roots', { roots })
}

export function scanRoot(path: string): Promise<LibNode> {
  return invoke('scan_root', { path })
}

/** Raw model bytes via the binary IPC channel. */
export async function readModelBytes(path: string): Promise<ArrayBuffer> {
  return (await invoke('read_model', { path })) as ArrayBuffer
}

export async function pickFolder(title: string): Promise<string | null> {
  const selection = await open({ directory: true, multiple: false, title })
  return typeof selection === 'string' ? selection : null
}

export async function confirmRemoveRoot(name: string): Promise<boolean> {
  return ask(
    `Remove “${name}” from PrintVault?\n\nThe folder and all of its files stay untouched on disk.`,
    { title: 'Remove Folder', kind: 'warning', okLabel: 'Remove', cancelLabel: 'Cancel' },
  )
}

export function showContextMenu(target: CtxTarget): Promise<void> {
  return invoke('show_context_menu', { target })
}

export function revealInFinder(path: string): Promise<void> {
  return invoke('reveal_in_finder', { path })
}

/** Returns the new absolute path on success. */
export function renameItem(oldPath: string, newName: string): Promise<string> {
  return invoke('rename_item', { oldPath, newName })
}

export function deleteItem(path: string): Promise<void> {
  return invoke('delete_item', { path })
}

// --- Thumbnail cache (rendering happens in the frontend, persistence in Rust) ---

/** Cached base64 PNG for the file's current mtime/size, or null on miss. */
export function thumbGet(path: string): Promise<string | null> {
  return invoke('thumb_get', { path })
}

export function thumbStore(path: string, dataBase64: string): Promise<void> {
  return invoke('thumb_store', { path, dataBase64 })
}

/** Copies a cache entry after a rename through PrintVault. Best-effort. */
export function thumbMigrate(oldPath: string, newPath: string): Promise<void> {
  return invoke('thumb_migrate', { oldPath, newPath })
}

/** Sweeps cache entries for files that no longer exist in the library. */
export function thumbGc(paths: string[]): Promise<void> {
  return invoke('thumb_gc', { paths })
}

export async function confirmTrash(name: string, isDir: boolean): Promise<boolean> {
  const message = isDir
    ? `Move “${name}” to the ${TRASH_NAME}?\n\nEverything inside this folder will also be removed. You can restore it from the ${TRASH_NAME}.`
    : `Move “${name}” to the ${TRASH_NAME}?\n\nYou can restore it from the ${TRASH_NAME}.`
  return ask(message, {
    title: isDir ? 'Delete Folder' : 'Delete File',
    kind: 'warning',
    okLabel: `Move to ${TRASH_NAME}`,
    cancelLabel: 'Cancel',
  })
}
