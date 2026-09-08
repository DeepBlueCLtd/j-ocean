import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { declared } from './declared-geometry.js';

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

/** The declared floor: the smallest viewport the panes hold, re-measured in beat 018. */
const FLOOR_WIDTH = declared.presentation.minimumViewportWidthPx;
const FLOOR_HEIGHT = declared.presentation.minimumViewportHeightPx;

/**
 * The height the figures are taken at: the declared reference height, which is what a 2k
 * screen gives the workspace. Beat 013 captured at 950 because its floor was 728; the floor is
 * 960 now, so 950 photographs the below-the-floor answer by accident. The floor gets its own
 * capture below, deliberately.
 */
const HEIGHT = declared.presentation.referenceViewportHeightPx;

test.beforeAll(() => {
  mkdirSync(IMAGES, { recursive: true });
});

/** Everything is captured in one viewport, because that is what the application now is. */
async function inOneView(page: Page, width = REFERENCE_WIDTH, height = HEIGHT): Promise<void> {
  await page.setViewportSize({ width, height });
}

/**
 * A provenance panel is a tab of one pane now, not a disclosure, so it is photographed by
 * selecting it: the same act a reader performs, and the reason beat 016's `open` helper is
 * gone.
 */
async function selectTab(page: Page, title: string, testId: string): Promise<void> {
  await page.locator('.dv-tab', { hasText: title }).first().click();
  await expect(page.getByTestId(testId)).toBeVisible();
}

test('the shell, on arrival', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('pane-controls')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}001-shell-on-arrival.png` });
});

test('the shell, after integrating', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 30_000 });
  await selectTab(page, 'The run', 'run-panel');
  await page.screenshot({ path: `${IMAGES}001-shell-advanced.png` });
});

test('the ocean the model holds', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('analysed-field')).toBeVisible();
  await page.getByTestId('pane-horizons').screenshot({ path: `${IMAGES}003-field-initial.png` });
});

test('the ocean after twelve hours', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('analysed-field')).toBeVisible();
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('pane-horizons').screenshot({ path: `${IMAGES}003-field-advanced.png` });
  await selectTab(page, 'The run', 'run-panel');
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
  await page.getByTestId('pane-horizons').screenshot({ path: `${IMAGES}007-horizon-row.png` });

  await page.getByTestId('toggle-attribution').click();
  await page.getByTestId('horizon-row').screenshot({ path: `${IMAGES}007-attribution-row.png` });

  // Beat 015 made enlargement a selection: the centre now holds the strip and one panel, so
  // the figure of an enlarged panel is a figure of the centre rather than of the row.
  await page.getByTestId('toggle-attribution').click();
  await page.getByTestId('enlarge-24').click();
  await expect(page.getByTestId('enlarged-centre')).toBeVisible();
  await page.getByTestId('enlarged-centre').screenshot({ path: `${IMAGES}007-enlarged.png` });
});

test('the observation footprint', async ({ page }) => {
  test.setTimeout(180_000);
  await inOneView(page);
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('pane-horizons').screenshot({ path: `${IMAGES}008-footprint-row.png` });

  await page.getByTestId('enlarge-24').click();
  await expect(page.getByTestId('needle-elevation')).toBeVisible();
  await page.getByTestId('panel-24').screenshot({ path: `${IMAGES}008-needles.png` });

  // Clicked rather than hovered: a click pins the mark, so what it says survives in the
  // detail region while the figure is taken.
  const needle = page.getByTestId('needle-elevation').locator('[data-kind="drop"]').first();
  await needle.click();
  await expect(page.getByTestId('profile-comparison')).toBeVisible();
  await page.getByTestId('pane-selection').screenshot({ path: `${IMAGES}008-profile-comparison.png` });
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
  // Beat 018 draws the curve rather than disclosing it: it has the horizons pane's own width
  // and the height the row does not use.
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
  await page.getByTestId('pane-horizons').screenshot({ path: `${IMAGES}010-difference.png` });
  await page.getByTestId('run-status').screenshot({ path: `${IMAGES}010-run-status.png` });
});

/**
 * Beat 014 took the deferrals off the application: the site already carried them and the panel
 * became a named link, so there is no deferrals panel left to capture. `012-deferrals.png` is
 * beat 012's own record of the panel as it was on the day and is left where it is; what is
 * captured here is what replaced it, which is the way out of the application.
 */
test('where the narrative went', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await expect(page.getByTestId('site-links')).toBeVisible();
  await page.getByTestId('pane-controls').screenshot({ path: `${IMAGES}014-controls.png` });
  await page.getByTestId('site-links').screenshot({ path: `${IMAGES}014-site-links.png` });
});

test('what the forecast was worth', async ({ page }) => {
  test.setTimeout(180_000);
  await inOneView(page);
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
  /* Beat 018 put each panel's figures inside its own panel, so the figure of "what the
     forecast was worth" is a panel rather than a region of six columns. */
  await page.getByTestId('panel-24').screenshot({ path: `${IMAGES}006-score.png` });
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
  await page.getByTestId('pane-horizons').screenshot({ path: `${IMAGES}004-field-with-track.png` });
  await selectTab(page, 'Instruments', 'instruments-panel');
  await page.getByTestId('instruments-panel').screenshot({ path: `${IMAGES}004-instruments.png` });
});

test('the record the run is scored against', async ({ page }) => {
  await inOneView(page);
  await page.goto('/');
  await selectTab(page, 'Truth record', 'truth-panel');
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

/**
 * Beat 013's own two figures, re-taken: the panes at the floor, and the answer below it.
 *
 * The floor is the declared minimum on both axes -- the smallest window the application
 * admits, measured from the built layout -- so this is the tightest the surface ever is and
 * the only capture at which "it fits" is worth photographing.
 */
test('the panes at the declared floor', async ({ page }) => {
  test.setTimeout(240_000);
  await inOneView(page, FLOOR_WIDTH, FLOOR_HEIGHT);
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
  await page.screenshot({ path: `${IMAGES}013-at-the-floor.png` });
});

test('the answer below the floor', async ({ page }) => {
  test.setTimeout(240_000);
  // Narrower and shorter than the floor on both axes: a window this instrument cannot be
  // laid out in, which is the state FR-043 exists to answer.
  await inOneView(page, 900, 700);
  await page.goto('/');
  await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('enlarged-centre')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-0')).toContainText('persistence', { timeout: 60_000 });
  await page.getByTestId('strip-48').click();
  await expect(page.getByTestId('panel-48')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}013-below-the-floor.png` });
});

/**
 * Beat 015's own figures: an enlargement is a selection, so what it changes is the centre and
 * nothing else. The whole viewport is captured for that reason -- a figure cropped to the
 * centre could not show that the other three regions did not move -- and the strip is captured
 * on its own because the marking and the figures in it are the beat's claim.
 */
test('enlargement is a selection', async ({ page }) => {
  test.setTimeout(240_000);
  await inOneView(page, REFERENCE_WIDTH, FLOOR_HEIGHT);
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
  await page.screenshot({ path: `${IMAGES}015-the-row.png` });

  await page.getByTestId('enlarge-48').click();
  await expect(page.getByTestId('enlarged-centre')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}015-enlarged.png` });
  await page.getByTestId('horizon-strip').screenshot({ path: `${IMAGES}015-strip.png` });
});

test('panel help, where the reader asks for it', async ({ page }) => {
  test.setTimeout(180_000);
  // Captured at the declared reference width, which is where a pane is tightest and where an
  // explanation has the least room to place itself.
  await inOneView(page, REFERENCE_WIDTH);
  await page.goto('/');
  await expect(page.getByTestId('pane-controls')).toBeVisible();

  // The control at a panel's top right, and nothing at all on the panels that have nothing to
  // explain, which is FR-053 as a picture: the absence is what a reader is meant to read.
  await page.getByTestId('pane-controls').screenshot({ path: `${IMAGES}016-help-controls.png` });

  // Opening one, over a surface that has not moved by a pixel to make room for it.
  await selectTab(page, 'Manifest', 'manifest-panel');
  await page.getByTestId('help-control-controls/manifest').click();
  await expect(page.getByTestId('help-controls/manifest')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}016-help-manifest.png` });
  await page.keyboard.press('Escape');

  // The issue-time axis, whose control arrives with the row it is an axis of; and the scores
  // region, which has no heading line to hang a control on and gets its own corner.
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('help-control-controls/issue-time').click();
  await expect(page.getByTestId('help-controls/issue-time')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}016-help-issue-time.png` });
  await page.keyboard.press('Escape');

  await page.getByTestId('help-control-scores#24').click();
  await expect(page.getByTestId('help-scores#24')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}016-help-scores.png` });
  await page.keyboard.press('Escape');

  // And a horizon panel's own help, enlarged: the same entry at more room.
  await page.getByTestId('enlarge-48').click();
  await expect(page.getByTestId('enlarged-centre')).toBeVisible();
  await page.getByTestId('help-control-centre/horizon-panel#48').click();
  await expect(page.getByTestId('help-centre/horizon-panel#48')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}016-help-horizon-panel.png` });
});

/**
 * Beat 017's own figures.
 *
 * Two, and each is a picture of a refusal or of an affordance rather than of a feature working
 * -- the working case is a page that looks exactly like the page beside it, which photographs
 * as nothing. The first is a link this run cannot honour, reported by name in the region the
 * thing it named would have appeared in. The second is the field's keyboard cursor, which is
 * the whole of "operable without a mouse" in one frame.
 */
test('an address this run cannot honour, and the keyboard on a field', async ({ page }) => {
  test.setTimeout(240_000);
  await inOneView(page, REFERENCE_WIDTH, FLOOR_HEIGHT);

  // A link written against a different grid, naming a horizon this configuration does not
  // declare, and carrying a seed. Each is said by name, and nothing near it is selected.
  await page.goto('/?panel=144&cell=2431@120x120&seed=6a09e667f3bcc908');
  await expect(page.getByTestId('address-refusals')).toBeVisible();
  await page.screenshot({ path: `${IMAGES}017-address-refused.png` });
  await page.getByTestId('pane-selection').screenshot({
    path: `${IMAGES}017-address-refusals.png`,
  });

  // The cell cursor, on the analysed field, reached by Tab and moved by the arrow keys.
  await page.goto('/');
  await expect(page.getByTestId('analysed-field')).toBeVisible();
  // Reached by Tab rather than focused directly, so the picture shows the focus ring a reader
  // working by keyboard actually sees: `:focus-visible` is about how focus arrived.
  await page.getByTestId('help-control-centre/attribution').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.getByTestId('analysed-field').screenshot({ path: `${IMAGES}017-cell-cursor.png` });
});
