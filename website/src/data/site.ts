/**
 * Central configuration for the PrintVault landing page: copy-agnostic
 * metadata, external links and the release/download setup.
 *
 * Download buttons never point at binaries stored on the website — everything
 * goes to GitHub Releases. While the v0.1.0 release is unpublished, every
 * button falls back to the Releases page so nothing can 404. When the release
 * goes live: set RELEASE.published to true and make sure the asset file names
 * below match the uploaded files. That single change switches every button to
 * its direct download URL.
 */

export const SITE = {
  name: 'PrintVault',
  tagline: 'STL & 3MF library viewer',
  title: 'PrintVault — STL & 3MF Library Viewer',
  description:
    'A fast local desktop app for browsing, previewing and managing STL and 3MF files on macOS, Windows and Linux.',
  /** Canonical public URL of the deployed site (keep in sync with astro.config.mjs). */
  url: 'https://cyril-belin.github.io/printvault/',
} as const;

export const GITHUB_URL = 'https://github.com/cyril-belin/printvault';
export const SUPPORT_URL = 'https://buymeacoffee.com/printvault';

export const RELEASE = {
  tag: 'v0.1.0',
  version: '0.1.0',
  /** True once the GitHub Release is published; buttons then link directly. */
  published: true,
} as const;

const RELEASES_BASE = `${GITHUB_URL}/releases`;

/** Always valid once any release exists — the pre-publication fallback. */
export const RELEASES_PAGE_URL = `${RELEASES_BASE}/latest`;

const assetUrl = (file: string): string =>
  `${RELEASES_BASE}/download/${RELEASE.tag}/${file}`;

export interface DownloadButton {
  label: string;
  detail: string;
  href: string;
  primary: boolean;
}

export interface PlatformDownload {
  os: 'macOS' | 'Windows' | 'Linux';
  arch: string;
  buttons: DownloadButton[];
}

function platform(
  os: PlatformDownload['os'],
  arch: string,
  buttons: Array<{ label: string; detail: string; file: string }>,
): PlatformDownload {
  return {
    os,
    arch,
    buttons: buttons.map((button, index) => ({
      label: button.label,
      detail: button.detail,
      // Direct asset link once the release exists; Releases page before that.
      href: RELEASE.published ? assetUrl(button.file) : RELEASES_PAGE_URL,
      primary: index === 0,
    })),
  };
}

/**
 * v0.1.0 asset file names as uploaded to the GitHub Release (Tauri v2
 * bundling, productName "PrintVault"). If these ever change, update them
 * here — and verify against the release when bumping RELEASE.tag.
 */
export const PLATFORM_DOWNLOADS: PlatformDownload[] = [
  platform('macOS', 'Apple Silicon', [
    { label: 'Download for macOS', detail: 'Apple Silicon · DMG', file: 'PrintVault_0.1.0_aarch64.dmg' },
  ]),
  platform('Windows', 'x64', [
    { label: 'Download for Windows', detail: 'x64 · Installer (EXE)', file: 'PrintVault_0.1.0_x64-setup.exe' },
    { label: 'MSI package', detail: 'x64 · MSI', file: 'PrintVault_0.1.0_x64_en-US.msi' },
  ]),
  platform('Linux', 'x64', [
    { label: 'Download for Linux', detail: 'x64 · AppImage', file: 'PrintVault_0.1.0_amd64.AppImage' },
    { label: '.deb package', detail: 'x64 · DEB', file: 'PrintVault_0.1.0_amd64.deb' },
    { label: '.rpm package', detail: 'x64 · RPM', file: 'PrintVault-0.1.0-1.x86_64.rpm' },
  ]),
];
