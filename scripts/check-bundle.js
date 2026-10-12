// Checks the production build against the bundle budget: everything the
// first paint needs (the entry script, its static imports and CSS) must stay
// under 400 KB gzip. Chunks loaded later (the 3D scene) are reported too.
//
//   npm run build && npm run size

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const INITIAL_BUDGET_KB = 400;

const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
// Matches any base path ("/assets/…", "/app/assets/…", "./assets/…").
const initial = new Set(
  [...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+\.(?:js|css))"/g)].map(
    match => match[1]
  )
);
if (![...initial].some(asset => asset.endsWith('.js'))) {
  console.error(
    'No entry script found in dist/index.html; run the build first'
  );
  process.exit(1);
}

const kb = bytes => bytes / 1024;
const rows = readdirSync(path.join(DIST, 'assets'))
  .filter(file => /\.(js|css)$/.test(file))
  .map(file => {
    const asset = `assets/${file}`;
    const gzip = gzipSync(readFileSync(path.join(DIST, asset))).length;
    return { asset, gzip, initial: initial.has(asset) };
  })
  .sort((a, b) => b.gzip - a.gzip);

for (const row of rows) {
  const label = row.initial ? 'initial' : 'lazy   ';
  console.log(
    `${label}  ${kb(row.gzip).toFixed(1).padStart(7)} KB  ${row.asset}`
  );
}

const initialKb = kb(
  rows.filter(row => row.initial).reduce((sum, row) => sum + row.gzip, 0)
);
const totalKb = kb(rows.reduce((sum, row) => sum + row.gzip, 0));
console.log(
  `\nInitial ${initialKb.toFixed(1)} KB gzip (budget ${INITIAL_BUDGET_KB} KB), all chunks ${totalKb.toFixed(1)} KB`
);

if (initialKb > INITIAL_BUDGET_KB) {
  console.error(
    `Initial payload is over budget by ${(initialKb - INITIAL_BUDGET_KB).toFixed(1)} KB`
  );
  process.exit(1);
}
