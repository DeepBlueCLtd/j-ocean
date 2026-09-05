import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;
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
    baseURL: `http://127.0.0.1:${PORT}`,
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
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
