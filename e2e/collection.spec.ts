import { expect, test } from '@playwright/test';

import { WATCHES } from '../src/watches';
import { WATCH_ORDER } from '../src/watches/ids';
import {
  collectErrors,
  countDraws,
  gameState,
  hits,
  pressInPage,
  SCENE_TIMEOUT,
  seedProgress,
  startGame,
  waitForPhase,
  waitForWatch,
  ALL_UNLOCKED,
} from './helpers';

/** The last watch of the collection, where End goes. */
const LAST = WATCHES[WATCH_ORDER[WATCH_ORDER.length - 1] ?? 'diver'].name;

test('shows the whole collection, locked watches as silhouettes', async ({
  page,
}) => {
  await page.goto('/');
  const list = page.getByRole('radiogroup', { name: 'Watches' });
  await expect(list.getByRole('radio')).toHaveCount(WATCH_ORDER.length);
  await expect(page.getByTestId('watch-card')).toHaveCount(WATCH_ORDER.length);
  await expect(
    page.locator('[data-testid="watch-card"][data-locked="false"]')
  ).toHaveCount(1);
  await expect(list.getByRole('radio', { name: /^Diver,/ })).toBeChecked();
  await expect(list.getByRole('radio', { name: /^GMT,/ })).toHaveAccessibleName(
    'GMT, Locked. To unlock: Score 15 on the Chronograph (Best 0 of 15); Reach level 3 (0 of 400 points)'
  );
});

test('browses with the arrow keys and won’t start a locked watch', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(
    'Chronograph'
  );
  await expect(
    page.getByRole('radio', { name: /^Chronograph,/ })
  ).toBeChecked();
  const steps = page.getByTestId('unlock-step');
  await expect(steps).toHaveText([
    /Score 15 on the Diver · Best\s0\sof\s15$/,
    /Reach level 2 · 0\sof\s150\spoints$/,
  ]);
  await expect(steps.first()).toHaveAttribute('data-done', 'false');
  const locked = page.getByRole('button', { name: 'Locked' });
  await expect(locked).toHaveAttribute('aria-disabled', 'true');

  // Space says why instead of starting.
  await page.keyboard.press('Space');
  await expect(page.getByTestId('announcer-polite')).toContainText(
    'Locked. To unlock: Score 15 on the Diver'
  );
  expect((await gameState(page)).phase).toBe('idle');

  await page.keyboard.press('Home');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Diver');
  await page.keyboard.press('End');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(LAST);
});

test('unlocks what a saved best and level have earned, with its certificate', async ({
  page,
}) => {
  await seedProgress(page, {
    best: { diver: 41 },
    unlocked: ['diver'],
    points: 150,
  });
  await page.goto('/');
  await expect(
    page.locator('[data-testid="watch-card"][data-watch="chronograph"]')
  ).toHaveAttribute('data-locked', 'false');
  await expect(
    page.getByTestId('title-best').getByTestId('certificate-pips')
  ).toHaveAttribute('data-tier', 'chronometer');
});

test('shows what a locked watch still waits for, step by step', async ({
  page,
}) => {
  await seedProgress(page, {
    best: { diver: 20 },
    unlocked: ['diver'],
    points: 90,
  });
  await page.goto('/');
  await expect(page.getByTestId('level-meter')).toHaveAttribute(
    'data-level',
    '1'
  );
  await page
    .getByRole('radio', { name: /^Chronograph,/ })
    .click({ timeout: SCENE_TIMEOUT });
  const steps = page.getByTestId('unlock-step');
  await expect(steps.first()).toHaveAttribute('data-done', 'true');
  await expect(steps.last()).toHaveAttribute('data-done', 'false');
  await expect(steps.last()).toHaveText(/90\sof\s150\spoints/);
});

test('reaching the level with 15 unlocks the next watch and goes straight to it', async ({
  page,
  isMobile,
}) => {
  test.slow();
  await seedProgress(page, {
    best: { diver: 14 },
    unlocked: ['diver'],
    points: 140,
  });
  await page.goto('/');
  await startGame(page);
  // Perfects double from the third: 2 + 2 + 4 + 4 + 4 = 16.
  await pressInPage(page, { touch: isMobile, presses: 5 });
  await expect.poll(() => hits(page)).toBe(5);
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('certificate-earned')).toHaveAttribute(
    'data-tier',
    'adjusted'
  );
  await expect(page.getByTestId('level-up')).toHaveAttribute('data-level', '2');
  const banner = page.getByTestId('unlock-banner');
  await expect(banner).toHaveAttribute('data-watch', 'chronograph');
  await expect(results).toHaveAccessibleDescription(/Chronograph unlocked\./);

  await banner.getByRole('button', { name: 'Play the Chronograph' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Tick Perfect, Chronograph'
  );
  await waitForPhase(page, 'playing');
});

test('draws every watch within budget and lets each one go', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await countDraws(page);
  await seedProgress(page, { unlocked: ALL_UNLOCKED });
  await page.goto('/');
  await waitForWatch(page);
  for (const name of [
    'Chronograph',
    'GMT',
    'Moonphase',
    'Tourbillon',
    'Grand Complication',
    'Field',
    'Pilot',
    'Digital',
    'Diver',
  ]) {
    // Endless's card leads with its mode, as it reads on screen.
    const card = name === 'Grand Complication' ? 'Endless' : name;
    await page.getByRole('radio', { name: new RegExp(`^${card},`) }).click();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
      new RegExp(`^${name}`)
    );
    await waitForWatch(page);
  }
  expect(errors).toEqual([]);
});

test('plays Endless once the collection is complete', async ({ page }) => {
  await seedProgress(page, {
    best: {
      diver: 15,
      chronograph: 15,
      gmt: 15,
      moonphase: 15,
      tourbillon: 15,
    },
    points: 2200,
  });
  await page.goto('/');
  await page
    .getByRole('radio', { name: /^Endless,/ })
    .click({ timeout: SCENE_TIMEOUT });
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(
    /^Grand Complication/
  );
  await startGame(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Tick Perfect, Grand Complication'
  );
});
