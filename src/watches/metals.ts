import type { MetalSpec } from './spec.js';

// Shared metals, so watches made of the same alloy match.

export const BRUSHED_STEEL: MetalSpec = {
  color: '#d6d9de',
  roughness: 0.28,
  brushing: 0.75,
};

export const POLISHED_STEEL: MetalSpec = {
  color: '#d9dce1',
  roughness: 0.08,
  brushing: 0,
};

/** White gold for applied markers and hands: brighter than steel. */
export const WHITE_GOLD: MetalSpec = {
  color: '#eceef1',
  roughness: 0.06,
  brushing: 0,
};

export const POLISHED_YELLOW_GOLD: MetalSpec = {
  color: '#f1cf7c',
  roughness: 0.08,
  brushing: 0,
};

/** Forged carbon reads as a dark, satin metal. */
export const CARBON: MetalSpec = {
  color: '#3a3d43',
  roughness: 0.48,
  brushing: 0,
};

/** 18k rose gold, polished, for accents on a dark case. */
export const POLISHED_ROSE_GOLD: MetalSpec = {
  color: '#e8b49c',
  roughness: 0.08,
  brushing: 0,
};

/** A rose gold case, polished but softer than its bevels. */
export const ROSE_GOLD: MetalSpec = {
  color: '#ecbaa0',
  roughness: 0.2,
  brushing: 0,
};

/** Gilt, the warm pale gold of vintage hands and markers. */
export const GILT: MetalSpec = {
  color: '#e4c68c',
  roughness: 0.16,
  brushing: 0,
};

/** Rose gold hands in a satin finish, bright against a dark movement. */
export const SATIN_ROSE_GOLD: MetalSpec = {
  color: '#ecbca5',
  roughness: 0.24,
  brushing: 0,
};

/** Bronze, satin-brushed: warm and a little dull, as it ages. */
export const BRUSHED_BRONZE: MetalSpec = {
  color: '#b9844f',
  roughness: 0.32,
  brushing: 0.5,
};

export const POLISHED_BRONZE: MetalSpec = {
  color: '#c99464',
  roughness: 0.12,
  brushing: 0,
};

/** Bronze-toned hands, bright on a dark dial. */
export const SATIN_BRONZE: MetalSpec = {
  color: '#d8ab7c',
  roughness: 0.24,
  brushing: 0,
};

export const POLISHED_TITANIUM: MetalSpec = {
  color: '#c4c9cf',
  roughness: 0.12,
  brushing: 0,
};

export const PLATINUM: MetalSpec = {
  color: '#e4e5e8',
  roughness: 0.1,
  brushing: 0,
};

/**
 * Satin-finished hand metals: a mirror polish shows the dark studio and
 * reads black, so hands without lume get a softer sheen that stays bright.
 */
export const SATIN_YELLOW_GOLD: MetalSpec = {
  color: '#efcd78',
  roughness: 0.24,
  brushing: 0,
};

export const SATIN_WHITE_GOLD: MetalSpec = {
  color: '#eef0f3',
  roughness: 0.24,
  brushing: 0,
};
