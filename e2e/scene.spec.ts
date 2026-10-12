import { expect, test } from '@playwright/test';

import { collectErrors, countDraws, waitForWatch } from './helpers';

test('opens the app and draws the watch without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await countDraws(page);

  await page.goto('/');

  await expect(page).toHaveTitle('Tick Perfect');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tick Perfect' })
  ).toBeVisible();
  await waitForWatch(page);
  expect(errors).toEqual([]);
});

test('keeps the 3D scene out of the accessibility tree', async ({ page }) => {
  await countDraws(page);
  await page.goto('/');
  await waitForWatch(page);

  // The scene is decorative; the game reports its state in the page itself.
  await expect(page.locator('[aria-hidden="true"] canvas')).toHaveCount(1);
});

test('keeps drawing the watch when the HDRI cannot load', async ({ page }) => {
  const errors = collectErrors(page);
  await countDraws(page);
  let markAborted: (() => void) | undefined;
  const aborted = new Promise<void>(resolve => {
    markAborted = resolve;
  });
  await page.route('**/*.hdr', async route => {
    await route.abort();
    markAborted?.();
  });

  await page.goto('/');
  await aborted;

  // The watch must keep being drawn after the failure, not just have started.
  await waitForWatch(page);
  await expect(page.locator('canvas')).toBeVisible();
  // The failed request itself is logged as a console error by the browser.
  expect(errors.filter(error => !error.includes('net::ERR_FAILED'))).toEqual(
    []
  );
});
