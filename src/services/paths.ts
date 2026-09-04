/**
 * Cross-platform path helpers.
 *
 * The Rust scanner always returns native paths: `/`-separated on macOS/Linux,
 * `\`-separated (with drive letters) on Windows. Rather than sniffing the OS,
 * every helper below derives the separator from the path data itself, which
 * keeps behaviour correct even in the browser harness.
 */

/** True when the path uses Windows separators (`C:\...` or any backslash). */
function isWindowsPath(path: string): boolean {
  return path.includes('\\')
}

function separatorOf(path: string): string {
  return isWindowsPath(path) ? '\\' : '/'
}

/** Last path segment (file or folder name), for any platform. */
export function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : path
}

/** Parent directory of a path, or null when there is none (bare root). */
export function parentDir(path: string): string | null {
  const index = path.lastIndexOf(separatorOf(path))
  return index > 0 ? path.slice(0, index) : null
}

/** Joins a parent directory and a single child name. */
export function joinPath(parent: string, name: string): string {
  const sep = separatorOf(parent)
  if (parent.endsWith('/') || parent.endsWith('\\')) return parent + name
  return parent + sep + name
}

/** True when `path` is `ancestor` itself or lives anywhere beneath it. */
export function isSameOrUnder(path: string, ancestor: string): boolean {
  if (path === ancestor) return true
  return path.startsWith(ancestor + separatorOf(ancestor))
}

/** True when `path` lives strictly beneath `ancestor` (not equal to it). */
export function isUnder(path: string, ancestor: string): boolean {
  return path !== ancestor && isSameOrUnder(path, ancestor)
}

/**
 * Rebases `path` from one ancestor to another: returns `newAncestor` with
 * `path`'s remainder appended. `path` must be equal to or under `oldAncestor`.
 */
export function rebasePath(path: string, oldAncestor: string, newAncestor: string): string {
  if (path === oldAncestor) return newAncestor
  const sep = separatorOf(oldAncestor)
  return newAncestor + path.slice(oldAncestor.length).replace(/^[/\\]/, sep)
}

/** The path segments of `path` that lie beneath `ancestor`. */
export function segmentsUnder(path: string, ancestor: string): string[] {
  if (path === ancestor) return []
  return path
    .slice(ancestor.length)
    .split(/[/\\]/)
    .filter(Boolean)
}

/**
 * Strips trailing separators from a picked folder path, preserving bare roots
 * (`/`, `C:\`, `C:/`) exactly as the OS dialog returned them.
 */
export function normalizeRootPath(path: string): string {
  if (/^[a-zA-Z]:[/\\]$/.test(path)) return path
  const stripped = path.replace(/[/\\]+$/, '')
  return stripped.length ? stripped : path
}

// ---------------------------------------------------------------------------
// Platform identity — used for user-facing wording only (dialog copy, keyboard
// conventions). All path logic is data-driven and never consults these.
// ---------------------------------------------------------------------------

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

export const IS_WINDOWS = /windows/i.test(ua)
export const IS_MAC = /macintosh|mac os x/i.test(ua)

/** OS name for the system trash: "Recycle Bin" on Windows, "Trash" elsewhere. */
export const TRASH_NAME = IS_WINDOWS ? 'Recycle Bin' : 'Trash'
