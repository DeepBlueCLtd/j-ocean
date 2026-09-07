import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { declared, FOUR_REGION_WIDTH } from './declared-geometry.js';

/**
 * The documentation site's figures, captured from the real application.
 *
 * `pnpm screenshots` writes these into `docs/site/images/`, where the site build copies
 * them. Nothing is staged or mocked: what a figure shows is what the shell does, which is
 * the only way a screenshot in an engineering note is worth including (Principle VI --
 * there is no "populate for the screenshot" path).
 *
 * **Beat 013 removed `fullPage`.** It meant something while the application was three
 * vertical screens; now that it is one non-scrolling viewport, a full-page capture is the
 * viewport with a different name, and any figure that appeared to need one was really asking
 * for a wider window. So every capture here sets the viewport first, and the width it sets is
 * derived from what configuration declares rather than chosen.
 */

const IMAGES = fileURLToPath(new URL('../../docs/site/images/', import.meta.url));

/** The row is captured at the width configuration declares it fits in, not at a round number. */
const REFERENCE_WIDTH = declared.presentation.referenceViewportWidthPx;

const HEIGHT = 950;

test.beforeAll(() => {
  mkdirSync(IMAGES, { recursive: true });
});

/** Everything is captured in one viewport, because that is what the application now is. */
async function inOneView(page: Page, width = FOUR_REGION_WIDTH): Promise<void> {
  await page.setViewportSize({ width, height: HEIGHT });
}

/** A disclosure has to be opened before it can be photographed. */
async function open(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).evaluate((node) => {
    (node as HTMLDetailsElement).open = true;
  });
}

test('the shell, on arrival', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('region-controls')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}001-shell-on-arrival.png` });
});

test('the shell, after integrating', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 30_000 });
  await open(page, 'run-panel');
  await page.screenshot({ path: `${IMAGES}001-shell-advanced.png` });
});

test('the ocean the model holds', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('analysed-field')).toBeVisible();
  await page.getByTestId('region-centre').screenshot({ path: `${IMAGES}003-field-initial.png` });
});

test('the ocean after twelve hours', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('analysed-field')).toBeVisible();
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('region-centre').screenshot({ path: `${IMAGES}003-field-advanced.png` });
  await open(page, 'run-panel');
  await page.getByTestId('run-panel').screenshot({ path: `${IMAGES}003-run-panel.png` });
});

test('the horizon row', async ({ page }) => {
  test.setTimeout(180_000);
  await inOneView(page);
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
  await page.getByTestId('centre-stack').screenshot({ path: `${IMAGES}007-horizon-row.png` });

  await page.getByTestId('toggle-attribution').click();
  await page.getByTestId('horizon-row').screenshot({ path: `${IMAGES}007-attribution-row.png` });

  await page.getByTestId('toggle-attribution').click();
  await page.getByTestId('enlarge-24').click();
  await page.getByTestId('horizon-row').screenshot({ path: `${IMAGES}007-enlarged.png` });
});

test('the observation footprint', async ({ page }) => {
  test.setTimeout(180_000);
  await inOneView(page);
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('centre-stack').screenshot({ path: `${IMAGES}008-footprint-row.png` });

  await page.getByTestId('enlarge-24').click();
  await expect(page.getByTestId('needle-elevation')).toBeVisible();
  await page.getByTestId('panel-24').screenshot({ path: `${IMAGES}008-needles.png` });

  // Clicked rather than hovered: a click pins the mark, so what it says survives in the
  // detail region while the figure is taken.
  const needle = page.getByTestId('needle-elevation').locator('[data-kind="drop"]').first();
  await needle.click();
  await expect(page.getByTestId('profile-comparison')).toBeVisible();
  await page.getByTestId('region-detail').screenshot({ path: `${IMAGES}008-profile-comparison.png` });
});

test('the two axes', async ({ page }) => {
  test.setTimeout(240_000);
  await inOneView(page);
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
  await page.screenshot({ path: `${IMAGES}009-issued-at-default.png` });

  const control = page.getByTestId('issue-time');
  await control.fill(String(Number(await control.inputValue()) - 12 * 3_600_000));
  await page.getByTestId('reissue').click();
  await expect(page.getByTestId('issue-stale')).toHaveCount(0, { timeout: 120_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
  await page.screenshot({ path: `${IMAGES}009-issued-earlier.png` });
  await open(page, 'skill-disclosure');
  await page.getByTestId('skill-inset').screenshot({ path: `${IMAGES}009-skill-inset.png` });
});

test('the counterfactuals', async ({ page }) => {
  test.setTimeout(240_000);
  await inOneView(page);
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('enlarge-24').click();
  await page.getByTestId('needle-elevation').locator('[data-kind="drop"]').first().click();
  await expect(page.getByTestId('profile-editor')).toBeVisible();
  await page.getByTestId('observation-hover').screenshot({ path: `${IMAGES}010-profile-editor.png` });

  await page.getByTestId('withhold-mark').click();
  await expect(page.getByTestId('run-status')).toContainText('withheld', { timeout: 120_000 });
  await page.getByTestId('toggle-difference').click();
  await page.getByTestId('centre-stack').screenshot({ path: `${IMAGES}010-difference.png` });
  await page.getByTestId('run-status').screenshot({ path: `${IMAGES}010-run-status.png` });
});

test('what it does not do', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('deferrals-panel')).toBeVisible();
  await open(page, 'deferrals-panel');
  await page.getByTestId('deferrals-panel').screenshot({ path: `${IMAGES}012-deferrals.png` });
});

test('what the forecast was worth', async ({ page }) => {
  test.setTimeout(180_000);
  await inOneView(page);
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
  await page.getByTestId('region-scores').screenshot({ path: `${IMAGES}006-score.png` });
});

test('where the answer came from', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('analysed-field')).toBeVisible();
  await page.getByTestId('attribution-view-overlay').click({ position: { x: 210, y: 190 } });
  await expect(page.getByTestId('cell-breakdown')).toContainText('observations');
  await page.screenshot({ path: `${IMAGES}005-attribution.png` });
});

test('what the instruments measured', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('analysed-field')).toBeVisible();
  await page.getByTestId('region-centre').screenshot({ path: `${IMAGES}004-field-with-track.png` });
  await open(page, 'instruments-panel');
  await page.getByTestId('instruments-panel').screenshot({ path: `${IMAGES}004-instruments.png` });
});

test('the record the run is scored against', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('truth-panel')).toBeVisible();
  await open(page, 'truth-panel');
  await page.getByTestId('truth-panel').screenshot({ path: `${IMAGES}002-truth-record.png` });
});

test('the shell, refusing an invalid configuration', async ({ page }) => {
  await inOneView(page);
  await page.route(/j-ocean.*\.json$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1, grid: { nx: 1, ny: 100, cellSizeMetres: 5500 } }),
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('configuration-failure')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}001-shell-invalid-configuration.png` });
});

test('the walkthrough', async ({ page }) => {
  // Captured at the declared reference width, which is where the four regions are tightest
  // and where the card has the least room to place itself.
  await inOneView(page, REFERENCE_WIDTH);
  await page.goto('/');
  await expect(page.getByTestId('region-controls')).toBeVisible();

  // The button on its own, in the corner it lives in.
  await page.screenshot({
    path: `${IMAGES}013-help-button.png`,
    clip: { x: REFERENCE_WIDTH - 320, y: 0, width: 320, height: 200 },
  });

  await page.getByTestId('help-button').click();
  await expect(page.getByTestId('walkthrough-card')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}013-walkthrough-first-step.png` });

  // A step whose anchor is a region rather than a paragraph: the ring is around the centre,
  // and the card has moved to sit beside it.
  await page.getByTestId('walkthrough-next').click();
  await page.getByTestId('walkthrough-next').click();
  await expect(page.getByTestId('walkthrough-title')).toContainText(
    'The forecast, at every horizon at once',
  );
  // Waited on the card: it is placed from the anchor's rectangle and its own measured height,
  // which arrive a frame apart, and a figure taken between the two shows it part-way to where
  // it settles.
  await expect
    .poll(async () => {
      const ring = await page.getByTestId('walkthrough-spotlight').boundingBox();
      const card = await page.getByTestId('walkthrough-card').boundingBox();
      const size = page.viewportSize();
      if (ring === null || card === null || size === null) return null;
      return ring.y >= 0 && card.y + card.height <= size.height;
    })
    .toBe(true);
  await page.screenshot({ path: `${IMAGES}013-walkthrough-field-step.png` });
});
