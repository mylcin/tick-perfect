import path from 'node:path';

import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import gameBoundary from './eslint-rules/game-boundary.js';

const JS = '{js,mjs,cjs}';
const TS = '{ts,tsx,mts,cts}';

const local = { rules: { 'game-boundary': gameBoundary } };
const GAME_ROOT = path.join(import.meta.dirname, 'src', 'game');

// The game layer receives time, input, storage and randomness as arguments,
// so every rule is deterministic and runs without a DOM. Anything the browser
// or Node adds on top of the language itself is off limits there.
const PLATFORM_GLOBALS = [
  'globalThis',
  ...Object.keys({ ...globals.browser, ...globals.node }).filter(
    name => !(name in globals.es2027)
  ),
].map(name => ({
  name,
  message: `src/game must not read '${name}'; pass the value in instead.`,
}));

export default defineConfig([
  globalIgnores([
    'dist',
    'dev-dist',
    'coverage',
    'playwright-report',
    'test-results',
    'blob-report',
  ]),

  {
    files: [`**/*.${JS}`, `**/*.${TS}`],
    extends: [js.configs.recommended],
  },

  {
    files: [`**/*.${TS}`],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: [`src/**/*.${TS}`],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  {
    files: [
      `*.${JS}`,
      `*.${TS}`,
      `e2e/**/*.${TS}`,
      `server/**/*.${TS}`,
      `api/**/*.${TS}`,
      `eslint-rules/**/*.${JS}`,
      `scripts/**/*.${JS}`,
    ],
    languageOptions: { globals: globals.node },
  },

  // Served as is and run before anything else, in any browser: plain ES5
  // scripts, not modules. ES5's catch must name the error it ignores.
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }] },
  },

  {
    files: [`src/game/**/*.${TS}`],
    plugins: { local },
    rules: {
      'local/game-boundary': ['error', { root: GAME_ROOT }],
      'no-console': 'error',
      'no-restricted-globals': ['error', ...PLATFORM_GLOBALS],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG so runs can be replayed.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Take the time as an argument.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Take the date as an argument.',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'Take the date as an argument.',
        },
        {
          selector: 'JSXElement, JSXFragment',
          message: 'src/game holds rules only; render in screens or three.',
        },
      ],
    },
  },

  {
    files: [`src/game/**/*.test.${TS}`],
    rules: {
      'local/game-boundary': ['error', { root: GAME_ROOT, allow: ['vitest'] }],
    },
  },

  prettier,
]);
