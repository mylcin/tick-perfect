import { expect, test } from '@playwright/test';

import { collectErrors, SCENE_TIMEOUT } from './helpers';

// The privacy notice at /privacy. The e2e build is online and names a
// (made-up) controller, as a real online deployment must.

test('opens the privacy notice from the settings, in the player’s language', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByTestId('settings-open').click({ timeout: SCENE_TIMEOUT });
  await page
    .getByTestId('settings-dialog')
    .getByRole('link', { name: 'Privacy notice' })
    .click();

  await expect(page).toHaveURL(/\/privacy$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Privacy notice' })
  ).toBeVisible();
  await expect(page).toHaveTitle('Privacy notice · Tick Perfect');
  await expect(page.locator('[data-section="controller"]')).toContainText(
    'The data controller is Tick Perfect Test.'
  );
  await expect(
    page.getByRole('link', { name: 'privacy@e2e.invalid' }).first()
  ).toHaveAttribute('href', 'mailto:privacy@e2e.invalid');
  await expect(page.getByTestId('privacy-section')).toHaveCount(9);

  await page.getByRole('button', { name: 'Türkçe' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Gizlilik ve aydınlatma metni'
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(page.getByRole('button', { name: 'Türkçe' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  // Back in the game, in the language chosen there.
  await page.getByRole('link', { name: /Oyuna dön/ }).click();
  await expect(
    page.getByRole('button', { name: 'Oynamak için dokun' })
  ).toBeVisible({ timeout: SCENE_TIMEOUT });
  expect(
    errors.filter(error => !error.includes('Failed to load resource'))
  ).toEqual([]);
});

test('serves the notice at its own address, for links from outside', async ({
  page,
}) => {
  await page.goto('/privacy');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Privacy notice' })
  ).toBeVisible();
  // Each section is reachable from a link.
  await page.goto('/privacy#rights');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Your rights' })
  ).toBeInViewport();
});
