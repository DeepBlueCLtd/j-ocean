import { expect, test, type Page } from '@playwright/test';
import { declared, LEADS } from './declared-geometry.js';

/**
 * The viewport floor, measured (spec 013 FR-009, FR-010, SC-006; SRD-v2 FR-43, §9).
 *
 * SRD-v2 §9 leaves the smallest viewport as an open question and says the answer comes from
 * measuring the built layout rather than from choosing a number now. This file is that
 * measurement, and it is arranged so that the figures come out of the browser rather than out
 * of arithmetic somebody did in their head and then asserted.
 *
 * **What "holds" means here.** Four things, and each is a requirement rather than a taste:
 *
 * 1. the page does not scroll on either axis (FR-002, AT-11);
 * 2. every declared horizon has a panel at or above `presentation.minimumPanelWidthPx`, which
 *    is the width below which beat 007 declared a panel stops being legible;
 * 3. the centre stack's content does not exceed its box on either axis -- the row **and**
 *    every score are visible without scrolling for them, because "all visible at once" is the
 *    requirement (FR-013, FR-041) and a score reached by scrolling is not visible;
 * 4. the statement of FR-02 is wholly inside the viewport rectangle.
 *
 * The two flanking columns are excluded from (3) on purpose: they carry the run's provenance
 * behind disclosures and they are declared scrollers, so their content genuinely exceeds them
 * whenever a reader opens one. The centre is not: it is the payload.
 *
 * **Why the floor is not found by shrinking the window.** Below the declared floor the
 * application answers with FR-043's single-panel presentation -- that is the whole of T042 --
 * so a window driven downwards stops rendering the four regions at exactly the declared
 * figure, and a test that shrank until the layout broke would only rediscover the declaration
 * it was supposed to check. So the floor is measured from the built layout the other way
 * round: what the regions **cost** is measured at a viewport that comfortably holds them, and
 * what the row needs is the declared minimum panel width times the declared horizons. The sum
 * is the floor, and it is then verified by rendering at it and checking all four conditions,
 * and checked for tightness: at the floor a panel is *at* its declared minimum and the centre
 * stack has no spare height, so one pixel less is one pixel too few.
 */

const { presentation } = declared;

/** Generous on both axes: the regions' cost is what is being measured, not their squeeze. */
const ROOMY = { width: 2600, height: 1400 };

/** What the row itself needs: every declared horizon at the declared minimum, with the gaps. */
const ROW_WIDTH =
  LEADS.length * presentation.minimumPanelWidthPx +
  (LEADS.length - 1) * presentation.panelGapPx;

interface Measured {
  readonly viewport: { width: number; height: number };
  /** Everything the centre stack does not get: the gutter, both columns and the two gaps. */
  readonly widthTheRegionsCost: number;
  /** Everything the centre stack does not get vertically: the gutter, top and bottom. */
  readonly heightTheRegionsCost: number;
  readonly centreStack: { clientWidth: number; clientHeight: number; scrollWidth: number; scrollHeight: number };
  /**
   * What the centre stack's two regions actually occupy, top of the row to bottom of the
   * scores. Measured from the boxes rather than read off `scrollHeight`, which never reports
   * less than the box it is in and so cannot say how much room the content did not need.
   */
  readonly centreContentHeight: number;
  readonly panelWidths: readonly number[];
  readonly page: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number };
  readonly statementInside: boolean;
}

async function measure(page: Page, leads: readonly number[]): Promise<Measured> {
  return page.evaluate((horizons) => {
    const root = document.documentElement;
    const stack = document.querySelector<HTMLElement>('[data-testid="centre-stack"]');
    if (stack === null) throw new Error('there is no centre stack to measure');
    const statement = document.querySelector<HTMLElement>('[data-testid="not-operational"]');
    const rect = statement?.getBoundingClientRect() ?? null;
    const centre = document.querySelector<HTMLElement>('[data-testid="region-centre"]');
    const scores = document.querySelector<HTMLElement>('[data-testid="region-scores"]');
    if (centre === null || scores === null) throw new Error('the centre stack has lost a region');
    return {
      viewport: { width: root.clientWidth, height: root.clientHeight },
      widthTheRegionsCost: root.clientWidth - stack.clientWidth,
      heightTheRegionsCost: root.clientHeight - stack.clientHeight,
      centreStack: {
        clientWidth: stack.clientWidth,
        clientHeight: stack.clientHeight,
        scrollWidth: stack.scrollWidth,
        scrollHeight: stack.scrollHeight,
      },
      centreContentHeight: Math.ceil(
        scores.getBoundingClientRect().bottom - centre.getBoundingClientRect().top,
      ),
      panelWidths: horizons.map((lead) => {
        const panel = document.querySelector<HTMLElement>(`[data-testid="panel-${String(lead)}"]`);
        return panel === null ? 0 : panel.getBoundingClientRect().width;
      }),
      page: {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      },
      statementInside:
        rect !== null && rect.top >= -0.5 && rect.bottom <= root.clientHeight + 0.5,
    };
  }, [...leads]);
}

/** The recorded case, with the row built and scored: the fullest the centre ever is. */
async function scoredRow(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('region-controls')).toBeVisible();
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
}

test.describe('the viewport floor', () => {
  test('is measured from the built layout, and is what configuration declares', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(ROOMY);
    await scoredRow(page);

    // What the four regions cost, measured: the width the centre stack does not get.
    const roomy = await measure(page, LEADS);
    const measuredWidth = roomy.widthTheRegionsCost + ROW_WIDTH;

    // The height is measured at the floor's own width and not at a roomy one: a score
    // statement is a sentence and it wraps in its column, so a wider panel is a shorter
    // score, and a height measured beside wide panels would be a height the floor has not got.
    await page.setViewportSize({ width: measuredWidth, height: ROOMY.height });
    await expect(page.getByTestId('horizon-row')).toBeVisible();
    const atWidth = await measure(page, LEADS);
    const measuredHeight = atWidth.heightTheRegionsCost + atWidth.centreContentHeight;
    expect(
      atWidth.centreContentHeight,
      'the centre was already scrolling while its content was being measured, so the ' +
        'measurement is of the box and not of the content',
    ).toBeLessThanOrEqual(atWidth.centreStack.clientHeight);

    console.log(
      `    measured floor: ${String(measuredWidth)} x ${String(measuredHeight)} CSS px\n` +
        `      the regions cost ${String(roomy.widthTheRegionsCost)} px of width ` +
        `(gutter ${String(presentation.pageGutterPx)}, controls ${String(presentation.controlsWidthPx)}, ` +
        `detail ${String(presentation.detailWidthPx)}, two column gaps) and ` +
        `${String(atWidth.heightTheRegionsCost)} px of height\n` +
        `      the row needs ${String(ROW_WIDTH)} px: ${String(LEADS.length)} x ` +
        `${String(presentation.minimumPanelWidthPx)} px panels and ${String(LEADS.length - 1)} x ` +
        `${String(presentation.panelGapPx)} px gaps\n` +
        `      the centre stack's content is ${String(atWidth.centreContentHeight)} px tall at that width\n` +
        `      declared: ${String(presentation.minimumViewportWidthPx)} x ` +
        `${String(presentation.minimumViewportHeightPx)}`,
    );

    expect(
      presentation.minimumViewportWidthPx,
      'presentation.minimumViewportWidthPx is not the width the built layout needs',
    ).toBe(measuredWidth);
    // The height carries a tolerance the width does not, and for a stated reason rather than
    // to make a test pass: the row's width is a sum of declared boxes and is the same figure
    // on any machine, while its height ends at the last line of a score *statement* -- a
    // sentence, wrapped in a column, in whatever serif the host has. So the declaration must
    // hold the layout, and must not be more than a line of prose more generous than it needs.
    const HEIGHT_TOLERANCE_PX = 20;
    expect(
      presentation.minimumViewportHeightPx,
      `presentation.minimumViewportHeightPx does not hold the built layout, which needs ${String(measuredHeight)} px`,
    ).toBeGreaterThanOrEqual(measuredHeight);
    expect(
      presentation.minimumViewportHeightPx,
      `presentation.minimumViewportHeightPx is more than a line of prose above the ${String(measuredHeight)} px the built layout needs`,
    ).toBeLessThanOrEqual(measuredHeight + HEIGHT_TOLERANCE_PX);
  });

  test('holds the four regions at exactly the declared floor, with nothing to spare', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({
      width: presentation.minimumViewportWidthPx,
      height: presentation.minimumViewportHeightPx,
    });

    // Before the row is built the centre carries FR-048's invitation and the analysed field
    // at the size the region gives it, and that has to fit the floor too -- otherwise the
    // first thing a reader at the smallest admissible window meets is a scrollbar.
    await page.goto('/');
    await expect(page.getByTestId('row-invitation')).toBeVisible();
    const unbuilt = await measure(page, []);
    expect(
      unbuilt.centreContentHeight,
      'the row invitation does not fit the centre at the declared floor',
    ).toBeLessThanOrEqual(unbuilt.centreStack.clientHeight);

    await scoredRow(page);
    const at = await measure(page, LEADS);

    expect(at.page.scrollWidth, 'the page scrolls horizontally at the declared floor').toBeLessThanOrEqual(
      at.page.clientWidth,
    );
    expect(at.page.scrollHeight, 'the page scrolls vertically at the declared floor').toBeLessThanOrEqual(
      at.page.clientHeight,
    );
    expect(at.statementInside, 'FR-02’s statement is not wholly on screen at the floor').toBe(true);

    for (const [index, width] of at.panelWidths.entries()) {
      expect(
        width,
        `the panel for +${String(LEADS[index])} h is ${String(width)} px, below the declared minimum`,
      ).toBeGreaterThanOrEqual(presentation.minimumPanelWidthPx - 0.5);
    }

    expect(
      at.centreStack.scrollWidth,
      'the row does not fit the centre at the declared floor',
    ).toBeLessThanOrEqual(at.centreStack.clientWidth + 1);
    expect(
      at.centreStack.scrollHeight,
      'the row and its scores do not fit the centre at the declared floor',
    ).toBeLessThanOrEqual(at.centreStack.clientHeight + 1);

    // Tight, which is what makes it a floor rather than a comfortable number: one pixel of
    // width takes a panel below its declared minimum, and there is no spare height.
    const widest = Math.max(...at.panelWidths);
    expect(
      widest,
      `a panel is ${String(widest)} px wide at the floor, so the floor is wider than it needs to be`,
    ).toBeLessThan(presentation.minimumPanelWidthPx + 1);
    expect(
      at.centreStack.clientHeight - at.centreContentHeight,
      'the centre has spare height at the declared floor, so the floor is taller than it needs to be',
    ).toBeLessThan(20);
  });

  /**
   * FR-009 and FR-043, and US7's three scenarios. Below the floor the application says the
   * size it needs and offers the single-panel presentation; it does not shrink six panels past
   * legibility, and it does not scroll the row.
   */
  test.describe('below the floor', () => {
    test('says the size it needs, as a declared figure', async ({ page }) => {
      await page.setViewportSize({
        width: presentation.minimumViewportWidthPx - 1,
        height: presentation.minimumViewportHeightPx,
      });
      await page.goto('/');
      const notice = page.getByTestId('viewport-floor-notice');
      await expect(notice).toBeVisible();

      // The required size is a *declared* figure, in the kind the surface draws declared
      // figures in (Principle V). A number in a banner with no kind is a number a reader
      // cannot place.
      const size = notice.locator('.figure.declared', {
        hasText: `${String(presentation.minimumViewportWidthPx)} × ${String(presentation.minimumViewportHeightPx)} px`,
      });
      await expect(size).toHaveCount(1);
      await expect(page.getByTestId('one-view')).toHaveAttribute(
        'data-presentation',
        'single-panel',
      );

      // FR-02 is still the first thing on the surface, and still outside every scroller.
      await expect(page.getByTestId('not-operational')).toBeVisible();
    });

    test('offers the single-panel presentation, with the strip and the scores', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 900, height: 700 });
      await scoredRowBelowFloor(page);

      // FR-049 and FR-050: one panel, and the strip carrying all six with what each was worth.
      await expect(page.getByTestId('single-panel')).toBeVisible();
      await expect(page.getByTestId('horizon-row')).toHaveCount(0);
      for (const lead of LEADS) {
        await expect(page.getByTestId(`strip-${String(lead)}`)).toHaveCount(1);
      }
      await expect(page.getByTestId(`panel-${String(LEADS[0])}`)).toBeVisible();
      await expect(page.getByTestId(`panel-score-${String(LEADS[0])}`)).toContainText('persistence');

      // Selecting another horizon in the strip swaps the panel and its score, and nothing else.
      await page.getByTestId('strip-48').click();
      await expect(page.getByTestId('panel-48')).toBeVisible();
      await expect(page.getByTestId(`panel-${String(LEADS[0])}`)).toHaveCount(0);
      await expect(page.getByTestId('panel-score-48')).toContainText('persistence');

      // The controls are still reachable, and the detail region is still here.
      await expect(page.getByTestId('region-controls').getByTestId('build-row')).toHaveCount(0);
      await expect(page.getByTestId('region-controls').getByTestId('new-run')).toHaveCount(1);
      await expect(page.getByTestId('region-detail')).toBeVisible();

      // And the page still does not scroll: the fallback is an answer, not a smaller mess.
      const scroll = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      }));
      expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
      expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.clientHeight);
    });

    test('swaps presentation as the window crosses the floor, without a reload', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 900, height: 700 });
      await page.goto('/');
      await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();

      // A witness that survives only if the document does: crossing the floor must be a
      // change of presentation and not a fresh load, or every run and every edit is lost
      // whenever somebody drags a window edge (US7 scenario 3).
      await page.evaluate(() => {
        (window as unknown as { __notReloaded?: boolean }).__notReloaded = true;
      });

      await page.setViewportSize({
        width: presentation.minimumViewportWidthPx,
        height: presentation.minimumViewportHeightPx,
      });
      await expect(page.getByTestId('viewport-floor-notice')).toHaveCount(0);
      await expect(page.getByTestId('region-centre')).toBeVisible();
      await expect(page.getByTestId('row-invitation')).toBeVisible();

      await page.setViewportSize({
        width: presentation.minimumViewportWidthPx - 1,
        height: presentation.minimumViewportHeightPx,
      });
      await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();

      expect(
        await page.evaluate(() => (window as unknown as { __notReloaded?: boolean }).__notReloaded),
        'the page reloaded when the window crossed the floor',
      ).toBe(true);
    });

    /**
     * The spec's third edge case. The floor is expressed in **CSS pixels**, so a window that
     * is wide enough at 100 per cent is below the floor at 200 per cent zoom and gets the
     * same answer -- which is correct, because at that zoom there are as few pixels to read
     * six panels in.
     *
     * Browser zoom is not something a test can turn, so what is asserted here is the property
     * that makes the edge case come out right: the **unit**. This window is exactly the
     * declared floor in CSS pixels and half of it in device pixels. A floor answered in device
     * pixels would refuse it; a floor answered in CSS pixels admits it, and by the same
     * arithmetic in the other direction refuses a window of twice the floor's device pixels
     * held at 200 per cent zoom.
     */
    test.describe('at half a device pixel per CSS pixel', () => {
      test.use({
        viewport: {
          width: presentation.minimumViewportWidthPx,
          height: presentation.minimumViewportHeightPx,
        },
        deviceScaleFactor: 0.5,
      });

      test('answers in CSS pixels and not in device ones', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('region-centre')).toBeVisible();
        expect(await page.evaluate(() => window.devicePixelRatio)).toBe(0.5);
        await expect(page.getByTestId('viewport-floor-notice')).toHaveCount(0);
        await expect(page.getByTestId('row-invitation')).toBeVisible();
      });
    });
  });
});

/** The recorded case scored, below the floor, where the row is one panel and a strip. */
async function scoredRowBelowFloor(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('single-panel')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId(`panel-score-${String(LEADS[0])}`)).toContainText('persistence', {
    timeout: 60_000,
  });
}
