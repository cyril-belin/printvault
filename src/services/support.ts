import { openUrl } from '@tauri-apps/plugin-opener'

/**
 * Single source of truth for the voluntary support (tip) page. PrintVault
 * itself stays completely free — this link is surfaced only from the About
 * dialog and the sidebar footer. To change the support provider, edit this
 * one value.
 */
export const SUPPORT_URL = 'https://buymeacoffee.com/printvault'

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validates the configured URL and hands it to the OS default browser via
 * the cross-platform Tauri opener plugin. PrintVault stays running; nothing
 * is embedded in the app. Returns false (and logs) when the URL is not
 * HTTPS or the OS could not open it.
 */
export async function openSupportPage(): Promise<boolean> {
  if (!isHttpsUrl(SUPPORT_URL)) {
    console.error('PrintVault: SUPPORT_URL must be a valid HTTPS URL; refusing to open:', SUPPORT_URL)
    return false
  }
  try {
    await openUrl(SUPPORT_URL)
    return true
  } catch (error) {
    console.error('PrintVault: could not open the support page', error)
    return false
  }
}
