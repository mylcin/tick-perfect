import { expect, test, type Page } from '@playwright/test';

import { en } from '../src/i18n/en';
import {
  collectErrors,
  countDraws,
  gameState,
  SCENE_TIMEOUT,
  startGame,
  waitForPhase,
  waitForWatch,
} from './helpers';

interface SceneState {
  readonly status: string;
  readonly failure: string | null;
}

/** Whether the 3D watch is showing, and why not, through the e2e hook. */
function scene(page: Page): Promise<SceneState> {
  return page.evaluate(() =>
    (
      window as unknown as { __tickPerfect: { scene: () => SceneState } }
    ).__tickPerfect.scene()
  );
}

async function waitForScene(page: Page, status: string, timeout = 20_000) {
  await expect
    .poll(async () => (await scene(page)).status, { timeout, intervals: [50] })
    .toBe(status);
}

/** Takes the canvas's WebGL context away, as the GPU does under pressure. */
function loseContext(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const context = canvas?.getContext('webgl2');
    const extension = context?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('No WEBGL_lose_context here');
    Object.assign(window, { __loseContext: extension });
    extension.loseContext();
  });
}

function restoreContext(page: Page) {
  return page.evaluate(() => {
    (
      window as unknown as { __loseContext: WEBGL_lose_context }
    ).__loseContext.restoreContext();
  });
}

test('draws the watch again when a lost WebGL context comes back', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await countDraws(page);
  await page.goto('/');
  await waitForWatch(page);
  await waitForScene(page, 'ready');

  await loseContext(page);
  await waitForScene(page, 'lost');
  await restoreContext(page);

  // A fresh canvas, its scene rebuilt, rather than the old one half-drawn.
  await waitForScene(page, 'ready', SCENE_TIMEOUT);
  await expect(page.locator('canvas')).toHaveCount(1);
  await waitForWatch(page);
  expect(errors).toEqual([]);
});

test('holds a round while the GPU is away, and lets it go on after', async ({
  page,
}) => {
  await countDraws(page);
  await page.goto('/');
  await waitForWatch(page);
  await startGame(page);

  await loseContext(page);
  await waitForPhase(page, 'paused');
  const dialog = page.getByRole('dialog', { name: 'Paused' });
  const restoring = dialog.getByTestId('pause-restoring');
  await expect(restoring).toHaveAttribute('data-scene', 'lost');
  const resume = dialog.getByRole('button', { name: 'Resume' });
  await expect(resume).toHaveAttribute('aria-disabled', 'true');
  // Resume doesn't let the round go on without its watch.
  await expect(resume).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  expect((await gameState(page)).phase).toBe('paused');

  await restoreContext(page);
  await waitForScene(page, 'ready', SCENE_TIMEOUT);
  await expect(restoring).toBeHidden();
  await expect(resume).toHaveAttribute('aria-disabled', 'false');
  await resume.click();
  await expect(dialog).toBeHidden();
});

test('Escape leaves for the title while the GPU is away', async ({ page }) => {
  await countDraws(page);
  await page.goto('/');
  await waitForWatch(page);
  await startGame(page);

  await loseContext(page);
  await waitForPhase(page, 'paused');
  const dialog = page.getByRole('dialog', { name: 'Paused' });
  await expect(dialog.getByTestId('pause-restoring')).toBeVisible();
  // Browsers close the dialog themselves after a few refused Escapes, so
  // the round must not just stay paused behind it.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('radiogroup', { name: 'Watches' })).toBeVisible();
});

test('gives up on a WebGL context that never comes back', async ({ page }) => {
  await countDraws(page);
  await page.goto('/');
  await waitForWatch(page);

  await loseContext(page);
  await waitForScene(page, 'lost');
  await expect
    .poll(() => scene(page), { timeout: 10_000 })
    .toEqual({
      status: 'failed',
      failure: 'stopped',
    });
  // Not blamed on the browser's settings: it drew the watch until now.
  await expect(page.getByTestId('title-unsupported')).toHaveText(
    en.title.stopped
  );
});

test("blames the network when the scene's code doesn't load", async ({
  page,
}) => {
  await page.route('**/assets/watch-scene-*.js', route => route.abort());
  let documents = 0;
  page.on('request', request => {
    if (request.isNavigationRequest()) documents += 1;
  });
  await page.goto('/', { waitUntil: 'commit' });
  // A chunk that won't load may be one a deploy replaced: the page reloads
  // for the current build, once, and then says what went wrong.
  await expect.poll(() => documents, { timeout: SCENE_TIMEOUT }).toBe(2);
  await expect
    .poll(() => scene(page).catch(() => null), { timeout: SCENE_TIMEOUT })
    .toEqual({
      status: 'failed',
      failure: 'network',
    });
  await expect(page.getByTestId('title-unsupported')).toHaveText(
    en.title.loadFailed
  );
  expect(documents).toBe(2);
});

test('blames WebGL when the browser has none', async ({ page }) => {
  await page.addInitScript(() => {
    const prototype = HTMLCanvasElement.prototype;
    const getContext = Object.getOwnPropertyDescriptor(prototype, 'getContext')
      ?.value as (...args: unknown[]) => unknown;
    Object.defineProperty(prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return type.startsWith('webgl')
          ? null
          : getContext.call(this, type, ...rest);
      },
    });
  });
  await page.goto('/');
  await expect
    .poll(() => scene(page), { timeout: SCENE_TIMEOUT })
    .toEqual({
      status: 'failed',
      failure: 'webgl',
    });
});

test('shows a picture of the watch while the 3D one loads', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const released = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/assets/watch-scene-*.js', async route => {
    await released;
    await route.continue();
  });
  await countDraws(page);
  await page.goto('/');

  const poster = page.getByTestId('scene-poster');
  await expect(poster).toHaveAttribute('src', '/watches/diver.webp');
  await expect(poster).not.toHaveCSS('opacity', '0');
  expect(
    await poster.evaluate(image => (image as HTMLImageElement).complete)
  ).toBe(true);

  release?.();
  await waitForWatch(page);
  await waitForScene(page, 'ready', SCENE_TIMEOUT);
  // The real watch fades in over it.
  await expect(poster).toHaveCSS('opacity', '0');
});

test('pauses a round when the phone turns', async ({ page }) => {
  await countDraws(page);
  await page.goto('/');
  await waitForWatch(page);
  await startGame(page);

  const size = page.viewportSize();
  if (!size) throw new Error('No viewport');
  await page.setViewportSize({ width: size.height, height: size.width });
  await waitForPhase(page, 'paused');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
});

test('offers vibration only where something can shake', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByTestId('settings-open').click();
  const vibration = page
    .getByTestId('settings-dialog')
    .getByRole('switch', { name: 'Vibration' });
  // The desktop project is a laptop; the mobile one a phone.
  if (testInfo.project.name === 'mobile') {
    await expect(vibration).toBeEnabled();
  } else {
    await expect(vibration).toBeDisabled();
  }
});
