import { describe, expect, it } from 'vitest';

import { thumbnailUrl } from './thumbnails';

describe('thumbnailUrl', () => {
  it("names a standard watch's thumbnail after the watch", () => {
    expect(thumbnailUrl('diver', 'standard')).toBe('/watches/diver.webp');
  });

  it('adds the variant for any other', () => {
    expect(thumbnailUrl('gmt', 'blueBlack')).toBe(
      '/watches/gmt-blueBlack.webp'
    );
  });
});
