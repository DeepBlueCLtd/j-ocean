import { expect, test, type Page } from '@playwright/test';
import { BELOW_THE_ROW, declared, FLOOR, LEADS, REFERENCE, ROW_WIDTH_PX } from './declared-geometry.js';

/**
 * The viewport floor and the reference viewport, both measured (spec 018 FR-003, FR-011,
 * SC-002; SRD-v2 FR-43, §8.1, §9).
 *
 * ## What beat 013 measured, and what it got wrong
 *
 * Beat 013 measured its floor honestly and arrived at **2 038 × 728**. The arithmetic was
 * 48 px of gutter, a 390 px controls column, a 390 px detail column and six panels at 190 px:
 * 828 px of it was chrome, declared unshrinkable because in a grid of fixed tracks it was.
 * The consequence was that an ordinary 2 000 px monitor — the author's own — got the
 * below-the-floor fallback, and the fallback is not what an instrument should look like on a
 * large screen.
 *
 * In a workspace the flanking panes flex. The floor is therefore built from what a pane cannot
 * be *read* below (`workspace.paneMinimumWidthPx`) rather than from the width it *opens* at,
 * and the declared widths are shared down when a window cannot afford them. This file measures
 * that from the built workspace and holds the declaration to it.
 *
 * ## What "holds" means here
 *
 * Four things, each a requirement rather than a taste:
 *
 * 1. the page does not scroll on either axis (FR-041, AT-11);
 * 2. every declared horizon has a panel at or above `presentation.minimumPanelWidthPx`;
 * 3. **no pane clips its content** — measured on the panes' own rectangles, because
 *    `overflow: hidden` is how not-fitting hides from a scrollbar test, and beat 013's floor
 *    test never asked;
 * 4. the statement of FR-58 is wholly inside the viewport rectangle.
 *
 * And two claims about the reference viewport, which beat 018 declares on both axes: it is at
 * or above the floor, and a horizon panel is measurably wider there (SC-002).
 */

const { presentation } = declared;

/** Generous on both axes: what the panes cost is being measured, not their squeeze. */
const ROOMY = { width: 2600, height: 1500 };

interface Measured {
  readonly viewport: { width: number; height: number };
  /** What the flanking panes and the sashes take, leaving the rest to the horizons pane. */
  readonly widthTheFlanksCost: number;
  /** What the status strip and the tab strips take, leaving the rest to the panes. */
  readonly heightTheChromeCost: number;
  /**
   * What the controls pane's own content needs.
   *
   * The controls pane and not the tallest pane, and the distinction matters. The horizons pane
   * *fills* whatever height it is given -- the skill curve takes the band the row does not --
   * so measuring its content would measure the window and call it a requirement. The controls
   * pane is a fixed set of controls that do not shrink, so its height is a genuine floor, and
   * it is the binding one: it is the pane at its narrowest at the floor's width, so its labels
   * wrap most there.
   */
  readonly controlsContentHeight: number;
  readonly panelWidths: readonly number[];
  /** FR-045: what the row is given, and what the aid to reading it is given. */
  readonly panelHeight: number;
  readonly skillCurveHeight: number;
  readonly horizonsPaneHeight: number;
  /** The status strip, which is where the advance's confirmation is drawn (the seventh pass). */
  readonly stripHeight: number;
  readonly clipped: readonly string[];
  readonly page: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number };
  readonly statementInside: boolean;
}

async function measure(page: Page, leads: readonly number[]): Promise<Measured> {
  return page.evaluate((horizons) => {
    const root = document.documentElement;
    const horizonsPane = document.querySelector<HTMLElement>('[data-pane-id="horizons"]');
    if (horizonsPane === null) throw new Error('there is no horizons pane to measure');
    const statement = document.querySelector<HTMLElement>('[data-testid="not-operational"]');
    const rect = statement?.getBoundingClientRect() ?? null;

    const painted = (element: Element, stopAt: Element): boolean => {
      if (element.closest('details:not([open])') !== null && element.tagName !== 'SUMMARY') return false;
      for (let at: Element | null = element; at !== null && at !== stopAt; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.clipPath !== 'none' || style.visibility === 'hidden' || style.display === 'none') {
          return false;
        }
      }
      return true;
    };

    const clipped: string[] = [];
    let controlsContentHeight = 0;
    for (const pane of Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]'))) {
      const box = pane.getBoundingClientRect();
      let bottom = box.top;
      let right = box.left;
      for (const element of Array.from(pane.querySelectorAll<HTMLElement>('*'))) {
        if (element.closest('[data-scrolls="list"], [data-help], [data-walkthrough]') !== null) continue;
        if (!painted(element, pane)) continue;
        const child = element.getBoundingClientRect();
        if (child.width === 0 || child.height === 0) continue;
        bottom = Math.max(bottom, child.bottom);
        right = Math.max(right, child.right);
      }
      if (pane.dataset['paneId'] === 'controls') {
        /* The pane's own bottom padding is part of what the pane needs, and beat 018's fifth
           pass is where that was noticed: the floor was measured to the last control's bottom
           edge, so the declared height was 8 px short of the pane's content box and at the
           floor the last control sat flush against the pane's rule. The census in `census.ts`
           reports it as what it is -- `scrollHeight` 656 in a `clientHeight` of 648 -- because
           it asks the box rather than the children. */
        controlsContentHeight = Math.ceil(
          bottom - box.top + parseFloat(getComputedStyle(pane).paddingBottom),
        );
      }
      if (bottom - box.bottom > 1 || right - box.right > 1) {
        clipped.push(
          `${pane.dataset['paneId'] ?? '(unnamed)'} by ${String(Math.round(bottom - box.bottom))} px ` +
            `below and ${String(Math.round(right - box.right))} px right`,
        );
      }
    }

    return {
      viewport: { width: root.clientWidth, height: root.clientHeight },
      widthTheFlanksCost: root.clientWidth - horizonsPane.clientWidth,
      heightTheChromeCost: root.clientHeight - horizonsPane.clientHeight,
      controlsContentHeight,
      panelWidths: horizons.map((lead) => {
        const panel = document.querySelector<HTMLElement>(`[data-testid="panel-${String(lead)}"]`);
        return panel === null ? 0 : panel.getBoundingClientRect().width;
      }),
      panelHeight:
        document
          .querySelector<HTMLElement>(`[data-testid="panel-${String(horizons[0] ?? 0)}"]`)
          ?.getBoundingClientRect().height ?? 0,
      skillCurveHeight:
        document.querySelector<HTMLElement>('[data-testid="skill-curve"]')?.getBoundingClientRect()
          .height ?? 0,
      horizonsPaneHeight: horizonsPane.clientHeight,
      stripHeight:
        document.querySelector<HTMLElement>('[data-testid="pane-status"]')?.getBoundingClientRect()
          .height ?? 0,
      clipped,
      page: {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      },
      statementInside: rect !== null && rect.top >= -0.5 && rect.bottom <= root.clientHeight + 0.5,
    };
  }, [...leads]);
}

/**
 * Twelve hours integrated, by the path a reader takes: press, be refused on the frame budget,
 * press *Integrate anyway*.
 *
 * The floor is measured after this and not before, because the surface after an advance is a
 * surface with two things on it that were not there before: the run's own step time in the
 * status strip, and the confirmation that the advance finished (the author's request). A floor
 * measured only in the state before a reader has pressed anything is a floor for a surface
 * nobody has used.
 */
async function advanced(page: Page): Promise<void> {
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('over-budget')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('proceed-anyway').click();
  await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 120_000 });
  await expect(page.getByTestId('surface-report')).toContainText('Integrated');
}

/** The recorded case, with the row built and scored: the fullest the workspace ever is. */
async function scoredRow(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('pane-controls')).toBeVisible();
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 120_000 });
}

test.describe('the viewport floor', () => {
  test('is measured from the built workspace, and is what configuration declares', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(ROOMY);
    await scoredRow(page);

    /*
     * What the workspace cannot give the row: the two flanking panes at the width below which
     * they cannot be read, and the sashes between them. Measured at the floor's own width,
     * because that is where the flanking panes are at their minimum -- at a roomy viewport
     * they are at their declared widths, which is a different figure and not the floor's.
     */
    const measuredWidth =
      2 * presentation.workspace.paneMinimumWidthPx +
      2 * presentation.workspace.sashWidthPx +
      ROW_WIDTH_PX;

    /*
     * Loaded fresh at the floor's width rather than resized to it, and the difference is the
     * whole measurement: the arrangement a reader leaves is the arrangement they return to, so
     * a window dragged narrower keeps the proportions it had. What the floor is about is the
     * workspace *opening* into a window that small, where the flanking panes are at the width
     * below which they cannot be read and the controls pane's labels wrap most.
     */
    await page.setViewportSize({ width: measuredWidth, height: ROOMY.height });
    await page.goto('/');
    await page.evaluate(() => { window.localStorage.clear(); });
    await page.reload();
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 120_000 });
    const beforeTheAdvance = await measure(page, LEADS);
    await advanced(page);
    const atWidth = await measure(page, LEADS);
    expect(
      atWidth.widthTheFlanksCost,
      'the flanking panes did not shrink to their declared minimum at the floor width, so the ' +
        'floor is not the width the workspace needs',
    ).toBeLessThanOrEqual(2 * presentation.workspace.paneMinimumWidthPx + 2 * presentation.workspace.sashWidthPx + 1);

    // The height is measured at the floor's own width and not at a roomy one: the controls
    // pane is at its narrowest there, so its labels wrap most and it is at its tallest.
    const measuredHeight = atWidth.heightTheChromeCost + atWidth.controlsContentHeight;

    console.log(
      `    measured floor: ${String(measuredWidth)} x ${String(measuredHeight)} CSS px\n` +
        `      the flanking panes cost ${String(Math.round(atWidth.widthTheFlanksCost))} px of width ` +
        `(2 x ${String(presentation.workspace.paneMinimumWidthPx)} at their minimum, ` +
        `2 x ${String(presentation.workspace.sashWidthPx)} sashes)\n` +
        `      the row needs ${String(ROW_WIDTH_PX)} px: ${String(LEADS.length)} x ` +
        `${String(presentation.minimumPanelWidthPx)} px panels, ${String(LEADS.length - 1)} x ` +
        `${String(presentation.panelGapPx)} px gaps and ${String(presentation.pageGutterPx)} px of pane padding\n` +
        `      the workspace's chrome costs ${String(Math.round(atWidth.heightTheChromeCost))} px of height, ` +
        `and the controls pane's own content is ${String(atWidth.controlsContentHeight)} px at that width\n` +
        `      the status strip is ${String(Math.round(beforeTheAdvance.stripHeight))} px before the ` +
        `advance and ${String(Math.round(atWidth.stripHeight))} px with its confirmation on screen, ` +
        `and the controls pane was ${String(beforeTheAdvance.controlsContentHeight)} px before it\n` +
        `      declared: ${String(presentation.minimumViewportWidthPx)} x ` +
        `${String(presentation.minimumViewportHeightPx)}\n` +
        `      beat 013 declared 2038 x 728, of which 828 px of width was chrome that could not shrink`,
    );

    expect(
      presentation.minimumViewportWidthPx,
      'presentation.minimumViewportWidthPx is not the width the built workspace needs',
    ).toBe(measuredWidth);

    // The height carries a tolerance the width does not, and for a stated reason rather than
    // to make a test pass: the row's width is a sum of declared boxes and is the same figure
    // on any machine, while the controls pane's height ends at the last line of a wrapped
    // control label, in whatever font the host has.
    const HEIGHT_TOLERANCE_PX = 24;
    expect(
      presentation.minimumViewportHeightPx,
      `presentation.minimumViewportHeightPx does not hold the built workspace, which needs ${String(measuredHeight)} px`,
    ).toBeGreaterThanOrEqual(measuredHeight);
    expect(
      presentation.minimumViewportHeightPx,
      `presentation.minimumViewportHeightPx is more than a wrapped label above the ${String(measuredHeight)} px the built workspace needs`,
    ).toBeLessThanOrEqual(measuredHeight + HEIGHT_TOLERANCE_PX);
  });

  test('holds every pane at exactly the declared floor, with nothing clipped', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(FLOOR);

    // Before the row is built the horizons pane carries FR-048's statement and the analysed
    // field at the size the pane gives it, and that has to fit the floor too.
    await page.goto('/');
    await expect(page.getByTestId('row-invitation')).toBeVisible();
    const unbuilt = await measure(page, []);
    expect(unbuilt.clipped, 'a pane clips its content at the declared floor, unbuilt').toEqual([]);

    await scoredRow(page);
    await advanced(page);
    const at = await measure(page, LEADS);

    expect(at.page.scrollWidth, 'the page scrolls horizontally at the declared floor').toBeLessThanOrEqual(
      at.page.clientWidth,
    );
    expect(at.page.scrollHeight, 'the page scrolls vertically at the declared floor').toBeLessThanOrEqual(
      at.page.clientHeight,
    );
    expect(at.statementInside, 'FR-58’s statement is not wholly on screen at the floor').toBe(true);
    expect(at.clipped, 'a pane clips its content at the declared floor').toEqual([]);

    for (const [index, width] of at.panelWidths.entries()) {
      expect(
        width,
        `the panel for +${String(LEADS[index])} h is ${String(width)} px, below the declared minimum`,
      ).toBeGreaterThanOrEqual(presentation.minimumPanelWidthPx - 0.5);
    }

    // Tight, which is what makes it a floor rather than a comfortable number: one pixel of
    // width takes a panel below its declared minimum.
    const widest = Math.max(...at.panelWidths);
    expect(
      widest,
      `a panel is ${String(widest)} px wide at the floor, so the floor is wider than it needs to be`,
    ).toBeLessThan(presentation.minimumPanelWidthPx + 6);
  });

  /**
   * FR-011 and SC-002. The reference viewport is declared on both axes now, and it is where
   * the workspace is designed, measured and photographed. Two things are asserted about it:
   * it is a window the workspace lays out in, and the panes take the space it gives them.
   */
  test('lays the workspace out at the declared reference viewport, panes filling it', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(REFERENCE);
    await scoredRow(page);
    const at = await measure(page, LEADS);

    await expect(page.getByTestId('one-view')).toHaveAttribute('data-presentation', 'workspace');
    expect(at.clipped, 'a pane clips its content at the reference viewport').toEqual([]);
    for (const [index, width] of at.panelWidths.entries()) {
      expect(
        width,
        `the panel for +${String(LEADS[index])} h is only ${String(Math.round(width))} px at the ` +
          'reference viewport, which is the declared minimum: the panes are not taking the ' +
          'space they are given (SC-002)',
      ).toBeGreaterThan(presentation.minimumPanelWidthPx + 1);
    }
    console.log(
      `    at the reference viewport of ${String(REFERENCE.width)} x ${String(REFERENCE.height)}, ` +
        `a horizon panel is ${String(Math.round(at.panelWidths[0] ?? 0))} px against a declared ` +
        `minimum of ${String(presentation.minimumPanelWidthPx)} px`,
    );
  });

  /**
   * FR-045. The row is the payload and takes the dominant space; the curve is an aid to
   * reading the figures the panels already carry.
   *
   * Beat 018's first pass gave the curve whatever the row left, and at the reference viewport
   * that was **694 px of a 1 359 px pane** for six points, against 561 px for the six panels
   * the pane exists to show. A chart taller than the instrument it annotates is the dead space
   * of beat 017 filled rather than used, so the share the curve may take is declared and this
   * is what holds it: measured on the two rectangles, at the viewport the workspace is
   * designed for.
   */
  test('gives the row more of the horizons pane than the curve beneath it', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(REFERENCE);
    await scoredRow(page);
    const at = await measure(page, LEADS);

    expect(at.skillCurveHeight, 'the skill curve is not drawn, so there is nothing to hold').toBeGreaterThan(0);
    expect(
      at.skillCurveHeight,
      'the skill curve takes more of the horizons pane than ' +
        `${String(presentation.workspace.skillCurveFraction)} of it, which is the declared share`,
    ).toBeLessThanOrEqual(at.horizonsPaneHeight * presentation.workspace.skillCurveFraction + 1);
    expect(
      at.panelHeight,
      `a horizon panel is ${String(Math.round(at.panelHeight))} px tall and the skill curve ` +
        `beneath the row is ${String(Math.round(at.skillCurveHeight))} px. FR-045 makes the row ` +
        'the payload and gives it the dominant space; a curve taller than the panels it plots ' +
        'is an aid to reading that has taken the room from the thing being read',
    ).toBeGreaterThan(at.skillCurveHeight);

    console.log(
      `    at the reference viewport a horizon panel is ${String(Math.round(at.panelHeight))} px ` +
        `tall and the skill curve is ${String(Math.round(at.skillCurveHeight))} px, in a ` +
        `${String(Math.round(at.horizonsPaneHeight))} px pane`,
    );
  });

  /**
   * FR-043 and FR-013, rebuilt (spec 018 US6, T072).
   *
   * Beat 013's answer below the floor was a presentation of its own — every pane stacked in
   * one column with a scrollbar down the side — and beat 018's first pass carried it through
   * unchanged while raising the declared floor to 960 px tall. No browser window is 960 px
   * tall, so that column was what **every** reader met: 6,584 px of it in a 560 px box.
   *
   * It is deleted rather than shortened. What a small window is short of is width — six panels
   * at `minimumPanelWidthPx` need `minimumViewportWidthPx` between them — so below that the
   * workspace is still the workspace and the centre carries one horizon with the strip
   * carrying the other five. Height is not what makes a row of six unreadable, and the query
   * that decides this is a width query for that reason.
   */
  test.describe('below the width the row needs', () => {
    test('says the size it needs, as a declared width and in one line', async ({ page }) => {
      await page.setViewportSize({ width: BELOW_THE_ROW.width, height: BELOW_THE_ROW.height });
      await page.goto('/');
      const notice = page.getByTestId('viewport-floor-notice');
      await expect(notice).toBeVisible();

      // The required size is a *declared* figure, in the kind the surface draws declared
      // figures in (Principle V), and it is a **width**: that is the figure the row is short
      // of, and a height in that line would be naming the wrong shortage.
      const size = notice.locator('.figure.declared', {
        hasText: `${String(presentation.minimumViewportWidthPx)} px`,
      });
      await expect(size).toHaveCount(1);

      // It is the workspace, and it is in the pane it is about, rather than a banner over the
      // whole surface: the pane holding one horizon is the pane that is short of width.
      await expect(page.getByTestId('one-view')).toHaveAttribute('data-presentation', 'workspace');
      await expect(page.getByTestId('pane-horizons').getByTestId('viewport-floor-notice')).toHaveCount(1);

      // And it is a line rather than an argument: the two paragraphs went to the walkthrough.
      const words = await notice.evaluate((element) => {
        const clone = element.cloneNode(true) as HTMLElement;
        for (const figure of clone.querySelectorAll('.figure')) figure.remove();
        return (clone.textContent ?? '').trim().split(/\s+/).filter((word) => word !== '').length;
      });
      expect(
        words,
        'the below-the-floor notice is explaining again; the explanation belongs to the ' +
          'walkthrough (spec 018 FR-007)',
      ).toBeLessThanOrEqual(12);

      // FR-58 is still the first thing on the surface, and still outside every scroller.
      await expect(page.getByTestId('not-operational')).toBeVisible();
    });

    test('offers one horizon and the strip, in the workspace', async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: BELOW_THE_ROW.width, height: BELOW_THE_ROW.height });
      await scoredRowBelowTheRow(page);

      // FR-049 and FR-050: one panel, and the strip carrying all six with what each was worth.
      await expect(page.getByTestId('enlarged-centre')).toBeVisible();
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

      // It is the workspace and not a column: the dock is here, the panes are panes, and the
      // provenance is still four tabs rather than four sections one under another.
      await expect(page.getByTestId('workspace-dock')).toBeVisible();
      await expect(page.getByTestId('below-floor-body')).toHaveCount(0);
      await expect(page.getByTestId('pane-controls').getByTestId('build-row')).toHaveCount(0);
      await expect(page.getByTestId('pane-controls').getByTestId('new-run')).toHaveCount(1);
      await expect(page.getByTestId('pane-selection')).toBeVisible();
      await expect(page.getByTestId('pane-provenance/run')).toBeVisible();

      // And the page still does not scroll: the answer below the floor is an answer, not a
      // smaller mess, and never the page this beat exists to kill.
      const scroll = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      }));
      expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
      expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.clientHeight);
    });

    test('swaps what the centre holds as the window crosses the width, without a reload', async ({
      page,
    }) => {
      await page.setViewportSize({ width: BELOW_THE_ROW.width, height: BELOW_THE_ROW.height });
      await page.goto('/');
      await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();

      // A witness that survives only if the document does: crossing the floor must be a
      // change of what the centre holds and not a fresh load, or every run and every edit is
      // lost whenever somebody drags a window edge.
      await page.evaluate(() => {
        (window as unknown as { __notReloaded?: boolean }).__notReloaded = true;
      });

      await page.setViewportSize(FLOOR);
      await expect(page.getByTestId('viewport-floor-notice')).toHaveCount(0);
      await expect(page.getByTestId('pane-horizons')).toBeVisible();
      await expect(page.getByTestId('row-invitation')).toBeVisible();

      await page.setViewportSize({ width: FLOOR.width - 1, height: FLOOR.height });
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
     * that makes the edge case come out right: the **unit**.
     */
    test.describe('at half a device pixel per CSS pixel', () => {
      test.use({ viewport: FLOOR, deviceScaleFactor: 0.5 });

      test('answers in CSS pixels and not in device ones', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('pane-horizons')).toBeVisible();
        expect(await page.evaluate(() => window.devicePixelRatio)).toBe(0.5);
        await expect(page.getByTestId('viewport-floor-notice')).toHaveCount(0);
        await expect(page.getByTestId('row-invitation')).toBeVisible();
      });
    });
  });
});

/** The recorded case scored, below the width the row needs: one panel and a strip. */
async function scoredRowBelowTheRow(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('enlarged-centre')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId(`panel-score-${String(LEADS[0])}`)).toContainText('persistence', {
    timeout: 120_000,
  });
}
