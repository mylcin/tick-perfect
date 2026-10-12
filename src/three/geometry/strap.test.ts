import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { WATCH_ORDER, WATCHES } from '../../watches';
import { caseGeometry } from './cases';
import { STRAP_RADIUS, STRAP_THICKNESS, STRAP_TILT, STRAP_WRAP } from './strap';

const X_AXIS = new Vector3(1, 0, 0);
const END_SAMPLES = 16;

/**
 * The strap's near end on its centre line, from bottom to top, placed as
 * the Strap component places it: a flat face between rounded edges,
 * folded round the bar at `anchor` and tilted back towards the wrist.
 */
function nearEnd(anchor: { y: number; z: number }): Vector3[] {
  const flat = STRAP_THICKNESS / 2 - STRAP_RADIUS;
  return Array.from({ length: END_SAMPLES + 1 }, (_, index) => {
    const angle = Math.PI * (index / END_SAMPLES - 0.5);
    return new Vector3(
      0,
      -STRAP_WRAP + STRAP_RADIUS * (1 - Math.cos(angle)),
      Math.sign(angle) * flat + STRAP_RADIUS * Math.sin(angle)
    )
      .applyAxisAngle(X_AXIS, STRAP_TILT)
      .add(new Vector3(0, anchor.y, anchor.z));
  });
}

// The tonneau's strap goes into its case end, so only lugged cases leave
// room between the case and the strap.
describe.each(
  WATCH_ORDER.filter(id => {
    const { case: spec, strap } = WATCHES[id];
    return (
      spec.style !== 'tonneau' &&
      strap.type !== 'oyster' &&
      strap.type !== 'jubilee'
    );
  })
)('the %s strap', id => {
  const { case: spec, bezel } = WATCHES[id];
  const parts = caseGeometry(spec, bezel.outer);

  it('meets the case with only a sliver of light between', () => {
    const body = new Mesh(
      parts.body,
      new MeshBasicMaterial({ side: DoubleSide })
    );
    const raycaster = new Raycaster();
    // Straight in towards the case, across the gap a viewer would see.
    const gaps = nearEnd(parts.strap).flatMap(point => {
      raycaster.set(point, new Vector3(0, -1, 0));
      const hit = raycaster.intersectObject(body)[0];
      return hit ? [hit.distance] : [];
    });
    expect(gaps.length).toBeGreaterThan(END_SAMPLES / 2);
    const gap = Math.min(...gaps);
    expect(gap).toBeGreaterThanOrEqual(0.03);
    expect(gap).toBeLessThanOrEqual(0.08);
  });
});
