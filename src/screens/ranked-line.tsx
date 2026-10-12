import type { Dictionary } from '../i18n';
import { ONLINE, useOnline, type Submission } from '../online';
import { useSession } from '../state/session';

/**
 * What became of the round on the online board: posting, its place, held
 * for review or refused. A guest, on a round that could have counted, is
 * offered the way in instead. Nothing at all in a build without the
 * online side.
 */
export function RankedLine({
  t,
  countable,
}: {
  t: Dictionary;
  /** A collection round or a Daily: one a board would take. */
  countable: boolean;
}) {
  const submission = useOnline(state => state.submission);
  const status = useOnline(state => state.status);
  const open = useOnline(state => state.config?.leaderboard ?? false);
  const setLeaderboardOpen = useSession(state => state.setLeaderboardOpen);
  if (!ONLINE) return null;

  if (submission) {
    const text = submissionText(t, submission);
    return (
      <p
        data-testid="ranked-line"
        data-state={submission.state}
        role="status"
        className="mt-2 text-xs text-ink-2 tabular-nums"
      >
        {text}
      </p>
    );
  }

  if (status === 'signedOut' && open && countable) {
    return (
      <button
        type="button"
        data-testid="ranked-sign-in"
        className="mt-2 text-xs text-ink-3 underline decoration-ink/30 underline-offset-4 hover:text-ink"
        onClick={() => {
          setLeaderboardOpen(true);
        }}
      >
        {t.leaderboard.signInToPost}
      </button>
    );
  }
  return null;
}

function submissionText(t: Dictionary, submission: Submission): string {
  switch (submission.state) {
    case 'sending':
      return t.leaderboard.posting;
    case 'failed':
      return t.leaderboard.postFailed;
    case 'rejected':
      return t.leaderboard.rejected;
    case 'flagged':
      return t.leaderboard.flagged;
    case 'verified':
      return submission.rank === null || submission.best === null
        ? t.leaderboard.flagged
        : t.leaderboard.posted(submission.rank, submission.best);
  }
}
