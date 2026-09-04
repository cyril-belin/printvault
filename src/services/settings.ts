import type { Orientation, Settings } from '../types'
import { loadSettingsDoc, saveSettingsDoc } from './backend'

export const SIDEBAR_MIN = 220
export const SIDEBAR_MAX = 520

export function defaultSettings(): Settings {
  return {
    version: 1,
    roots: [],
    expanded: {},
    selectedPath: null,
    sidebarWidth: 300,
    orientations: {},
    browseMode: 'tree',
  }
}

function clampWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 300
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value)))
}

/**
 * Converts an XYZ-order Euler rotation (radians) to a quaternion. Mirrors
 * three.js `Quaternion.setFromEuler` with its default 'XYZ' order — that is
 * the convention the legacy Euler-based orientation entries were saved with.
 */
function eulerToQuaternion(x: number, y: number, z: number): Orientation {
  const c1 = Math.cos(x / 2)
  const c2 = Math.cos(y / 2)
  const c3 = Math.cos(z / 2)
  const s1 = Math.sin(x / 2)
  const s2 = Math.sin(y / 2)
  const s3 = Math.sin(z / 2)
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  }
}

function parseOrientation(raw: unknown): Orientation | null {
  if (!raw || typeof raw !== 'object') return null
  const { x, y, z, w } = raw as Record<string, unknown>
  if (
    typeof x !== 'number' || !Number.isFinite(x) ||
    typeof y !== 'number' || !Number.isFinite(y) ||
    typeof z !== 'number' || !Number.isFinite(z)
  ) {
    return null
  }
  // Entries without a `w` component are legacy Euler radians — migrate them.
  if (typeof w !== 'number' || !Number.isFinite(w)) {
    return eulerToQuaternion(x, y, z)
  }
  return { x, y, z, w }
}

function parseOrientations(raw: unknown): Record<string, Orientation> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, Orientation> = {}
  for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
    const orientation = parseOrientation(value)
    if (orientation) out[path] = orientation
  }
  return out
}

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await loadSettingsDoc()
    if (!raw || typeof raw !== 'object') return defaultSettings()
    const doc = raw as Record<string, unknown>
    return {
      version: 1,
      roots: Array.isArray(doc.roots)
        ? doc.roots.filter((x): x is string => typeof x === 'string')
        : [],
      expanded:
        doc.expanded && typeof doc.expanded === 'object' && !Array.isArray(doc.expanded)
          ? (doc.expanded as Record<string, boolean>)
          : {},
      selectedPath: typeof doc.selectedPath === 'string' ? doc.selectedPath : null,
      sidebarWidth: clampWidth(doc.sidebarWidth),
      orientations: parseOrientations(doc.orientations),
      browseMode: doc.browseMode === 'gallery' ? 'gallery' : 'tree',
    }
  } catch (error) {
    console.error('PrintVault: failed to read settings', error)
    return defaultSettings()
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
let pending: Settings | null = null

/** Debounced persistence — rapid UI changes (expanding, resizing) coalesce. */
export function persistSettingsSoon(settings: Settings): void {
  pending = settings
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    if (!pending) return
    saveSettingsDoc(pending).catch((error) => {
      console.error('PrintVault: failed to save settings', error)
    })
  }, 250)
}
