import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;
// Bound explicitly to the IPv4 loopback rather than left to `localhost`. On a machine
// where `localhost` resolves to ::1 first -- a GitHub runner does -- vite preview listens
// on the IPv6 address while Playwright polls the IPv4 one, and the wait times out with no
// error to read. Naming the host on both sides removes the question.
const HOST = '127.0.0.1';
const chromium = process.env['J_OCEAN_CHROMIUM'];

// SC-003: the site is loaded from a static file server, not from a dev server, so that
// "no network request other than the site's own assets" is a claim about what ships.
export default defineConfig({
  testDir: './tests/shell',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Ordinarily Playwright's own browser, installed with `pnpm exec playwright
        // install`. Where a machine already carries a Chromium — a CI image, or this
        // project's remote environment — J_OCEAN_CHROMIUM points at it, so the shell test
        // does not need a second copy downloaded to run.
        ...(chromium === undefined ? {} : { launchOptions: { executablePath: chromium } }),
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --host ${HOST} --port ${String(PORT)} --strictPort`,
    url: `http://${HOST}:${String(PORT)}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // So that a server which fails to start says why in the job log, instead of leaving a
    // bare "timed out waiting for config.webServer" to be guessed at.
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
