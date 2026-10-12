import { Box3, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';

import { DIVER, WATCH_ORDER, WATCHES } from '../../watches';
import { INSERT_RECESS, LAYOUT, trackFor } from '../layout';
import { endLinkReach } from './bracelet';
import { arcBand, extrude, lathe } from './build';
import { CASE_TOP } from './cases';
import { createTargetGeometry, createWatchGeometry, disposeAll } from './parts';
import {
  apertureFrameProfile,
  caseProfile,
  rehautProfile,
  subdialRimProfile,
} from './profiles';

const box = (geometry: BufferGeometry) =>
  new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);

describe('lathe', () => {
  it('spins a profile around the watch axis (+Z)', () => {
    const geometry = lathe([
      [1, 0],
      [1, 0.5],
    ]);
    const { min, max } = box(geometry);
    expect(max.z).toBeCloseTo(0.5, 6);
    expect(min.z).toBeCloseTo(0, 6);
    expect(max.x).toBeCloseTo(1, 3);
    expect(max.y).toBeCloseTo(1, 3);
  });
});

describe('extrude', () => {
  it('rises towards the viewer by its depth, bevel included', () => {
    const geometry = extrude(
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      { depth: 0.02, bevel: 0.004 }
    );
    const { min, max } = box(geometry);
    expect(min.z).toBeCloseTo(0, 6);
    expect(max.z).toBeCloseTo(0.02, 6);
    // One group means one draw call.
    expect(geometry.groups).toHaveLength(0);
  });
});

describe('arcBand', () => {
  it('is centred on 12 o’clock and as wide as asked', () => {
    const { min, max } = box(arcBand(1, 1.2, 24));
    const halfChord = Math.sin((12 * Math.PI) / 180) * 1.2;
    expect(max.x).toBeCloseTo(halfChord, 3);
    expect(min.x).toBeCloseTo(-halfChord, 3);
    expect(max.y).toBeCloseTo(1.2, 3);
  });
});

describe('profiles', () => {
  it('builds the case out to the spec radius', () => {
    const profile = caseProfile(DIVER.case.radius, DIVER.case.height);
    expect(Math.max(...profile.map(([radius]) => radius))).toBe(
      DIVER.case.radius
    );
  });

  it('slopes the rehaut down from the crystal to the dial', () => {
    const [[r0, z0], , [r2, z2]] = rehautProfile() as [
      [number, number],
      [number, number],
      [number, number],
    ];
    expect(r0).toBe(LAYOUT.crystalRadius);
    expect(z0).toBe(LAYOUT.crystalHeight);
    expect(r2).toBe(LAYOUT.dialRadius);
    expect(z2).toBe(0);
  });

  it.each([
    ['rehaut', () => lathe(rehautProfile())],
    ['sub-dial rim', () => lathe(subdialRimProfile(0.2))],
    ['aperture frame', () => lathe(apertureFrameProfile(0.1))],
  ])('turns the %s to face the viewer', (_, build) => {
    const geometry = build().toNonIndexed();
    const position = geometry.getAttribute('position');
    let up = 0;
    let down = 0;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    for (let index = 0; index < position.count; index += 3) {
      a.fromBufferAttribute(position, index);
      b.fromBufferAttribute(position, index + 1);
      c.fromBufferAttribute(position, index + 2);
      const normal = b.sub(a).cross(c.sub(a));
      if (normal.z > 1e-12) up++;
      if (normal.z < -1e-12) down++;
    }
    expect(up).toBeGreaterThan(0);
    expect(down).toBe(0);
  });
});

/** Every BufferGeometry inside a nested geometry set. */
function geometriesIn(value: unknown): BufferGeometry[] {
  if (!value || typeof value !== 'object') return [];
  if ('isBufferGeometry' in value) return [value as BufferGeometry];
  return Object.values(value).flatMap(geometriesIn);
}

describe('createWatchGeometry', () => {
  const geometry = createWatchGeometry(DIVER);

  it('keeps the crystal under the bezel insert', () => {
    if (!('insert' in DIVER.bezel)) throw new Error('the Diver has an insert');
    expect(box(geometry.crystal).max.z).toBeLessThan(
      DIVER.bezel.height - INSERT_RECESS
    );
  });

  it('disposes every part, nested ones included', () => {
    const fresh = geometriesIn(createWatchGeometry(DIVER));
    let disposed = 0;
    fresh.forEach(part => {
      part.addEventListener('dispose', () => disposed++);
    });
    disposeAll(fresh);
    expect(disposed).toBe(fresh.length);
  });
});

describe('createTargetGeometry', () => {
  it('draws a Perfect core that stands proud of the band on both edges', () => {
    const { band, core } = createTargetGeometry(24, 3, trackFor(DIVER));
    const bandBox = box(band);
    const coreBox = box(core);
    // Narrower than the band…
    expect(coreBox.max.x).toBeLessThan(bandBox.max.x);
    // …but taller on both edges, so it reads by shape, not only colour.
    expect(coreBox.max.y).toBeGreaterThan(bandBox.max.y + 0.03);
    const inner = (geometry: BufferGeometry) => {
      const position = geometry.getAttribute('position');
      let smallest = Infinity;
      for (let index = 0; index < position.count; index++) {
        smallest = Math.min(
          smallest,
          Math.hypot(position.getX(index), position.getY(index))
        );
      }
      return smallest;
    };
    expect(inner(core)).toBeLessThan(inner(band) - 0.03);
  });

  it('disposes both pieces', () => {
    const target = createTargetGeometry(24, 3, trackFor(DIVER));
    let disposed = 0;
    geometriesIn(target).forEach(part => {
      part.addEventListener('dispose', () => disposed++);
    });
    disposeAll(target);
    expect(disposed).toBe(2);
  });
});

describe('the gate line', () => {
  it('crosses the band as far as the brackets reach, its flag one way', () => {
    const track = trackFor(DIVER);
    const { gateLine } = createWatchGeometry(DIVER);
    const bar = box(gateLine.bar);
    const edge = box(gateLine.edge);
    // Centred on the origin, so it swells about its middle.
    expect(bar.max.y - bar.min.y).toBeCloseTo(
      track.outer + track.reach.out - (track.inner - track.reach.in),
      6
    );
    expect(gateLine.radius + bar.min.y).toBeCloseTo(
      track.inner - track.reach.in,
      6
    );
    // The flag points clockwise, into +x.
    expect(bar.max.x).toBeGreaterThan(-bar.min.x * 2);
    // The dark edge shows round the light bar.
    expect(edge.min.x).toBeLessThan(bar.min.x);
    expect(edge.max.x).toBeGreaterThan(bar.max.x);
    expect(edge.max.y).toBeGreaterThan(bar.max.y);
  });
});

describe.each(WATCH_ORDER)('the %s geometry', id => {
  const parts = geometriesIn(createWatchGeometry(WATCHES[id]));

  it('builds every part with finite vertices', () => {
    expect(parts.length).toBeGreaterThan(20);
    for (const part of parts) {
      const positions = part.getAttribute('position').array;
      expect(positions.length).toBeGreaterThan(0);
      expect(Array.from(positions).every(Number.isFinite)).toBe(true);
    }
  });
});

describe.each(
  WATCH_ORDER.filter(id => {
    const { type } = WATCHES[id].strap;
    return type === 'oyster' || type === 'jubilee';
  })
)('the %s bracelet', id => {
  const spec = WATCHES[id];
  const geometry = createWatchGeometry(spec);
  const { strap } = geometry;
  if (!strap) throw new Error(`${id} has no bracelet`);
  const radius = spec.case.radius;
  const reach = endLinkReach(geometry.case.strap.y, radius);
  const end = strap.geometry.end;
  const position = end.getAttribute('position');
  const normal = end.getAttribute('normal');
  const points = Array.from({ length: position.count }, (_, index) =>
    new Vector3().fromBufferAttribute(position, index)
  );
  const placed = (point: Vector3) =>
    point.clone().applyMatrix4(strap.links.end);

  it('fits the end link flush against the case, with no gap', () => {
    // The outline has points only at its front corners and along its back,
    // hollowed to the case, well behind half the reach. Its back face is
    // checked; the rounded edge over it turns up, away from the case.
    const back = points
      .filter(
        (point, index) => point.y < -reach / 2 && normal.getZ(index) < 0.5
      )
      .map(placed);
    expect(back.length).toBeGreaterThan(20);
    for (const point of back) {
      const distance = Math.hypot(point.x, point.y);
      expect(distance).toBeGreaterThanOrEqual(radius - 0.07);
      expect(distance).toBeLessThanOrEqual(radius + 0.005);
    }
  });

  it('keeps the end link under the case top, clear of the bezel', () => {
    for (const point of points.map(placed)) {
      expect(point.z).toBeLessThan(CASE_TOP);
    }
  });
});
