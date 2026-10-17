import { expect, test } from '@playwright/test';

import { PRACTICE_SET } from '../src/game';
import { SAVE_KEY } from '../src/state/saved';
import {
  gameState,
  pressEarly,
  SCENE_TIMEOUT,
  seedProgress,
  waitForPhase,
} from './helpers';

// Practice: a set of targets on the watch on show, where a miss moves on
// to the next, slower until the watch is certified, and nothing is saved.

test('plays a practice set through its misses, and saves nothing', async ({
  page,
  isMobile,
}) => {
  await seedProgress(page, { best: { diver: 12 } });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Practice' })
    .click({ timeout: SCENE_TIMEOUT });
  await waitForPhase(page, 'playing');
  const corner = page.getByTestId('hud-best');
  await expect(corner).toHaveAttribute('data-standing', 'practice');
  await expect(corner).toHaveText(`Practice 1/${String(PRACTICE_SET.targets)}`);

  // An early tap is a miss, said with its timing, and the set plays on.
  await pressEarly(page, isMobile);
  const feedback = page.getByTestId('practice-feedback');
  await expect(feedback).toHaveAttribute('data-outcome', 'early');
  await expect(feedback).toHaveText(/^Miss · \d+ ms early$/);
  expect((await gameState(page)).phase).toBe('playing');
  await expect(corner).toHaveText(`Practice 2/${String(PRACTICE_SET.targets)}`);

  // Every other target missed too: the set ends after its last.
  for (let target = 2; target <= PRACTICE_SET.targets; target++) {
    if ((await gameState(page)).phase !== 'playing') break;
    await pressEarly(page, isMobile);
  }
  await waitForPhase(page, 'gameOver');
  const results = page.getByRole('dialog', { name: 'Practice set' });
  await expect(results).toBeVisible({ timeout: 15_000 });
  await expect(results.getByTestId('practice-hits')).toHaveText(
    `0 of ${String(PRACTICE_SET.targets)} hit`
  );
  await expect(
    results.locator('[data-testid="practice-readout"][data-readout="misses"]')
  ).toHaveText(String(PRACTICE_SET.targets));
  // Slow until the watch is certified: the next set may go at its pace.
  await expect(results.getByRole('radio', { name: 'Slow' })).toBeChecked();
  await expect(page.getByTestId('game-over-dialog')).toBeHidden();

  // Nothing saved: no best, points, timing, history or Daily.
  const saved = await page.evaluate(
    key =>
      (
        JSON.parse(localStorage.getItem(key) ?? 'null') as {
          state: Record<string, unknown>;
        } | null
      )?.state,
    SAVE_KEY
  );
  expect(saved?.['progress']).toMatchObject({ best: { diver: 12 } });
  expect(saved?.['progress']).not.toHaveProperty('points');
  expect(saved?.['timing'] ?? {}).toEqual({});
  expect(saved?.['history'] ?? {}).toEqual({});
  expect(saved?.['daily'] ?? null).toBeNull();

  // Another set at the watch's own pace.
  await results.getByText('Normal').click();
  await results.getByRole('button', { name: 'Again' }).click();
  await expect(results).toBeHidden();
  await waitForPhase(page, 'playing');
  await expect(corner).toHaveText(`Practice 1/${String(PRACTICE_SET.targets)}`);
  expect((await gameState(page)).phase).toBe('playing');
});

test('practises only a watch the collection has opened', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Practice' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  await page.getByRole('radio', { name: /^Chronograph,/ }).click();
  await expect(page.getByRole('button', { name: 'Practice' })).toHaveCount(0);
});
