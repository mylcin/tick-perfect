import { expect, test } from '@playwright/test';

import { countDraws, SCENE_TIMEOUT, waitForWatch } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('is installable', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const response = await request.get(href ?? '');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: { sizes: string; purpose?: string }[];
  };
  expect(manifest).toMatchObject({
    name: 'Tick Perfect',
    display: 'standalone',
    start_url: '/',
  });
  const sizes = manifest.icons.map(icon => icon.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true);
});

test('plays offline after the first visit', async ({ page, context }) => {
  await countDraws(page);
  await page.goto('/');
  // The service worker precaches the app, the 3D chunk and the HDRI, then
  // takes control of the page.
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    { timeout: 30_000 }
  );

  await context.setOffline(true);
  // The studio HDRI too, not just the fallback lighting.
  const hdri = page.waitForResponse(response =>
    response.url().endsWith('.hdr')
  );
  await page.reload();
  const response = await hdri;
  expect(response.ok()).toBe(true);
  expect(response.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  await waitForWatch(page);
});
