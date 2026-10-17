import { expect, test } from '@playwright/test';

import { SCENE_TIMEOUT, seedProgress } from './helpers';

test('changes settings and keeps them after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('settings-open').click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  // Found by test id: its name changes with the language below.
  const settings = page.getByTestId('settings-dialog');

  const sound = settings.getByRole('switch', { name: 'Sound' });
  await expect(sound).toHaveAttribute('aria-checked', 'true');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-checked', 'false');

  await settings.getByRole('switch', { name: 'Night mode' }).click();
  await settings.getByRole('switch', { name: 'Turn off animations' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  // Not even a switch slides or fades any more.
  await expect(sound).toHaveCSS('transition-duration', '0s');

  // The radio itself is visually hidden behind its label, as players see it.
  await settings.getByText('Türkçe').click();
  await expect(settings.getByRole('radio', { name: 'Türkçe' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(page.getByRole('dialog', { name: 'Ayarlar' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Ayarlar' })).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Oynamak için dokun' })
  ).toBeVisible({ timeout: SCENE_TIMEOUT });

  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Oynamak için dokun' })
  ).toBeVisible({ timeout: SCENE_TIMEOUT });
  await page.getByTestId('settings-open').click();
  const saved = page.getByRole('dialog', { name: 'Ayarlar' });
  await expect(saved.getByRole('switch', { name: 'Ses' })).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expect(
    saved.getByRole('switch', { name: 'Gece modu' })
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    saved.getByRole('switch', { name: 'Animasyonları kapat' })
  ).toHaveAttribute('aria-checked', 'true');
  await expect(saved.getByRole('radio', { name: 'Türkçe' })).toBeChecked();
});

test('follows the system motion setting until told otherwise', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');

  await page.getByTestId('settings-open').click();
  const motion = page.getByRole('switch', { name: 'Turn off animations' });
  await expect(motion).toHaveAttribute('aria-checked', 'true');
  await expect(motion).toHaveAccessibleDescription(
    'Following your system setting'
  );

  await motion.click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await expect(motion).toHaveAccessibleDescription(
    'Only the game’s own motion remains'
  );

  // Back to the system's choice: it follows the system again.
  await motion.click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(motion).toHaveAccessibleDescription(
    'Following your system setting'
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await expect(motion).toHaveAttribute('aria-checked', 'false');
});

test('battery saver draws the watch at the cheapest quality, and stays on', async ({
  page,
}) => {
  await page.goto('/');
  const scene = page.getByTestId('watch-scene');
  await expect(scene).toBeAttached({ timeout: SCENE_TIMEOUT });
  await page.getByTestId('settings-open').click();
  const saver = page
    .getByTestId('settings-dialog')
    .getByRole('switch', { name: 'Battery saver' });
  await expect(saver).toHaveAttribute('aria-checked', 'false');
  await expect(saver).toHaveAccessibleDescription(
    'Simpler graphics that use less power'
  );

  await saver.click();
  await expect(saver).toHaveAttribute('aria-checked', 'true');
  // The lowest tier: no bloom, no pixels past the screen's own.
  await expect(scene).toHaveAttribute('data-quality', 'low');

  await page.reload();
  await expect(scene).toHaveAttribute('data-quality', 'low', {
    timeout: SCENE_TIMEOUT,
  });
  await page.getByTestId('settings-open').click();
  await expect(saver).toHaveAttribute('aria-checked', 'true');
  await saver.click();
  await expect(saver).toHaveAttribute('aria-checked', 'false');
});

test('closes with its button and returns focus', async ({ page }) => {
  await page.goto('/');
  const open = page.getByTestId('settings-open');
  await open.click();
  await page.getByTestId('settings-close').click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
  await expect(open).toBeFocused();
});

test('resets settings and erases progress, each on its own', async ({
  page,
}) => {
  await seedProgress(page, {
    best: { diver: 20 },
    unlocked: ['diver', 'chronograph'],
    points: 400,
  });
  await page.goto('/');
  await page.getByTestId('settings-open').click();
  const settings = page.getByTestId('settings-dialog');
  const status = settings.getByTestId('reset-status');

  const sound = settings.getByRole('switch', { name: 'Sound' });
  await sound.click();
  await expect(sound).toHaveAttribute('aria-checked', 'false');
  await settings.getByRole('button', { name: 'Reset settings' }).click();
  await expect(sound).toHaveAttribute('aria-checked', 'true');
  await expect(status).toHaveAttribute('data-outcome', 'settings');

  // Erasing asks first; keeping it changes nothing.
  await settings.getByRole('button', { name: 'Erase progress' }).click();
  const keep = settings.getByRole('button', { name: 'Keep it' });
  await expect(keep).toBeFocused();
  await keep.click();
  await expect(
    settings.getByRole('button', { name: 'Erase progress' })
  ).toBeFocused();
  await expect(page.getByRole('radio', { name: /^Chronograph,/ })).toHaveCount(
    1
  );

  await settings.getByRole('button', { name: 'Erase progress' }).click();
  await settings.getByRole('button', { name: 'Erase', exact: true }).click();
  await expect(status).toHaveAttribute('data-outcome', 'progress');
  await page.keyboard.press('Escape');

  // Back to a fresh start, after a reload too: only the Diver is open.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  const chronograph = page.getByRole('radio', { name: /^Chronograph,/ });
  await expect(chronograph).toHaveAccessibleName(/Locked/);
});
