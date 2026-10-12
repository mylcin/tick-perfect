import { expect, test, type Locator, type Page } from '@playwright/test';

import { encodeChallenge } from '../src/state/challenge';
import { SAVE_KEY, SAVE_VERSION } from '../src/state/saved';
import { RULES_REVISION } from '../src/watches/revisions';
import {
  ALL_UNLOCKED,
  countDraws,
  pressInPage,
  SCENE_TIMEOUT,
  seedProgress,
  waitForPhase,
  waitForWatch,
} from './helpers';

// How the text sits on every screen size: on screen, clear of the corner
// buttons and of itself, never cut short, and big enough to tap.

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Not on screen');
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
  };
}

/** Where an element's text is drawn, which a centred heading's box isn't. */
function textOf(locator: Locator): Promise<Box> {
  return locator.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const { left, top, right, bottom } = range.getBoundingClientRect();
    return { left, top, right, bottom };
  });
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Saved progress in Turkish, before the app loads. */
async function seedTurkish(
  page: Page,
  best: Record<string, number>,
  points = 0
) {
  await page.addInitScript(
    ([key, saved]) => {
      if (sessionStorage.getItem('seeded') === null) {
        localStorage.setItem(key, saved);
        sessionStorage.setItem('seeded', '1');
      }
    },
    [
      SAVE_KEY,
      JSON.stringify({
        state: {
          settings: {
            sound: false,
            vibration: false,
            night: false,
            reducedMotion: null,
            language: 'tr',
          },
          progress: { best, unlocked: ['diver'], points },
          selected: 'diver',
        },
        version: SAVE_VERSION,
      }),
    ] as const
  );
}

const CHALLENGE = encodeChallenge({
  watch: 'tourbillon',
  seed: 7,
  score: 123,
  revision: RULES_REVISION.tourbillon,
});

test('the title stays on screen and clear of the corner buttons, upright or sideways', async ({
  page,
  isMobile,
}) => {
  await seedProgress(page, {
    best: {
      diver: 52,
      chronograph: 31,
      gmt: 18,
      moonphase: 16,
      tourbillon: 15,
    },
    unlocked: ALL_UNLOCKED,
    selected: 'grandComplication',
  });
  await page.goto(`/?c=${CHALLENGE}`);
  await expect(page.getByTestId('challenge-card')).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  for (const [width, height] of [
    [667, 375],
    [844, 390],
    [1024, 768],
    // The smallest phone held upright; no mouse-driven window is this small.
    ...(isMobile ? ([[320, 568]] as const) : []),
  ]) {
    await page.setViewportSize({ width, height });
    // The layout settles over a few frames after a resize.
    const clashes = async () => {
      const card = await boxOf(page.getByTestId('challenge-card'));
      const name = await textOf(page.getByRole('heading', { level: 2 }));
      const found: string[] = card.top < 0 ? ['card off screen'] : [];
      for (const corner of [
        'settings-open',
        'timegrapher-open',
        'leaderboard-open',
        'help-open',
      ]) {
        const button = await boxOf(page.getByTestId(corner));
        if (overlaps(card, button)) found.push(`card under ${corner}`);
        if (overlaps(name, button)) found.push(`name under ${corner}`);
      }
      return found;
    };
    await expect
      .poll(clashes, { message: `${String(width)}×${String(height)}` })
      .toEqual([]);
  }
});

test('picking a watch far along the strip never shifts the page', async ({
  page,
}) => {
  await seedProgress(page, {
    best: { diver: 52, chronograph: 31 },
    unlocked: ['diver', 'chronograph', 'gmt'],
    selected: 'chronograph',
  });
  await page.goto('/');
  await expect(page.getByRole('radio', { name: /^Chronograph,/ })).toBeChecked({
    timeout: SCENE_TIMEOUT,
  });
  // Centring a card scrolls the strip, and must not scroll the screen.
  const title = page.getByRole('heading', { level: 1 });
  const onScreen = async () => {
    const box = await boxOf(title);
    const width = page.viewportSize()?.width ?? 0;
    return box.left >= 0 && box.right <= width;
  };
  await expect.poll(onScreen).toBe(true);
  await page.getByRole('radio', { name: /^GMT,/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(/^GMT/);
  await expect.poll(onScreen).toBe(true);
});

test('the challenge card names its watch in full on a small phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await seedTurkish(page, {});
  await countDraws(page);
  await page.goto(`/?c=${CHALLENGE}`);
  // Above the card the watch is small, but drawn: not out of the camera's
  // reach.
  await waitForWatch(page);
  const card = page.getByTestId('challenge-card');
  const name = card.getByRole('paragraph').locator('[lang="en"]');
  await expect(name).toHaveText('Tourbillon');
  expect(
    await name.evaluate(element => element.scrollWidth <= element.clientWidth)
  ).toBe(true);
  // A full touch target, Play and Dismiss alike.
  for (const button of await card.getByRole('button').all()) {
    const { top, bottom } = await boxOf(button);
    expect(bottom - top).toBeCloseTo(44, 1);
  }
});

test('the unlock banner wraps before its text runs under the button', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await seedTurkish(page, { diver: 14 }, 140);
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Oynamak için dokun' })
    .click({ timeout: SCENE_TIMEOUT });
  await waitForPhase(page, 'playing');
  // Seven Perfects, then a pass: past 15, the Chronograph opens.
  await pressInPage(page, { touch: false, presses: 7 });
  const banner = page.getByTestId('unlock-banner');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  const text = await boxOf(banner.getByRole('paragraph'));
  const button = await boxOf(banner.getByRole('button'));
  expect(overlaps(text, button)).toBe(false);
  await expect(banner.getByRole('paragraph').locator('[lang="en"]')).toHaveText(
    'Chronograph'
  );
  // One run of text, its space kept, not two items set apart.
  await expect(banner.getByRole('button')).toHaveText('Chronograph ile oyna', {
    useInnerText: true,
  });
});

test('names stay English inside Turkish, for screen readers too', async ({
  page,
}) => {
  await seedTurkish(page, { diver: 41 });
  await page.goto('/');
  const diver = page.getByRole('radio', { name: /^Diver,/ });
  await expect(diver).toHaveAccessibleName('Diver, En iyi 41, Chronometer');
  await expect(diver.locator('.sr-only [lang="en"]')).toHaveText([
    'Diver',
    'Chronometer',
  ]);
  const daily = page.getByRole('button', { name: /^Daily #\d+, / });
  await expect(daily.locator('.sr-only [lang="en"]').first()).toHaveText(
    'Daily'
  );
  await expect(
    page.getByTestId('title-best').getByTestId('certificate-pips')
  ).toHaveAttribute('lang', 'en');
});
