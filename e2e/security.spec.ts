import { expect, test, type Page } from '@playwright/test';

import {
  collectErrors,
  hits,
  pressOnTarget,
  SCENE_TIMEOUT,
  startGame,
} from './helpers';

// The headers vercel.json sends, which the preview server sends too, and a
// content security policy the whole game runs under without a complaint.

/** Records every policy violation on the page, from the first script on. */
async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { __violations: seen });
    document.addEventListener('securitypolicyviolation', event => {
      seen.push(`${event.effectiveDirective} blocked ${event.blockedURI}`);
    });
  });
}

const violations = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __violations: string[] }).__violations
  );

test('sends a strict content security policy and its companions', async ({
  request,
}) => {
  const headers = (await request.get('/')).headers();
  const policy = headers['content-security-policy'] ?? '';
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    'report-uri /api/reports/csp',
  ]) {
    expect(policy).toContain(directive);
  }
  expect(policy).not.toContain('unsafe');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['reporting-endpoints']).toBe('csp="/api/reports/csp"');
});

test('plays a round with nothing blocked by the policy', async ({
  page,
  isMobile,
}) => {
  await recordViolations(page);
  const errors = collectErrors(page);
  await page.goto('/');
  await startGame(page);
  await pressOnTarget(page, isMobile);
  await expect.poll(() => hits(page)).toBe(1);
  await expect(page.getByRole('dialog', { name: 'Game over' })).toBeVisible({
    timeout: 15_000,
  });
  expect(await violations(page)).toEqual([]);

  // Each panel on the title, on a fresh page.
  await page.goto('/');
  for (const panel of [
    'settings',
    'timegrapher',
    'leaderboard',
    'help',
  ] as const) {
    await page.getByTestId(`${panel}-open`).click({ timeout: SCENE_TIMEOUT });
    await expect(page.getByTestId(`${panel}-dialog`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(`${panel}-dialog`)).toBeHidden();
  }
  expect(await violations(page)).toEqual([]);

  await page.goto('/privacy');
  await expect(page.getByTestId('privacy-page')).toBeVisible();
  expect(await violations(page)).toEqual([]);
  expect(
    errors.filter(error => /Content Security Policy/i.test(error))
  ).toEqual([]);
});

test('enforces the policy: a script injected into the page never runs', async ({
  page,
}) => {
  await recordViolations(page);
  await page.goto('/privacy');
  await expect(page.getByTestId('privacy-page')).toBeVisible();
  const ran = await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__injected = true';
    document.head.append(script);
    return (window as unknown as { __injected?: boolean }).__injected ?? false;
  });
  expect(ran).toBe(false);
  await expect
    .poll(() => violations(page))
    .toContainEqual(expect.stringMatching(/^script-src-elem blocked inline/));
});
