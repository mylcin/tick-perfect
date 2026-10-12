// Renders the README's picture from the real game:
//
//   npm run dev          (in another terminal)
//   node scripts/render-readme.js [http://127.0.0.1:5173]
//
// docs/images/hero.webp is the title screen in the light studio, at
// 1600×1000, from a save some way in: a few watches open, the Diver
// certified, today's Daily played. The rest of the collection stays out,
// left for players to find.

import { statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const [ORIGIN = 'http://127.0.0.1:5173'] = process.argv.slice(2);
const IMAGES = path.resolve(import.meta.dirname, '..', 'docs', 'images');
const HERO = { width: 1280, height: 800, scale: 1.25 };
/** The title's entrance over, and the demo round's marker in view. */
const SETTLE_MS = 4000;
const QUALITY = 0.86;

// Today's Daily number, as src/game/daily.ts counts them (#1 on
// 1 October 2026, turning at local midnight).
const now = new Date();
const today =
  Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(2026, 9, 1)) /
      86_400_000
  ) + 1;

// The save, as src/state/saved.ts reads it: the light studio, in English.
const SAVE = JSON.stringify({
  state: {
    settings: { theme: 'light', night: false, language: 'en', sound: false },
    progress: {
      best: { diver: 46, chronograph: 31, gmt: 19 },
      unlocked: ['diver', 'chronograph', 'gmt', 'moonphase'],
      points: 920,
    },
    selected: 'diver',
    daily: { number: today, best: 18, marks: 'PGGPGPGGPPGG' },
    reserve: { days: 5, woundOn: today },
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

/** A PNG made into WebP by the browser, at QUALITY. */
async function webp(png) {
  const page = await browser.newPage();
  const data = await page.evaluate(
    async ({ png, quality }) => {
      const image = new globalThis.Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', quality).split(',')[1];
    },
    { png: png.toString('base64'), quality: QUALITY }
  );
  await page.close();
  return Buffer.from(data, 'base64');
}

function save(name, bytes) {
  const out = path.join(IMAGES, name);
  writeFileSync(out, bytes);
  console.log(`${name} ${(statSync(out).size / 1024).toFixed(0)} KB`);
}

// The title screen.
const page = await browser.newPage({
  viewport: { width: HERO.width, height: HERO.height },
  deviceScaleFactor: HERO.scale,
  colorScheme: 'light',
});
await page.addInitScript(state => {
  localStorage.setItem('tick-perfect', state);
}, SAVE);
await page.goto(ORIGIN);
// The dev build's hook says when the watch is drawn.
await page.waitForFunction(
  () => globalThis.__tickPerfect?.scene().status === 'ready',
  null,
  { timeout: 120_000 }
);
await page.waitForTimeout(SETTLE_MS);
save('hero.webp', await webp(await page.screenshot({ type: 'png' })));

await browser.close();
