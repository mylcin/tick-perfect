import { expect, test } from '@playwright/test';

import { framingFor } from '../src/three/camera';
import {
  collectErrors,
  gameState,
  hits,
  pressEarly,
  pressInPage,
  pressOnTarget,
  roundSeed,
  SCENE_TIMEOUT,
  seedProgress,
  startGame,
  tapScreen,
  waitForPhase,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows the title screen', async ({ page }) => {
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tick Perfect' })
  ).toBeVisible();
  const play = page.getByRole('button', { name: 'Tap to Play' });
  await expect(play).toBeVisible({ timeout: SCENE_TIMEOUT });
  await expect(play).toBeFocused();
  await expect(page.getByTestId('settings-open')).toBeVisible();
  expect((await gameState(page)).phase).toBe('idle');
});

test('only the button starts a game, not a press on the watch', async ({
  page,
  isMobile,
}) => {
  const play = page.getByRole('button', { name: 'Tap to Play' });
  await expect(play).toHaveAttribute('aria-disabled', 'false', {
    timeout: SCENE_TIMEOUT,
  });
  // The middle of the watch on show, where the scene frames it.
  const size = page.viewportSize() ?? { width: 1280, height: 720 };
  const { box } = framingFor('showcase', size);
  const x = ((box.left + box.right) / 2) * size.width;
  const y = ((box.top + box.bottom) / 2) * size.height;
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      () => Object.assign(window, { __pressed: true }),
      { capture: true, once: true }
    );
  });
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  // Software rendering can hold a press back: wait until it has landed,
  // then for longer than a round takes to start.
  await expect
    .poll(() => page.evaluate(() => '__pressed' in window))
    .toBe(true);
  await page.waitForTimeout(1000);
  expect((await gameState(page)).phase).toBe('idle');
  await expect(play).toBeVisible();

  await play.click();
  await waitForPhase(page, 'playing');
});

test('plays a round: hits, a miss, the results and a retry', async ({
  page,
  isMobile,
}) => {
  const errors = collectErrors(page);
  await startGame(page);
  await expect(page.getByTestId('hud-score')).toHaveText('Score 0');

  await pressOnTarget(page, isMobile);
  await expect.poll(() => hits(page)).toBe(1);
  await expect(page.getByTestId('hit-feedback')).toBeAttached();
  await pressOnTarget(page, isMobile);
  await expect.poll(() => hits(page)).toBe(2);

  const playing = await gameState(page);
  if (playing.phase === 'idle') throw new Error('No round');
  const { score } = playing.round;
  expect(score).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('hud-score')).toHaveText(
    `Score ${String(score)}`
  );

  // Stop pressing: the hand runs past the next target and the round ends.
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('game-over-reason')).toHaveAttribute(
    'data-reason',
    'passed'
  );
  await expect(page.getByTestId('game-over-reason')).toHaveText(
    'The hand passed the marker'
  );
  await expect(page.getByTestId('game-over-score')).toHaveText(String(score));
  await expect(page.getByTestId('game-over-best')).toHaveText(String(score));
  await expect(page.getByTestId('new-best')).toBeVisible();
  // Screen readers hear the whole result once, as focus moves into the
  // dialog.
  await expect(results).toHaveAccessibleDescription(
    `The hand passed the marker. Game over. Score ${String(score)}. New best! ${String(15 - score)} points to Adjusted.`
  );
  await expect(page.getByTestId('goal-line')).toHaveAttribute(
    'data-goal',
    'certificate'
  );
  // Every round's points go towards the watchmaker's level.
  await expect(results.getByTestId('level-meter')).toHaveAttribute(
    'data-points',
    String(score)
  );

  const retry = results.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeFocused();
  const firstSeed = await roundSeed(page);
  await retry.click();
  // It may already be over by the time a slow software-rendered page
  // answers, so check for the new round itself.
  // The board clears, the camera settles, then a new round starts.
  await expect
    .poll(
      async () => {
        const seed = await roundSeed(page);
        return seed !== null && seed !== firstSeed;
      },
      { intervals: [25] }
    )
    .toBe(true);
  expect(await hits(page)).toBe(0);
  await expect(page.getByTestId('hud-score')).toHaveText('Score 0');
  await expect(page.getByTestId('hud-best')).toHaveText(
    `Best ${String(score)}`
  );
  // Left alone, it ends like any other.
  await expect(results).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('game-over-score')).toHaveText('0');

  expect(errors).toEqual([]);
});

test('lights the best up for a moment as a round passes it', async ({
  page,
  isMobile,
}) => {
  await seedProgress(page, { best: { diver: 1 } });
  await page.reload();
  await startGame(page);
  const best = page.getByTestId('hud-best');
  await expect(best).toHaveAttribute('data-passed', 'false');
  // A Perfect at the centre scores 2, past the best of 1.
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect(best).toHaveAttribute('data-passed', 'true');
  await expect(best).toHaveText('Best 2');
  await expect(best).toHaveAttribute('data-passed', 'false', {
    timeout: 3000,
  });
});

test('a press before the target ends the round', async ({ page, isMobile }) => {
  await startGame(page);
  await pressEarly(page, isMobile);
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results).toBeVisible();
  await expect(page.getByTestId('game-over-reason')).toHaveAttribute(
    'data-reason',
    'early'
  );
  // How far off it was, instead of just "too early".
  await expect(page.getByTestId('near-miss')).toHaveAttribute(
    'data-side',
    'early'
  );
  await expect(page.getByTestId('near-miss')).toHaveText(
    /^\d+(\.\d)? m?s too early$/
  );
  await expect(page.getByTestId('game-over-score')).toHaveText('0');
  await expect(page.getByTestId('new-best')).toBeHidden();
});

test('a finger on the screen lands on the play area', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'touch only');
  await startGame(page);
  await page.getByTestId('game-surface').evaluate(surface => {
    const seen: string[] = [];
    Object.assign(window, { __touches: seen });
    surface.addEventListener('pointerdown', event => {
      seen.push((event as PointerEvent).pointerType);
    });
  });
  await tapScreen(page);
  // Through the HUD on top of it, to the play area, as a touch. (Software
  // rendering can hold the tap back for a while, so when it lands is left
  // to the timed tests.)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __touches: string[] }).__touches
      )
    )
    .toContain('touch');
  await waitForPhase(page, 'gameOver');
});

test('Space is a tap even with the pause button focused', async ({ page }) => {
  await startGame(page);
  await page.getByTestId('pause-button').focus();
  await pressEarly(page, false);
  // Not a pause: the press was judged as a tap, too early.
  await waitForPhase(page, 'gameOver');
  const state = await gameState(page);
  expect(state.phase === 'gameOver' && state.miss?.reason).toBe('early');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
});

test('pauses, counts down and resumes where it stopped', async ({ page }) => {
  await startGame(page);
  await page.keyboard.press('Escape');
  const paused = page.getByRole('dialog', { name: 'Paused' });
  await expect(paused).toBeVisible();
  await waitForPhase(page, 'paused');

  // Time stands still while paused.
  const before = await gameState(page);
  await page.waitForTimeout(400);
  expect(await gameState(page)).toEqual(before);

  await paused.getByRole('button', { name: 'Resume' }).click();
  await expect(paused).toBeHidden();
  await expect(page.getByTestId('countdown')).toBeVisible();
  await waitForPhase(page, 'playing');
  await expect(page.getByTestId('countdown')).toBeHidden();
});

test('leaves a round for the title from the pause menu', async ({ page }) => {
  await startGame(page);
  // Forced: waiting for a software-rendered page to look stable could let
  // the round end first.
  await page.getByTestId('pause-button').click({ force: true });
  await page
    .getByRole('dialog', { name: 'Paused' })
    .getByRole('button', { name: 'Main menu' })
    .click();
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  await waitForPhase(page, 'idle');
});

test('asks before leaving a round that has scored', async ({
  page,
  isMobile,
}) => {
  await startGame(page);
  expect(await pressInPage(page, { touch: isMobile, presses: 1 })).toBe(1);
  // Paused from the page itself, so the next target can't end the round
  // first.
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
      })
    );
  });
  await waitForPhase(page, 'paused');
  expect(await hits(page)).toBe(1);
  const paused = page.getByRole('dialog', { name: 'Paused' });
  const menu = paused.getByRole('button', { name: 'Main menu' });
  await menu.click();

  // The round waits, paused, while the player is asked.
  await expect(paused.getByText(/won’t be saved/)).toBeVisible();
  await expect(paused.getByRole('button', { name: 'Go back' })).toBeFocused();
  expect((await gameState(page)).phase).toBe('paused');

  // Escape steps back to the menu, onto the button that asked.
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(paused).toBeVisible();
  expect((await gameState(page)).phase).toBe('paused');

  await menu.click();
  await paused.getByRole('button', { name: 'Leave the round' }).click();
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  await waitForPhase(page, 'idle');
});

test('keeps the best score across visits', async ({ page, isMobile }) => {
  await startGame(page);
  await pressOnTarget(page, isMobile);
  await expect.poll(() => hits(page)).toBe(1);
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results).toBeVisible({ timeout: 15_000 });
  const best = await page.getByTestId('game-over-best').innerText();

  await results.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.getByTestId('title-best')).toHaveText(`Best ${best}`);
  await page.reload();
  await expect(page.getByTestId('title-best')).toHaveText(`Best ${best}`);
});

test('Escape on the results goes back to the title', async ({ page }) => {
  await startGame(page);
  await pressEarly(page, false);
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(results).toBeHidden();
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
});

test('Space starts a game from the title unless a control has focus', async ({
  page,
}) => {
  const play = page.getByRole('button', { name: 'Tap to Play' });
  await expect(play).toHaveAttribute('aria-disabled', 'false', {
    timeout: SCENE_TIMEOUT,
  });
  // A focused button takes Space for itself, as anywhere else.
  await page.getByTestId('settings-open').focus();
  await page.keyboard.press('Space');
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  expect((await gameState(page)).phase).toBe('idle');

  // With nothing in particular focused, Space plays.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await gameState(page)).phase, { intervals: [25] })
    .not.toBe('idle');
});
