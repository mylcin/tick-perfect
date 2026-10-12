/** Older timestamps than this are not trusted to be on the same clock. */
export const MAX_INPUT_AGE_MS = 1000;

/**
 * When an input happened, on the `performance.now()` clock.
 *
 * An event's `timeStamp` is when the press happened, not when the page got
 * round to handling it, which keeps taps fair when a frame runs long. Old
 * engines stamped events with epoch time or 0; anything that doesn't fit the
 * clock falls back to `now`.
 */
export function inputTime(eventTimeStamp: number, now: number): number {
  const age = now - eventTimeStamp;
  const trusted =
    Number.isFinite(eventTimeStamp) &&
    eventTimeStamp > 0 &&
    age >= 0 &&
    age <= MAX_INPUT_AGE_MS;
  return trusted ? eventTimeStamp : now;
}
