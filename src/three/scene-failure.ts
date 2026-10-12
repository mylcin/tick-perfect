import type { SceneFailure } from '../state/session';

/**
 * What browsers throw when a lazily loaded chunk can't be fetched: Chrome,
 * Firefox, Safari, and Vite's preloading of the chunk's styles.
 */
const CHUNK_FAILED =
  /dynamically imported module|importing a module script failed|unable to preload|failed to fetch/i;

/** What three.js throws when it gets no WebGL context, or too old a one. */
const NO_WEBGL = /webgl/i;

/**
 * Why the 3D scene failed, from what it threw: its code didn't load (a
 * dropped connection, or a deploy that removed the old chunks), the
 * browser couldn't draw it (no WebGL, or graphics acceleration off), or
 * something else broke it while it drew.
 */
export function sceneFailureOf(error: unknown): SceneFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (CHUNK_FAILED.test(message)) return 'network';
  return NO_WEBGL.test(message) ? 'webgl' : 'stopped';
}
