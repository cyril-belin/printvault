import { defineConfig } from 'astro/config';

// GitHub Pages project site: https://cyril-belin.github.io/printvault/
//
// To move to a custom domain later: set `site` to 'https://your-domain.com',
// change `base` to '/', and update SITE.url in src/data/site.ts. Nothing else
// in the site hardcodes the subpath — every URL is derived from BASE_URL.
export default defineConfig({
  site: 'https://cyril-belin.github.io',
  base: '/printvault',
});
