import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { hits, pressInPage, startGame, waitForPhase } from './helpers';

// The round as a picture: drawn in the browser, then to the share sheet
// where files can be shared, or saved as a file.

test('saves the round as a picture where nothing can share one', async ({
  page,
  isMobile,
}, testInfo) => {
  // No share sheet here, as on most desktops.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined });
  });
  await page.goto('/');
  await startGame(page);
  await pressInPage(page, { touch: isMobile, presses: 2 });
  await expect.poll(() => hits(page)).toBeGreaterThan(0);
  await waitForPhase(page, 'gameOver');
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results).toBeVisible({ timeout: 15_000 });

  const download = page.waitForEvent('download');
  await results.getByRole('button', { name: 'Image' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^tick-perfect-\d+\.png$/);
  const path = testInfo.outputPath('card.png');
  await file.saveAs(path);
  const png = await readFile(path);
  // A PNG, 1080 pixels square.
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1080);
  await expect(results.getByTestId('share-status')).toHaveText('Image saved');
});

test('hands the picture to the share sheet where files can go', async ({
  page,
  isMobile,
}) => {
  await page.addInitScript(() => {
    const shared: { name: string; type: string; text: string }[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, 'canShare', {
      value: (data: { files?: File[] }) => (data.files?.length ?? 0) > 0,
    });
    Object.defineProperty(navigator, 'share', {
      value: (data: { files: File[]; text: string }) => {
        const [file] = data.files;
        if (file)
          shared.push({ name: file.name, type: file.type, text: data.text });
        return Promise.resolve();
      },
    });
  });
  await page.goto('/');
  await startGame(page);
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await waitForPhase(page, 'gameOver');
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results).toBeVisible({ timeout: 15_000 });
  await results.getByRole('button', { name: 'Image' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __shared: unknown[] }).__shared
      )
    )
    .toEqual([
      {
        name: expect.stringMatching(/^tick-perfect-\d+\.png$/) as unknown,
        type: 'image/png',
        text: expect.stringContaining('Tick Perfect · Diver') as unknown,
      },
    ]);
});
