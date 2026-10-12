import { expect, test, type Page } from '@playwright/test';

import { THEME_COLORS } from '../src/screens/studio';
import { SAVE_KEY, SAVE_VERSION } from '../src/state/saved';
import { SCENE_TIMEOUT } from './helpers';

// The studio the page is in: light or dark with the system, or as chosen in
// the settings, with night over either. public/boot.js applies the saved
// choice before the first paint, so a load never flashes the other studio.

/** The colour the browser shows round the page, as a CSS rgb() string. */
const rgbOf = (hex: string) =>
  `rgb(${[1, 3, 5].map(i => String(parseInt(hex.slice(i, i + 2), 16))).join(', ')})`;

/** The backdrop's edge colour, painted under the gradient. */
const backdrop = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** The theme-color the browser uses: the meta whose media matches. */
const themeColor = (page: Page) =>
  page.evaluate(
    () =>
      [
        ...document.querySelectorAll<HTMLMetaElement>(
          'meta[name="theme-color"]'
        ),
      ].find(meta => !meta.media || matchMedia(meta.media).matches)?.content
  );

/** Saved settings for a test to start from, written before the first load. */
async function seedSettings(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript(
    ([key, saved]) => {
      if (sessionStorage.getItem('seeded-settings') === null) {
        localStorage.setItem(key, saved);
        sessionStorage.setItem('seeded-settings', '1');
      }
    },
    [
      SAVE_KEY,
      JSON.stringify({ state: { settings }, version: SAVE_VERSION }),
    ] as const
  );
}

interface FirstLook {
  readonly theme: string | null;
  readonly night: boolean;
  readonly motion: string | null;
  readonly backdrop: string;
  readonly rise: string;
}

/**
 * Records the page as it stands at DOMContentLoaded, before the app has
 * rendered anything: what the first paint shows.
 */
async function recordFirstLook(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.documentElement;
      const look: FirstLook = {
        theme: root.getAttribute('data-theme'),
        night: root.hasAttribute('data-night'),
        motion: root.getAttribute('data-motion'),
        backdrop: getComputedStyle(document.body).backgroundColor,
        rise: getComputedStyle(root).getPropertyValue('--animate-rise').trim(),
      };
      Object.assign(window, { __firstLook: look });
    });
  });
}

const firstLook = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __firstLook: FirstLook }).__firstLook
  );

test('follows the system into the light and the dark studio', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect.poll(() => backdrop(page)).toBe(rgbOf(THEME_COLORS.light));
  expect(await themeColor(page)).toBe(THEME_COLORS.light);

  // Live, without a reload: the studio crossfades.
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => backdrop(page)).toBe(rgbOf(THEME_COLORS.dark));
  expect(await themeColor(page)).toBe(THEME_COLORS.dark);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('keeps a chosen theme through a reload, from the first paint', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByTestId('settings-open').click({ timeout: SCENE_TIMEOUT });
  const appearance = page.getByRole('group', { name: 'Appearance' });
  await appearance.getByText('Light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => backdrop(page)).toBe(rgbOf(THEME_COLORS.light));
  // Chosen, it wins over the system's scheme.
  expect(await themeColor(page)).toBe(THEME_COLORS.light);

  await recordFirstLook(page);
  await page.reload();
  expect(await firstLook(page)).toMatchObject({
    theme: 'light',
    night: false,
    backdrop: rgbOf(THEME_COLORS.light),
  });
  expect(await themeColor(page)).toBe(THEME_COLORS.light);

  // And the other way round.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByTestId('settings-open').click({ timeout: SCENE_TIMEOUT });
  await page
    .getByRole('group', { name: 'Appearance' })
    .getByText('Dark')
    .click();
  await page.reload();
  expect(await firstLook(page)).toMatchObject({
    theme: 'dark',
    backdrop: rgbOf(THEME_COLORS.dark),
  });
});

test('night puts the lights out in either theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await seedSettings(page, { theme: 'light', night: true });
  await recordFirstLook(page);
  await page.goto('/');
  expect(await firstLook(page)).toMatchObject({
    theme: 'light',
    night: true,
    backdrop: rgbOf(THEME_COLORS.night),
  });
  expect(await themeColor(page)).toBe(THEME_COLORS.night);

  // Turned off, the chosen theme's studio comes back.
  await page.getByTestId('settings-open').click({ timeout: SCENE_TIMEOUT });
  await page.getByRole('switch', { name: 'Night mode' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-night');
  await expect.poll(() => backdrop(page)).toBe(rgbOf(THEME_COLORS.light));
  expect(await themeColor(page)).toBe(THEME_COLORS.light);
});

test('turns animations off before the first frame', async ({ page }) => {
  // Chosen in the settings.
  await seedSettings(page, { reducedMotion: true });
  await recordFirstLook(page);
  await page.goto('/');
  expect(await firstLook(page)).toMatchObject({
    motion: 'reduced',
    rise: 'none',
  });
});

test('follows the system motion setting before the app has read it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordFirstLook(page);
  await page.goto('/');
  expect(await firstLook(page)).toMatchObject({ rise: 'none' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
});

test('offers the appearance as a labelled choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByTestId('settings-open').click({ timeout: SCENE_TIMEOUT });
  const appearance = page
    .getByTestId('settings-dialog')
    .getByRole('group', { name: 'Appearance' });
  await expect(appearance.getByRole('radio')).toHaveCount(3);
  await expect(appearance.getByRole('radio', { name: 'System' })).toBeChecked();

  // Arrow keys move along it, as in any radio group.
  await appearance.getByRole('radio', { name: 'System' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(appearance.getByRole('radio', { name: 'Light' })).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(appearance.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => backdrop(page)).toBe(rgbOf(THEME_COLORS.dark));

  await appearance.getByText('System').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect.poll(() => backdrop(page)).toBe(rgbOf(THEME_COLORS.light));
});
