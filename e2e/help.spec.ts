import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { SAVE_KEY } from '../src/state/saved';
import {
  gameState,
  pressInPage,
  SCENE_TIMEOUT,
  seedProgress,
  startGame,
  waitForPhase,
} from './helpers';

// Learning the game: How to play, the one-time tips during a round, and
// keeping progress safe in a file.

/** What the app has saved, read straight from storage. */
function saved(page: Page) {
  return page.evaluate(key => {
    const raw = localStorage.getItem(key);
    return raw === null
      ? null
      : (
          JSON.parse(raw) as {
            state: {
              tips?: string[];
              progress: { best: Record<string, number>; unlocked: string[] };
            };
          }
        ).state;
  }, SAVE_KEY);
}

test('How to play opens and closes from the keyboard, every control named', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  // Before a first score, the title says how the game is played.
  await expect(page.getByTestId('title-rule')).toHaveAttribute(
    'data-first',
    'true'
  );

  const open = page.getByTestId('help-open');
  await expect(open).toHaveAccessibleName('How to play');
  await open.focus();
  await page.keyboard.press('Enter');
  const help = page.getByRole('dialog', { name: 'How to play' });
  await expect(help).toBeVisible();
  const close = help.getByTestId('help-close');
  await expect(close).toBeFocused();
  await expect(close).toHaveAccessibleName('Close how to play');
  // Four cards, the last on the rule of the watch on show.
  await expect(help.getByRole('listitem')).toHaveCount(4);
  await expect(help.getByRole('heading', { level: 3 })).toHaveText([
    'Tap on time',
    'Perfect',
    'Streak',
    'The Diver’s rule',
  ]);
  await expect(help.getByRole('listitem').nth(2)).toContainText(
    '3 for ×2 and 8 for ×3'
  );

  // The arrows don't browse the collection behind it.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(open).toBeFocused();
  await expect(page.getByRole('radio', { name: /^Diver,/ })).toBeChecked();

  // Space presses it as well, and starts nothing.
  await page.keyboard.press('Space');
  await expect(help).toBeVisible();
  expect((await gameState(page)).phase).toBe('idle');
  await page.keyboard.press('Enter');
  await expect(help).toBeHidden();
  await expect(open).toBeFocused();
});

test('a first Perfect brings up its tip, and only once', async ({
  page,
  isMobile,
}) => {
  // Past learning the Diver, so no twist's hint can take the tip's place.
  await seedProgress(page, { best: { diver: 20 } });
  await page.goto('/');
  await startGame(page);
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect
    .poll(async () => {
      const state = await gameState(page);
      return state.phase === 'idle' ? 0 : state.round.perfects;
    })
    .toBe(1);

  const hint = page.getByTestId('hud-hint');
  await expect(hint).toHaveAttribute('data-tip', 'perfect');
  await expect(hint).toHaveText('Perfect: the bright core scores 2');
  await expect(page.getByTestId('announcer-polite')).toHaveText(
    'Perfect: the bright core scores 2'
  );
  expect((await saved(page))?.tips).toContain('perfect');

  // Left alone the round ends; the next one's first Perfect says what
  // comes next instead.
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results).toBeVisible({ timeout: 15_000 });
  await results.getByRole('button', { name: 'Retry' }).click();
  await waitForPhase(page, 'playing');
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect(hint).toHaveAttribute('data-tip', 'streak');
  await expect(hint).toHaveText('3 Perfects in a row double every score');
});

test('backs progress up to a file and restores one, losing nothing', async ({
  page,
}) => {
  // At level 3, where a score on the Chronograph is all the GMT waits for.
  await seedProgress(page, { best: { diver: 20 }, points: 400 });
  await page.goto('/');
  await page.getByTestId('settings-open').click({ timeout: SCENE_TIMEOUT });
  const settings = page.getByTestId('settings-dialog');

  const downloading = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Back up progress' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^tick-perfect-\d{4}-\d{2}-\d{2}\.json$/
  );
  const backup = JSON.parse(
    await readFile(await download.path(), 'utf8')
  ) as Record<string, unknown>;
  expect(backup).toMatchObject({
    app: 'tick-perfect',
    progress: {
      best: { diver: 20 },
      unlocked: ['diver', 'chronograph'],
      points: 400,
    },
  });
  // What an account would hold: no settings, no tips.
  expect(backup).not.toHaveProperty('settings');
  expect(backup).not.toHaveProperty('tips');

  // Another device's backup: less on the Diver, more on the Chronograph.
  const elsewhere = {
    name: 'tick-perfect-2026-10-01.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...backup,
        progress: {
          best: { diver: 5, chronograph: 41 },
          unlocked: ['diver', 'chronograph'],
        },
      })
    ),
  };
  const restore = settings.getByLabel('Restore');
  const status = settings.getByTestId('backup-status');
  await restore.setInputFiles(elsewhere);
  await expect(status).toHaveAttribute('data-outcome', 'restored');
  await expect(status).toHaveText(
    'Progress restored. Nothing you had was lost.'
  );
  // The same file again brings nothing new.
  await restore.setInputFiles(elsewhere);
  await expect(status).toHaveAttribute('data-outcome', 'unchanged');
  // Anything else is turned away, and says why.
  await restore.setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"notes": []}'),
  });
  await expect(status).toHaveAttribute('data-outcome', 'foreign');
  await restore.setInputFiles({
    name: 'torn.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"app": "tick-perfect"'),
  });
  await expect(status).toHaveAttribute('data-outcome', 'unreadable');

  // The best of both: the Diver's 20 stays, the Chronograph's 41 came in
  // and unlocked the GMT.
  expect((await saved(page))?.progress).toMatchObject({
    best: { diver: 20, chronograph: 41 },
    unlocked: ['diver', 'chronograph', 'gmt'],
  });
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await page.getByRole('radio', { name: /^Chronograph,/ }).click();
  await expect(page.getByTestId('title-best')).toHaveText('Best 41');
});
