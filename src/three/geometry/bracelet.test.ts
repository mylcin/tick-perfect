import { Box3, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';

import {
  BRACELET_STYLES,
  braceletGeometry,
  braceletLinks,
  braceletPath,
  endLinkReach,
  type BraceletType,
  type EndLinkFit,
} from './bracelet';

const TYPES: readonly BraceletType[] = ['oyster', 'jubilee'];
const OPTIONS = { width: 1.3, startY: 1.53, startZ: -0.08, length: 4.2 };
const CASE_RADIUS = 1.36;
const FIT: EndLinkFit = {
  width: OPTIONS.width,
  caseRadius: CASE_RADIUS,
  reach: endLinkReach(OPTIONS.startY, CASE_RADIUS),
};
/** Both sides of the bracelet together stay within a mobile budget. */
const TRIANGLE_BUDGET = 25_000;

const box = (geometry: BufferGeometry) =>
  new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);

const triangles = (geometry: BufferGeometry) =>
  (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;

function decompose(matrix: Matrix4) {
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  return { position, rotation, scale };
}

const finite = (matrix: Matrix4) => matrix.elements.every(Number.isFinite);

describe('braceletPath', () => {
  it('starts at the lug ends and dips slightly over the straight run', () => {
    const [startY, startZ] = braceletPath(0);
    expect(startY).toBeCloseTo(0, 12);
    expect(startZ).toBeCloseTo(0, 12);
    const [y, z] = braceletPath(0.4);
    expect(Math.atan2(z, y)).toBeCloseTo(-0.2, 9);
    expect(Math.hypot(y, z)).toBeCloseTo(0.4, 9);
  });

  it('bends away from the viewer at a steady radius', () => {
    // Arc length over the bend equals the chord-angle relation of a circle.
    const [y0, z0] = braceletPath(0.4);
    const [y1, z1] = braceletPath(0.4 + 2.6 * 0.5);
    const chord = Math.hypot(y1 - y0, z1 - z0);
    expect(chord).toBeCloseTo(2 * 2.6 * Math.sin(0.25), 9);
    expect(z1).toBeLessThan(z0);
  });
});

describe('endLinkReach', () => {
  it('reaches from the spring bar to the case along the dipping link', () => {
    const reach = endLinkReach(OPTIONS.startY, CASE_RADIUS);
    const run = reach * Math.cos(0.2);
    // Just past the case flank, tucked into it so no light shows.
    expect(run).toBeGreaterThan(OPTIONS.startY - CASE_RADIUS);
    expect(run).toBeLessThan(OPTIONS.startY - CASE_RADIUS + 0.02);
  });
});

describe.each(TYPES)('the %s bracelet geometry', type => {
  const style = BRACELET_STYLES[type];
  const geometry = braceletGeometry(type, FIT);
  const parts = [geometry.outer, geometry.centre, geometry.end];

  it('builds every part with finite vertices, normals and UVs', () => {
    for (const part of parts) {
      for (const name of ['position', 'normal', 'uv']) {
        const values = Array.from(part.getAttribute(name).array);
        expect(values.length).toBeGreaterThan(0);
        expect(values.every(Number.isFinite)).toBe(true);
      }
      // One group means one draw call.
      expect(part.groups).toHaveLength(0);
    }
  });

  it('sizes the links to their share of a row one unit wide', () => {
    const outer = box(geometry.outer).getSize(new Vector3());
    const centre = box(geometry.centre).getSize(new Vector3());
    const length = style.pitch - 0.008;
    expect(outer.x).toBeCloseTo(style.outerShare, 6);
    expect(outer.y).toBeCloseTo(length, 6);
    expect(outer.z).toBeCloseTo(style.thickness, 6);
    expect(centre.y).toBeCloseTo(length, 6);
    expect(centre.z).toBeCloseTo(style.thickness, 6);
    // The row adds up to one unit, gaps included.
    const gaps = (style.centreLinks + 1) * 0.008;
    expect(2 * outer.x + style.centreLinks * centre.x + gaps).toBeCloseTo(1, 6);
  });

  it('centres the links on their own origin', () => {
    for (const part of [geometry.outer, geometry.centre]) {
      const center = box(part).getCenter(new Vector3());
      expect(center.length()).toBeLessThan(1e-9);
    }
  });

  it('fills the lug gap with an end link the full row width', () => {
    const { min, max } = box(geometry.end);
    expect(min.x).toBeCloseTo(-0.5, 3);
    expect(max.x).toBeCloseTo(0.5, 3);
    // Its back edge is hollowed to the case at the real width, so the
    // corners reach furthest: as far as the case curves away from the bar,
    // measured along the dipping link.
    const corner = FIT.width / 2;
    const sag = CASE_RADIUS - Math.sqrt(CASE_RADIUS ** 2 - corner ** 2);
    const deepest = FIT.reach + sag / Math.cos(0.2);
    expect(Math.abs(min.y + deepest)).toBeLessThan(0.03);
    // Flush with the links on top, deeper towards the case below.
    expect(max.z).toBeCloseTo(style.thickness / 2, 6);
    expect(min.z).toBeLessThan(-style.thickness / 2 - 0.05);
  });

  it('stops the end link short of the first row, but for staggered stubs', () => {
    const front = box(geometry.end).max.y;
    if (style.staggered) {
      expect(front).toBeCloseTo(style.pitch / 2 - 0.004, 6);
    } else {
      expect(front).toBeCloseTo(-0.004, 6);
    }
  });

  it('stays within the triangle budget for both sides', () => {
    const links = braceletLinks(type, OPTIONS);
    const oneSide =
      triangles(geometry.outer) * links.outer.length +
      triangles(geometry.centre) * links.centre.length +
      triangles(geometry.end);
    expect(oneSide * 2).toBeLessThan(TRIANGLE_BUDGET);
  });
});

describe.each(TYPES)('the %s bracelet links', type => {
  const style = BRACELET_STYLES[type];
  const links = braceletLinks(type, OPTIONS);
  const rows = Math.floor(OPTIONS.length / style.pitch + 1e-9);
  // Outer links come in left-right pairs, one pair a row.
  const rowCentres = Array.from({ length: rows }, (_, row) => {
    const left = links.outer[row * 2];
    const right = links.outer[row * 2 + 1];
    if (!left || !right) throw new Error(`row ${String(row)} is missing`);
    return {
      left: decompose(left),
      right: decompose(right),
    };
  });

  it('places every matrix at a finite position', () => {
    expect([...links.outer, ...links.centre, links.end].every(finite)).toBe(
      true
    );
  });

  it('builds as many rows as the length holds pitches', () => {
    expect(rows).toBeGreaterThan(10);
    expect(links.outer).toHaveLength(rows * 2);
    const staggered = style.staggered ? 2 : 0;
    const aligned = style.centreLinks - staggered;
    expect(links.centre).toHaveLength(rows * aligned + (rows - 1) * staggered);
  });

  it('starts at the lug ends and keeps within the length', () => {
    const first = rowCentres[0];
    expect(first?.left.position.y).toBeCloseTo(
      OPTIONS.startY + (style.pitch / 2) * Math.cos(0.2),
      6
    );
    for (const matrix of [...links.outer, ...links.centre]) {
      const { y } = decompose(matrix).position;
      expect(y).toBeGreaterThan(OPTIONS.startY);
    }
    const end = decompose(links.end).position;
    expect(end.x).toBeCloseTo(0, 12);
    expect(end.y).toBeCloseTo(OPTIONS.startY, 12);
    expect(end.z).toBeCloseTo(OPTIONS.startZ, 12);
  });

  it('tapers monotonically to about four fifths of the width', () => {
    const widths = rowCentres.map(({ left }) => left.scale.x);
    widths.slice(1).forEach((width, index) => {
      expect(width).toBeLessThan(widths[index] ?? 0);
    });
    expect(widths[0]).toBeCloseTo(OPTIONS.width, 1);
    expect(widths.at(-1)).toBeGreaterThan(0.79 * OPTIONS.width);
    expect(widths.at(-1)).toBeLessThan(0.82 * OPTIONS.width);
    // The rows narrow by drawing their outer links in as well.
    const spans = rowCentres.map(
      ({ left, right }) => right.position.x - left.position.x
    );
    spans.slice(1).forEach((span, index) => {
      expect(span).toBeLessThan(spans[index] ?? 0);
    });
  });

  it('curves away from the viewer along its length', () => {
    const heights = rowCentres.map(({ left }) => left.position.z);
    heights.slice(1).forEach((z, index) => {
      expect(z).toBeLessThan(heights[index] ?? 0);
    });
    expect(heights.at(-1)).toBeLessThan(OPTIONS.startZ - 2);
  });

  it('turns each row along the bend, never twisting it', () => {
    const angles = rowCentres.map(({ left }) => {
      const axis = new Vector3(1, 0, 0).applyQuaternion(left.rotation);
      // Only a turn about x: the link's own x stays on the world x axis.
      expect(axis.x).toBeCloseTo(1, 9);
      const along = new Vector3(0, 1, 0).applyQuaternion(left.rotation);
      return Math.atan2(along.z, along.y);
    });
    expect(angles[0]).toBeCloseTo(-0.2, 9);
    angles.slice(1).forEach((angle, index) => {
      expect(angle).toBeLessThanOrEqual((angles[index] ?? 0) + 1e-9);
    });
  });

  it('spaces consecutive rows at least nearly a pitch apart', () => {
    rowCentres.slice(1).forEach(({ left }, index) => {
      const previous = rowCentres[index]?.left.position;
      if (!previous) throw new Error('missing row');
      const distance = Math.hypot(
        left.position.y - previous.y,
        left.position.z - previous.z
      );
      expect(distance).toBeGreaterThanOrEqual(0.95 * style.pitch);
      expect(distance).toBeLessThanOrEqual(style.pitch + 1e-9);
    });
  });

  it('keeps neighbouring links in a row apart', () => {
    const geometry = braceletGeometry(type, FIT);
    const outerHalf = box(geometry.outer).max.x;
    const centreHalf = box(geometry.centre).max.x;
    // Back at the unit row, every column of every row lines up.
    const across = (matrices: readonly Matrix4[]) =>
      matrices.map(matrix => {
        const { position, scale } = decompose(matrix);
        return position.x / scale.x;
      });
    const columns = [
      ...new Set(
        [...across(links.outer), ...across(links.centre)].map(x => x.toFixed(6))
      ),
    ]
      .map(Number)
      .sort((a, b) => a - b);
    expect(columns).toHaveLength(style.centreLinks + 2);
    const halves = columns.map((_, index) =>
      index === 0 || index === columns.length - 1 ? outerHalf : centreHalf
    );
    columns.slice(1).forEach((x, index) => {
      const previous = columns[index] ?? 0;
      const clearance =
        x - (halves[index + 1] ?? 0) - (previous + (halves[index] ?? 0));
      expect(clearance).toBeCloseTo(0.008, 6);
    });
    expect((columns.at(-1) ?? 0) + outerHalf).toBeCloseTo(0.5, 6);
  });
});

describe('the jubilee centre links', () => {
  const style = BRACELET_STYLES.jubilee;
  const links = braceletLinks('jubilee', OPTIONS);
  const centres = links.centre.map(matrix => decompose(matrix).position);
  const middle = centres.filter(position => Math.abs(position.x) < 1e-9);
  const right = centres.filter(position => position.x > 1e-9);
  const left = centres.filter(position => position.x < -1e-9);
  const outerRows = links.outer
    .filter((_, index) => index % 2 === 0)
    .map(matrix => decompose(matrix).position);

  it('aligns the middle column with the outer links', () => {
    expect(middle).toHaveLength(outerRows.length);
    middle.forEach((position, row) => {
      expect(position.y).toBeCloseTo(outerRows[row]?.y ?? NaN, 9);
      expect(position.z).toBeCloseTo(outerRows[row]?.z ?? NaN, 9);
    });
  });

  it('staggers the columns beside it by half a pitch', () => {
    expect(right).toHaveLength(outerRows.length - 1);
    right.forEach((flank, row) => {
      const before = middle[row];
      const after = middle[row + 1];
      if (!before || !after) throw new Error('missing link');
      const toBefore = Math.hypot(flank.y - before.y, flank.z - before.z);
      const toAfter = Math.hypot(after.y - flank.y, after.z - flank.z);
      expect(toBefore).toBeCloseTo(style.pitch / 2, 2);
      expect(toAfter).toBeCloseTo(style.pitch / 2, 2);
    });
  });

  it('mirrors the two flank columns', () => {
    expect(left).toHaveLength(right.length);
    right.forEach((position, index) => {
      expect(left[index]?.x).toBeCloseTo(-position.x, 9);
      expect(left[index]?.y).toBeCloseTo(position.y, 9);
      expect(left[index]?.z).toBeCloseTo(position.z, 9);
    });
  });
});

describe('the oyster rows', () => {
  it('line up their centre links with the outer links', () => {
    const links = braceletLinks('oyster', OPTIONS);
    links.centre.forEach((matrix, row) => {
      const centre = decompose(matrix).position;
      const left = links.outer[row * 2];
      if (!left) throw new Error('missing row');
      expect(centre.x).toBe(0);
      expect(centre.y).toBeCloseTo(decompose(left).position.y, 9);
    });
  });
});

describe('braceletLinks edge cases', () => {
  it('gives only the end link when the length holds no row', () => {
    const links = braceletLinks('oyster', { ...OPTIONS, length: 0 });
    expect(links.outer).toHaveLength(0);
    expect(links.centre).toHaveLength(0);
    expect(finite(links.end)).toBe(true);
  });
});
