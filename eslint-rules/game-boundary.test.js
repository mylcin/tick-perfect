import path from 'node:path';

import { ESLint, RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';

import rule from './game-boundary.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const REPO = path.resolve(import.meta.dirname, '..');
const GAME_ROOT = path.join(REPO, 'src', 'game');

const inGame = (file, code, options = {}) => ({
  code,
  filename: path.join(GAME_ROOT, file),
  options: [{ root: GAME_ROOT, ...options }],
});

const failing = (messageId, file, code, options) => ({
  ...inGame(file, code, options),
  errors: [{ messageId }],
});

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run(
  'game-boundary',
  rule,
  {
    valid: [
      inGame('timing.ts', "import { wrap } from './angle';"),
      inGame('rules/diver.ts', "import { wrap } from '../angle';"),
      inGame('state.ts', "import type { RuleModule } from './rules/types';"),
      inGame('index.ts', "export * from './angle';"),
      inGame('index.ts', "export { wrap } from './angle';"),
      inGame('angle.ts', 'export const turn = 360;'),
      inGame('state.ts', "const rules = import('./rules/diver');"),
      inGame('angle.test.ts', "import { it } from 'vitest';", {
        allow: ['vitest'],
      }),
    ],
    invalid: [
      failing('package', 'state.ts', "import { useState } from 'react';"),
      failing('package', 'state.ts', "import * as THREE from 'three';"),
      failing(
        'package',
        'state.ts',
        "import type { ThreeElements } from '@react-three/fiber';"
      ),
      failing('package', 'index.ts', "export { create } from 'zustand';"),
      failing('package', 'index.ts', "export * from 'zustand';"),
      failing('package', 'state.ts', "type Vec = import('three').Vector3;"),
      failing('package', 'state.ts', 'const mod = import(`three`);'),
      failing('dynamic', 'state.ts', 'const mod = import(name);'),
      failing('outside', 'state.ts', "const a = import('../audio/engine');"),
      failing('outside', 'state.ts', "import { clamp } from '../utils/math';"),
      failing(
        'outside',
        'rules/diver.ts',
        "import { clamp } from '../../utils/math';"
      ),
      // A sibling folder whose name merely starts with "game".
      failing('outside', 'state.ts', "import { x } from '../game-ui/x';"),
      failing(
        'outside',
        'angle.test.ts',
        "import { useSettings } from '../state/settings';",
        { allow: ['vitest'] }
      ),
    ],
  }
);

describe('eslint config', () => {
  const eslint = new ESLint({ cwd: REPO });
  const configFor = async file =>
    (await eslint.calculateConfigForFile(file)).rules;
  const options = entry => entry.slice(1);

  it('applies the game boundary to every TypeScript file in src/game', async () => {
    for (const file of ['state.ts', 'clock.mts', 'clock.cts', 'view.tsx']) {
      const rules = await configFor(`src/game/${file}`);
      expect(rules['local/game-boundary']).toEqual([2, { root: GAME_ROOT }]);
    }
  });

  it('bans platform globals but keeps the language built-ins', async () => {
    const rules = await configFor('src/game/state.ts');
    const banned = options(rules['no-restricted-globals']).map(o => o.name);

    for (const name of [
      'window',
      'document',
      'globalThis',
      'performance',
      'crypto',
      'setTimeout',
      'localStorage',
      'process',
    ]) {
      expect(banned).toContain(name);
    }
    for (const name of ['Math', 'Array', 'Map', 'Promise', 'Symbol']) {
      expect(banned).not.toContain(name);
    }
  });

  it('bans the clock, Math.random and JSX', async () => {
    const rules = await configFor('src/game/state.ts');
    const properties = options(rules['no-restricted-properties']).map(
      o => `${o.object}.${o.property}`
    );
    const selectors = options(rules['no-restricted-syntax']).map(
      o => o.selector
    );

    expect(properties).toEqual(['Math.random', 'Date.now']);
    expect(selectors).toEqual([
      "NewExpression[callee.name='Date']",
      "CallExpression[callee.name='Date']",
      'JSXElement, JSXFragment',
    ]);
  });

  it('lets game tests import vitest and nothing else', async () => {
    const rules = await configFor('src/game/angle.test.ts');

    expect(rules['local/game-boundary']).toEqual([
      2,
      { root: GAME_ROOT, allow: ['vitest'] },
    ]);
  });

  it('anchors the game root to the config, not the cwd', async () => {
    const fromSrc = new ESLint({ cwd: path.join(REPO, 'src') });
    const { rules } = await fromSrc.calculateConfigForFile('game/state.ts');

    expect(rules['local/game-boundary']).toEqual([2, { root: GAME_ROOT }]);
  });

  it('leaves the other layers free to use React and Three.js', async () => {
    const rules = await configFor('src/screens/title-screen.tsx');

    expect(rules['local/game-boundary']).toBeUndefined();
  });
});
