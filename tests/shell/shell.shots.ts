import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
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

/** The row is captured at the width configuration declares it fits in, not at a round number. */
const REFERENCE_WIDTH = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../config/j-ocean.json', import.meta.url)), 'utf8'),
  ) as { presentation: { referenceViewportWidthPx: number } }
).presentation.referenceViewportWidthPx;

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

test('the horizon row', async ({ page }) => {
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 1000 });
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
  await page.getByTestId('horizon-row-panel').screenshot({ path: `${IMAGES}007-horizon-row.png` });

  await page.getByTestId('toggle-attribution').click();
  await page.getByTestId('horizon-row').screenshot({ path: `${IMAGES}007-attribution-row.png` });

  await page.getByTestId('toggle-attribution').click();
  await page.getByTestId('enlarge-24').click();
  await page.getByTestId('horizon-row').screenshot({ path: `${IMAGES}007-enlarged.png` });
});

test('the observation footprint', async ({ page }) => {
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 1100 });
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('horizon-row-panel').screenshot({ path: `${IMAGES}008-footprint-row.png` });

  await page.getByTestId('enlarge-24').click();
  await expect(page.getByTestId('needle-elevation')).toBeVisible();
  await page.getByTestId('panel-24').screenshot({ path: `${IMAGES}008-needles.png` });

  // Scrolled into place *before* hovering: a scroll under a stationary pointer fires a
  // mouseout, and the hover this figure exists to show would be gone by the time it was taken.
  // Clicked rather than hovered: a click pins the mark, so what it says survives the scroll
  // the screenshot itself performs.
  const needle = page.getByTestId('needle-elevation').locator('[data-kind="drop"]').first();
  await needle.click();
  await expect(page.getByTestId('profile-comparison')).toBeVisible();
  await page.getByTestId('panel-24').screenshot({ path: `${IMAGES}008-profile-comparison.png` });
});

test('the two axes', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: REFERENCE_WIDTH, height: 1100 });
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
  await page.getByTestId('horizon-row-panel').screenshot({ path: `${IMAGES}009-issued-at-default.png` });

  const control = page.getByTestId('issue-time');
  await control.fill(String(Number(await control.inputValue()) - 12 * 3_600_000));
  await page.getByTestId('reissue').click();
  await expect(page.getByTestId('issue-stale')).toHaveCount(0, { timeout: 120_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
  await page.getByTestId('horizon-row-panel').screenshot({ path: `${IMAGES}009-issued-earlier.png` });
  await page.getByTestId('skill-inset').screenshot({ path: `${IMAGES}009-skill-inset.png` });
});

test('what the forecast was worth', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('score-run').click();
  await expect(page.getByTestId('score-statement')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('score-panel').screenshot({ path: `${IMAGES}006-score.png` });
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
