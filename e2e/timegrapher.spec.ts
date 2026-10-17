import { expect, test } from '@playwright/test';

import { SAVE_KEY, SAVE_VERSION } from '../src/state/saved';
import { todaysDaily } from '../src/state/daily';
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
    // The round is the first of the latest: nothing yet to compare with.
    const latest = panel.getByTestId('timegrapher-latest');
    await expect(latest).toContainText('1 round so far');
    await expect(
      latest.locator('[data-testid="latest-readout"][data-readout="average"]')
    ).toHaveText(/^\d+(\.\d)?$/);
    await expect(latest.getByTestId('latest-change')).toHaveCount(0);
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

test('sums up the latest rounds against those before, and the Dailies', async ({
  page,
}) => {
  // Twenty rounds on the Diver, the later ten better; a few Dailies.
  const now = Date.now();
  const lines = Array.from({ length: 20 }, (_, index) => {
    const better = index >= 10;
    return [
      now - (20 - index) * 60_000,
      0,
      better ? 30 : 20,
      20,
      better ? 10 : 5,
      better ? 2 : 6,
      better ? 10 : 16,
    ];
  });
  const today = todaysDaily(new Date());
  await page.addInitScript(
    ([key, saved]) => {
      localStorage.setItem(key, saved);
    },
    [
      SAVE_KEY,
      JSON.stringify({
        state: {
          timing: { diver: record(20) },
          history: { diver: lines },
          dailies: {
            [String(today)]: 21,
            [String(today - 1)]: 15,
            [String(today - 3)]: 9,
          },
        },
        version: SAVE_VERSION,
      }),
    ] as const
  );
  await page.goto('/');
  await page.getByTestId('timegrapher-open').click({ timeout: SCENE_TIMEOUT });
  const panel = page.getByTestId('timegrapher-dialog');
  const readout = (key: string) =>
    panel.locator(`[data-testid="latest-readout"][data-readout="${key}"]`);
  await expect(readout('average')).toHaveText(/^30\s*\+10\.0/);
  await expect(readout('perfect')).toHaveText(/^50%\s*\+25 pt/);
  await expect(readout('spread')).toHaveText(/^±10 ms\s*−6 ms/);
  // Twenty-five asked for, twenty played: nothing before them to compare.
  await panel.getByText('Last 25').click();
  await expect(panel.getByTestId('timegrapher-latest')).toContainText(
    '20 rounds so far'
  );
  await expect(panel.getByTestId('latest-change')).toHaveCount(0);

  const archive = panel.getByTestId('daily-archive');
  await expect(
    archive.locator('[data-testid="daily-archive-day"][data-played="true"]')
  ).toHaveCount(3);
  await expect(archive).toContainText(
    '2 days in a row · 3 of the last 14 played'
  );
});
