import { expect, test, type Page } from '@playwright/test';

import {
  collectErrors,
  countDraws,
  hits,
  pressInPage,
  SCENE_TIMEOUT,
  seedProgress,
  startGame,
  waitForWatch,
} from './helpers';

/** The Diver Chronometer-certified: its first variant earned, not its second. */
async function openCertifiedDiver(page: Page) {
  await seedProgress(page, {
    best: { diver: 40 },
    unlocked: ['diver', 'chronograph'],
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  return page.getByRole('radiogroup', { name: 'Variant' });
}

test('offers the variants a certificate has earned, and says what earns the rest', async ({
  page,
}) => {
  const variants = await openCertifiedDiver(page);
  await expect(variants.getByRole('radio')).toHaveCount(3);
  await expect(variants.getByRole('radio', { name: 'Standard' })).toBeChecked();

  const green = variants.getByRole('radio', { name: 'Green Sunburst' });
  await expect(green).toHaveAttribute('aria-disabled', 'false');

  const blue = variants.getByRole('radio', { name: 'Blue Sunburst' });
  await expect(blue).toHaveAttribute('aria-disabled', 'true');
  await expect(blue).toHaveAccessibleDescription(
    'Observatory certificate (75 points)'
  );
  // Seen on focus too, and still not picked by a click. The longer caption
  // doesn't move the swatches, or a pointer would slide off the one it is on.
  const before = await blue.boundingBox();
  await blue.focus();
  await expect(
    page
      .getByTestId('variant-caption')
      .getByText('Observatory certificate (75 points)')
  ).toBeVisible();
  expect(await blue.boundingBox()).toEqual(before);
  // Forced: Playwright won't click what is aria-disabled.
  await blue.click({ force: true });
  await expect(blue).not.toBeChecked();
  await expect(variants.getByRole('radio', { name: 'Standard' })).toBeChecked();
});

test('wears the picked variant, in the scene and the strip, across a reload', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await countDraws(page);
  const variants = await openCertifiedDiver(page);
  await variants.getByRole('radio', { name: 'Green Sunburst' }).click();
  await expect(
    variants.getByRole('radio', { name: 'Green Sunburst' })
  ).toBeChecked();
  const card = page.locator('[data-testid="watch-card"][data-watch="diver"]');
  await expect(card.locator('img')).toHaveAttribute(
    'src',
    '/watches/diver-green.webp'
  );
  await waitForWatch(page);

  await page.reload();
  await expect(
    page
      .getByRole('radiogroup', { name: 'Variant' })
      .getByRole('radio', { name: 'Green Sunburst' })
  ).toBeChecked({ timeout: SCENE_TIMEOUT });
  await expect(card.locator('img')).toHaveAttribute(
    'src',
    '/watches/diver-green.webp'
  );
  await waitForWatch(page);
  expect(errors).toEqual([]);
});

test('moves between swatches with the arrows, not between watches', async ({
  page,
}) => {
  const variants = await openCertifiedDiver(page);
  const heading = page.getByRole('heading', { level: 2 });
  await expect(heading).toHaveText('Diver');

  await variants.getByRole('radio', { name: 'Standard' }).focus();
  await page.keyboard.press('ArrowRight');
  const green = variants.getByRole('radio', { name: 'Green Sunburst' });
  await expect(green).toBeFocused();
  await expect(green).toBeChecked();

  // An unearned swatch takes focus, to say what earns it, but not the pick.
  await page.keyboard.press('ArrowRight');
  await expect(
    variants.getByRole('radio', { name: 'Blue Sunburst' })
  ).toBeFocused();
  await expect(green).toBeChecked();

  await page.keyboard.press('ArrowRight');
  await expect(variants.getByRole('radio', { name: 'Standard' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(heading).toHaveText('Diver');
  await expect(page.getByRole('radio', { name: /^Diver,/ })).toBeChecked();
});

test('says so when a round earns a variant', async ({ page, isMobile }) => {
  test.slow();
  await seedProgress(page, {
    best: { diver: 39 },
    unlocked: ['diver', 'chronograph'],
  });
  // A small phone upright, where the results are short of room.
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await startGame(page);
  // Perfects double from the third and triple from the eighth:
  // 2 + 2 + 5 times 4 + 3 times 6 = 42.
  await pressInPage(page, { touch: isMobile, presses: 10 });
  await expect.poll(() => hits(page)).toBe(10);
  await expect(page.getByRole('dialog', { name: 'Game over' })).toBeVisible({
    timeout: 15_000,
  });
  const earned = page.getByTestId('variant-earned');
  await expect(earned).toHaveText('New variant: Green Sunburst');
  await expect(earned).toHaveAttribute('data-variants', 'green');
  // The timing line gives way to the chips, so the panel clears the watch.
  await expect(page.getByTestId('timing-line')).toBeHidden();
});
