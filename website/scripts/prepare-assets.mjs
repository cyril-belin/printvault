/**
 * One-off asset preparation for the landing page. Run from website/:
 *
 *   node scripts/prepare-assets.mjs
 *
 * Sources (not committed beyond what the repo already has):
 *   ../logo.png                     full PrintVault artwork (master)
 *   ../src-tauri/icons/app-icon.png symbol-only icon
 *   ../public/favicon.png           64px favicon
 *   ../website-shots/*.png          app screenshots captured from the
 *                                   browser harness at 2880×1800 (2x)
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const website = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repo = path.dirname(website);
const out = path.join(website, 'public');
const shots = path.join(repo, 'website-shots');

// Screenshots: resize the 2880px captures to 2160 (2x for a ~1080px layout)
// and encode as WebP.
for (const name of ['hero', 'gallery', 'viewer-3mf']) {
  await sharp(path.join(shots, `${name}.png`))
    .resize(2160, 1350)
    .webp({ quality: 82 })
    .toFile(path.join(out, 'screenshots', `${name}.webp`));
  console.log(`screenshots/${name}.webp`);
}

// Header/footer mark from the symbol-only app icon.
await sharp(path.join(repo, 'src-tauri/icons/app-icon.png'))
  .resize(256, 256)
  .png()
  .toFile(path.join(out, 'mark.png'));
console.log('mark.png');

// Apple touch icon.
await sharp(path.join(repo, 'src-tauri/icons/app-icon.png'))
  .resize(180, 180)
  .png()
  .toFile(path.join(out, 'apple-touch-icon.png'));
console.log('apple-touch-icon.png');

// Favicon: the app already ships a 64px one.
await sharp(path.join(repo, 'public/favicon.png'))
  .png()
  .toFile(path.join(out, 'favicon.png'));
console.log('favicon.png');

// Open Graph card: full artwork centered on the app background.
const logo = await sharp(path.join(repo, 'logo.png')).resize(470, 470).png().toBuffer();
await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 4,
    background: { r: 0x13, g: 0x14, b: 0x17, alpha: 1 },
  },
})
  .composite([
    { input: logo, left: Math.round((1200 - 470) / 2), top: Math.round((630 - 470) / 2) },
  ])
  .png({ compressionLevel: 9 })
  .toFile(path.join(out, 'og.png'));
console.log('og.png');
