// Renders the app icons from public/icons/icon.svg with Playwright's
// Chromium, so the PNGs can be regenerated whenever the SVG changes:
//
//   node scripts/render-icons.js

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const ICONS = path.resolve(import.meta.dirname, '..', 'public', 'icons');
// The artwork keeps clear of the edges, inside the 80% circle that maskable
// icons promise to show, so one design serves every purpose.
const SIZES = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

const svg = readFileSync(path.join(ICONS, 'icon.svg'), 'base64');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size] of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0}</style><img src="data:image/svg+xml;base64,${svg}" width="${size}" height="${size}">`
  );
  await page.locator('img').evaluate(image => image.decode());
  await page.screenshot({ path: path.join(ICONS, file) });
  console.log(`${file} ${size}×${size}`);
}
await browser.close();
