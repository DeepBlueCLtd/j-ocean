import { expect, test, type Page } from '@playwright/test';
import { EXEMPT, holdsOneView, selectTab, unreviewableExemptions } from './census.js';
import { BELOW_THE_ROW, declared, FLOOR, LEADS, PANE_IDS, REFERENCE } from './declared-geometry.js';

/**
 * One view, and what a pane may scroll (spec 018 SC-001, FR-002; SRD-v2 §8.1, FR-41, AT-11).
 *
 * ## What replaced beat 013's test, and why
 *
 * Beat 013 asserted that the page did not scroll and that every element which *did* scroll
 * carried `data-scrolls`. It passed on every beat from 013 to 017, while the controls column
 * was a **1,344 px scroller in a 1,440 px window** — the six-screen page of SRD-v2 §1.1,
 * folded sideways and stamped legitimate. The test proved the scrollers were *intended*. It
 * said nothing at all about whether the content should have fitted.
 *
 * That is beat 007's finding for the third time: a test that asserts the easy property in
 * place of the claim will pass while the claim is false. "No undeclared scrollbar" is easy.
 * "The content fits, and where it does not it is a list and not an argument" is the claim.
 *
 * So the census in `census.ts` asserts these instead:
 *
 * 1. **the page does not scroll**, on either axis, in every state it can reach;
 * 2. **everything that runs past its own box is one of three things** — a declared list, an
 *    exemption with a written reason, or a defect — and the failure names the pane, the
 *    element, the axis and both figures;
 * 3. **a declared list says which list**, and never holds a body of text;
 * 4. **nothing is clipped**: a pane whose content does not fit is a fault whether it scrolls
 *    or not, and `overflow: hidden` is how not-fitting hides from a scrollbar test;
 * 5. **no two pieces of text are painted on top of each other.**
 *
 * The fourth is what makes the first three mean something. A pane that clips is a pane a
 * reader cannot read all of, and it produces no scrollbar to catch.
 *
 * ## Beat 018's fifth pass, and the two it caught immediately
 *
 * The fourth pass counted only elements whose computed `overflow` was `auto` or `scroll`,
 * which is a filter on the declaration rather than on the fact. Two faults lived in that gap
 * for the whole beat: the pre-row centre's field spilled its own label 71 px onto the term
 * list beside it -- *"the Horizons panel has text overwriting other text"*, reported by the
 * author on a green tree -- and the manifest tab's two figures were cut off at every viewport
 * in the matrix. Neither element had a scrollbar to count. The fifth assertion is there for
 * the same reason: overflow and overlap are different properties, and the one a reader
 * notices first is the second.
 *
 * ## Where it is asserted
 *
 * Here, at the **declared floor**, which is where the workspace is tightest, in the deepest
 * walk of states the surface has — and, in `viewport-matrix.spec.ts`, at every viewport in the
 * declared matrix of real browser sizes.
 *
 * That second file is beat 018's second pass and it is the correction of this one. Asking the
 * census at the floor and at one window below it was not enough: the floor was declared 960 px
 * tall, no browser window is, and what every reader met instead was a column of every pane
 * stacked and scrolled 6,584 px — which this census called a list, because it had been
 * declared one. A property asserted only at the size it was designed at is a property nobody
 * has tested.
 */

const CONFIG_REQUEST = /j-ocean.*\.json$/;

/*
 * The census itself is `census.ts`, because `viewport-matrix.spec.ts` asks the same question
 * at every viewport in the declared matrix and two copies of a census can each agree with the
 * requirement and still disagree with each other. This file is where it is asked in the
 * deepest walk of states, at the declared floor, which is where the workspace is tightest.
 */

test.describe('one view, and what a pane may scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(FLOOR);
  });

  test('does not scroll the page, or a body of text, in any state it can reach', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await holdsOneView(page, 'loaded');

    // FR-048, narrowed by §8.1: before the row is built the horizons pane says what would
    // appear in it, in as few words as will do it, and the selection pane likewise.
    await expect(page.getByTestId('row-invitation')).toBeVisible();
    await expect(page.getByTestId('detail-empty')).toBeVisible();
    await holdsOneView(page, 'row-unbuilt');

    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });
    await holdsOneView(page, 'row-built');

    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 120_000 });
    await holdsOneView(page, 'scored');

    // FR-047: selecting fills the selection pane and moves nothing. The geometry of the other
    // panes is measured before and after, to the pixel.
    const before = await paneBoxes(page);
    await page.getByTestId('panel-field-24-overlay').click({ position: { x: 60, y: 60 } });
    await expect(page.getByTestId('cell-breakdown')).toBeVisible();
    expect(await paneBoxes(page)).toEqual(before);
    await holdsOneView(page, 'cell-selected');

    // Every provenance tab, because a tab nobody has selected is a pane nobody has measured --
    // and the manifest tab is the one pane on this surface that scrolls at every viewport.
    for (const tab of ['Instruments', 'Truth record', 'Manifest']) {
      await selectTab(page, tab);
      await holdsOneView(page, `the ${tab} tab`);
    }
    await expect(page.getByTestId('manifest')).toBeVisible();

    /* And the manifest tab with its paste box open, which is the state that decided how that
       tab is arranged. At the declared floor the tab is 220 px wide: the two figures, the
       document and the form together want 463 px of a 311 px pane, so the box is folded away
       and the document gives way to it while it is open. A state a reader can reach in one
       click and no census had ever visited is exactly the hole this beat is closing. */
    await page.getByTestId('manifest-import').evaluate((node) => {
      (node as HTMLDetailsElement).open = true;
    });
    await expect(page.getByTestId('manifest-input')).toBeVisible();
    await holdsOneView(page, 'the Manifest tab, with the paste box open');
  });

  /**
   * The second of the census's three outcomes, held to the bar that makes it an outcome and
   * not a threshold in disguise (spec 018 FR-002).
   *
   * A finding may be a declared list, an exemption, or a defect. The exemptions are a list in
   * `census.ts` with a written reason each, and this is what stops that list becoming the
   * place findings go to be forgotten: an entry with no reason, or with a reason too short to
   * be one, excuses nothing -- the element it names is reported as a defect -- and it is named
   * here so that whoever added it is told why it did not work.
   */
  test('gives a written reason for every exemption the census applies', () => {
    expect(EXEMPT.length, 'the census has no exemptions at all, which is not a state it has been in').toBeGreaterThan(0);
    expect(
      unreviewableExemptions(),
      'these exemptions carry no reason a reader could review, so they excuse nothing: an ' +
        'element they name is reported as a defect until somebody writes down why it is not one',
    ).toEqual([]);
  });

  /**
   * Below the width the row needs, which is the same workspace with one horizon in it.
   *
   * Beat 018's first pass asked this of a 900 x 700 window, which is not a window a reader
   * has, and of a presentation that no longer exists: a column of every pane stacked and
   * scrolled. The window is the smallest laptop in the matrix now, and what is asserted is
   * that the answer down there is **the workspace** -- the dock, the panes, the status strip
   * -- with the centre carrying one horizon and the strip carrying the other five.
   */
  test('is the same workspace below the width the row needs', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: BELOW_THE_ROW.width, height: BELOW_THE_ROW.height });
    await page.goto('/');
    await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
    await expect(page.getByTestId('one-view')).toHaveAttribute('data-presentation', 'workspace');
    await expect(page.getByTestId('workspace-dock')).toBeVisible();
    await expect(page.getByTestId('below-floor-body')).toHaveCount(0);
    await holdsOneView(page, 'below the row, unbuilt');

    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('horizon-row')).toHaveCount(0);
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId(`panel-score-${String(LEADS[0])}`)).toContainText('persistence', {
      timeout: 120_000,
    });
    await holdsOneView(page, 'below the row, scored');
  });

  /**
   * NFR-04's notice, reached the way G-05 reaches a row that disagrees with its configuration:
   * the page is served a configuration whose declared frame budget no machine can meet.
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
    await expect(page.getByTestId('pane-controls')).toBeVisible();
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

  /**
   * FR-046, realised (spec 018 T030).
   *
   * Beat 013 asserted that a score's box shared a *column* with its panel's, because the
   * scores were a separate region aligned by CSS `subgrid` and the column was the only thing
   * holding them together. The claim survives and its subject does not: a score is now inside
   * its own panel, which is what the requirement asked for and is a stronger statement than
   * the one the column test made — a box inside another box cannot be under the wrong one.
   */
  test('draws each panel’s score inside that panel, beneath its own picture', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });

    for (const lead of LEADS) {
      const inside = await page
        .getByTestId(`panel-${String(lead)}`)
        .locator(`[data-testid="panel-score-${String(lead)}"]`)
        .count();
      expect(inside, `the score for +${String(lead)} h is not inside its own panel`).toBe(1);

      const panel = await page.getByTestId(`panel-${String(lead)}`).boundingBox();
      const score = await page.getByTestId(`panel-score-${String(lead)}`).boundingBox();
      const field = await page.getByTestId(`panel-field-${String(lead)}`).boundingBox();
      expect(panel).not.toBeNull();
      expect(score).not.toBeNull();
      // Beneath its own picture, which is FR-046's actual sentence.
      expect(
        score?.y ?? 0,
        `the score for +${String(lead)} h is not beneath that panel's field`,
      ).toBeGreaterThan((field?.y ?? 0) + (field?.height ?? 0) - 1);
      expect(
        (score?.y ?? 0) + (score?.height ?? 0),
        `the score for +${String(lead)} h is outside its panel`,
      ).toBeLessThanOrEqual((panel?.y ?? 0) + (panel?.height ?? 0) + 1);
    }

    // And there is no scores region left to put one in.
    await expect(page.getByTestId('pane-scores')).toHaveCount(0);
  });

  /**
   * SC-002. Panes take the space they are given: a horizon panel is measurably wider at the
   * reference viewport than at the declared floor. Two fifths of an instrument standing empty
   * is the fault this beat exists to fix, and a fixed track is how it happened.
   */
  test('gives a horizon panel more width at the reference viewport than at the floor', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    /*
     * Two fresh loads rather than a resize, and the reason is worth stating: the arrangement a
     * reader leaves is the arrangement they return to, so a window dragged wider keeps the
     * proportions they set. What SC-002 is about is the workspace *opening* into the window it
     * is given, which is what a reader who arrives at 2 560 actually meets.
     */
    const widthOfAPanel = async (size: { width: number; height: number }): Promise<number> => {
      await page.setViewportSize(size);
      await page.goto('/');
      await page.evaluate(() => { window.localStorage.clear(); });
      await page.reload();
      await page.getByTestId('build-row').click();
      await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });
      return (await page.getByTestId(`panel-${String(LEADS[0])}`).boundingBox())?.width ?? 0;
    };

    const atFloor = await widthOfAPanel(FLOOR);
    const atReference = await widthOfAPanel(REFERENCE);

    console.log(
      `    a horizon panel is ${String(Math.round(atFloor))} px at the declared floor of ` +
        `${String(FLOOR.width)} x ${String(FLOOR.height)} and ${String(Math.round(atReference))} px ` +
        `at the reference viewport of ${String(REFERENCE.width)} x ${String(REFERENCE.height)}`,
    );
    expect(
      atFloor,
      'a horizon panel is below the declared minimum panel width at the floor',
    ).toBeGreaterThanOrEqual(declared.presentation.minimumPanelWidthPx - 0.5);
    expect(
      atReference,
      'a horizon panel is no wider at the reference viewport than at the floor, so the panes ' +
        'are not taking the space they are given (SC-002)',
    ).toBeGreaterThan(atFloor + 1);
  });

  /**
   * FR-044 and FR-006. The controls SRD-v1 names are in the controls pane and in no other:
   * issue time (FR-25), the observation and quality-control toggles (FR-31, FR-32), the bias
   * (FR-32), the domain choice (FR-11) and the track editor's entry point (FR-33). The row's
   * own display toggles are here too, because they drive all six panels at once and a control
   * that drives everything is a cause.
   */
  test('holds every control the requirements name, and the horizons pane holds none', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });

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
    const controls = page.getByTestId('pane-controls');
    const horizons = page.getByTestId('pane-horizons');
    for (const control of named) {
      await expect(
        controls.getByTestId(control),
        `${control} is not in the controls pane`,
      ).toHaveCount(1);
      await expect(
        horizons.getByTestId(control),
        `${control} is in the horizons pane, which FR-045 keeps for the row alone`,
      ).toHaveCount(0);
    }

    // FR-004's other half: a control that acts on one panel alone is at that panel.
    for (const lead of LEADS) {
      await expect(horizons.getByTestId(`enlarge-${String(lead)}`)).toHaveCount(1);
      await expect(controls.getByTestId(`enlarge-${String(lead)}`)).toHaveCount(0);
    }
  });

  /**
   * Every pane the layout declares is on the surface, and no others.
   *
   * A tab that is not showing is not in the document -- that is what a tab is -- so the walk
   * selects each provenance tab in turn. The claim is the same one beat 013 made about its
   * four regions: what the layout draws is what the layout declares, and a pane that quietly
   * stopped being rendered would be a rectangle nobody would notice the absence of.
   */
  test('is the panes the layout declares, and no others', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();

    const seen = new Set<string>();
    const record = async (): Promise<void> => {
      for (const id of await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]')).map(
          (element) => element.dataset['paneId'] ?? '',
        ),
      )) {
        seen.add(id);
      }
    };
    const TABS: readonly { readonly title: string; readonly pane: string }[] = [
      { title: 'Instruments', pane: 'provenance/instruments' },
      { title: 'Truth record', pane: 'provenance/truth' },
      { title: 'Manifest', pane: 'provenance/manifest' },
      { title: 'The run', pane: 'provenance/run' },
    ];
    await record();
    for (const tab of TABS) {
      await page.locator('.dv-tab', { hasText: tab.title }).first().click();
      // Waited for rather than assumed: a tab's pane arrives in the document when the tab is
      // shown, and a walk that recorded before it arrived would report a pane as missing.
      await expect(page.getByTestId(`pane-${tab.pane}`)).toBeVisible();
      await record();
    }

    seen.delete('status');
    expect([...seen].sort()).toEqual([...PANE_IDS].sort());
  });
});

async function paneBoxes(page: Page): Promise<Record<string, unknown>> {
  const boxes: Record<string, unknown> = {};
  for (const pane of ['controls', 'horizons', 'selection', 'status']) {
    boxes[pane] = await page.getByTestId(`pane-${pane}`).boundingBox();
  }
  return boxes;
}
