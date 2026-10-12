import { useEffect, useState } from 'react';
import {
  EquirectangularReflectionMapping,
  LinearSRGBColorSpace,
  type DataTexture,
} from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const loads = new Map<string, Promise<DataTexture>>();
const loaded = new Map<string, DataTexture>();

/**
 * Loads an equirectangular .hdr, once per URL: later calls, and a scene
 * mounted again, share the same download. A failed one is tried again on
 * the next call.
 */
export function loadHdri(url: string): Promise<DataTexture> {
  let load = loads.get(url);
  if (!load) {
    load = new HDRLoader().loadAsync(url).then(texture => {
      texture.mapping = EquirectangularReflectionMapping;
      texture.colorSpace = LinearSRGBColorSpace;
      loaded.set(url, texture);
      return texture;
    });
    load.catch(() => {
      loads.delete(url);
    });
    loads.set(url, load);
  }
  return load;
}

/** Starts downloading an HDRI before anything draws with it. */
export function preloadHdri(url: string): void {
  loadHdri(url).catch(() => {
    // useHdri reports it, and the scene keeps its fallback lighting.
  });
}

/**
 * An HDRI to light the scene with. Returns null until it arrives, and stays
 * null if it never does (offline before it was cached, a network error), so
 * the caller can keep its fallback lighting.
 */
export function useHdri(url: string): DataTexture | null {
  const [texture, setTexture] = useState(() => loaded.get(url) ?? null);

  useEffect(() => {
    let cancelled = false;
    loadHdri(url)
      .then(result => {
        if (!cancelled) setTexture(result);
      })
      .catch((error: unknown) => {
        if (import.meta.env.DEV) {
          console.warn(`Studio HDRI unavailable, using fallback lights`, error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  // Frees its GPU copy with the scene; the image stays loaded for the next.
  useEffect(
    () => () => {
      texture?.dispose();
    },
    [texture]
  );

  return texture;
}
