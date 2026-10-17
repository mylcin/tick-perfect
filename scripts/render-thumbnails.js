// Renders the collection's watch thumbnails from the real 3D models, so
// the strip costs no GPU time at runtime:
//
//   npm run dev          (in another terminal)
//   node scripts/render-thumbnails.js [http://127.0.0.1:5173] [names...]
//
// Each watch is drawn on the development-only thumbnail.html page and saved
// as public/watches/<id>.webp, and each of its variants as
// <id>-<variant>.webp. Names (e.g. `diver gmt-blueBlack`) render only
// those. Locked watches use the standard image, turned into a silhouette
// with CSS.

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const [ORIGIN = 'http://127.0.0.1:5173', ...ONLY] = process.argv.slice(2);
const OUT = path.resolve(import.meta.dirname, '..', 'public', 'watches');
const SIZE = 192;
const QUALITY = 0.86;

mkdirSync(OUT, { recursive: true });
// The Mac's GPU through ANGLE's Metal backend where there is one, as the
// e2e tests do locally (see playwright.config.ts); SwiftShader elsewhere.
const browser = await chromium.launch({
  args:
    process.platform === 'darwin'
      ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
});
// The variants come from the catalogue itself, through the dev server.
await page.goto(`${ORIGIN}/thumbnail.html?watch=diver`);
const thumbnails = await page.evaluate(async () => {
  const { STANDARD, VARIANTS } = await import('/src/watches/variants.ts');
  return Object.entries(VARIANTS).flatMap(([watch, variants]) =>
    variants.map(({ id }) => ({
      name: id === STANDARD ? watch : `${watch}-${id}`,
      query:
        id === STANDARD ? `watch=${watch}` : `watch=${watch}&variant=${id}`,
    }))
  );
});
for (const { name, query } of thumbnails) {
  if (ONLY.length > 0 && !ONLY.includes(name)) continue;
  await page.goto(`${ORIGIN}/thumbnail.html?${query}`);
  await page.waitForFunction(() => '__thumbnailReady' in globalThis, null, {
    timeout: 120_000,
  });
  const data = await page
    .locator('canvas')
    .evaluate(
      (canvas, quality) => canvas.toDataURL('image/webp', quality),
      QUALITY
    );
  writeFileSync(
    path.join(OUT, `${name}.webp`),
    Buffer.from(data.split(',')[1], 'base64')
  );
  console.log(`${name}.webp`);
}
await browser.close();
