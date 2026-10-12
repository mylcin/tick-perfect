import type { WatchSpec } from '../../watches';
import { createWatchGeometry, disposeAll, type WatchGeometry } from './parts';

// Building a watch's geometry is one of the slowest things the page does,
// so each watch's is built once and kept. Variants change colours and
// finishes, so they share it, unless one wears a bracelet in place of a
// strap (or the other way round): that one gets its own. Coming back to a
// watch reuses it. Its GPU buffers are freed while nothing shows it, and
// three.js uploads them again on use.

const built = new Map<string, WatchGeometry>();
const holders = new Map<WatchGeometry, number>();

/** `spec`'s geometry, built on first use, shared by its variants. */
export function watchGeometry(spec: WatchSpec): WatchGeometry {
  const key = `${spec.id}:${spec.strap.type}`;
  let geometry = built.get(key);
  if (!geometry) {
    geometry = createWatchGeometry(spec);
    built.set(key, geometry);
  }
  return geometry;
}

/**
 * Marks `geometry` as shown until the returned release is called. Once no
 * one holds it, `schedule` (the next frames, by default) frees its GPU
 * buffers, unless it is held again by then.
 */
export function holdGeometry(
  geometry: WatchGeometry,
  schedule: (task: () => void) => void = afterNextFrame
): () => void {
  holders.set(geometry, (holders.get(geometry) ?? 0) + 1);
  return () => {
    holders.set(geometry, (holders.get(geometry) ?? 1) - 1);
    schedule(() => {
      if (holders.get(geometry) === 0) disposeAll(geometry);
    });
  };
}

/**
 * Runs `task` after the next frame has been drawn. A replacement then draws
 * first, so three.js reuses the shader programs the two have in common
 * instead of destroying and compiling them again.
 */
export function afterNextFrame(task: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(task);
  });
}
