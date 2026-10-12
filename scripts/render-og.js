// Renders the link preview, public/og.jpg: the real title screen in the
// dark studio, at the 1200×630 that Open Graph and X show large, from the
// real 3D scene:
//
//   npm run dev          (in another terminal)
//   node scripts/render-og.js [http://127.0.0.1:5173]
//
// Drawn at twice the size and scaled down, from a save a few rounds in:
// the collection begun, the Diver's first certificate earned, today's
// Daily played. index.html links the picture by its absolute address; the
// service worker leaves it out (vite.config.ts).

import { statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const [ORIGIN = 'http://127.0.0.1:5173'] = process.argv.slice(2);
const OUT = path.resolve(import.meta.dirname, '..', 'public', 'og.jpg');
const WIDTH = 1200;
const HEIGHT = 630;
const QUALITY = 0.88;
/**
 * From the watch's first frame to the picture: the title's entrance is
 * over, and the demo round's marker is in view, clear of the last hit.
 */
const SETTLE_MS = 4000;
/** What link previews take without complaint. */
const MAX_BYTES = 250 * 1024;

// Today's Daily number, as src/game/daily.ts counts them (#1 on
// 1 October 2026, turning at local midnight).
const now = new Date();
const today =
  Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(2026, 9, 1)) /
      86_400_000
  ) + 1;

// The save, as src/state/saved.ts reads it: the dark studio, in English.
const SAVE = JSON.stringify({
  state: {
    settings: { theme: 'dark', night: false, language: 'en', sound: false },
    progress: {
      best: { diver: 23, chronograph: 17 },
      unlocked: ['diver', 'chronograph', 'gmt'],
    },
    selected: 'diver',
    daily: { number: today, best: 12, marks: 'PGGPGGPGGGPG' },
    reserve: { days: 4, woundOn: today },
  },
  version: 1,
});

// The Mac's GPU through ANGLE's Metal backend where there is one, as the
// e2e tests do locally (see playwright.config.ts); SwiftShader elsewhere.
const browser = await chromium.launch({
  args:
    process.platform === 'darwin'
      ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
await page.addInitScript(save => {
  localStorage.setItem('tick-perfect', save);
}, SAVE);
await page.goto(ORIGIN);
// The dev build's hook says when the watch is drawn.
await page.waitForFunction(
  () => globalThis.__tickPerfect?.scene().status === 'ready',
  null,
  { timeout: 120_000 }
);
await page.waitForTimeout(SETTLE_MS);
const shot = await page.screenshot({ type: 'png' });

// Scaled down by the browser, with its best smoothing. (Run in the page:
// its globals aren't this script's.)
const scaler = await browser.newPage();
const jpeg = await scaler.evaluate(
  async ({ png, width, height, quality }) => {
    const image = new globalThis.Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  },
  {
    png: shot.toString('base64'),
    width: WIDTH,
    height: HEIGHT,
    quality: QUALITY,
  }
);
writeFileSync(OUT, Buffer.from(jpeg, 'base64'));
await browser.close();

const bytes = statSync(OUT).size;
console.log(`og.jpg ${WIDTH}×${HEIGHT}, ${(bytes / 1024).toFixed(0)} KB`);
if (bytes > MAX_BYTES) {
  console.error(`Over ${String(MAX_BYTES / 1024)} KB; lower QUALITY`);
  process.exit(1);
}
