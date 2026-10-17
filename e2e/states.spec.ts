import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/en';
import { pinDate, pressEarly, SCENE_TIMEOUT, startGame } from './helpers';

// What the player sees when something is missing or goes wrong: no 3D,
// no storage, a broken link, nothing played yet.

test('says why the watch can’t be drawn when WebGL is off, and offers a reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const prototype = HTMLCanvasElement.prototype as unknown as {
      getContext: (this: HTMLCanvasElement, ...args: unknown[]) => unknown;
    };
    const original = prototype.getContext;
    prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      return String(args[0]).startsWith('webgl')
        ? null
        : original.apply(this, args);
    };
  });
  await page.goto('/');
  const failure = page.getByTestId('title-unsupported');
  await expect(failure).toHaveAttribute('data-failure', 'webgl', {
    timeout: SCENE_TIMEOUT,
  });
  await expect(failure).toHaveText(en.title.unsupportedWebgl);
  await expect(page.getByText(en.title.keyHint)).toBeHidden();
  await expect(page.getByTestId('variant-picker')).toBeHidden();

  await page.getByTestId('title-reload').click();
  await page.waitForLoadState('load');
  await expect(failure).toBeVisible({ timeout: SCENE_TIMEOUT });
});

test('says so when the watch’s code can’t load', async ({ page }) => {
  await page.route(/watch-scene/, route => route.abort());
  await page.goto('/');
  const failure = page.getByTestId('title-unsupported');
  await expect(failure).toHaveAttribute('data-failure', 'network', {
    timeout: SCENE_TIMEOUT,
  });
  await expect(failure).toHaveText(en.title.loadFailed);
  await expect(page.getByTestId('title-reload')).toBeVisible();
});

test('warns, quietly, when progress can’t be saved', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  await expect(page.getByTestId('storage-warning')).toBeHidden();

  // The first save fails: the round's score.
  await startGame(page);
  await pressEarly(page, false);
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results.getByTestId('storage-warning')).toHaveText(
    en.storage.notSaved
  );
  await results.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.getByTestId('storage-warning')).toBeVisible();
});

test('says when a challenge link is broken', async ({ page }) => {
  await page.goto('/?c=gmt.zzz');
  await expect(page).toHaveURL(/\/$/);
  const card = page.getByTestId('challenge-invalid');
  await expect(card).toContainText(en.challenge.invalid);
  await card.getByRole('button', { name: en.challenge.dismiss }).click();
  await expect(card).toBeHidden();
  await expect(page.getByTestId('challenge-card')).toBeHidden();
});

test('explains the Daily and the timegrapher before the first round', async ({
  page,
}) => {
  // Daily #1, on the Diver: open on a fresh save, so it is introduced
  // rather than locked.
  await pinDate(page, new Date(2026, 9, 1, 12, 0, 0));
  await page.goto('/');
  await expect(page.getByTestId('daily-intro')).toHaveText(en.daily.intro);
  await page.getByTestId('timegrapher-open').click();
  const timegrapher = page.getByRole('dialog', { name: 'Timegrapher' });
  await expect(timegrapher.getByText(en.timegrapher.intro)).toBeVisible();
  await expect(timegrapher.getByTestId('timegrapher-empty')).toHaveText(
    en.timegrapher.empty
  );
  // The trace's empty grid, with no hits on it yet.
  await expect(timegrapher.getByTestId('timegrapher-trace')).toBeVisible();
  await expect(timegrapher.getByTestId('timegrapher-dot')).toHaveCount(0);
});
