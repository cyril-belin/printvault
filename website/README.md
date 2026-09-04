# PrintVault website

The public landing page for PrintVault — a fully static
[Astro](https://astro.build) site with TypeScript, plain CSS and **zero
client-side JavaScript**. Built and deployed to GitHub Pages by
`.github/workflows/pages.yml`.

Public URL: <https://cyril-belin.github.io/printvault/>

## Commands

```bash
npm install        # once
npm run dev        # local dev server
npm run check      # astro check (type checking)
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

## Configuration

- **Base path** — set in `astro.config.mjs` (`site: 'https://cyril-belin.github.io'`,
  `base: '/printvault'`). Every URL in the source is derived from
  `import.meta.env.BASE_URL`, so a custom domain only needs `site` changed to
  the new origin and `base` to `/` (plus `SITE.url` in `src/data/site.ts`).
- **Links & downloads** — centralized in `src/data/site.ts`. The site never
  hosts installers; download buttons point at GitHub Releases. Until the
  `v0.1.0` release is published, every button falls back to the Releases page
  (`RELEASE.published: false`). When the release is live, flip
  `RELEASE.published` to `true` and verify the asset file names listed there
  match the uploaded files — that single change switches all buttons to direct
  download URLs.

## Assets

- Branding comes from the repository's canonical artwork: `logo.png` (master),
  `src-tauri/icons/app-icon.png` (symbol), `public/favicon.png`. The header
  mark, touch icon and OG card are derived from those in
  `scripts/prepare-assets.mjs`.
- `public/screenshots/*.webp` are real PrintVault screenshots, captured from
  the repository's own browser harness (`harness.html`, which runs the actual
  frontend against the demo library in `dev-assets/test-library/`) at
  2880×1800 and encoded to WebP at 2160×1350 by
  `scripts/prepare-assets.mjs`. To refresh them, re-capture the harness and
  re-run that script.

## Structure

```
src/
  data/site.ts        site metadata, links, release/download configuration
  layouts/Base.astro  <head>: SEO, canonical, Open Graph, Twitter card, favicon
  components/         Header, Hero, Features, Showcase, Download, Privacy,
                      GithubSection, Support, Footer
  pages/index.astro   the landing page
  styles/global.css   design tokens (mirroring the app palette) + shared styles
public/               favicon, mark, OG image, optimized screenshots
```
