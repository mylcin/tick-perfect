import { expect, test } from '@playwright/test';

import {
  gameState,
  pressEarly,
  roundSeed,
  SCENE_TIMEOUT,
  startGame,
  waitForPhase,
} from './helpers';

// Keyboard and screen reader details around the rounds: what Space presses,
// what is announced, and where the live regions are while a dialog is open.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
});

test('Space presses a focused control on the title instead of playing', async ({
  page,
}) => {
  await page.getByTestId('timegrapher-open').focus();
  await page.keyboard.press('Space');
  const timegrapher = page.getByRole('dialog', { name: 'Timegrapher' });
  await expect(timegrapher).toBeVisible();
  expect((await gameState(page)).phase).toBe('idle');
  await page.keyboard.press('Escape');
  await expect(timegrapher).toBeHidden();

  // A swatch is a radio: Space picks it, as it would anywhere else.
  await page.getByTestId('variant-swatch').first().focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  expect((await gameState(page)).phase).toBe('idle');

  // From the strip, Space still plays the watch on show.
  await page.getByRole('radio', { name: /^Diver,/ }).focus();
  await page.keyboard.press('Space');
  await waitForPhase(page, 'playing');
});

test('a reflex Space right after a miss leaves the results up', async ({
  page,
}) => {
  await startGame(page);
  await pressEarly(page, false);
  const seed = await roundSeed(page);
  // Pressed the moment the results open, and timed from there: an observer
  // hears the dialog open at once, where a frame poll could be a slow
  // software-rendered frame late.
  const opened = await page.evaluate(
    () =>
      new Promise<number>(resolve => {
        const dialog = document.querySelector(
          '[data-testid="game-over-dialog"]'
        );
        if (!dialog) throw new Error('No results dialog');
        if (dialog.hasAttribute('open')) {
          resolve(performance.now());
          return;
        }
        const observer = new MutationObserver(() => {
          if (!dialog.hasAttribute('open')) return;
          observer.disconnect();
          resolve(performance.now());
        });
        observer.observe(dialog, { attributeFilter: ['open'] });
      })
  );
  await page.keyboard.press('Space');
  const pressed = await page.evaluate(() => performance.now());
  const results = page.getByRole('dialog', { name: 'Game over' });
  await page.waitForTimeout(300);
  await expect(results).toBeVisible();
  expect(await roundSeed(page)).toBe(seed);
  // With room to spare: a press later than this is a slow test, not Retry.
  expect(pressed - opened).toBeLessThan(350);

  // Once they have been seen, Space presses Retry as usual.
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await expect(results).toBeHidden();
});

test('says the miss at once, and the rest with the results', async ({
  page,
}) => {
  await startGame(page);
  await pressEarly(page, false);
  await expect(page.getByTestId('announcer-urgent')).toHaveText(
    /^\d+(\.\d)? m?s too early$/
  );
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results).toHaveAccessibleDescription(
    /too early\. Game over\. Score 0\. Best 0\./
  );
  // The results say the miss themselves; it isn't said again over them.
  await page.waitForTimeout(500);
  await expect(results.getByTestId('announcer-urgent')).toHaveText('');
});

test('keeps the live regions inside an open dialog', async ({ page }) => {
  await startGame(page);
  await page.keyboard.press('Escape');
  const paused = page.getByRole('dialog', { name: 'Paused' });
  await expect(paused.getByTestId('announcer-polite')).toHaveText(
    'Game paused'
  );

  // Resuming says so before the hand moves again.
  await paused.getByRole('button', { name: 'Resume' }).click();
  await expect(paused).toBeHidden();
  await expect(page.getByTestId('announcer-polite')).toHaveText(/^Resuming/);
  await waitForPhase(page, 'playing');
});

test('the touch hint names no key on a touch screen', async ({
  page,
  isMobile,
}) => {
  await startGame(page);
  const hint = page.getByTestId('hud-hint');
  if (isMobile) {
    await expect(hint).toHaveText('Tap as the hand meets the marker', {
      useInnerText: true,
    });
  } else {
    await expect(hint).toHaveText(
      'Tap or press Space as the hand meets the marker',
      { useInnerText: true }
    );
  }
  await expect(page.getByTestId('announcer-polite')).toHaveText(
    /^Round started\. Tap, or press Space,/
  );
});
