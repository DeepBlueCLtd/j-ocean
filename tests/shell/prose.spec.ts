import { expect, test, type Page } from '@playwright/test';
import { BELOW_THE_ROW, FLOOR, REFERENCE } from './declared-geometry.js';

/**
 * No explanatory sentence on the surface (spec 018 US3, FR-006, FR-007, SC-005; SRD-v2 §8.1).
 *
 * ## What replaced beat 014's test, and why
 *
 * Beat 014 counted "prose blocks" and exempted, among other things, **any block that carried a
 * figure**. That exemption is the whole of how this survived to beat 017:
 *
 * > *The analysis at this issue instant saw 2 observations; 29 had not happened yet.*
 * > *Drawn over every panel: 25 surface measurements, 6 XBT drops and 25 Argo profiles, of
 * > which 11 carry a flag — drawn as flagged, never omitted. Quality control was on.*
 *
 * Both carry figures. Both passed. Both are readouts written as sentences, and a reader has to
 * read a line of prose to find two numbers in it. The author's review named exactly these.
 *
 * So the exemption is gone, and what is counted is a **sentence**: a rendered block whose text,
 * with every figure's own text removed, still runs to more than `SENTENCE_WORDS` words. A
 * label is short by nature — *"measurements along the declared track"* is five words — and a
 * sentence is not. The threshold is stated here rather than tuned: it is the length at which a
 * label has stopped labelling.
 *
 * ## What is still admitted, and why each is a requirement
 *
 * | Not counted | Why |
 * |---|---|
 * | Inside `not-operational` | FR-58: the one statement the application owes a reader who arrived without context, and it may not be moved behind a control |
 * | Inside panel help (`[data-help]`) | FR-052: it renders only when a reader presses that panel's control |
 * | Inside the walkthrough (`[data-walkthrough]`) | Spec 018 FR-009: offered, never imposed, and the other place explanation belongs |
 * | `.banner` | Principle VI: the harness reporting that it lost, or refused, in the failing instrument's own words |
 * | `.statement`, `.caveat`, inside `.provenance` | FR-021, FR-022: the scorer's own verdict and the figure's own provenance, printed verbatim |
 * | `.run-status` | SRD-v1 FR-34: the surface always says whether this is the recorded run or an edit |
 * | `.region-empty` | FR-048, **narrowed**: an empty pane says what would appear in it, in no more than `EMPTY_PANE_WORDS` words |
 * | `.legend`, `.figure-label`, inside `label`, `summary`, `button` | It labels a control, a mark or a picture |
 *
 * `.aside` is gone from that list, and it is worth saying why: it was a class that meant "this
 * is a sentence, and that is all right", which is a licence rather than a category.
 *
 * ## The legend, which was exempt and is now counted
 *
 * `.legend` was on that list as a whole block, and a whole-block exemption is the same shape of
 * mistake as beat 014's: the legend beneath the row is a `<p>`, so exempting the paragraph
 * exempted everything inside it, and two explanations lived there through this beat's own first
 * pass --
 *
 * > *the row shows the field alone at this size: the attribution layer and each measurement at
 * > the depth it reached are drawn in the enlarged panel*
 * >
 * > *the same field on every panel: this run analyses once, at 2026-09-08T09:00:00.000Z.
 * > Attribution becomes per horizon when the forecast cycles.*
 *
 * -- twenty words each, under a class that means *this labels a mark*. A legend is exempt
 * because a legend labels, and the way to keep that true is to count what is in it rather than
 * to trust the class. So every **entry** of a legend is counted on its own against
 * `LEGEND_WORDS`, and the whole paragraph stays exempt because the paragraph is only its
 * entries. Both sentences above are now `docs/narrative-disposition.json` entries pointing at
 * panel help, and what is left in the legend is a label of eight words and one of six.
 */

/**
 * How many words a block may carry, once its figures are removed, before it is a sentence.
 *
 * Eight. A control's label, a term in a list and the unit beside a figure are all shorter than
 * that; an explanation is longer. The number is here so that moving it is a visible act.
 */
const SENTENCE_WORDS = 8;

/** FR-048, narrowed by §8.1: an empty pane says what would appear, and no more than this. */
const EMPTY_PANE_WORDS = 12;

/**
 * How many words one entry of a legend may carry, once its figures are removed.
 *
 * Ten, and two more than a block elsewhere on the surface, because a legend entry does a job
 * a control's label does not: it names a mark, says what the mark encodes, and where the
 * encoding has a range it carries that range's own figures inside the label. *surface
 * measurement, dark for warm: 18.1 to 24.3 °C* is nine words of that kind. Ten is where
 * naming has stopped and explaining has begun; the two entries this beat moved to panel help
 * were twenty words each.
 */
const LEGEND_WORDS = 10;

interface Block {
  readonly where: string;
  readonly words: number;
  readonly text: string;
}

/** Every sentence on the surface that is none of the kinds above. */
async function sentences(page: Page): Promise<Block[]> {
  return page.evaluate(
    ({ limit }) => {
      const exemptClass = [
        'banner',
        'statement',
        'caveat',
        'legend',
        'figure-label',
        'region-empty',
        'run-status',
        'score-lead',
      ];
      const surface = document.querySelector('[data-testid="one-view"], .boot-view');
      if (surface === null) throw new Error('there is no surface to count sentences on');
      const found: { where: string; words: number; text: string }[] = [];
      for (const node of surface.querySelectorAll('p, figcaption, blockquote, dd, li')) {
        const element = node as HTMLElement;
        if (element.closest('[data-testid="not-operational"]') !== null) continue;
        if (element.closest('[data-help], [data-walkthrough]') !== null) continue;
        if (element.closest('label, summary, button, .provenance') !== null) continue;
        if (element.closest('details:not([open])') !== null) continue;
        if (exemptClass.some((name) => element.classList.contains(name))) continue;
        if (element.closest(`.${exemptClass.join(', .')}`) !== null) continue;
        // A clip-path'd accessible list is not on the surface; it is the canvas said in words.
        if (element.closest('.mark-list') !== null) continue;

        // Every figure's own text comes out: what is left is what a reader has to read to
        // find the figures, and that is the thing this beat is counting.
        const clone = element.cloneNode(true) as HTMLElement;
        for (const figure of clone.querySelectorAll('.figure, .unmeasured')) figure.remove();
        const words = (clone.textContent ?? '').trim().split(/\s+/).filter((word) => word !== '');
        if (words.length <= limit) continue;

        const pane = element.closest<HTMLElement>('[data-pane-id]')?.dataset['paneId'];
        found.push({
          where: pane ?? 'outside every pane',
          words: words.length,
          text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
        });
      }
      return found;
    },
    { limit: SENTENCE_WORDS },
  );
}

/**
 * Every entry of every legend that is longer than a label.
 *
 * The paragraph is exempt and its entries are not: a legend is exempt because it labels marks,
 * and this is what holds that true rather than assuming it. Counted the same way as any other
 * block -- figures removed, what is left is what a reader has to read.
 */
async function legendEntries(page: Page): Promise<Block[]> {
  return page.evaluate(({ limit }) => {
    const found: { where: string; words: number; text: string }[] = [];
    for (const node of document.querySelectorAll('.legend > span')) {
      const element = node as HTMLElement;
      const clone = element.cloneNode(true) as HTMLElement;
      for (const figure of clone.querySelectorAll('.figure, .unmeasured')) figure.remove();
      const words = (clone.textContent ?? '').trim().split(/\s+/).filter((word) => word !== '');
      if (words.length <= limit) continue;
      found.push({
        where:
          element.closest<HTMLElement>('[data-pane-id]')?.dataset['paneId'] ?? 'outside every pane',
        words: words.length,
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
      });
    }
    return found;
  }, { limit: LEGEND_WORDS });
}

/** FR-048 as §8.1 narrows it: what an empty pane says, and how much of it. */
async function emptyPaneStatements(page: Page): Promise<Block[]> {
  return page.evaluate(({ limit }) => {
    const found: { where: string; words: number; text: string }[] = [];
    for (const node of document.querySelectorAll('.region-empty')) {
      const element = node as HTMLElement;
      const clone = element.cloneNode(true) as HTMLElement;
      for (const figure of clone.querySelectorAll('.figure, .unmeasured')) figure.remove();
      const words = (clone.textContent ?? '').trim().split(/\s+/).filter((word) => word !== '');
      if (words.length <= limit) continue;
      found.push({
        where: element.closest<HTMLElement>('[data-pane-id]')?.dataset['paneId'] ?? 'outside every pane',
        words: words.length,
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
      });
    }
    return found;
  }, { limit: EMPTY_PANE_WORDS });
}

const say = (blocks: Block[]): string =>
  blocks.map((block) => `\n  [${block.where}, ${String(block.words)} words] ${block.text}`).join('');

/** Every disclosure that is left, opened: a closed one hides whatever is in it. */
async function openEverything(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('details')) {
      (node as HTMLDetailsElement).open = true;
    }
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(FLOOR);
});

test.describe('the surface carries no explanatory sentence', () => {
  test('on arrival, and with every disclosure opened', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();

    const onArrival = await sentences(page);
    expect(onArrival, `sentences on the loaded workspace:${say(onArrival)}`).toEqual([]);

    await openEverything(page);
    const opened = await sentences(page);
    expect(opened, `sentences behind the disclosures:${say(opened)}`).toEqual([]);
  });

  test('with the row built, scored, a panel enlarged and a cell selected', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', {
      timeout: 120_000,
    });

    await page.getByTestId('enlarge-24').click();
    await page.getByTestId('panel-field-24-overlay').click({ position: { x: 40, y: 40 } });
    await openEverything(page);

    const blocks = await sentences(page);
    expect(blocks, `sentences on the working workspace:${say(blocks)}`).toEqual([]);
  });

  /**
   * FR-007, at the one class that is exempt because of what it is for.
   *
   * The row's legend and the enlarged panel's are the same entries, so both are walked: an
   * entry that is a label in one presentation and an argument in the other would be an
   * explanation arriving in whichever presentation this test did not look at.
   */
  test('keeps every legend entry a label for a mark, in the row and enlarged', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(REFERENCE);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });

    const wordy = await legendEntries(page);
    expect(
      wordy,
      `a legend entry is explaining rather than labelling a mark:${say(wordy)}`,
    ).toEqual([]);

    // FR-051's own label, which is what the row owes and all that it owes: the account of
    // what the enlarged panel adds is `centre/horizon-row`'s help.
    await expect(page.getByTestId('row-fidelity')).toContainText('field only');

    // With the attribution layer shown, which is a different set of entries entirely.
    await page.getByTestId('toggle-attribution').click();
    await expect(page.getByTestId('attribution-scope')).toBeVisible();
    const shown = await legendEntries(page);
    expect(
      shown,
      `a legend entry of the attribution layer is explaining rather than labelling:${say(shown)}`,
    ).toEqual([]);

    await page.getByTestId('enlarge-24').click();
    await expect(page.getByTestId('panel-legend')).toBeVisible();
    const enlarged = await legendEntries(page);
    expect(
      enlarged,
      `a legend entry of the enlarged panel is explaining rather than labelling:${say(enlarged)}`,
    ).toEqual([]);
  });

  /** Every provenance tab, because a tab nobody selected is a pane nobody counted. */
  test('on every provenance tab', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('run-panel')).toBeVisible();
    for (const title of ['Instruments', 'Truth record', 'Manifest', 'The run']) {
      await page.locator('.dv-tab', { hasText: title }).first().click();
      const blocks = await sentences(page);
      expect(blocks, `sentences on the ${title} tab:${say(blocks)}`).toEqual([]);
    }
  });

  test('below the declared floor, where the surface has more to say and no more room', async ({
    page,
  }) => {
    await page.setViewportSize({ width: BELOW_THE_ROW.width, height: BELOW_THE_ROW.height });
    await page.goto('/');
    await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
    await openEverything(page);

    const blocks = await sentences(page);
    expect(blocks, `sentences below the floor:${say(blocks)}`).toEqual([]);
  });

  /**
   * FR-048 as §8.1 narrows it. An empty pane still says what would appear there — an empty
   * pane is a claim the surface is not entitled to make — but it says it in as few words as
   * will do it, and it is not a licence for an explanation.
   */
  test('says what an empty pane would hold, in as few words as will do it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('detail-empty')).toBeVisible();
    await expect(page.getByTestId('row-invitation-statement')).toBeVisible();
    const wordy = await emptyPaneStatements(page);
    expect(
      wordy,
      `an empty pane is explaining rather than naming what would appear:${say(wordy)}`,
    ).toEqual([]);
  });

  /** FR-58, which is the one thing this beat may not take away. */
  test('and still states what j-ocean is not, without interaction', async ({ page }) => {
    await page.goto('/');
    const statement = page.getByTestId('not-operational');
    await expect(statement).toBeVisible();
    await expect(statement).toContainText('not an operational forecast system');

    // Visible without interaction is a claim about geometry, so it is measured: nothing was
    // clicked, and the whole statement is inside the viewport. And it is not in the dock, so
    // there is no arrangement in which a reader could have closed or tabbed it away.
    const box = await statement.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
    expect(
      await statement.evaluate((element) => element.closest('.dv-groupview') !== null),
      'the statement of FR-58 is inside the dock, where a reader could close or tab it away',
    ).toBe(false);
  });

  /**
   * FR-005. The narrative went somewhere, and the application says where by name rather than
   * leaving a reader who wants the background to guess that a site exists.
   */
  test('names the site it sent the narrative to, and the page that holds the deferrals', async ({
    page,
  }) => {
    await page.goto('/');
    const site = page.getByTestId('site-link');
    await expect(site).toBeVisible();
    await expect(site).toContainText('j-ocean site');
    await expect(site).toHaveAttribute('href', '../index.html');

    const deferrals = page.getByTestId('deferrals-link');
    await expect(deferrals).toBeVisible();
    await expect(deferrals).toContainText('What this does not do');
    await expect(deferrals).toHaveAttribute('href', '../deferred.html');
  });
});
