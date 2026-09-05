import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The documentation site's figures, captured from the real application.
 *
 * `pnpm screenshots` writes these into `docs/site/images/`, where the site build copies
 * them. Nothing is staged or mocked: what a figure shows is what the shell does, which is
 * the only way a screenshot in an engineering note is worth including (Principle VI --
 * there is no "populate for the screenshot" path).
 */

const IMAGES = fileURLToPath(new URL('../../docs/site/images/', import.meta.url));

test.beforeAll(() => {
  mkdirSync(IMAGES, { recursive: true });
});

test('the shell, on arrival', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('run-panel')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}001-shell-on-arrival.png`, fullPage: true });
});

test('the shell, after integrating', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 30_000 });
  await page.screenshot({ path: `${IMAGES}001-shell-advanced.png`, fullPage: true });
});

test('the ocean the model holds', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('field-panel')).toBeVisible();
  await page.getByTestId('field-panel').screenshot({ path: `${IMAGES}003-field-initial.png` });
});

test('the ocean after twelve hours', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('field-panel')).toBeVisible();
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('field-panel').screenshot({ path: `${IMAGES}003-field-advanced.png` });
  await page.getByTestId('run-panel').screenshot({ path: `${IMAGES}003-run-panel.png` });
});

test('where the answer came from', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('attribution-panel')).toBeVisible();
  await page.getByTestId('attribution-view-overlay').click({ position: { x: 210, y: 190 } });
  await expect(page.getByTestId('cell-breakdown')).toContainText('observations');
  await page.getByTestId('attribution-panel').screenshot({ path: `${IMAGES}005-attribution.png` });
});

test('what the instruments measured', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('instruments-panel')).toBeVisible();
  await page.getByTestId('field-panel').screenshot({ path: `${IMAGES}004-field-with-track.png` });
  await page.getByTestId('instruments-panel').screenshot({ path: `${IMAGES}004-instruments.png` });
});

test('the record the run is scored against', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('truth-panel')).toBeVisible();
  await page.getByTestId('truth-panel').screenshot({ path: `${IMAGES}002-truth-record.png` });
});

test('the shell, refusing an invalid configuration', async ({ page }) => {
  await page.route(/j-ocean.*\.json$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1, grid: { nx: 1, ny: 100, cellSizeMetres: 5500 } }),
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('configuration-failure')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}001-shell-invalid-configuration.png`, fullPage: true });
});
