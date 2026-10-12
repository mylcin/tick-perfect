import { DataUtils, EquirectangularReflectionMapping } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import studio from '../assets/studio-small-03.hdr?inline';
import { loadHdri } from './use-hdri';

/** The bundled studio HDRI's bytes. */
const STUDIO = Uint8Array.from(
  atob(studio.slice(studio.indexOf(',') + 1)),
  character => character.charCodeAt(0)
);

/** What three.js reports download progress with; Node has no DOM one. */
class ProgressEvent extends Event {}

/** Serves the studio HDRI to every fetch, counting them. */
function serveStudio() {
  const fetch = vi.fn(() => Promise.resolve(new Response(STUDIO)));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('ProgressEvent', ProgressEvent);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadHdri', () => {
  it('loads the studio HDRI small, its bulbs capped in the file', async () => {
    serveStudio();
    const texture = await loadHdri('http://test/studio.hdr');
    expect(texture.mapping).toBe(EquirectangularReflectionMapping);
    const { width, height, data } = texture.image;
    expect([width, height]).toEqual([256, 128]);
    if (!data) throw new Error('No image data');
    // Polished edges mirror the bulbs; uncapped they flared into stars.
    let peak = 0;
    for (let index = 0; index < data.length; index += 4) {
      for (let channel = 0; channel < 3; channel++) {
        const value = DataUtils.fromHalfFloat(data[index + channel] ?? 0);
        peak = Math.max(peak, value);
      }
    }
    expect(peak).toBeGreaterThan(8);
    expect(peak).toBeLessThanOrEqual(12.1);
  });

  it('downloads each HDRI once, however often it is asked for', async () => {
    const fetch = serveStudio();
    const first = loadHdri('http://test/once.hdr');
    const second = loadHdri('http://test/once.hdr');
    expect(second).toBe(first);
    await first;
    await loadHdri('http://test/once.hdr');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('tries a failed download again next time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    );
    await expect(loadHdri('http://test/offline.hdr')).rejects.toThrow();
    const fetch = serveStudio();
    await expect(loadHdri('http://test/offline.hdr')).resolves.toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
