import { expect, test, type Page } from '@playwright/test';

import { dailySeed, type HitQuality, type Segment } from '../src/game';
import { en } from '../src/i18n/en';
import {
  challengeRules,
  encodeChallenge,
  parseChallenge,
} from '../src/state/challenge';
import { SAVE_KEY, SAVE_VERSION } from '../src/state/saved';
import { RULES_REVISION } from '../src/watches/revisions';
import {
  currentSegment,
  gameState,
  hits,
  pinDate,
  pressInPage,
  roundSeed,
  SCENE_TIMEOUT,
  seedProgress,
  setDate,
  startGame,
  waitForPhase,
} from './helpers';

// 2 October 2026, noon where the browser is: Daily #2, on the Chronograph
// (still locked on a fresh save).
const TODAY = new Date(2026, 9, 2, 12, 0, 0);
const TODAY_NUMBER = 2;
const TODAYS_SEED = dailySeed(TODAY_NUMBER);

/** The collection's progress as the app saved it. */
function savedProgress(page: Page): Promise<unknown> {
  return page.evaluate(
    key =>
      (
        JSON.parse(localStorage.getItem(key) ?? 'null') as {
          state: { progress: unknown };
        } | null
      )?.state.progress,
    SAVE_KEY
  );
}

/** Today's Daily button on the title. */
const dailyButton = (page: Page) =>
  page.getByRole('button', { name: /^Daily #\d+, / });

/** Starts today's Daily from the title. */
async function startDaily(page: Page) {
  const daily = dailyButton(page);
  await expect(daily).toHaveAttribute('aria-disabled', 'false', {
    timeout: SCENE_TIMEOUT,
  });
  await daily.click();
  await waitForPhase(page, 'playing');
}

/** Keeps what the page shares, through the share sheet or the clipboard. */
async function captureShares(page: Page) {
  await page.addInitScript(() => {
    const shared: string[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData) => {
        shared.push(data.text ?? '');
        return Promise.resolve();
      },
    });
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: (text: string) => {
        shared.push(text);
        return Promise.resolve();
      },
    });
  });
}

async function lastShared(page: Page): Promise<string> {
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __shared: string[] }).__shared.length
      )
    )
    .toBeGreaterThan(0);
  return page.evaluate(
    () => (window as unknown as { __shared: string[] }).__shared.at(-1) ?? ''
  );
}

/** The challenge a shared text's last line links to. */
function linkedChallenge(text: string) {
  const link = new URL(text.split('\n').at(-1) ?? '');
  return parseChallenge(link.searchParams.get('c'));
}

/** How the round's hits landed, read through the e2e hook. */
function qualities(page: Page): Promise<readonly HitQuality[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __tickPerfect: {
            snapshot: () => { qualities: readonly HitQuality[] };
          };
        }
      ).__tickPerfect.snapshot().qualities
  );
}

/** A sweep with its start time zeroed: that differs from page to page. */
function course(segment: Segment): Segment {
  return { ...segment, startTime: 0 };
}

test('turns to the next Daily at local midnight', async ({ page }) => {
  // A resting watch keeps the page light, so its timers run on time.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pinDate(page, new Date(2026, 9, 6, 23, 59, 58));
  await page.goto('/');
  await expect(dailyButton(page)).toHaveAccessibleName(/^Daily #6, Diver\./);
  // Midnight passes; the page's timer to it (on real time) rolls over.
  await setDate(page, new Date(2026, 9, 7, 0, 0, 1));
  await expect(
    page.getByRole('button', { name: /^Daily #7, Chronograph\./ })
  ).toBeVisible({ timeout: 30_000 });
});

/** Two watches in: the Daily's Chronograph is open, and the GMT after it. */
const PROGRESS = {
  best: { diver: 15, chronograph: 15 },
  unlocked: ['diver', 'chronograph', 'gmt'],
  points: 400,
};

test('plays the Daily on its watch before the collection opens it', async ({
  page,
}) => {
  // A fresh save: only the Diver is open, and today's Daily is on the
  // Chronograph.
  await pinDate(page, TODAY);
  await page.goto('/');
  const daily = page.getByTestId('daily-play');
  await expect(daily).toHaveAttribute('aria-disabled', 'false', {
    timeout: SCENE_TIMEOUT,
  });
  await expect(daily).toHaveAccessibleName(
    'Daily #2, Chronograph. Power reserve 0 of 7 days.'
  );
  await daily.click();
  // Left alone, the hand runs past the first marker and the round ends.
  await waitForPhase(page, 'gameOver');
  await expect(page.getByRole('dialog', { name: 'Daily #2' })).toBeVisible({
    timeout: 15_000,
  });

  // It counts towards the Daily alone: the Chronograph stays locked.
  const results = page.getByTestId('game-over-dialog');
  await results.getByRole('button', { name: 'Main menu' }).click();
  await expect(dailyButton(page)).toHaveAccessibleName(
    /^Daily #2, Chronograph\. Today’s best 0\./
  );
  expect(await savedProgress(page)).toMatchObject({ unlocked: ['diver'] });
  await expect(
    page.getByRole('radio', { name: /^Chronograph,/ })
  ).toHaveAccessibleName(/Locked/);
});

test('waits for a challenge’s watch to be unlocked', async ({ page }) => {
  await page.goto('/?c=gmt.ya.23.3');
  const card = page.getByTestId('challenge-card');
  await expect(card.getByTestId('challenge-rules-note')).toHaveText(
    'Unlock the GMT to take it on.'
  );
  const play = card.getByRole('button', { name: 'Play' });
  await expect(play).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Tap to Play' })).toBeVisible({
    timeout: SCENE_TIMEOUT,
  });
  await play.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('announcer-polite')).toContainText(
    'Locked. To unlock: Score 15 on the Chronograph',
    { timeout: SCENE_TIMEOUT }
  );
  expect((await gameState(page)).phase).toBe('idle');
});

test.describe('on 2 October 2026', () => {
  test.beforeEach(async ({ page }) => {
    await pinDate(page, TODAY);
    await seedProgress(page, PROGRESS);
  });

  test('shows today’s Daily, on its own watch', async ({ page }) => {
    await page.goto('/');
    await expect(dailyButton(page)).toHaveAccessibleName(
      'Daily #2, Chronograph. Power reserve 0 of 7 days.'
    );
    await expect(dailyButton(page)).toContainText('Daily #2 · Chronograph');
    await expect(
      dailyButton(page).getByTestId('reserve-gauge')
    ).toHaveAttribute('data-days', '0');
  });

  test('Space on the focused Daily plays the Daily, not the collection', async ({
    page,
  }) => {
    await page.goto('/');
    const daily = dailyButton(page);
    await expect(daily).toHaveAttribute('aria-disabled', 'false', {
      timeout: SCENE_TIMEOUT,
    });
    await daily.focus();
    await page.keyboard.press('Space');
    await waitForPhase(page, 'playing');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Tick Perfect, Chronograph'
    );
    expect(await roundSeed(page)).toBe(TODAYS_SEED);
  });

  test('plays the day’s seed, the same targets for every player', async ({
    page,
    browser,
  }) => {
    test.slow();
    await page.goto('/');
    await startDaily(page);
    // Read at once: left alone, the first target passes and the round ends.
    const first = course(await currentSegment(page));
    expect(await roundSeed(page)).toBe(TODAYS_SEED);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Tick Perfect, Chronograph'
    );
    await expect(page.getByTestId('hud-best')).toHaveText('Today 0');
    // Off the page, so the second one doesn't wait for the first's frames.
    await page.goto('about:blank');

    // Someone else, in a browser of their own.
    const context = await browser.newContext();
    const other = await context.newPage();
    await pinDate(other, TODAY);
    await seedProgress(other, PROGRESS);
    await other.goto('/');
    await startDaily(other);
    expect(await roundSeed(other)).toBe(TODAYS_SEED);
    expect(course(await currentSegment(other))).toEqual(first);
    await context.close();
  });

  test('a Daily counts for the day and winds the reserve, never the collection', async ({
    page,
    isMobile,
  }) => {
    test.slow();
    await captureShares(page);
    await page.goto('/');
    await startDaily(page);
    await pressInPage(page, { touch: isMobile, presses: 3 });
    await expect.poll(() => hits(page)).toBeGreaterThan(0);
    const results = page.getByRole('dialog', { name: 'Daily #2' });
    await expect(results).toBeVisible({ timeout: 15_000 });
    const over = await gameState(page);
    if (over.phase !== 'gameOver') throw new Error('The round is not over');
    const { score } = over.round;
    const marks = await qualities(page);

    await expect(page.getByTestId('game-over-score')).toHaveText(String(score));
    await expect(page.getByTestId('game-over-best')).toHaveAttribute(
      'data-mode',
      'daily'
    );
    await expect(page.getByTestId('game-over-best')).toHaveText(String(score));
    const reserve = page.getByTestId('daily-reserve');
    await expect(reserve).toHaveAttribute('data-days', '1');
    await expect(reserve).toHaveAttribute('data-wound', 'true');
    await expect(reserve).toContainText('Power reserve 1 day');
    await expect(page.getByTestId('next-daily')).toHaveText(
      'Next Daily in 12 h 0 min'
    );
    // No unlocks, certificates or goals from a fixed sequence.
    await expect(page.getByTestId('goal-line')).toBeHidden();
    await expect(page.getByTestId('unlock-banner')).toBeHidden();
    await expect(page.getByTestId('certificate-earned')).toBeHidden();
    // The round's timing closes it: a Daily is timed like any round.
    await expect(results).toHaveAccessibleDescription(
      new RegExp(
        `Daily #2 over\\. Score ${String(score)}\\..*Power reserve 1 day\\. Wound a day\\. (Timing \\d+ ms (early|late)|Right on time) · ±\\d+ ms\\.$`
      )
    );

    // Share: the day's best, its trace, and a challenge on today's Daily.
    await results.getByRole('button', { name: 'Share' }).click();
    const text = await lastShared(page);
    const [heading, ...rest] = text.split('\n');
    expect(heading).toBe(`Tick Perfect #2 · ${String(score)}`);
    const trace = rest.slice(0, -1).join('');
    expect(trace).toBe(
      marks.map(quality => (quality === 'perfect' ? '◆' : '◇')).join('')
    );
    expect(linkedChallenge(text)).toEqual({
      watch: 'chronograph',
      seed: TODAYS_SEED,
      score,
      revision: RULES_REVISION.chronograph,
    });

    // Retry replays the same targets.
    await results.getByRole('button', { name: 'Retry' }).click();
    await expect
      .poll(async () => (await gameState(page)).phase, { intervals: [25] })
      .not.toBe('gameOver');
    // The board clears (no round), then the new one starts.
    await expect
      .poll(() => roundSeed(page), { intervals: [25], timeout: 20_000 })
      .toBe(TODAYS_SEED);
    await page
      .getByRole('dialog', { name: 'Daily #2' })
      .getByRole('button', { name: 'Main menu' })
      .click({ timeout: 30_000 });

    // The title shows the day's best and the reserve; the collection is as
    // it was, the Moonphase still locked.
    await expect(dailyButton(page)).toHaveAccessibleName(
      new RegExp(
        `^Daily #2, Chronograph\\. Today’s best \\d+\\. Power reserve 1 of 7 days\\.$`
      )
    );
    await expect(page.getByTestId('daily-best')).toHaveText(/^Today \d+$/);
    await expect(
      page.locator('[data-testid="watch-card"][data-watch="moonphase"]')
    ).toHaveAttribute('data-locked', 'true');
    await page.keyboard.press('Home');
    await expect(page.getByTestId('title-best')).toHaveText('Best 15');
    // No best kept quietly for the Chronograph, and no points either.
    expect(await savedProgress(page)).toEqual(PROGRESS);

    await page.reload();
    await expect(dailyButton(page)).toHaveAccessibleName(
      /Power reserve 1 of 7 days\.$/
    );
  });

  test('a challenge link plays exactly that round, to beat', async ({
    page,
  }) => {
    const challenge = {
      watch: 'gmt',
      seed: 1234,
      score: 23,
      revision: RULES_REVISION.gmt,
    } as const;
    await page.goto(`/?ref=chat&c=${encodeChallenge(challenge)}`);
    // Taken into the game, out of the address bar.
    await expect(page).toHaveURL(/\/\?ref=chat$/);
    const card = page.getByRole('group', { name: 'Challenge · GMT · Beat 23' });
    await expect(card).toBeVisible();
    const play = card.getByRole('button', { name: 'Play' });
    await expect(play).toHaveAttribute('aria-disabled', 'false', {
      timeout: SCENE_TIMEOUT,
    });
    // Read as text in swipe order, not only as the group's name.
    await expect(card.getByRole('paragraph')).toContainText('Beat 23');
    // Focus stays where Space plays: the collection's watch.
    await expect(
      page.getByRole('button', { name: 'Tap to Play' })
    ).toBeFocused();

    await play.click();
    await waitForPhase(page, 'playing');
    expect(await roundSeed(page)).toBe(challenge.seed);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Tick Perfect, GMT'
    );
    await expect(page.getByTestId('hud-best')).toHaveText('To beat 23');

    // Left alone, it ends at 0, short of the score to beat.
    const results = page.getByRole('dialog', { name: 'Challenge' });
    await expect(results).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('game-over-best')).toHaveText('23');
    await expect(page.getByTestId('beat-status')).toHaveAttribute(
      'data-beaten',
      'false'
    );
    await expect(page.getByTestId('beat-status')).toHaveText(
      '24 points to beat 23'
    );
    await expect(results).toHaveAccessibleDescription(
      /Game over\. Score 0\. 24 points to beat 23\.$/
    );

    // The card stays for another go until it is dismissed.
    await results.getByRole('button', { name: 'Main menu' }).click();
    await expect(card).toBeVisible({ timeout: SCENE_TIMEOUT });
    await card.getByRole('button', { name: 'Dismiss the challenge' }).click();
    await expect(card).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Tap to Play' })
    ).toBeFocused();
  });

  test('a challenge set on other rules says its targets will differ', async ({
    page,
  }) => {
    // A link from before links carried a revision: set on the first.
    await page.goto('/?c=gmt.ya.23');
    const card = page.getByTestId('challenge-card');
    const legacy = {
      watch: 'gmt',
      seed: 1234,
      score: 23,
      revision: 1,
    } as const;
    expect(challengeRules(legacy)).toBe('earlier');
    await expect(card).toHaveAttribute('data-rules', 'earlier');
    await expect(card.getByTestId('challenge-rules-note')).toHaveText(
      en.challenge.earlierRules
    );

    // One set on a newer version's rules, opened before this page updates.
    const later = { ...legacy, revision: RULES_REVISION.gmt + 1 };
    await page.goto(`/?c=${encodeChallenge(later)}`);
    await expect(card).toHaveAttribute('data-rules', 'later');
    await expect(card.getByTestId('challenge-rules-note')).toHaveText(
      en.challenge.laterRules
    );
    await expect(card).toHaveAccessibleDescription(en.challenge.laterRules);

    // Still played, on its seed, by the rules this version has.
    const play = card.getByRole('button', { name: 'Play' });
    await expect(play).toHaveAttribute('aria-disabled', 'false', {
      timeout: SCENE_TIMEOUT,
    });
    await play.click();
    await waitForPhase(page, 'playing');
    expect(await roundSeed(page)).toBe(later.seed);
  });

  test('a challenge on today’s Daily plays as the Daily', async ({ page }) => {
    await page.goto(
      `/?c=${encodeChallenge({
        watch: 'chronograph',
        seed: TODAYS_SEED,
        score: 5,
        revision: RULES_REVISION.chronograph,
      })}`
    );
    const card = page.getByRole('group', {
      name: 'Challenge · Chronograph · Beat 5',
    });
    const play = card.getByRole('button', { name: 'Play' });
    await expect(play).toHaveAttribute('aria-disabled', 'false', {
      timeout: SCENE_TIMEOUT,
    });
    await play.click();
    await waitForPhase(page, 'playing');
    expect(await roundSeed(page)).toBe(TODAYS_SEED);
    await expect(page.getByTestId('hud-best')).toHaveText('To beat 5');
    await expect(page.getByRole('dialog', { name: 'Daily #2' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('daily-reserve')).toHaveAttribute(
      'data-days',
      '1'
    );
    await expect(page.getByTestId('beat-status')).toHaveText(
      '6 points to beat 5'
    );
  });

  test('a Daily that runs past midnight says the next one is ready', async ({
    page,
  }) => {
    await page.goto('/');
    await startDaily(page);
    // Left alone past midnight, the round ends on 3 October.
    await setDate(page, new Date(2026, 9, 3, 0, 3, 0));
    await expect(page.getByRole('dialog', { name: 'Daily #2' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('next-daily')).toHaveText(
      'Daily #3 is ready'
    );
  });

  test('a Daily older than the saved one claims no day’s best', async ({
    page,
  }) => {
    // Saved when the clock ran a day ahead, over the progress seeded.
    await page.addInitScript(
      ([key, saved]) => {
        localStorage.setItem(key, saved);
      },
      [
        SAVE_KEY,
        JSON.stringify({
          state: {
            progress: PROGRESS,
            daily: { number: 3, best: 9, marks: '' },
            reserve: { days: 1, woundOn: 3 },
          },
          version: SAVE_VERSION,
        }),
      ] as const
    );
    await page.goto('/');
    await startDaily(page);
    const results = page.getByRole('dialog', { name: 'Daily #2' });
    await expect(results).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('game-over-score')).toHaveText('0');
    await expect(page.getByTestId('game-over-best')).toBeHidden();
    await expect(results).toHaveAccessibleDescription(
      /Game over\. Score 0\. Power reserve 1 day\.$/
    );
  });

  test('a collection round shares a challenge on its own seed', async ({
    page,
    isMobile,
  }) => {
    await captureShares(page);
    await page.goto('/');
    await startGame(page);
    await pressInPage(page, { touch: isMobile, presses: 1 });
    const results = page.getByRole('dialog', { name: 'Game over' });
    await expect(results).toBeVisible({ timeout: 15_000 });
    const seed = await roundSeed(page);
    const score = Number(await page.getByTestId('game-over-score').innerText());

    await results.getByRole('button', { name: 'Share' }).click();
    const text = await lastShared(page);
    expect(text.split('\n')[0]).toBe(`Tick Perfect · Diver · ${String(score)}`);
    expect(linkedChallenge(text)).toEqual({
      watch: 'diver',
      seed,
      score,
      revision: RULES_REVISION.diver,
    });
  });
});
