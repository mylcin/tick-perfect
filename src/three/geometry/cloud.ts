import { BufferGeometry, Float32BufferAttribute } from 'three';

import { polar } from '../layout';

// The cloud a Pilot's seconds hand flies through: a band across the dial
// over the stretch ahead of the marker, soft at every edge.

/**
 * Its radii: clear of the centre, and out over the chapter ring, so the
 * marker is misted too.
 */
const CLOUD_BAND = { inner: 0.16, outer: 1.06 } as const;
/** Grid points per degree of its arc, and across its band. */
const PER_DEGREE = 0.5;
const ACROSS = 8;
/** How much of its arc, and of its band, fades out at each edge. */
const ARC_FEATHER = 0.3;
const BAND_FEATHER = { inner: 0.3, outer: 0.16 } as const;

const smooth = (edge: number, at: number) => {
  const t = Math.min(Math.max(at / edge, 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * A band of cloud from `from` (degrees clockwise from 12) on clockwise for
 * `length` degrees, alpha in its vertex colours, UVs planar over the dial
 * so its texture lies still as the band moves.
 */
export function cloudGeometry(from: number, length: number): BufferGeometry {
  const along = Math.max(2, Math.ceil(length * PER_DEGREE));
  const positions: number[] = [];
  const uvs: number[] = [];
  const colours: number[] = [];
  for (let row = 0; row <= ACROSS; row++) {
    const across = row / ACROSS;
    const radius =
      CLOUD_BAND.inner + across * (CLOUD_BAND.outer - CLOUD_BAND.inner);
    const band = Math.min(
      smooth(BAND_FEATHER.inner, across),
      smooth(BAND_FEATHER.outer, 1 - across)
    );
    for (let column = 0; column <= along; column++) {
      const share = column / along;
      const [x, y] = polar(from + share * length, radius);
      positions.push(x, y, 0);
      uvs.push(0.5 + x / 2, 0.5 + y / 2);
      const arc = Math.min(
        smooth(ARC_FEATHER, share),
        smooth(ARC_FEATHER, 1 - share)
      );
      colours.push(1, 1, 1, band * arc);
    }
  }
  const index: number[] = [];
  const width = along + 1;
  for (let row = 0; row < ACROSS; row++) {
    for (let column = 0; column < along; column++) {
      const a = row * width + column;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      // Counter-clockwise seen from +Z, so the band faces the viewer.
      index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 4));
  geometry.setIndex(index);
  return geometry;
}
