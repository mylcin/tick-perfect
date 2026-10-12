import { expect, test, type Page, type Route } from '@playwright/test';

import { DIVER_RULES } from '../src/game';
import {
  collectErrors,
  hits,
  pressOnTarget,
  roundSeed,
  SCENE_TIMEOUT,
  startGame,
} from './helpers';

// The online side, against a stand-in API: the e2e build knows a (made-up)
// Supabase project, and every /api call is answered here.

const PROFILE = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Ada',
  role: 'player',
};
const ROUND_ID = '00000000-0000-4000-8000-0000000000aa';
const SEED = 4242;

const CONFIG = {
  leaderboard: true,
  submissions: true,
  announcement: 'Season 1 is open',
  seasons: [],
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

/** Answers the API: each key is `METHOD /route`. */
async function stubApi(
  page: Page,
  answers: Record<string, (route: Route) => Promise<void>>
) {
  // The made-up project is never reached.
  await page.route('https://e2e.invalid/**', route => route.abort());
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname.replace(/^\/api/, '')}`;
    const answer = answers[key];
    await (answer
      ? answer(route)
      : json(route, { error: { code: 'notFound', message: key } }, 404));
  });
}

/** A Supabase session, kept as a returning player's would be. */
async function signedIn(page: Page) {
  await page.addInitScript(user => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(
      'tick-perfect-auth',
      JSON.stringify({
        access_token: 'e2e-token',
        refresh_token: 'e2e-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expiresAt,
        user: {
          id: user.id,
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      })
    );
  }, PROFILE);
}

test('shows a guest the boards, and the way in', async ({ page }) => {
  const errors = collectErrors(page);
  await stubApi(page, {
    'GET /config': route => json(route, CONFIG),
    'GET /leaderboard': route =>
      json(route, {
        board: new URL(route.request().url()).searchParams.has('daily')
          ? 'daily:3'
          : 'season:1',
        entries: new URL(route.request().url()).searchParams.has('daily')
          ? []
          : [
              {
                rank: 1,
                name: 'Grace',
                score: 88,
                you: false,
              },
            ],
        you: null,
      }),
  });
  await page.goto('/');
  await page.getByTestId('leaderboard-open').click({ timeout: SCENE_TIMEOUT });
  const dialog = page.getByTestId('leaderboard-dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Leaderboard' })
  ).toBeVisible();
  await expect(page.getByTestId('leaderboard-announcement')).toHaveText(
    'Season 1 is open'
  );
  await expect(page.getByTestId('leaderboard-entries')).toContainText('Grace');
  await expect(
    dialog.getByRole('button', { name: 'Continue with Google' })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Continue with GitHub' })
  ).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'Privacy notice' })
  ).toHaveAttribute('href', '/privacy');

  await dialog.getByRole('radio', { name: /^Daily #/ }).click();
  await expect(page.getByTestId('leaderboard-empty')).toBeVisible();
  // The arrows move between the boards, never the watches behind them.
  await page.keyboard.press('ArrowRight');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Diver');
  expect(
    errors.filter(error => !error.includes('Failed to load resource'))
  ).toEqual([]);
});

test('says so when the boards can’t be reached', async ({ page }) => {
  await stubApi(page, {
    'GET /config': route => json(route, CONFIG),
    'GET /leaderboard': route =>
      json(route, { error: { code: 'closed', message: 'closed' } }, 503),
  });
  await page.goto('/');
  await page.getByTestId('leaderboard-open').click({ timeout: SCENE_TIMEOUT });
  await expect(page.getByTestId('leaderboard-error')).toHaveAttribute(
    'data-error',
    'closed'
  );
});

test('ranks a signed-in player’s round, from the server’s seed', async ({
  page,
  isMobile,
}) => {
  test.slow();
  interface Submitted {
    log: { seed: number; actions: unknown[] };
    score: number;
  }
  const sent: { body: Submitted | null } = { body: null };
  await signedIn(page);
  await stubApi(page, {
    'GET /config': route => json(route, CONFIG),
    'GET /me': route => json(route, { profile: PROFILE, bests: [] }),
    'GET /me/progress': route => json(route, { data: null, updatedAt: null }),
    'PUT /me/progress': route =>
      json(route, { updatedAt: new Date().toISOString() }),
    'POST /rounds': route =>
      json(
        route,
        {
          id: ROUND_ID,
          watch: 'diver',
          seed: SEED,
          daily: null,
          rules: DIVER_RULES,
        },
        201
      ),
    [`POST /rounds/${ROUND_ID}`]: route => {
      sent.body = route.request().postDataJSON() as Submitted;
      return json(route, {
        status: 'verified',
        score: sent.body.score,
        best: 20,
        rank: 3,
      });
    },
  });
  await page.goto('/');
  await page.getByTestId('leaderboard-open').click({ timeout: SCENE_TIMEOUT });
  await expect(page.getByTestId('leaderboard-signed-in')).toHaveText(
    'Signed in as Ada'
  );
  await page.keyboard.press('Escape');

  await startGame(page);
  expect(await roundSeed(page)).toBe(SEED);
  await pressOnTarget(page, isMobile);
  await expect.poll(() => hits(page)).toBe(1);
  // Then the hand runs past the next target.
  await expect(page.getByRole('dialog', { name: 'Game over' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('ranked-line')).toHaveText(
    '#3 on the board, with your best of 20.'
  );
  expect(sent.body).toMatchObject({ log: { seed: SEED } });
  expect(sent.body?.log.actions).toHaveLength(1);
});

test('reloads the board after a new name and a deleted account', async ({
  page,
}) => {
  const account = { name: 'Ada' as string | null };
  await signedIn(page);
  await stubApi(page, {
    'GET /config': route => json(route, CONFIG),
    'GET /me': route =>
      json(route, {
        profile: { ...PROFILE, displayName: account.name },
        bests: [],
      }),
    'GET /me/progress': route => json(route, { data: null, updatedAt: null }),
    'PUT /me/progress': route =>
      json(route, { updatedAt: new Date().toISOString() }),
    'PATCH /me': route => {
      const { displayName } = route.request().postDataJSON() as {
        displayName: string;
      };
      account.name = displayName;
      return json(route, { profile: { ...PROFILE, displayName } });
    },
    'DELETE /me': route => {
      account.name = null;
      return route.fulfill({ status: 204 });
    },
    'GET /leaderboard': route =>
      json(route, {
        board: 'season:1',
        entries: [
          { rank: 1, name: 'Grace', score: 88, you: false },
          ...(account.name
            ? [{ rank: 2, name: account.name, score: 40, you: true }]
            : []),
        ],
        you: null,
      }),
  });
  await page.goto('/');
  await page.getByTestId('leaderboard-open').click({ timeout: SCENE_TIMEOUT });
  const dialog = page.getByTestId('leaderboard-dialog');
  const entries = page.getByTestId('leaderboard-entries');
  await expect(entries).toContainText('Ada');

  await dialog.getByRole('button', { name: 'Change name' }).click();
  await dialog.getByLabel('Display name').fill('Countess');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(entries).toContainText('Countess');
  await expect(entries).not.toContainText('Ada');

  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await dialog.getByRole('button', { name: 'Delete it all' }).click();
  await expect(page.getByTestId('leaderboard-account')).toHaveAttribute(
    'data-status',
    'signedOut'
  );
  await expect(entries).not.toContainText('Countess');
  await expect(entries).toContainText('Grace');
});

test('plays unranked when no seed comes back', async ({ page }) => {
  await signedIn(page);
  await stubApi(page, {
    'GET /config': route => json(route, CONFIG),
    'GET /me': route => json(route, { profile: PROFILE, bests: [] }),
    'GET /me/progress': route => json(route, { data: null, updatedAt: null }),
    'PUT /me/progress': route =>
      json(route, { updatedAt: new Date().toISOString() }),
    'POST /rounds': route =>
      json(route, { error: { code: 'tooMany', message: 'slow down' } }, 429),
  });
  await page.goto('/');
  await startGame(page);
  expect(await roundSeed(page)).not.toBe(SEED);
  await expect(page.getByRole('dialog', { name: 'Game over' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('ranked-line')).toHaveCount(0);
});

test('asks a guest at /admin to sign in', async ({ page }) => {
  await stubApi(page, { 'GET /config': route => json(route, CONFIG) });
  await page.goto('/admin');
  await expect(page.getByTestId('admin-sign-in')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Tick Perfect · Admin' })
  ).toBeVisible();
});

test('shows an admin the error log, by kind', async ({ page }) => {
  await signedIn(page);
  await stubApi(page, {
    'GET /config': route => json(route, CONFIG),
    'GET /me': route =>
      json(route, { profile: { ...PROFILE, role: 'admin' }, bests: [] }),
    'GET /admin/overview': route =>
      json(route, {
        you: { displayName: 'Ada', role: 'admin' },
        seasons: [],
        flagged: 0,
        settings: {
          'leaderboard.enabled': true,
          'submissions.enabled': true,
          announcement: null,
        },
        errors: { api: 1, page: 2, csp: 0 },
      }),
    'GET /admin/rulesets': route => json(route, { rulesets: [] }),
    'GET /admin/errors': route =>
      json(route, {
        days: Number(new URL(route.request().url()).searchParams.get('days')),
        errors: [
          {
            id: 'a1b2c3d4e5f60718',
            source: 'api',
            count: 1,
            firstAt: '2026-10-03T09:00:00.000Z',
            lastAt: '2026-10-03T09:00:00.000Z',
            message: 'Error: connection lost',
            detail: { route: 'GET /config', status: 500, stack: null },
          },
        ],
      }),
  });
  await page.goto('/admin');
  const tab = page.getByRole('button', { name: /^Errors/ });
  await expect(tab.getByTestId('admin-errors-count')).toHaveText('3');
  await tab.click();
  const error = page.getByTestId('admin-error');
  await expect(error).toHaveAttribute('data-source', 'api');
  await expect(error).toContainText('Error: connection lost');
  await error.getByText(/^Latest sample/).click();
  await expect(error).toContainText('GET /config');

  const week = page.waitForRequest(/\/api\/admin\/errors\?days=7$/);
  await page.getByRole('radio', { name: 'Last week' }).click();
  await week;
});
