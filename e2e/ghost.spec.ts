import { expect, test, type Page } from '@playwright/test';

import { DIVER_RULES, simulateRound } from '../src/game';
import { ghostOf } from '../src/state/ghost';
import { SAVE_KEY, SAVE_VERSION } from '../src/state/saved';
import {
  hits,
  pinDate,
  pressInPage,
  SCENE_TIMEOUT,
  waitForPhase,
} from './helpers';

// A ghost: a best round raced again, its hand see-through on the dial. The
// watch's best is raced from the title and counts for nothing; the day's
// best Daily races beside the Daily's retries.

/** The saved state, as the app keeps it. */
function saved(page: Page) {
  return page.evaluate(
    key =>
      (
        JSON.parse(localStorage.getItem(key) ?? 'null') as {
          state: Record<string, unknown>;
        } | null
      )?.state,
    SAVE_KEY
  );
}

test('races the watch’s best round, counting for nothing', async ({ page }) => {
  // A steady player's best round on the Diver, kept as its ghost.
  const best = simulateRound(DIVER_RULES, { seed: 99, sigma: 8 });
  const ghost = ghostOf(best.log, best.score);
  expect(best.score).toBeGreaterThan(5);
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('seeded') !== null) return;
      localStorage.setItem(key, value);
      sessionStorage.setItem('seeded', '1');
    },
    [
      SAVE_KEY,
      JSON.stringify({
        state: {
          progress: {
            best: { diver: best.score },
            unlocked: ['diver'],
            points: best.score,
          },
          ghosts: { best: { diver: ghost }, daily: null },
        },
        version: SAVE_VERSION,
      }),
    ] as const
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Race your best' })
    .click({ timeout: SCENE_TIMEOUT });
  await waitForPhase(page, 'playing');

  // The ghost plays its round beside this one, and scores as it did.
  const corner = page.getByTestId('hud-best');
  await expect(corner).toHaveText(`To beat ${String(best.score)}`);
  const ghostLine = page.getByTestId('hud-ghost');
  await expect(ghostLine).toHaveText(/^Ghost \d+ · /);
  await expect(ghostLine).not.toHaveText(/^Ghost 0 /, { timeout: 10_000 });

  // Left alone, this round ends at its first target; the ghost's doesn't.
  await waitForPhase(page, 'gameOver');
  const results = page.getByRole('dialog', { name: 'Against your best' });
  await expect(results).toBeVisible({ timeout: 15_000 });
  await expect(results.getByTestId('ghost-verdict')).toHaveText(
    `Your ghost stays ahead by ${String(best.score)}.`
  );
  await expect(results.getByTestId('ghost-race')).toContainText(
    String(best.hits)
  );

  // Nothing counted: the best, the timing and the history are as they were.
  const state = await saved(page);
  expect(state?.['progress']).toMatchObject({ best: { diver: best.score } });
  expect(state?.['timing'] ?? {}).toEqual({});
  expect(state?.['history'] ?? {}).toEqual({});
});

test('keeps the day’s best Daily round, and races it on a retry', async ({
  page,
  isMobile,
}) => {
  // Daily #1, on the Diver: open on a fresh save.
  await pinDate(page, new Date(2026, 9, 1, 12, 0, 0));
  await page.goto('/');
  await page
    .getByRole('button', { name: /^Daily #1, / })
    .click({ timeout: SCENE_TIMEOUT });
  await waitForPhase(page, 'playing');
  await expect(page.getByTestId('hud-ghost')).toHaveCount(0);
  await pressInPage(page, { touch: isMobile, presses: 2 });
  await expect.poll(() => hits(page)).toBeGreaterThan(0);
  await waitForPhase(page, 'gameOver');
  const results = page.getByRole('dialog', { name: 'Daily #1' });
  await expect(results).toBeVisible({ timeout: 15_000 });
  const state = await saved(page);
  expect(state?.['ghosts']).toMatchObject({
    daily: { number: 1, watch: 'diver' },
  });

  // The retry races the round just kept.
  await results.getByRole('button', { name: 'Retry' }).click();
  await waitForPhase(page, 'playing');
  await expect(page.getByTestId('hud-ghost')).toHaveText(/^Ghost \d+ · /);
});
