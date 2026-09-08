import { expect, test, type Page } from '@playwright/test';
import { declared, FLOOR, LEADS, PANE_IDS, REFERENCE } from './declared-geometry.js';

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
 * So this file asserts three things instead, and the second and third are new:
 *
 * 1. **the page does not scroll**, on either axis, in every state it can reach;
 * 2. **every scroller is a list**, and says which list — a profile's levels, a manifest, the
 *    run's own figures — and the failure names the pane and what kind of content it held;
 * 3. **nothing is clipped**: a pane whose content does not fit is a fault whether it scrolls
 *    or not, and `overflow: hidden` is how not-fitting hides from a scrollbar test.
 *
 * The third is what makes the first two mean something. A pane that clips is a pane a reader
 * cannot read all of, and it produces no scrollbar to catch.
 *
 * ## Where it is asserted
 *
 * At the **declared floor** on both axes, which is where the workspace is tightest, and in the
 * **below-the-floor** presentation, which beat 013 never held to this discipline at all — the
 * author's own screenshot of beat 017's head was a window in that state with a scrolling pane
 * in it. A property asserted only where there is room is a property nobody has tested.
 */

const CONFIG_REQUEST = /j-ocean.*\.json$/;

/**
 * What may scroll, and what it must say.
 *
 * `data-scrolls="list"` and a `data-list` naming the enumeration. There is no other admissible
 * value: beat 013's `data-scrolls="true"` said only that somebody meant it.
 */
const LIST = 'list';

/**
 * Two placed cards are not panes and are not held to FR-002.
 *
 * Panel help (FR-052) and the walkthrough (FR-009) are `position: fixed` cards a reader opened
 * on purpose, capped to the room there is, and closed again with one key. They are the two
 * places explanation is *supposed* to live, and an explanation long enough to need scrolling
 * inside a card the reader asked for is not the surface explaining itself unbidden.
 */
const PLACED_CARDS = '[data-help], [data-walkthrough]';

interface Scroller {
  readonly where: string;
  readonly pane: string;
  readonly declaredKind: string | null;
  readonly list: string | null;
  readonly holdsProse: readonly string[];
  readonly axis: string;
}

interface Clipped {
  readonly pane: string;
  readonly below: number;
  readonly right: number;
  readonly worst: string;
}

interface Measured {
  readonly page: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number };
  readonly scrollers: readonly Scroller[];
  readonly clipped: readonly Clipped[];
}

async function measure(page: Page): Promise<Measured> {
  return page.evaluate(
    ({ cards, listKind }) => {
      const root = document.documentElement;

      /** A word count of what is left when every figure's own text is taken out. */
      const proseIn = (element: Element): string[] => {
        const found: string[] = [];
        for (const block of element.querySelectorAll('p, blockquote, li')) {
          if (block.closest(cards) !== null) continue;
          /* A closed disclosure is not on the surface, and a figure's own provenance is the
             scorer's words which FR-022 requires to be reachable and unsoftened. Neither is
             the pane scrolling an argument at a reader. */
          if (block.closest('details:not([open])') !== null && block.tagName !== 'SUMMARY') continue;
          if (block.closest('.provenance') !== null) continue;
          if (block.closest('.banner, .statement, .caveat, .region-empty, .figure-label, .legend, label, summary, button') !== null) {
            continue;
          }
          if (block.closest('.mark-list') !== null) continue;
          const clone = block.cloneNode(true) as HTMLElement;
          for (const figure of clone.querySelectorAll('.figure, .unmeasured')) figure.remove();
          const words = (clone.textContent ?? '').trim().split(/\s+/).filter((w) => w !== '');
          if (words.length > 8) found.push((block.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120));
        }
        return found;
      };

      /**
       * Whether this element is on the surface at all. A closed disclosure's contents and a
       * clip-path'd accessible list both keep layout boxes in the engine and are painted
       * nowhere, so measuring them would be measuring something no reader can see.
       */
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

      const scrollers: Scroller[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        if (element.clientWidth === 0 || element.clientHeight === 0) continue;
        if (element.closest(cards) !== null) continue;
        const style = getComputedStyle(element);
        const scrolls = (value: string): boolean => value === 'auto' || value === 'scroll';
        const overflowsX = element.scrollWidth > element.clientWidth + 1 && scrolls(style.overflowX);
        const overflowsY = element.scrollHeight > element.clientHeight + 1 && scrolls(style.overflowY);
        if (!overflowsX && !overflowsY) continue;
        const testId = element.dataset['testid'] ?? '';
        const classes = typeof element.className === 'string' ? element.className : '';
        scrollers.push({
          where:
            element.tagName.toLowerCase() +
            (testId === '' ? '' : `[data-testid="${testId}"]`) +
            (classes === '' ? '' : `.${classes.split(' ').join('.')}`),
          pane: element.closest<HTMLElement>('[data-pane-id]')?.dataset['paneId'] ?? 'outside every pane',
          declaredKind: element.dataset['scrolls'] ?? null,
          list: element.dataset['list'] ?? null,
          holdsProse: proseIn(element),
          axis: `${overflowsX ? 'horizontally' : ''}${overflowsX && overflowsY ? ' and ' : ''}${overflowsY ? 'vertically' : ''}`,
        });
      }

      /* Nothing is clipped: every pane's painted content is inside the pane's own rectangle.
         Content inside a declared list scroller is excluded — that is what the declaration is
         for — and so is a placed card, which is not laid out with the panes. */
      const clipped: Clipped[] = [];
      for (const pane of Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]'))) {
        const box = pane.getBoundingClientRect();
        let below = 0;
        let right = 0;
        let worst = '';
        for (const element of Array.from(pane.querySelectorAll<HTMLElement>('*'))) {
          if (element.closest(`[data-scrolls="${listKind}"], ${cards}`) !== null) continue;
          if (!painted(element, pane)) continue;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.bottom - box.bottom > below) {
            below = rect.bottom - box.bottom;
            worst =
              element.tagName.toLowerCase() +
              (typeof element.className === 'string' && element.className !== ''
                ? `.${element.className.split(' ').join('.')}`
                : '');
          }
          right = Math.max(right, rect.right - box.right);
        }
        if (below > 1 || right > 1) {
          clipped.push({
            pane: pane.dataset['paneId'] ?? '(unnamed)',
            below: Math.round(below),
            right: Math.round(right),
            worst,
          });
        }
      }

      return {
        page: {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          scrollHeight: root.scrollHeight,
          clientHeight: root.clientHeight,
        },
        scrollers,
        clipped,
      };
    },
    { cards: PLACED_CARDS, listKind: LIST },
  );
}

/** SC-001, in three assertions, each naming what it found and where. */
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

  /*
   * FR-002. Every scroller is a declared list, and it says which list. The failure names the
   * pane and the kind of content, which is the whole difference between this test and beat
   * 013's: "the controls pane scrolled six paragraphs of explanation" and "the manifest tab
   * scrolled a manifest" are the same sentence to a test that only counts scrollbars.
   */
  const undeclared = measured.scrollers.filter((one) => one.declaredKind !== LIST);
  expect(
    undeclared.map((one) => `${one.pane} / ${one.where} scrolls ${one.axis}, declaring ${String(one.declaredKind)}`),
    `in the "${state}" state these scroll without declaring themselves a list; a pane may ` +
      'scroll a list and may never scroll a body of text (FR-002)',
  ).toEqual([]);

  const unnamed = measured.scrollers.filter((one) => (one.list ?? '').trim() === '');
  expect(
    unnamed.map((one) => `${one.pane} / ${one.where}`),
    `in the "${state}" state these declare themselves lists and do not say which list`,
  ).toEqual([]);

  const prosy = measured.scrollers.filter((one) => one.holdsProse.length > 0);
  expect(
    prosy.map((one) => `${one.pane} / ${one.where} (declared "${String(one.list)}") holds: ${one.holdsProse.join(' | ')}`),
    `in the "${state}" state a scroller declared as a list is holding a body of text`,
  ).toEqual([]);

  expect(
    measured.clipped.map(
      (one) =>
        `the ${one.pane} pane clips its content by ${String(one.below)} px below and ` +
        `${String(one.right)} px right (worst: ${one.worst})`,
    ),
    `in the "${state}" state a pane's content does not fit the pane. A pane that clips is a ` +
      'pane a reader cannot read all of, and it produces no scrollbar for a scrollbar test to ' +
      'catch — which is how beat 013\'s test passed while the surface did not fit',
  ).toEqual([]);

  console.log(
    `    ${state}: page ${String(measured.page.scrollWidth)}x${String(measured.page.scrollHeight)} ` +
      `in ${String(measured.page.clientWidth)}x${String(measured.page.clientHeight)}; ` +
      `scrolling lists: ${
        measured.scrollers.map((one) => `${one.pane}/${String(one.list)}`).join(' | ') || 'none'
      }`,
  );
}

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
  });

  /**
   * The third of the coordinator's additions, and the one beat 013 never tested: the
   * below-the-floor presentation is held to the same discipline as the workspace. The author's
   * screenshot of beat 017's head was a window in exactly this state with a scrolling pane in
   * it, and no test in the tree had anything to say about it.
   */
  test('holds the same discipline below the declared floor', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/');
    await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
    await holdsOneView(page, 'below the floor, unbuilt');

    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId(`panel-score-${String(LEADS[0])}`)).toContainText('persistence', {
      timeout: 120_000,
    });
    await holdsOneView(page, 'below the floor, scored');
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

/** Select a provenance tab by the words on it. */
export async function selectTab(page: Page, title: string): Promise<void> {
  await page.locator('.dv-tab', { hasText: title }).first().click();
}

async function paneBoxes(page: Page): Promise<Record<string, unknown>> {
  const boxes: Record<string, unknown> = {};
  for (const pane of ['controls', 'horizons', 'selection', 'status']) {
    boxes[pane] = await page.getByTestId(`pane-${pane}`).boundingBox();
  }
  return boxes;
}
