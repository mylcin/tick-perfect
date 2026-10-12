import { describe, expect, it } from 'vitest';

import { sceneFailureOf } from './scene-failure';

describe('sceneFailureOf', () => {
  it("blames the network when the scene's code didn't load", () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x/assets/watch-scene-1.js',
      'error loading dynamically imported module: https://x/assets/three-2.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/watch-scene-1.css',
    ]) {
      expect(sceneFailureOf(new TypeError(message))).toBe('network');
    }
  });

  it('blames WebGL when three.js gets no context', () => {
    for (const message of [
      'Error creating WebGL context.',
      'Error creating WebGL context with your selected attributes.',
      'THREE.WebGLRenderer: WebGL 1 is not supported since r163.',
    ]) {
      expect(sceneFailureOf(new Error(message))).toBe('webgl');
    }
  });

  it('says the watch stopped for anything else', () => {
    expect(
      sceneFailureOf(
        new TypeError("Cannot read properties of null (reading 'alpha')")
      )
    ).toBe('stopped');
    expect(sceneFailureOf('something odd')).toBe('stopped');
    expect(sceneFailureOf(null)).toBe('stopped');
  });
});
