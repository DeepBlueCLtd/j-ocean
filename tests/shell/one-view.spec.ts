import { expect, test, type Page } from '@playwright/test';
import { declared, LEADS } from './declared-geometry.js';

/**
 * One view, four regions (spec 013 SC-001, FR-002, FR-003, FR-006; SRD-v2 FR-41, AT-11).
 *
 * The application occupies one viewport and does not scroll. That is a claim about geometry
 * in *every state the application can reach*, which is why this file walks seven of them
 * rather than asserting the property once on a freshly loaded page: beat 007 learned that a
 * layout test which asserts membership and order measures nothing.
 *
 * A region may scroll **within itself**, and that is a declared property rather than an
 * accident: it carries `data-scrolls`. So the second assertion here is the one that makes the
 * first mean something -- every element that actually scrolls is one that said it would, and
 * an undeclared scrollbar fails by name.
 *
 * The viewport is the **declared floor** on both axes, read from the file the shell is served:
 * the smallest window the four regions hold, measured from the built layout by
 * `tests/shell/viewport-floor.spec.ts` and declared in configuration. Asserting the property
 * at the tightest window the application admits is the only place it is worth asserting --
 * anything larger passes for reasons that have nothing to do with the layout.
 */

const CONFIG_REQUEST = /j-ocean.*\.json$/;
const WIDTH = declared.presentation.minimumViewportWidthPx;
const HEIGHT = declared.presentation.minimumViewportHeightPx;

/**
 * What the page's own scroll extents are, and which elements are genuinely scrolling.
 *
 * "Genuinely" is the whole point: an element whose content overflows a box it *clips* is not
 * a scrollbar, and an element inside a closed disclosure has no box at all. So an element
 * counts only where its content exceeds its box on an axis whose computed overflow is `auto`
 * or `scroll`, and where it has a box to exceed.
 */
async function measure(page: Page): Promise<{
  readonly page: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number };
  readonly scrolling: readonly { name: string; declared: boolean }[];
}> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const scrolling: { name: string; declared: boolean }[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      if (element.clientWidth === 0 || element.clientHeight === 0) continue;
      const style = getComputedStyle(element);
      const scrolls = (value: string): boolean => value === 'auto' || value === 'scroll';
      const overflowsX = element.scrollWidth > element.clientWidth + 1 && scrolls(style.overflowX);
      const overflowsY = element.scrollHeight > element.clientHeight + 1 && scrolls(style.overflowY);
      if (!overflowsX && !overflowsY) continue;
      const testId = element.dataset['testid'] ?? '';
      // An SVG element's `className` is not a string, so it is only used where it is one.
      const classes = typeof element.className === 'string' ? element.className : '';
      const name =
        `${element.tagName.toLowerCase()}` +
        (testId === '' ? '' : `[data-testid="${testId}"]`) +
        (classes === '' ? '' : `.${classes.split(' ').join('.')}`) +
        ` (${overflowsX ? 'horizontally' : ''}${overflowsX && overflowsY ? ' and ' : ''}${overflowsY ? 'vertically' : ''})`;
      scrolling.push({ name, declared: element.dataset['scrolls'] === 'true' });
    }
    return {
      page: {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      },
      scrolling,
    };
  });
}

/** SC-001, and the declaration check that makes it mean something. Reported by state. */
async function holdsOneView(page: Page, state: string): Promise<void> {
  const measured = await measure(page);
  expect(
    measured.page.scrollWidth,
    `the page scrolls horizontally in the "${state}" state: ` +
      `scrollWidth ${String(measured.page.scrollWidth)} > clientWidth ${String(measured.page.clientWidth)}`,
  ).toBeLessThanOrEqual(measured.page.clientWidth);
  expect(
    measured.page.scrollHeight,
    `the page scrolls vertically in the "${state}" state: ` +
      `scrollHeight ${String(measured.page.scrollHeight)} > clientHeight ${String(measured.page.clientHeight)}`,
  ).toBeLessThanOrEqual(measured.page.clientHeight);

  const undeclared = measured.scrolling.filter((element) => !element.declared).map((e) => e.name);
  expect(
    undeclared,
    `these elements scroll in the "${state}" state without declaring data-scrolls: ${undeclared.join(', ')}`,
  ).toEqual([]);

  console.log(
    `    ${state}: page ${String(measured.page.scrollWidth)}x${String(measured.page.scrollHeight)} ` +
      `in ${String(measured.page.clientWidth)}x${String(measured.page.clientHeight)}; ` +
      `declared scrollers: ${measured.scrolling.map((e) => e.name).join(' | ') || 'none'}`,
  );
}

test.describe('one view, four regions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  });

  test('does not scroll the page in any state it can reach', async ({ page }) => {
    test.setTimeout(240_000);

    await page.goto('/');
    await expect(page.getByTestId('region-controls')).toBeVisible();
    await holdsOneView(page, 'loaded');

    // FR-048: before the row is built the centre is not empty, and neither are the scores or
    // the detail. Each says what would appear there.
    await expect(page.getByTestId('row-invitation')).toBeVisible();
    await expect(page.getByTestId('scores-empty')).toBeVisible();
    await expect(page.getByTestId('detail-empty')).toBeVisible();
    await holdsOneView(page, 'row-unbuilt');

    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await holdsOneView(page, 'row-built');

    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
    await holdsOneView(page, 'scored');

    // FR-047: selecting fills the detail region and moves nothing. The geometry of the other
    // three regions is measured before and after, to the pixel.
    const before = await regionBoxes(page);
    await page.getByTestId('panel-field-24-overlay').click({ position: { x: 60, y: 60 } });
    await expect(page.getByTestId('cell-breakdown')).toBeVisible();
    const after = await regionBoxes(page);
    expect(after.controls).toEqual(before.controls);
    expect(after.centre).toEqual(before.centre);
    expect(after.scores).toEqual(before.scores);
    expect(after.detail).toEqual(before.detail);
    await holdsOneView(page, 'cell-selected');
  });

  test('shows the change in every panel and every score without the reader moving', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });

    const before = await everythingVisible(page);
    expect(
      before.outside,
      `these panels and scores were not inside the viewport before the control changed: ${before.outside.join(', ')}`,
    ).toEqual([]);

    // One control change: the forecast is reissued twelve hours earlier.
    const control = page.getByTestId('issue-time');
    await control.fill(String(Number(await control.inputValue()) - 12 * 3_600_000));
    await page.getByTestId('reissue').click();
    await expect(page.getByTestId('issue-stale')).toHaveCount(0, { timeout: 180_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 120_000 });

    const after = await everythingVisible(page);
    expect(
      after.outside,
      `these panels and scores were not inside the viewport after the control changed: ${after.outside.join(', ')}`,
    ).toEqual([]);

    // And the change is a change: every panel and every score the control governs moved.
    for (const lead of LEADS) {
      for (const testId of [`panel-${String(lead)}`, `panel-score-${String(lead)}`]) {
        expect(
          after.text[testId],
          `${testId} is unchanged after the issue time moved, so nothing was there to see`,
        ).not.toBe(before.text[testId]);
      }
    }

    await holdsOneView(page, 'reissued and rescored');
  });

  /**
   * NFR-04's notice, reached the way G-05 reaches a row that disagrees with its configuration:
   * the page is served a configuration whose declared frame budget no machine can meet. The
   * budget is a declared number, so declaring a small one is the honest way to reach the state
   * -- there is no production hook here, and adding one would change what the shell does.
   */
  test('does not scroll the page when the run is over the declared budget', async ({ page }) => {
    test.setTimeout(120_000);
    await page.route(CONFIG_REQUEST, async (route) => {
      const response = await route.fetch();
      const config = JSON.parse(await response.text()) as { budget: { frameBudgetMs: number } };
      config.budget.frameBudgetMs = 0.000_001;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    });

    await page.goto('/');
    await expect(page.getByTestId('region-controls')).toBeVisible();
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('over-budget')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('over-budget')).toContainText('saying so rather than freezing');
    await holdsOneView(page, 'over-budget');
  });

  test('does not scroll the page when the configuration does not validate', async ({ page }) => {
    await page.route(CONFIG_REQUEST, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 1, grid: { nx: 1, ny: 100, cellSizeMetres: 5500 } }),
      }),
    );
    await page.goto('/');
    await expect(page.getByTestId('configuration-failure')).toBeVisible();
    await holdsOneView(page, 'configuration-failure');
  });

  test('is four named regions, and each score is in its own panel column', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    for (const region of ['region-controls', 'region-centre', 'region-scores', 'region-detail']) {
      await expect(page.getByTestId(region)).toBeVisible();
    }

    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    // FR-046 is a claim about columns, so it is measured as one: a score's box and its
    // panel's box are the same column of the centre's grid, which `subgrid` makes structural
    // rather than arranged.
    for (const lead of LEADS) {
      const panel = await page.getByTestId(`panel-${String(lead)}`).boundingBox();
      const score = await page.getByTestId(`panel-score-${String(lead)}`).boundingBox();
      expect(panel, `panel ${String(lead)} has no box`).not.toBeNull();
      expect(score, `the score for ${String(lead)} has no box`).not.toBeNull();
      expect(
        Math.abs((score?.x ?? 0) - (panel?.x ?? 0)),
        `the score for +${String(lead)} h does not start in its panel's column`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs((score?.width ?? 0) - (panel?.width ?? 0)),
        `the score for +${String(lead)} h is not its panel's width`,
      ).toBeLessThanOrEqual(1);
      // And beneath it, not beside it.
      expect((score?.y ?? 0)).toBeGreaterThan((panel?.y ?? 0) + (panel?.height ?? 0) - 1);
    }
  });

  /**
   * FR-044 and FR-003. The controls SRD-v1 names are in the controls region and in no other:
   * issue time (FR-25), the observation and quality-control toggles (FR-31, FR-32), the bias
   * (FR-32), the domain choice (FR-11) and the track editor's entry point (FR-33). The row's
   * own display toggles are here too, because they drive all six panels at once and a control
   * that drives everything is a cause.
   */
  test('holds every control the requirements name, and the centre holds none of them', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    const named = [
      'issue-time',
      'reissue',
      'quality-control',
      'bias-degrees',
      'revert',
      'domain-gulf-stream-front',
      'domain-open-gyre',
      'toggle-redraw-track',
      'advance',
      'new-run',
      'score-row',
      'toggle-attribution',
      'toggle-difference',
    ];
    const controls = page.getByTestId('region-controls');
    const centre = page.getByTestId('region-centre');
    for (const control of named) {
      await expect(
        controls.getByTestId(control),
        `${control} is not in the controls region`,
      ).toHaveCount(1);
      await expect(
        centre.getByTestId(control),
        `${control} is in the centre, which FR-045 keeps for the row alone`,
      ).toHaveCount(0);
    }

    // FR-004's other half: a control that acts on one panel alone is at that panel.
    for (const lead of LEADS) {
      await expect(centre.getByTestId(`enlarge-${String(lead)}`)).toHaveCount(1);
      await expect(controls.getByTestId(`enlarge-${String(lead)}`)).toHaveCount(0);
    }
  });
});

/**
 * SC-003 and AT-12. A control is changed, and the change in every panel and every score is
 * visible without the reader moving.
 *
 * "Without the reader moving" is a claim about rectangles, so it is measured as one: every
 * panel and every score is inside the viewport rectangle before the change and inside it
 * after. And it is a claim about a *change*, so the second half is that the things the
 * control governs did change -- a layout that held still because nothing happened would
 * satisfy the first half and none of the requirement.
 *
 * The control is the issue time, which is the one control that moves every panel and every
 * score at once: each panel is asked for a different lead from a different instant, and each
 * score is recomputed against it (beat 009).
 */
async function everythingVisible(
  page: Page,
): Promise<{ readonly text: Record<string, string>; readonly outside: readonly string[] }> {
  return page.evaluate((leads) => {
    const root = document.documentElement;
    const text: Record<string, string> = {};
    const outside: string[] = [];
    const inspect = (testId: string): void => {
      const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (element === null) {
        outside.push(`${testId} (absent)`);
        return;
      }
      text[testId] = (element.innerText || '').replace(/\s+/g, ' ').trim();
      const box = element.getBoundingClientRect();
      const inViewport =
        box.top >= -0.5 &&
        box.left >= -0.5 &&
        box.bottom <= root.clientHeight + 0.5 &&
        box.right <= root.clientWidth + 0.5;
      if (!inViewport) {
        outside.push(
          `${testId} at ${String(Math.round(box.left))},${String(Math.round(box.top))} ` +
            `${String(Math.round(box.width))}x${String(Math.round(box.height))}`,
        );
      }
    };
    for (const lead of leads) {
      inspect(`panel-${String(lead)}`);
      inspect(`panel-score-${String(lead)}`);
    }
    return { text, outside };
  }, [...LEADS]);
}

async function regionBoxes(page: Page): Promise<Record<string, unknown>> {
  const boxes: Record<string, unknown> = {};
  for (const region of ['controls', 'centre', 'scores', 'detail']) {
    boxes[region] = await page.getByTestId(`region-${region}`).boundingBox();
  }
  return boxes;
}
