import { expect, test } from '@playwright/test';

import {
  gameState,
  hits,
  pressInPage,
  SCENE_TIMEOUT,
  seedProgress,
  startGame,
  waitForPhase,
} from './helpers';

/** A timing record on the Diver, `perfects` of its taps Perfect. */
const record = (perfects: number) => ({
  count: 1200,
  sum: 0,
  sumSquares: 120_000,
  perfects,
  recent: [],
});

test('turns the watch over to its caseback, and lists what it carries', async ({
  page,
}) => {
  await seedProgress(page, {
    best: { diver: 30 },
    engravings: { 'beatError:diver': 3, 'isochronism:gmt': 4 },
    timing: { diver: record(612) },
  });
  await page.goto('/');
  const toggle = page.getByTestId('caseback-toggle');
  // Named for what it shows, with how much of it is engraved here.
  await expect(toggle).toHaveAccessibleName('Achievements 1/5', {
    timeout: SCENE_TIMEOUT,
  });
  await expect(page.getByTestId('caseback-panel')).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('data-turned', 'true');
  await expect(toggle).toHaveAccessibleName('Back to the dial');
  const panel = page.getByTestId('caseback-panel');
  await expect(panel).toContainText('Each one is engraved on the caseback.');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('title-rule')).toBeHidden();
  await expect(page.getByRole('radiogroup', { name: 'Variant' })).toHaveCount(
    0
  );
  const row = (id: string) =>
    panel.locator(`[data-testid="engraving-row"][data-engraving="${id}"]`);
  // The Diver's own: the GMT's Isochronism is on the GMT's caseback.
  await expect(row('beatError')).toHaveAttribute('data-done', 'true');
  await expect(row('isochronism')).toHaveAttribute('data-done', 'false');
  await expect(row('escapement')).toContainText(/612\s\/\s1000/);
  await expect(row('powerReserve')).toContainText(/0\s\/\s7/);

  await toggle.click();
  await expect(toggle).toHaveAttribute('data-turned', 'false');
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Variant' })).toBeVisible();

  // Playing turns it back to its dial.
  await toggle.click();
  await page.getByRole('button', { name: 'Tap to Play' }).click();
  await waitForPhase(page, 'playing');
});

test('engraves Escapement with the 1,000th Perfect', async ({
  page,
  isMobile,
}) => {
  await seedProgress(page, { timing: { diver: record(999) } });
  await page.goto('/');
  await startGame(page);
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect.poll(() => hits(page)).toBe(1);
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results).toBeVisible({ timeout: 15_000 });
  const engraved = page.getByTestId('engraving-earned');
  await expect(engraved).toHaveAttribute('data-engravings', 'escapement');
  await expect(engraved).toHaveText('Escapement engraved on the caseback');
  await expect(results).toHaveAccessibleDescription(
    /Escapement engraved on the caseback\./
  );
  expect((await gameState(page)).phase).toBe('gameOver');
});
