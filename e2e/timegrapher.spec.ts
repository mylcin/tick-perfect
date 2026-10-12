import { expect, test } from '@playwright/test';

import {
  ALL_UNLOCKED,
  gameState,
  hits,
  pressInPage,
  SCENE_TIMEOUT,
  seedProgress,
  startGame,
  waitForPhase,
} from './helpers';

test('a fresh profile has nothing measured yet', async ({ page }) => {
  await page.goto('/');
  const play = page.getByRole('button', { name: 'Tap to Play' });
  await expect(play).toHaveAttribute('aria-disabled', 'false', {
    timeout: SCENE_TIMEOUT,
  });
  const open = page.getByTestId('timegrapher-open');
  await expect(open).toHaveAccessibleName('Timegrapher');
  await open.click();
  await expect(page.getByRole('dialog', { name: 'Timegrapher' })).toBeVisible();
  await expect(page.getByTestId('timegrapher-empty')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Timegrapher' })).toBeHidden();
  await expect(open).toBeFocused();
});

test('draws every hit of a round and keeps it', async ({ page, isMobile }) => {
  await page.goto('/');
  await startGame(page);
  await pressInPage(page, { touch: isMobile, presses: 4 });
  // Then the hand runs past the next marker.
  await waitForPhase(page, 'gameOver');
  const count = await hits(page);
  expect(count).toBe(4);

  const results = page.getByTestId('game-over-dialog');
  await expect(results.getByTestId('timing-line')).toHaveText(
    /^(Timing \d+ ms (early|late)|Right on time) · ±\d+ ms$/
  );
  await results.getByRole('button', { name: 'Main menu' }).click();

  const checkPanel = async () => {
    await page
      .getByTestId('timegrapher-open')
      .click({ timeout: SCENE_TIMEOUT });
    const panel = page.getByTestId('timegrapher-dialog');
    await expect(panel.getByRole('radio', { name: 'Diver' })).toBeChecked();
    await expect(
      panel.locator('[data-testid="timegrapher-readout"][data-readout="hits"]')
    ).toHaveText(String(count));
    const trace = panel.getByRole('img');
    await expect(trace).toHaveAccessibleName(
      new RegExp(`^Trace of the last ${String(count)} hits: `)
    );
    await expect(trace.getByTestId('timegrapher-dot')).toHaveCount(count);
  };
  await checkPanel();

  // The title's Space doesn't reach past the panel (and on a watch, not
  // the autofocused Close, it closes nothing), and Escape closes it.
  const panel = page.getByTestId('timegrapher-dialog');
  await panel.getByRole('radio', { name: 'Diver' }).focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  expect((await gameState(page)).phase).toBe('idle');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('timegrapher-open')).toBeFocused();

  await page.reload();
  await checkPanel();
});

/** A saved record of `count` hits, a few ms either side of late. */
function record(count: number) {
  const recent = Array.from({ length: count }, (_, index) =>
    index % 2 === 0 ? 6 : 14
  );
  return {
    count,
    sum: recent.reduce((total, ms) => total + ms, 0),
    sumSquares: recent.reduce((total, ms) => total + ms ** 2, 0),
    perfects: count / 2,
    recent,
  };
}

test('keeps the readouts in view in short landscape', async ({ page }) => {
  await seedProgress(page, {
    unlocked: ALL_UNLOCKED,
    // A record on every watch wraps their names onto the most rows.
    timing: Object.fromEntries(ALL_UNLOCKED.map(id => [id, record(40)])),
  });
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page
      .getByTestId('timegrapher-open')
      .click({ timeout: SCENE_TIMEOUT });
    const readouts = page.getByTestId('timegrapher-readout');
    await expect(readouts).toHaveCount(4);
    for (const readout of await readouts.all()) {
      await expect(readout).toBeInViewport({ ratio: 1 });
    }
  }
});

test.describe('in Turkish on a narrow phone', () => {
  test.use({ locale: 'tr-TR', viewport: { width: 360, height: 800 } });

  test('keeps the tagline clear of the Timegrapher button', async ({
    page,
  }) => {
    await page.goto('/');
    const tagline = page.getByText(
      'Mekanik bir saatte tek dokunuşluk zamanlama oyunu'
    );
    await expect(tagline).toBeVisible({ timeout: SCENE_TIMEOUT });
    const text = await tagline.boundingBox();
    const button = await page.getByTestId('timegrapher-open').boundingBox();
    expect(text && button).toBeTruthy();
    if (!text || !button) return;
    const apart =
      text.x + text.width <= button.x ||
      text.y + text.height <= button.y ||
      button.y + button.height <= text.y;
    expect(apart).toBe(true);
  });
});
