import { expect, test, type Page } from '@playwright/test';
import {
  CONFIG_REQUEST,
  holdsOneView,
  holdsOneViewWorking,
  measure,
  READER_FONTS,
  readerFontSize,
  settled,
} from './census.js';
import { VIEWPORT_MATRIX } from './declared-geometry.js';

/**
 * The reader's declared font as an axis of the census (spec 018 FR-015, FR-016, SC-011, SC-012; SRD-v2 §8.3).
 *
 * ## The defect this was written for
 *
 * The author pressed *Integrate 12 hours* and could not reach *Integrate anyway*: the notice
 * was laid out in the controls pane, and *"it's too tall for me to see the button."* The
 * mechanism is that the notice's **height** goes up with the reader's declared font while the
 * pane's **width** does not, so its paragraph wraps to more and more lines in a column that is
 * getting shorter at the same time. Measured at 950 x 875 with a 310 px controls pane, the room
 * under the control was 347 px at a 16 px root font, 225 px at 20, 39 px at 24 and gone at 28.
 *
 * Every viewport in the matrix was censused. Every state but this one was censused. Nothing had
 * ever been censused at a font size other than the one the machine running the tests happened
 * to default to -- and the surface is written in `rem` throughout, so the reader's font is the
 * one dimension of the layout that nobody had ever varied. SRD-v2's own edge cases name it:
 * *"deep browser zoom, or a large declared font."*
 *
 * ## What runs here, and why these combinations
 *
 * The full product is six viewports x three font sizes x eight states, and every state after
 * the row is built costs a minute of integration and scoring. So it is sampled, and the sample
 * is named rather than left to be inferred:
 *
 * - **16 px, every viewport, every state.** `viewport-matrix.spec.ts`, unchanged. That is the
 *   default a reader who has set nothing has, and it is where the whole state walk is paid for.
 * - **20 and 24 px, every viewport, the arrival state, the over-budget state and the row being
 *   built.** These are the three states a reader's font can reach before the row exists:
 *   arrival is what every reader sees, over-budget is the state the author's first report is
 *   about, and *Building 3 of 8* is the state the ninth pass put on the surface -- a control
 *   that relabels itself, which at half again the declared text size is exactly what outgrows
 *   a row. All three are cheap, so all three run at every viewport rather than at a sampled
 *   few. The *scoring* and *re-issuing* states are not here: both need the row built, and the
 *   paragraph below is why that is a different question.
 *
 * **What this sample leaves out, said plainly.** With the row built and scored, this surface
 * does not hold at 20 px or 24 px: measured at 1920 x 900 and a 24 px root font, the controls
 * pane's content runs 308 px below the pane and the horizons pane's 132 px below its own, with
 * 34 elements past their boxes, 16 pairs of text painted on top of each other and 30 controls
 * and figures painted outside what clips them -- among them *Integrate 12 hours*, *New run* and
 * *Re-issue*. That is a finding of this pass and not a fault it introduced: it is the same
 * class of defect as the one repaired here, three panes wide, and it is a beat of its own. What
 * is different now is that there is an instrument that sees it and a spec entry that names it,
 * rather than a surface nobody had measured.
 */

/** A frame budget no machine can meet, so the decision is the state under test. */
async function refuseTheBudget(page: Page): Promise<void> {
  await page.route(CONFIG_REQUEST, async (route) => {
    const response = await route.fetch();
    const config = JSON.parse(await response.text()) as { budget: { frameBudgetMs: number } };
    config.budget.frameBudgetMs = 0.000_001;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(config),
    });
  });
}

/** Every pane's rectangle, as one string, so "nothing moved" is one comparison. */
async function paneGeometry(page: Page): Promise<string> {
  await settled(page);
  return page.evaluate(() =>
    JSON.stringify(
      Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]')).map((pane) => {
        const box = pane.getBoundingClientRect();
        return [pane.dataset['paneId'], box.x, box.y, box.width, box.height];
      }),
    ),
  );
}

test.describe('the workspace, at the font sizes a reader declares', () => {
  for (const viewport of VIEWPORT_MATRIX) {
    for (const rootFont of READER_FONTS) {
      const where = `${String(viewport.width)} x ${String(viewport.height)} at ${String(rootFont)} px`;

      test(`holds the census on arrival and over budget at ${where}`, async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize(viewport);
        await readerFontSize(page, rootFont);
        await refuseTheBudget(page);

        await page.goto('/');
        await expect(page.getByTestId('pane-controls')).toBeVisible();
        // The mechanism, asserted rather than assumed: a test that silently failed to change
        // the reader's font would census the default three more times and report six passes.
        expect(
          await page.evaluate(() => getComputedStyle(document.documentElement).fontSize),
          'the reader’s declared font size did not reach the page',
        ).toBe(`${String(rootFont)}px`);
        await holdsOneView(page, `${where}, on arrival`);

        await page.getByTestId('advance').click();
        await expect(page.getByTestId('over-budget')).toBeVisible({ timeout: 60_000 });
        /* Let the arrangement stop moving first, for the reason `selectTab` does: the layout
           manager sizes its panes asynchronously, and the run's first measured figures reach
           the status strip in the same commit that opens this decision. A census taken in that
           task measures a dock the layout manager has not answered about yet. */
        await settled(page);
        await holdsOneView(page, `${where}, over budget`);

        const window = page.viewportSize();
        for (const control of ['proceed-anyway', 'stop-here']) {
          const box = await page.getByTestId(control).boundingBox();
          expect(box, `${control} has no box`).not.toBeNull();
          expect(box?.y ?? -1, `${control} is above the window`).toBeGreaterThanOrEqual(0);
          expect(box?.x ?? -1, `${control} is left of the window`).toBeGreaterThanOrEqual(0);
          expect(
            (box?.y ?? 0) + (box?.height ?? 0),
            `${control} is painted below the foot of the window at ${where}`,
          ).toBeLessThanOrEqual(window?.height ?? 0);
          expect(
            (box?.x ?? 0) + (box?.width ?? 0),
            `${control} is painted past the right of the window at ${where}`,
          ).toBeLessThanOrEqual(window?.width ?? 0);
        }

        /*
         * Neither figure is truncated. Ellipsis is invisible to a text comparison -- the words
         * are still in the DOM -- so it is asked of the boxes: a figure whose content is wider
         * than the box it is painted in has lost its end, and a truncated figure is a figure
         * without its provenance (Principle V). The step time was ellipsised on this very
         * notice two passes ago, and what fell off was the word that said whether the budget
         * was met.
         */
        const figures = await page.evaluate(() => {
          const dialog = document.querySelector<HTMLElement>('[data-testid="over-budget"]');
          const box = dialog?.getBoundingClientRect();
          return Array.from(
            document.querySelectorAll<HTMLElement>('[data-testid="over-budget-figures"] .figure'),
          ).map((one) => {
            const rect = one.getBoundingClientRect();
            let cut = '';
            for (let at: HTMLElement | null = one; at !== null && at !== dialog; at = at.parentElement) {
              const style = getComputedStyle(at);
              if (style.textOverflow === 'ellipsis') cut = 'ellipsised';
              if (style.overflowX !== 'visible' && at.scrollWidth - at.clientWidth > 1) {
                cut = 'wider than a box that hides the rest';
              }
            }
            if (
              box !== undefined &&
              (rect.left < box.left - 1 ||
                rect.right > box.right + 1 ||
                rect.top < box.top - 1 ||
                rect.bottom > box.bottom + 1)
            ) {
              cut = 'painted outside the dialog';
            }
            return { text: (one.textContent ?? '').trim(), cut };
          });
        });
        /* Three readouts, each with its own label, and every figure in them uncut. The count
           is of `.figure` spans and not of readouts, because a label carries figures of its
           own: each projection names the hours and the steps it is the cost of, which is what
           makes the two of them tellable apart (Principle V, and the ninth pass's defect). */
        for (const readout of ['projected-advance', 'projected-row', 'declared-budget']) {
          await expect(
            page.getByTestId(readout),
            `the decision does not print ${readout} at ${where}`,
          ).toBeVisible();
        }
        expect(
          figures.length,
          'the decision does not print every figure it is between, with its provenance',
        ).toBe(7);
        expect(
          figures.filter((one) => one.cut !== '').map((one) => `${one.text}: ${one.cut}`),
          `a figure in the over-budget decision is cut off at ${where}`,
        ).toEqual([]);

        /*
         * It moves no pane. Measured across the **close** and not across the open, because the
         * advance's own first chunk changes what the run's figures say and the status strip is
         * sized from them: comparing across the open would be comparing the surface before an
         * advance with the surface after one, and calling the difference the dialog's doing.
         * What is asserted is the dialog alone -- it is in the top layer, so the workspace it
         * is drawn over is exactly where it was when the dialog goes away.
         */
        const withItOpen = await paneGeometry(page);
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('over-budget')).toHaveCount(0);
        expect(
          await paneGeometry(page),
          `the over-budget decision moved a pane at ${where}`,
        ).toBe(withItOpen);

        /*
         * A third state, and it is the ninth pass's: *Build the horizon row* relabels itself
         * *Building 3 of 8* while it works, and a relabelled control at half again the
         * declared text size is exactly the thing that outgrows its row. It is censused here
         * and the two after it are not, and the reason is the sample this file already names:
         * this state is the arrival state with one control saying something else, and it is
         * reached before the row exists. *Scoring* and *Re-issuing* are states of a surface
         * with the row built, and with the row built this surface does not hold at 20 or 24 px
         * -- the finding recorded in the plan and in the header above. Censusing them here
         * would fail on that and not on anything this pass did.
         */
        await holdsOneViewWorking(
          page,
          where,
          'build-row',
          'building the horizon row',
        );
      });
    }
  }

  /**
   * Past the size that broke it, at the tightest window in the matrix.
   *
   * 28 px is where the notice's own control went below the foot of the controls pane -- 183 px
   * below it at 950 x 875, behind an ancestor with `overflow: hidden`. The whole surface does
   * not hold there and this does not pretend otherwise: what is asserted is the dialog and the
   * two things a reader can do with it, through the same clip census, restricted to the
   * decision itself.
   */
  test('keeps the decision’s own controls reachable at a font that broke the pane', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const smallest = VIEWPORT_MATRIX[0] as { width: number; height: number };
    await page.setViewportSize(smallest);
    await readerFontSize(page, 28);
    await refuseTheBudget(page);
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('over-budget')).toBeVisible({ timeout: 60_000 });

    const measured = await measure(page);
    const decision = measured.outside.filter(
      (one) => one.what.includes('proceed-anyway') || one.what.includes('stop-here'),
    );
    console.log(
      `    the decision’s controls at 28 px: ${
        decision
          .map((one) => `${one.what} ${String(Math.round(one.visible * 100))}% [${one.verdict}]`)
          .join(' | ') || 'wholly inside every box that clips them'
      }`,
    );
    expect(
      decision.map(
        (one) =>
          `${one.what} is ${String(Math.round((1 - one.visible) * 100))}% outside ${one.clippedBy}`,
      ),
      'a control of the over-budget decision is painted outside the box that clips it',
    ).toEqual([]);
    await expect(page.getByTestId('proceed-anyway')).toBeVisible();
    await expect(page.getByTestId('stop-here')).toBeVisible();
  });
});
