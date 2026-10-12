// A leather, alligator or rubber strap's proportions, apart from its
// component so tests can check how it meets the case without a renderer.

export const STRAP_LENGTH = 4.4;
export const STRAP_THICKNESS = 0.13;
/** Its edges, rounded all round. */
export const STRAP_RADIUS = 0.05;
/** A strap leaves the spring bar tilted back towards the wrist. */
export const STRAP_TILT = -0.22;
/**
 * The strap folds round its spring bar, so its end sits half its thickness
 * on the case side of the bar: started at the bar itself, it would leave a
 * hole between the case and the strap.
 */
export const STRAP_WRAP = STRAP_THICKNESS / 2;
