import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets two checkouts run their suites side by side.
const PORT = Number(process.env['E2E_PORT'] ?? 4173);
const BASE_URL = `http://localhost:${String(PORT)}`;
const isCI = Boolean(process.env['CI']);

// In e2e mode the preview server reads .env.e2e, as the e2e build did.
const preview = `npm run preview -- --mode e2e --port ${String(PORT)} --strictPort`;

/**
 * WebGL for the headless browser. CI machines have no GPU, so SwiftShader
 * draws every pixel on the CPU there, a few frames a second. A Mac's GPU,
 * through ANGLE's Metal backend, is many times faster, so local runs use
 * it; E2E_WEBGL=swiftshader reproduces CI's software rendering.
 */
const gpu =
  !isCI &&
  process.platform === 'darwin' &&
  process.env['E2E_WEBGL'] !== 'swiftshader';
const WEBGL_ARGS = gpu
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Software WebGL draws a few frames a second and every instance competes
  // for the CPU, so tests run a few at a time and get time to load.
  workers: isCI ? 1 : gpu ? 4 : 3,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Fresh pages every test; the offline test turns the service worker on.
    serviceWorkers: 'block',
    // Headless Chromium no longer picks a WebGL backend on its own.
    launchOptions: { args: WEBGL_ARGS },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      // A phone's viewport, touch and user agent. Software WebGL (on CI)
      // draws every pixel on the CPU, so the pixel ratio stays at 1 to keep
      // frames short enough for timing tests; real phones render at up to 2.
      use: { ...devices['Pixel 7'], deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    // Tests run against an e2e build: the production build plus a read-only
    // hook that lets them time key presses to the round. CI builds it in an
    // earlier step; locally it is built first, and a running server is never
    // reused, so tests never hit a stale dist.
    command: isCI ? preview : `npm run build:e2e && ${preview}`,
    url: BASE_URL,
    reuseExistingServer: false,
  },
});
