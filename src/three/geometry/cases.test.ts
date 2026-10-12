import { Box3, Vector3, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';

import {
  DIVER,
  TOURBILLON,
  WATCH_ORDER,
  WATCHES,
  type CaseStyle,
} from '../../watches';
import { LAYOUT } from '../layout';
import {
  CASE_TOP,
  caseGeometry,
  casebackGeometry,
  crownAxisZ,
  crownGeometry,
  crownGuardGeometry,
  pusherGeometry,
  type CrownPart,
} from './cases';

const box = (geometry: BufferGeometry) =>
  new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);

function vertices(geometry: BufferGeometry): Vector3[] {
  const position = geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, index) =>
    new Vector3().fromBufferAttribute(position, index)
  );
}

function triangles(geometry: BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

/**
 * Signed volume seen from `origin`: positive when every face winds outward.
 * An opening in a plane through the origin adds nothing to it.
 */
function signedVolume(geometry: BufferGeometry, origin = new Vector3()) {
  const points = vertices(geometry).map(point => point.sub(origin));
  const index = geometry.index;
  const corner = (n: number) => {
    const point = points[index ? index.getX(n) : n];
    if (!point) throw new Error(`no vertex for corner ${String(n)}`);
    return point;
  };
  let volume = 0;
  for (let n = 0; n < triangles(geometry) * 3; n += 3) {
    const [a, b, c] = [corner(n), corner(n + 1), corner(n + 2)];
    volume += a.dot(new Vector3().crossVectors(b, c)) / 6;
  }
  return volume;
}

const radial = (point: Vector3) => Math.hypot(point.x, point.y);

/** The lugs as the brief draws them, per case style. */
const LUG_SPECS: Readonly<
  Record<Exclude<CaseStyle, 'tonneau'>, { gap: number; tip: number }>
> = {
  oyster: { gap: 1.3, tip: 1.65 },
  tool: { gap: 1.24, tip: 1.58 },
  calatrava: { gap: 1.1, tip: 1.37 },
  grand: { gap: 1.22, tip: 1.54 },
};

describe.each(WATCH_ORDER)('the %s case', id => {
  const spec = WATCHES[id].case;
  const geometry = caseGeometry(spec, WATCHES[id].bezel.outer);
  const parts = [geometry.body, ...(geometry.lugs ? [geometry.lugs] : [])];

  it('builds finite, single-group parts with normals and UVs', () => {
    for (const part of parts) {
      expect(part.getAttribute('position').count).toBeGreaterThan(0);
      for (const name of ['position', 'normal', 'uv'] as const) {
        const values = Array.from(part.getAttribute(name).array);
        expect(values.every(Number.isFinite)).toBe(true);
      }
      expect(part.groups).toHaveLength(0);
    }
  });

  it('is as wide as the spec, its top at the bezel seat', () => {
    const { min, max } = box(geometry.body);
    expect(max.x).toBeCloseTo(spec.radius, 2);
    expect(min.x).toBeCloseTo(-spec.radius, 2);
    expect(max.z).toBeCloseTo(CASE_TOP, 5);
    // Measured at the centre: the tonneau's ends bend below it. A domed
    // caseback may sit a little proud of the bottom.
    const bottom = Math.min(
      ...vertices(geometry.body)
        .filter(point => Math.abs(point.y) < 0.5)
        .map(point => point.z)
    );
    expect(bottom).toBeLessThanOrEqual(CASE_TOP - spec.height + 0.001);
    expect(bottom).toBeGreaterThan(CASE_TOP - spec.height - 0.02);
  });

  it('leaves the dial and the crystal open', () => {
    for (const point of vertices(geometry.body)) {
      if (radial(point) < LAYOUT.dialRadius) {
        expect(point.z).toBeLessThan(0.05);
      }
      if (point.z > CASE_TOP - 0.001) {
        expect(radial(point)).toBeGreaterThan(LAYOUT.crystalRadius - 0.001);
      }
    }
    for (const point of geometry.lugs ? vertices(geometry.lugs) : []) {
      // The lug roots stay under the case top, outside the crystal.
      expect(radial(point)).toBeGreaterThan(LAYOUT.crystalRadius);
      expect(point.z).toBeLessThan(CASE_TOP);
    }
  });

  it('winds every face outward', () => {
    const solid = Math.PI * spec.radius ** 2 * spec.height;
    // Measured from the crystal plane, the open top adds no volume.
    const volume = signedVolume(geometry.body, new Vector3(0, 0, CASE_TOP));
    expect(volume).toBeGreaterThan(spec.style === 'tonneau' ? 0 : solid * 0.8);
    if (geometry.lugs) {
      expect(signedVolume(geometry.lugs)).toBeGreaterThan(0);
    }
  });

  it('stays within the mobile triangle budget', () => {
    const extras = [
      ...(spec.crown === 'none' ? [] : [crownGeometry(spec.crown)]),
      ...(spec.crownGuards ? [crownGuardGeometry(spec.radius)] : []),
      ...(spec.pushers === 'none'
        ? []
        : [pusherGeometry(spec.pushers), pusherGeometry(spec.pushers)]),
    ];
    const total = [...parts, ...extras].reduce(
      (sum, part) => sum + triangles(part),
      0
    );
    expect(total).toBeLessThan(25_000);
  });

  it('keeps the crown, or the buttons in its place, on the flank', () => {
    const axis = crownAxisZ(spec);
    const { max } = box(
      spec.crown === 'none'
        ? pusherGeometry('buttons').rotateX(0)
        : crownGeometry(spec.crown)
    );
    expect(axis + max.y).toBeLessThanOrEqual(CASE_TOP);
    expect(axis - max.y).toBeGreaterThanOrEqual(CASE_TOP - spec.height - 0.01);
  });
});

describe.each(WATCH_ORDER.filter(id => WATCHES[id].case.style !== 'tonneau'))(
  'the %s lugs',
  id => {
    const spec = WATCHES[id].case;
    const style = spec.style as Exclude<CaseStyle, 'tonneau'>;
    const { gap, tip } = LUG_SPECS[style];
    const { lugs, strap } = caseGeometry(spec, WATCHES[id].bezel.outer);
    if (!lugs) throw new Error(`${id} has no lugs`);
    const points = vertices(lugs);

    it('reach out to the strap at both ends', () => {
      const { min, max } = box(lugs);
      expect(max.y).toBeCloseTo(tip, 2);
      expect(min.y).toBeCloseTo(-tip, 2);
      expect(max.x).toBeCloseTo(-min.x, 5);
    });

    it('leave a clear gap the width of the strap', () => {
      expect(strap.width).toBeCloseTo(gap, 5);
      for (const point of points) {
        expect(Math.abs(point.x)).toBeGreaterThanOrEqual(gap / 2 - 1e-6);
      }
    });

    it('hold the spring bar inside the lugs, short of their ends', () => {
      expect(strap.y).toBeGreaterThan(spec.radius);
      expect(strap.y).toBeLessThan(tip);
      const around = points.filter(
        point => point.x > 0 && Math.abs(point.y - strap.y) < 0.02
      );
      const heights = around.map(point => point.z);
      expect(strap.z).toBeGreaterThan(Math.min(...heights));
      expect(strap.z).toBeLessThan(Math.max(...heights));
    });

    it('run lug to lug about 1.2 times the diameter, as real watches do', () => {
      // The diameter is the case's or, where it overhangs, the bezel's.
      const diameter = 2 * Math.max(spec.radius, WATCHES[id].bezel.outer);
      const { min, max } = box(lugs);
      const ratio = (max.y - min.y) / diameter;
      expect(ratio).toBeGreaterThanOrEqual(1.15);
      expect(ratio).toBeLessThanOrEqual(1.23);
    });
  }
);

describe.each(WATCH_ORDER)('the %s caseback', id => {
  const spec = WATCHES[id].case;
  const { geometry, radius, plate } = casebackGeometry(spec);
  const bottom = CASE_TOP - spec.height;

  it('lies just outside the back, within it', () => {
    const { min, max } = box(geometry);
    expect(max.z).toBeLessThan(bottom + 0.001);
    expect(min.z).toBeGreaterThan(bottom - 0.02);
    expect(Math.max(max.x, max.y)).toBeCloseTo(radius, 2);
  });

  it('lays its UVs flat and mirrored, to read from behind', () => {
    const uv = geometry.getAttribute('uv');
    const position = geometry.getAttribute('position');
    for (let index = 0; index < uv.count; index++) {
      expect(uv.getX(index)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getX(index)).toBeLessThanOrEqual(1 + 1e-6);
      // Seen from behind, the watch's 3 o'clock side is on the left.
      if (position.getX(index) > 0.1) expect(uv.getX(index)).toBeLessThan(0.5);
    }
  });

  it('closes the back where the case is open underneath', () => {
    expect(plate !== null).toBe(spec.style === 'tonneau');
  });
});

describe('lug styles', () => {
  const lugsOf = (id: keyof typeof WATCHES) => {
    const { lugs } = caseGeometry(WATCHES[id].case, WATCHES[id].bezel.outer);
    if (!lugs) throw new Error(`${id} has no lugs`);
    return vertices(lugs);
  };
  const topNear = (points: Vector3[], y: number) =>
    Math.max(
      ...points.filter(point => Math.abs(point.y - y) < 0.02).map(p => p.z)
    );

  it('curves the dress lugs down to the wrist', () => {
    const points = lugsOf('moonphase');
    const drop = topNear(points, 1) - topNear(points, 1.33);
    expect(drop).toBeGreaterThan(0.07);
    expect(drop).toBeLessThan(0.12);
  });

  it('keeps the sports lugs nearly straight', () => {
    const points = lugsOf('diver');
    const drop = topNear(points, 1.2) - topNear(points, 1.58);
    expect(drop).toBeGreaterThan(0);
    expect(drop).toBeLessThan(0.04);
  });

  it('tapers the dress lugs towards their ends', () => {
    const points = lugsOf('moonphase').filter(point => point.x > 0);
    const widthAt = (y: number) =>
      Math.max(
        ...points.filter(point => Math.abs(point.y - y) < 0.02).map(p => p.x)
      );
    expect(widthAt(1.3)).toBeLessThan(widthAt(1.05) - 0.01);
  });

  it('steps the grand complication lugs in two tiers', () => {
    const station = lugsOf('grandComplication').filter(
      point => point.x > 0 && Math.abs(point.y - 1.4) < 0.02
    );
    const inner = Math.min(...station.map(point => point.x));
    const outer = Math.max(...station.map(point => point.x));
    const topOf = (from: number, to: number) =>
      Math.max(
        ...station
          .filter(point => point.x >= from && point.x <= to)
          .map(point => point.z)
      );
    const width = outer - inner;
    const raised = topOf(inner, inner + width * 0.5);
    const step = topOf(inner + width * 0.7, outer);
    expect(raised - step).toBeGreaterThan(0.05);
  });
});

describe('the tonneau case', () => {
  const spec = TOURBILLON.case;
  const length = spec.length ?? 0;
  const { body, lugs, strap } = caseGeometry(spec, TOURBILLON.bezel.outer);
  const points = vertices(body);

  it('is a barrel, longer than wide, with the strap built in', () => {
    const { min, max } = box(body);
    expect(lugs).toBeNull();
    expect(max.y - min.y).toBeCloseTo(length * 2, 2);
    expect(max.x - min.x).toBeCloseTo(spec.radius * 2, 2);
    // Its sides bow out: narrower towards the ends than at the middle.
    const widthAt = (y: number) =>
      Math.max(
        ...points.filter(point => Math.abs(point.y - y) < 0.03).map(p => p.x)
      );
    expect(widthAt(length * 0.8)).toBeLessThan(widthAt(0) - 0.15);
  });

  it('is as long for its width as the tonneau it is drawn after', () => {
    // Its case is the lug to lug: about 49 mm on a 40 mm wide barrel.
    const ratio = length / spec.radius;
    expect(ratio).toBeGreaterThanOrEqual(1.15);
    expect(ratio).toBeLessThanOrEqual(1.3);
  });

  it('curves down to the wrist at 12 and 6, flat under the bezel', () => {
    const topNear = (y: number) =>
      Math.max(
        ...points.filter(point => Math.abs(point.y - y) < 0.03).map(p => p.z)
      );
    expect(topNear(0)).toBeCloseTo(CASE_TOP, 5);
    expect(topNear(TOURBILLON.bezel.outer - 0.15)).toBeCloseTo(CASE_TOP, 5);
    expect(topNear(length - 0.1)).toBeLessThan(CASE_TOP - 0.04);
    expect(topNear(-(length - 0.1))).toBeLessThan(CASE_TOP - 0.04);
    // The underside follows, so the whole case bends.
    expect(box(body).min.z).toBeLessThan(CASE_TOP - spec.height - 0.05);
  });

  it('closes a floor under the movement', () => {
    const floor = vertices(body).filter(point => radial(point) < 0.9);
    expect(floor.length).toBeGreaterThan(0);
    const normal = body.getAttribute('normal');
    const position = body.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      const point = new Vector3().fromBufferAttribute(position, index);
      if (radial(point) < 0.9) {
        expect(point.z).toBeLessThan(0);
        expect(normal.getZ(index)).toBeGreaterThan(0.99);
      }
    }
  });

  it('starts the strap in the case end', () => {
    expect(strap.y).toBeCloseTo(length - 0.05, 5);
    expect(strap.width).toBeCloseTo(1.1, 5);
    const end = points.filter(point => Math.abs(point.y - strap.y) < 0.02);
    expect(strap.z).toBeGreaterThan(Math.min(...end.map(point => point.z)));
    expect(strap.z).toBeLessThan(Math.max(...end.map(point => point.z)));
  });
});

/** Head radius and overall length (tube, head and face) per crown. */
const CROWN_SIZES: Readonly<
  Record<CrownPart, { radius: number; length: number }>
> = {
  screwDown: { radius: 0.16, length: 0.218 },
  tool: { radius: 0.18, length: 0.175 },
  flat: { radius: 0.12, length: 0.122 },
  barrel: { radius: 0.17, length: 0.2 },
  onion: { radius: 0.2, length: 0.25 },
};

describe.each(Object.keys(CROWN_SIZES) as CrownPart[])(
  'the %s crown',
  style => {
    const crown = crownGeometry(style);
    const { radius, length } = CROWN_SIZES[style];

    it('points along +X from its inner face at x = 0', () => {
      const { min, max } = box(crown);
      expect(min.x).toBeCloseTo(0, 6);
      expect(max.x).toBeCloseTo(length, 2);
      expect(max.y).toBeCloseTo(radius, 2);
      expect(max.z).toBeCloseTo(radius, 2);
      expect(min.y).toBeCloseTo(-max.y, 3);
      expect(min.z).toBeCloseTo(-max.z, 3);
    });

    it('is a closed, outward-facing solid', () => {
      expect(signedVolume(crown)).toBeGreaterThan(0);
      expect(crown.groups).toHaveLength(0);
      const values = Array.from(crown.getAttribute('normal').array);
      expect(values.every(Number.isFinite)).toBe(true);
    });
  }
);

describe('crown flutes', () => {
  const sideRadii = (style: CrownPart, x: number) =>
    vertices(crownGeometry(style))
      .filter(point => Math.abs(point.x - x) < 1e-4)
      .map(point => Math.hypot(point.y, point.z));

  it('grooves a screw-down crown round its side', () => {
    // The side's lower edge, past the tube and the inner chamfer.
    const radii = sideRadii('screwDown', 0.04 + 0.014);
    expect(Math.max(...radii)).toBeCloseTo(0.16, 3);
    expect(Math.min(...radii)).toBeCloseTo(0.16 - 0.014, 3);
  });

  it('keeps the racing barrel smooth', () => {
    const radii = sideRadii('barrel', 0.03 + 0.016);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-4);
  });
});

describe('pushers', () => {
  it.each([
    ['pump', 0.15, 0.082],
    ['round', 0.14, 0.06],
  ] as const)('%s points along +X', (style, length, radius) => {
    const pusher = pusherGeometry(style);
    const { min, max } = box(pusher);
    expect(min.x).toBeCloseTo(0, 6);
    expect(max.x).toBeCloseTo(length, 3);
    expect(max.y).toBeCloseTo(radius, 2);
    expect(min.z).toBeCloseTo(-max.z, 3);
    expect(signedVolume(pusher)).toBeGreaterThan(0);
  });

  it('gives the pump a flat cap and the round one a dome', () => {
    const capRadius = (style: 'pump' | 'round') => {
      const points = vertices(pusherGeometry(style));
      const end = Math.max(...points.map(point => point.x));
      return Math.max(
        ...points
          .filter(point => point.x > end - 1e-4)
          .map(point => Math.hypot(point.y, point.z))
      );
    };
    expect(capRadius('pump')).toBeGreaterThan(0.05);
    expect(capRadius('round')).toBeLessThan(0.001);
  });
});

describe('crown guards', () => {
  const radius = DIVER.case.radius;
  const guards = crownGuardGeometry(radius, crownAxisZ(DIVER.case));
  const points = vertices(guards);

  it('shoulder the crown on both sides, clear of its head', () => {
    const { min, max } = box(guards);
    expect(max.y).toBeCloseTo(-min.y, 5);
    expect(max.x).toBeGreaterThan(radius + 0.1);
    expect(max.x).toBeLessThan(radius + 0.15);
    const crown = box(crownGeometry('screwDown'));
    // The crown stands out past them, so it can still be gripped.
    expect(radius + crown.max.x).toBeGreaterThan(max.x + 0.05);
    const crownRadius = crown.max.y;
    for (const point of points) {
      expect(Math.abs(point.y)).toBeGreaterThan(crownRadius + 0.005);
    }
  });

  it('centres on the crown axis and winds outward', () => {
    const { min, max } = box(guards);
    expect((min.z + max.z) / 2).toBeCloseTo(crownAxisZ(DIVER.case), 5);
    expect(signedVolume(guards)).toBeGreaterThan(0);
  });

  it('defaults to the oyster crown height', () => {
    expect(box(crownGuardGeometry(radius)).min.z).toBeCloseTo(
      box(guards).min.z,
      5
    );
  });
});

describe('case proportions', () => {
  it('makes the dress case the thinnest', () => {
    const thickness = (id: keyof typeof WATCHES) => {
      const { min, max } = box(
        caseGeometry(WATCHES[id].case, WATCHES[id].bezel.outer).body
      );
      return max.z - min.z;
    };
    for (const id of WATCH_ORDER) {
      if (id === 'moonphase') continue;
      expect(thickness('moonphase')).toBeLessThan(thickness(id));
    }
  });
});
