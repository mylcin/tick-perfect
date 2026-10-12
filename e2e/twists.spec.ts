import { expect, test } from '@playwright/test';

import {
  centerTime,
  closingSpeed,
  countdownAt,
  isHeldAt,
  isSwayingAt,
  targetVisibilityAt,
} from '../src/game';
import {
  ALL_UNLOCKED,
  currentSegment,
  gameState,
  hits,
  playWatch,
  pressInPage,
  seedProgress,
  waitForPhase,
} from './helpers';

// Every watch with a twist shows it by its third target. Each test presses
// at the centre (where a twist never changes anything) until its twist
// comes up, then tries it.

test.beforeEach(async ({ page }) => {
  await seedProgress(page, { unlocked: ALL_UNLOCKED });
  await page.goto('/');
});

test('Chronograph: a pair takes a tap at each mark', async ({
  page,
  isMobile,
}) => {
  await playWatch(page, 'Chronograph');
  await pressInPage(page, { touch: isMobile, presses: 6, until: 'chrono' });
  const start = await currentSegment(page);
  expect(start.twist).toMatchObject({ kind: 'chrono', leg: 'start' });
  await expect(page.getByTestId('hud-hint')).toHaveAttribute(
    'data-twist',
    'chrono'
  );
  const before = await hits(page);

  // The start mark: the hand keeps going, the target isn't done yet.
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect
    .poll(async () => {
      const state = await gameState(page);
      return state.phase === 'playing' && state.round.segment.twist;
    })
    .toMatchObject({ kind: 'chrono', leg: 'stop' });
  const stop = await currentSegment(page);
  expect(await hits(page)).toBe(before);
  expect(stop.direction).toBe(start.direction);

  // The stop mark completes it.
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect.poll(() => hits(page)).toBe(before + 1);
});

test('GMT: a tap under the GMT hand is a miss', async ({ page, isMobile }) => {
  await playWatch(page, 'GMT');
  await pressInPage(page, { touch: isMobile, presses: 6, until: 'gmt' });
  const gate = await currentSegment(page);
  if (gate.twist?.kind !== 'gmt') throw new Error('Not a GMT gate');
  const { side } = gate.twist;
  // The hint says which side of the line to tap on.
  await expect(page.getByTestId('hud-hint')).toHaveAttribute('data-gate', side);
  // Inside the window, on the flank the GMT hand covers.
  const { hitWindow } = gate.target;
  const flank = side === 'wait' ? -hitWindow + 0.5 : hitWindow - 0.5;
  await pressInPage(page, { touch: isMobile, presses: 1, progress: flank });
  await waitForPhase(page, 'gameOver');
  await expect(page.getByTestId('game-over-reason')).toHaveAttribute(
    'data-reason',
    'blocked',
    { timeout: 15_000 }
  );
  await expect(page.getByTestId('game-over-reason')).toHaveText(
    'The GMT hand covered the marker'
  );
});

test('Moonphase: a hidden target still counts where it was', async ({
  page,
  isMobile,
}) => {
  await playWatch(page, 'Moonphase');
  await pressInPage(page, { touch: isMobile, presses: 6, until: 'moon' });
  const hidden = await currentSegment(page);
  expect(hidden.twist?.kind).toBe('moon');
  // By its centre it has faded out completely.
  expect(targetVisibilityAt(hidden, centerTime(hidden))).toBe(0);
  await expect(page.getByTestId('hud-hint')).toHaveAttribute(
    'data-twist',
    'moon'
  );
  const before = await hits(page);
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect.poll(() => hits(page)).toBe(before + 1);
});

test('Tourbillon: the watch rocks, and a tap at the centre still counts', async ({
  page,
  isMobile,
}) => {
  await playWatch(page, 'Tourbillon');
  await pressInPage(page, { touch: isMobile, presses: 6, until: 'sway' });
  const swaying = await currentSegment(page);
  expect(swaying.twist?.kind).toBe('sway');
  // The watch is still rocking as the hand reaches the centre.
  expect(isSwayingAt(swaying, centerTime(swaying))).toBe(true);
  await expect(page.getByTestId('hud-hint')).toHaveAttribute(
    'data-twist',
    'sway'
  );
  // Read from any phase: the next, unpressed sweep may end the round.
  const tally = async () => {
    const state = await gameState(page);
    if (state.phase === 'idle') throw new Error('No round has started');
    return { hits: state.round.hits, perfects: state.round.perfects };
  };
  const before = await tally();
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect
    .poll(tally)
    .toEqual({ hits: before.hits + 1, perfects: before.perfects + 1 });
});

test('Field: the hand stops short, and a tap once it runs on counts', async ({
  page,
  isMobile,
}) => {
  await playWatch(page, 'Field');
  await pressInPage(page, { touch: isMobile, presses: 6, until: 'hack' });
  const hacked = await currentSegment(page);
  if (hacked.twist?.kind !== 'hack') throw new Error('Not a hack');
  // It stands short of the window, then runs on to the centre.
  const stop =
    hacked.startTime +
    ((hacked.approach + hacked.twist.at) / closingSpeed(hacked)) * 1000;
  expect(isHeldAt(hacked, stop + hacked.twist.holdMs / 2)).toBe(true);
  expect(isHeldAt(hacked, centerTime(hacked))).toBe(false);
  await expect(page.getByTestId('hud-hint')).toHaveAttribute(
    'data-twist',
    'hack'
  );
  const before = await hits(page);
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect.poll(() => hits(page)).toBe(before + 1);
});

test('Field: a tap while the hand stands is early', async ({
  page,
  isMobile,
}) => {
  await playWatch(page, 'Field');
  await pressInPage(page, { touch: isMobile, presses: 6, until: 'hack' });
  const hacked = await currentSegment(page);
  if (hacked.twist?.kind !== 'hack') throw new Error('Not a hack');
  // Where the hand stands: just short of the window, before the hold.
  await pressInPage(page, {
    touch: isMobile,
    presses: 1,
    progress: hacked.twist.at,
  });
  await waitForPhase(page, 'gameOver');
  await expect(page.getByTestId('game-over-reason')).toHaveAttribute(
    'data-reason',
    'early',
    { timeout: 15_000 }
  );
});

test('Pilot: cloud drifts over the dial, and a tap at the centre counts', async ({
  page,
  isMobile,
}) => {
  await playWatch(page, 'Pilot');
  await pressInPage(page, { touch: isMobile, presses: 6, until: 'cloud' });
  const clouded = await currentSegment(page);
  expect(clouded.twist?.kind).toBe('cloud');
  if (clouded.twist?.kind !== 'cloud') throw new Error('Not clouded');
  // The cloud lies ahead of the marker, where the hand flies through it.
  expect(clouded.twist.from).toBeLessThan(0);
  await expect(page.getByTestId('hud-hint')).toHaveAttribute(
    'data-twist',
    'cloud'
  );
  const before = await hits(page);
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect.poll(() => hits(page)).toBe(before + 1);
});

test('Digital: the display counts down 3, 2, 1, and a tap at zero counts', async ({
  page,
  isMobile,
}) => {
  await playWatch(page, 'Digital');
  await pressInPage(page, { touch: isMobile, presses: 6, until: 'countdown' });
  const timed = await currentSegment(page);
  if (timed.twist?.kind !== 'countdown') throw new Error('Not a countdown');
  // Zero falls on the centre, the marker in sight all the way.
  expect(countdownAt(timed, centerTime(timed))?.count).toBe(0);
  expect(
    countdownAt(timed, centerTime(timed) - timed.twist.beatMs * 2.5)?.count
  ).toBe(3);
  expect(targetVisibilityAt(timed, centerTime(timed))).toBe(1);
  await expect(page.getByTestId('hud-hint')).toHaveAttribute(
    'data-twist',
    'countdown'
  );
  const before = await hits(page);
  await pressInPage(page, { touch: isMobile, presses: 1 });
  await expect.poll(() => hits(page)).toBe(before + 1);
});
