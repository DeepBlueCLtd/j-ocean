import { expect, test, type Page } from '@playwright/test';
import { holdsOneView, selectTab } from './census.js';
import { declared, LEADS, VIEWPORT_MATRIX } from './declared-geometry.js';

/**
 * The workspace, at the sizes a reader's browser actually has (spec 018 US6, FR-012, FR-013,
 * SC-008, SC-009).
 *
 * ## The test that would have caught it
 *
 * Beat 018's first pass measured the workspace at 2 560 x 1 440 and 1 920 x 1 080, declared a
 * minimum of 1 658 x 960 and was green. A browser window is never 960 px tall on a 1080-tall
 * screen -- the browser's own chrome takes the rest -- so **every ordinary window fell below
 * the floor**, and what was down there was a column of every pane stacked and scrolled: 6,584
 * px of it in a 560 px box at 1 920 x 900, longer than the 5,757 px page SRD-v2 was written to
 * kill. Two tests passed over it. `one-view.spec.ts` asked its census at the declared floor
 * and at one window below it, and the census called the column "a list -- the panes, one under
 * another", which stacking a whole application vertically is not.
 *
 * So the sizes are a **declared list** in `declared-geometry.ts` and this file walks it. Each
 * viewport asserts the same four things, in the same code the floor is asserted in:
 *
 * 1. it is the **workspace** -- panes with headers -- and never a presentation of its own;
 * 2. the row **builds and scores** there, and every declared horizon is on the surface;
 * 3. the **document does not scroll**, on either axis;
 * 4. nothing scrolls but a **declared list**, and nothing is clipped.
 *
 * ## What differs between the viewports, and what does not
 *
 * The layout does not: it is the same workspace at 1 366 px as at 2 560. What the centre holds
 * does: six panels at `minimumPanelWidthPx` need `minimumViewportWidthPx` of width, so below
 * that the centre carries one horizon and the strip carries the other five. That is a
 * statement about **width**. A short window is short of height, and height is not what makes a
 * row of six panels unreadable.
 */

const { presentation } = declared;

/** Whether this viewport has the width the row needs. Read from configuration, not chosen. */
function hasTheRow(width: number): boolean {
  return width >= presentation.minimumViewportWidthPx;
}

/** The recorded case, built and scored, at whatever this viewport's centre holds. */
async function buildAndScore(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => { window.localStorage.clear(); });
  await page.reload();
  await expect(page.getByTestId('pane-controls')).toBeVisible();
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('centre-ledger')).toHaveAttribute('data-centre-content', /row|enlarged/, {
    timeout: 120_000,
  });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId(`panel-score-${String(LEADS[0])}`)).toContainText('persistence', {
    timeout: 120_000,
  });
}

test.describe('the workspace, at every viewport a reader has', () => {
  for (const viewport of VIEWPORT_MATRIX) {
    const size = `${String(viewport.width)} x ${String(viewport.height)}`;

    test(`is the workspace at ${size}, and scrolls nothing but a list`, async ({ page }) => {
      test.setTimeout(420_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      let tallest = 0;
      const census = async (state: string): Promise<void> => {
        tallest = Math.max(tallest, await holdsOneView(page, `${size}, ${state}`));
      };

      await page.goto('/');
      await page.evaluate(() => { window.localStorage.clear(); });
      await page.reload();
      await expect(page.getByTestId('pane-controls')).toBeVisible();

      // 1. The workspace, and not an arrangement of its own. `pane-status` is outside the dock
      //    and `workspace-dock` is the dock itself, so both together say it is this layout.
      await expect(page.getByTestId('one-view')).toHaveAttribute('data-presentation', 'workspace');
      await expect(page.getByTestId('workspace-dock')).toBeVisible();
      await expect(page.getByTestId('pane-status')).toBeVisible();
      for (const pane of ['controls', 'horizons', 'selection']) {
        await expect(page.getByTestId(`pane-${pane}`)).toBeVisible();
      }
      // And nothing that was the stacked column, which is the thing this beat deleted.
      await expect(page.getByTestId('below-floor-body')).toHaveCount(0);
      await expect(page.getByTestId('pane-floor')).toHaveCount(0);

      await census('loaded');

      // 2. The row builds and scores. Where the window has not the width for six panels the
      //    centre carries one and the strip carries the rest -- which is a different centre
      //    and the same run, so every declared horizon is still on the surface with its score.
      await buildAndScore(page);
      await census('scored');

      if (hasTheRow(viewport.width)) {
        await expect(page.getByTestId('horizon-row')).toBeVisible();
        await expect(page.getByTestId('viewport-floor-notice')).toHaveCount(0);
        for (const lead of LEADS) {
          await expect(page.getByTestId(`panel-${String(lead)}`)).toHaveCount(1);
          await expect(page.getByTestId(`panel-score-${String(lead)}`)).toContainText('persistence');
        }
      } else {
        await expect(page.getByTestId('enlarged-centre')).toBeVisible();
        await expect(page.getByTestId('horizon-row')).toHaveCount(0);
        // The line that says what it is short of, and it says a width (US6, scenario 4).
        const notice = page.getByTestId('viewport-floor-notice');
        await expect(notice).toBeVisible();
        await expect(
          notice.locator('.figure.declared', {
            hasText: `${String(presentation.minimumViewportWidthPx)} px`,
          }),
        ).toHaveCount(1);
        for (const lead of LEADS) {
          await expect(page.getByTestId(`strip-${String(lead)}`)).toHaveCount(1);
        }
      }

      // 3. A selection, which is where FR-047 says nothing may move, and every provenance tab,
      //    because a tab nobody has selected is a pane nobody has measured.
      // The same panel either way: the centre holds the first declared horizon whether it is
      // one of six in the row or the one the strip has enlarged.
      await page
        .getByTestId(`panel-field-${String(LEADS[0])}-overlay`)
        .click({ position: { x: 40, y: 40 } });
      await expect(page.getByTestId('cell-breakdown')).toBeVisible();
      await census('a cell selected');

      for (const tab of ['Instruments', 'Truth record', 'Manifest']) {
        await selectTab(page, tab);
        await census(`the ${tab} tab`);
      }

      // SC-008: the figure, printed rather than asserted. What scrolls at any of these sizes
      // is a term list in a provenance tab and the manifest, and both are lists a reader scans.
      console.log(
        `    ${size}: the tallest scroll of any element in any state is ${String(tallest)} px, ` +
          `and it is a declared list. The centre holds ${
            hasTheRow(viewport.width) ? 'the row' : 'one horizon and the strip'
          }.`,
      );
    });
  }

  /**
   * SC-009, read off the file rather than off the surface: the declared minimum height is
   * below the shortest viewport in the matrix. It is the arithmetic the first pass got wrong
   * -- 960 against a shortest of 768 -- and it costs nothing to ask.
   */
  test('declares a minimum height below the shortest viewport in the matrix', () => {
    const shortest = Math.min(...VIEWPORT_MATRIX.map((one) => one.height));
    expect(
      presentation.minimumViewportHeightPx,
      `presentation.minimumViewportHeightPx is ${String(presentation.minimumViewportHeightPx)} ` +
        `and the shortest viewport in the matrix is ${String(shortest)}: a floor no browser ` +
        'window reaches puts every reader below it',
    ).toBeLessThan(shortest);
  });
});
