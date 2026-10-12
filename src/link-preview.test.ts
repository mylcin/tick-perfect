import { describe, expect, it } from 'vitest';

import html from '../index.html?raw';
import picture from '../public/og.jpg?inline';
import { APP_URL } from './utils/share';

// The preview a shared link unfurls into: index.html's Open Graph tags and
// the picture they point at, public/og.jpg (scripts/render-og.js).

/** The content of each <meta> in index.html, by its property or name. */
function metas(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/g)) {
    const key = /\b(?:property|name)="([^"]+)"/.exec(tag)?.[1];
    const content = /\bcontent="([^"]*)"/.exec(tag)?.[1];
    if (key && content !== undefined) found.set(key, content);
  }
  return found;
}

/** A JPEG's bytes, from the data URL the import inlines. */
function bytesOf(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

/** A JPEG's size, from its start-of-frame segment. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  let at = 2;
  while (at + 9 < bytes.length) {
    const marker = bytes[at + 1] ?? 0;
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    // SOF0 to SOF15, but for DHT (C4), JPG (C8) and DAC (CC).
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return {
        height: ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0),
        width: ((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0),
      };
    }
    at += 2 + length;
  }
  throw new Error('No frame in the JPEG');
}

describe('link preview', () => {
  const tags = metas();

  it('describes the game as the page does', () => {
    expect(tags.get('og:type')).toBe('website');
    expect(tags.get('og:title')).toBe('Tick Perfect');
    expect(tags.get('og:description')).toBe(tags.get('description'));
    expect(tags.get('twitter:card')).toBe('summary_large_image');
    expect(tags.get('og:image:alt')).toBeTruthy();
  });

  it('leaves the address to the link shared, a challenge’s included', () => {
    // An og:url would send every preview to the bare site.
    expect(tags.has('og:url')).toBe(false);
    expect(tags.get('og:image')).toBe(`${APP_URL}/og.jpg`);
  });

  it('sizes its picture as it says, small enough to unfurl', () => {
    const bytes = bytesOf(picture);
    expect(bytes.length).toBeLessThanOrEqual(250 * 1024);
    expect(jpegSize(bytes)).toEqual({
      width: Number(tags.get('og:image:width')),
      height: Number(tags.get('og:image:height')),
    });
    expect(tags.get('og:image:width')).toBe('1200');
    expect(tags.get('og:image:height')).toBe('630');
  });
});
