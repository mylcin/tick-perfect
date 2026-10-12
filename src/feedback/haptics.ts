export type VibrationPattern = number | readonly number[];

/**
 * Whether vibrating does anything here: a phone or tablet whose browser can.
 * Desktop Chrome has navigator.vibrate too, with nothing to shake.
 */
export function canVibrate(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function' &&
    navigator.maxTouchPoints > 0 &&
    typeof matchMedia === 'function' &&
    matchMedia('(pointer: coarse)').matches
  );
}

/** Vibrates where the device supports it; does nothing anywhere else. */
export function vibrate(pattern: VibrationPattern): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    // Some browsers throw instead of returning false; either way, skip it.
  }
}
