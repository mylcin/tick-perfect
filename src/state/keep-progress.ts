import type { Progress } from './progress';

// Browsers may clear a site's storage: when the disk runs short, and Safari
// after seven days of browsing without a visit. Once the player has earned
// something worth keeping, the game asks for the save to be kept, and on
// Safari suggests the Home Screen, where a web app keeps its own.

/** Something earned: a watch past the first. */
function hasEarned(progress: Progress): boolean {
  return progress.unlocked.length > 1;
}

/** Whether to ask the browser to keep the save: once, after an unlock. */
export function shouldPersist(
  progress: Progress,
  tips: readonly string[]
): boolean {
  return hasEarned(progress) && !tips.includes('persist');
}

/** The little of `navigator` that tells a Safari tab from a web app. */
export interface Device {
  /** Only Safari on iOS and iPadOS has it: false in a tab. */
  readonly standalone?: boolean;
}

/**
 * Whether to suggest Add to Home Screen: in a Safari tab on an iPhone or
 * iPad, after an unlock, until the player dismisses it.
 */
export function shouldSuggestHomeScreen(
  progress: Progress,
  tips: readonly string[],
  device: Device
): boolean {
  return (
    device.standalone === false &&
    hasEarned(progress) &&
    !tips.includes('homeScreen')
  );
}

/**
 * Asks the browser to keep this site's storage through its clean-ups. Some
 * browsers ask the player first (Firefox), so call it from a press. Where
 * it is missing or refused, the save is kept as it always was.
 */
export function persistStorage(
  storage: { readonly persist?: () => Promise<boolean> } | undefined
): void {
  try {
    storage?.persist?.().catch(() => {
      // Refused: nothing changes.
    });
  } catch {
    // Not allowed here (a sandboxed frame, say): nothing changes either.
  }
}
