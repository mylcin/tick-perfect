// Loads the API the way Vercel runs it: every file compiled on its own,
// never bundled, then imported by Node as an ES module. A relative import
// Node can't find, or code that only breaks outside Vite, fails here
// rather than on every request after a deploy. Without the online
// settings the API must still answer, with a 503.
//
//   npm run check:api

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
// Inside the project, so Node finds the dependencies in its node_modules.
const OUT = path.join(ROOT, 'node_modules', '.tmp', 'api-check');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsconfig = path.join(OUT, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify({
    extends: path.join(ROOT, 'tsconfig.server.json'),
    compilerOptions: {
      noEmit: false,
      // Types are `npm run typecheck`'s job; this only compiles.
      noCheck: true,
      rootDir: ROOT,
      outDir: path.join(OUT, 'out'),
      tsBuildInfoFile: null,
    },
    include: [],
    files: [path.join(ROOT, 'api', 'index.ts')],
  })
);
execFileSync(
  process.execPath,
  [
    path.join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js'),
    '-p',
    tsconfig,
  ],
  { stdio: 'inherit' }
);

// The online settings, left out: the API has to load and turn requests
// away by itself.
delete process.env['DATABASE_URL'];
delete process.env['SUPABASE_URL'];

const entry = path.join(OUT, 'out', 'api', 'index.js');
let api;
try {
  api = await import(pathToFileURL(entry).href);
} catch (error) {
  console.error('The API does not load in Node as Vercel runs it:');
  console.error(error);
  process.exit(1);
}
const response = await api.GET(new Request('http://localhost/api/config'));
const body = await response.json();
if (response.status !== 503 || body?.error?.code !== 'offline') {
  console.error(
    `Expected 503 offline without the online settings, got ${String(response.status)}:`,
    body
  );
  process.exit(1);
}
console.log('The API loads in Node and answers 503 while offline.');
