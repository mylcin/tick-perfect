import { STANDARD, type VariantId } from '../watches';
import type { WatchId } from '../watches/ids';

/**
 * The radius around the watch's centre, in scene units, that a thumbnail's
 * square frames: a little of the strap shows, and the widest case fits.
 */
export const THUMBNAIL_RADIUS = 1.72;

/**
 * A watch's thumbnail in a variant (scripts/render-thumbnails.js draws
 * them): the standard under the watch's own name.
 */
export function thumbnailUrl(watch: WatchId, variant: VariantId): string {
  return variant === STANDARD
    ? `/watches/${watch}.webp`
    : `/watches/${watch}-${variant}.webp`;
}
