import type { HitQuality } from '../game';

export const APP_URL = 'https://tick-perfect.vercel.app';

/** The HUD's diamonds: filled for a Perfect, hollow for a plain hit. */
const TRACE_MARKS: Readonly<Record<HitQuality, string>> = {
  perfect: '◆',
  good: '◇',
};
const MARKS_PER_LINE = 10;
/** A long run's trace stops here and counts the rest, so it stays short. */
export const MAX_TRACE_MARKS = 50;

/**
 * A run as a trace of marks, one per hit in order, ten to a line, like a
 * word game's squares: it shows how the run went, never where the targets
 * were. Empty for a run without a hit.
 */
export function shareTrace(qualities: readonly HitQuality[]): string {
  const marks = qualities
    .slice(0, MAX_TRACE_MARKS)
    .map(quality => TRACE_MARKS[quality]);
  const lines: string[] = [];
  for (let start = 0; start < marks.length; start += MARKS_PER_LINE) {
    lines.push(marks.slice(start, start + MARKS_PER_LINE).join(''));
  }
  const rest = qualities.length - marks.length;
  return `${lines.join('\n')}${rest > 0 ? ` +${String(rest)}` : ''}`;
}

/** What the first line names: a Daily by its number, or a watch. */
type ShareHeading =
  | { readonly kind: 'daily'; readonly number: number }
  | { readonly kind: 'watch'; readonly watch: string };

/**
 * The text shared after a round: "Tick Perfect #42 · 23" for a Daily or
 * "Tick Perfect · Diver · 23" for any other round, then the run's trace,
 * then the link (a challenge to play the same run).
 */
export function shareText({
  heading,
  score,
  qualities,
  link,
}: {
  heading: ShareHeading;
  score: number;
  qualities: readonly HitQuality[];
  link: string;
}): string {
  const title =
    heading.kind === 'daily'
      ? `Tick Perfect #${String(heading.number)} · ${String(score)}`
      : `Tick Perfect · ${heading.watch} · ${String(score)}`;
  return [title, shareTrace(qualities), link].filter(Boolean).join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Opens the system share sheet where there is one, and copies the text to
 * the clipboard everywhere else.
 */
export async function shareResult(
  text: string,
  browser: Pick<Navigator, 'clipboard'> &
    Partial<Pick<Navigator, 'share'>> = navigator
): Promise<ShareOutcome> {
  if (typeof browser.share === 'function') {
    try {
      await browser.share({ text });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return 'cancelled';
      }
      // Sharing is blocked here (no permission, insecure context); copy.
    }
  }
  try {
    await browser.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
