import { getVersion } from '@tauri-apps/api/app'

/**
 * The real application version from Tauri metadata (tauri.conf.json / the
 * bundled app), so the UI never hardcodes it. Resolves to null outside the
 * Tauri shell (browser harness) or if the app metadata is unavailable.
 */
export async function loadAppVersion(): Promise<string | null> {
  try {
    const version = await getVersion()
    return version.trim().length > 0 ? version : null
  } catch {
    return null
  }
}
