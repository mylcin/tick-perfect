import { expect, test } from '@playwright/test';

import { WATCH_ORDER } from '../src/watches/ids';
import { SCENE_TIMEOUT, seedProgress } from './helpers';

// The atelier: the collection's progress, and each open watch's story and
// what is left to master on it. Locked watches stay out of it.

test('tells a new player’s one watch, and what is left to master', async ({
  page,
}) => {
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Atelier' });
  await open.click({ timeout: SCENE_TIMEOUT });
  const atelier = page.getByRole('dialog', { name: 'Atelier' });
  await expect(atelier).toBeVisible();

  await expect(
    atelier.locator('[data-testid="atelier-tally"][data-tally="watches"]')
  ).toHaveText(`1/${String(WATCH_ORDER.length)}`);
  // Only the watches the collection has opened.
  await expect(atelier.getByRole('radio')).toHaveCount(1);
  const page_ = atelier.getByTestId('atelier-watch');
  await expect(page_).toHaveAttribute('data-watch', 'diver');
  await expect(page_.getByRole('heading', { level: 3 })).toHaveText(
    'Rotating dive bezel'
  );
  await expect(atelier.getByTestId('atelier-mastery')).toHaveText(
    'Mastery 0 of 7'
  );
  await expect(
    atelier.locator('[data-testid="atelier-goal"][data-done="true"]')
  ).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(atelier).toBeHidden();
  await expect(open).toBeFocused();
});

test('shows what each open watch has earned', async ({ page }) => {
  await seedProgress(page, {
    best: { diver: 41, chronograph: 16 },
    unlocked: ['diver', 'chronograph', 'gmt'],
    points: 500,
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Atelier' })
    .click({ timeout: SCENE_TIMEOUT });
  const atelier = page.getByRole('dialog', { name: 'Atelier' });
  await expect(atelier.getByRole('radio')).toHaveCount(3);
  // The Diver: Adjusted, Chronometer and its Chronometer colourway.
  await expect(atelier.getByTestId('atelier-mastery')).toHaveText(
    'Mastery 3 of 7'
  );
  await atelier.getByText('Chronograph', { exact: true }).click();
  await expect(atelier.getByTestId('atelier-watch')).toHaveAttribute(
    'data-watch',
    'chronograph'
  );
  await expect(atelier.getByTestId('atelier-mastery')).toHaveText(
    'Mastery 1 of 7'
  );
  await expect(
    atelier.locator('[data-testid="atelier-tally"][data-tally="certificates"]')
  ).toHaveText(`3/${String(3 * WATCH_ORDER.length)}`);
});

test.describe('in Turkish on a narrow phone', () => {
  test.use({ locale: 'tr-TR', viewport: { width: 360, height: 800 } });

  test('keeps the tagline clear of the Atelier button', async ({ page }) => {
    await page.goto('/');
    const tagline = page.getByText(
      'Mekanik bir saatte tek dokunuşluk zamanlama oyunu'
    );
    await expect(tagline).toBeVisible({ timeout: SCENE_TIMEOUT });
    const text = await tagline.boundingBox();
    const button = await page.getByTestId('atelier-open').boundingBox();
    expect(text && button).toBeTruthy();
    if (!text || !button) return;
    const apart =
      button.x + button.width <= text.x ||
      text.y + text.height <= button.y ||
      button.y + button.height <= text.y;
    expect(apart).toBe(true);
  });
});
