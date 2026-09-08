import { expect, test, type Page } from '@playwright/test';

/**
 * The application carries no prose (spec 014 US1, FR-001, SC-001; SRD-v2 FR-42).
 *
 * Beat 013 folded every narrative panel into the controls column's disclosures. Beat 014 asked
 * the spec's question of each of them -- does a reader **drive** this, or **read a live figure**
 * from it, or is it an **explanation**? -- and the explanations left for the site or for a
 * panel's help. This is what keeps them gone.
 *
 * **What counts as a prose block.** Every rendered block of text on the surface, less the kinds
 * the spec's own independent test admits: a text node may label a control, name a figure, or
 * state what an empty region would hold. So a block is counted unless it is one of these, and
 * each exemption is a requirement rather than a convenience:
 *
 * | Not counted | Why |
 * |---|---|
 * | Inside `not-operational` | FR-003, FR-058: the one sentence the application owes a reader who arrived without context |
 * | Inside a panel's help (`[data-help]`) | FR-052: it renders only when a reader presses that panel's control, and it is the destination of the eight paragraphs beat 014 sent to beat 016 |
 * | Carries a figure | It *names a figure*: `.declared`, `.computed`, `.derived`, `.host-time` and `.unmeasured` are the kinds |
 * | `.region-empty` | FR-048: a region with nothing in it says what would appear there |
 * | `.banner` | Principle VI: the harness reporting that it lost, in the failing instrument's own words |
 * | `.statement`, `.caveat` | FR-021 and FR-022: the scorer's own verdict, printed verbatim, which is a computed result in words |
 * | `.run-status` | SRD-v1 FR-34: the surface always says whether what is shown is the recorded run or an edit of it |
 * | `.legend`, `.figure-label`, or inside a `label`, `summary` or `button` | It labels a control, a mark or a picture |
 *
 * The count is taken in seven states -- loaded, with every disclosure opened, with the row
 * built, with it scored, with a panel enlarged, with a cell selected, and below the declared
 * floor -- because a paragraph that renders only once something has been clicked is still a
 * paragraph on the page.
 */

const FIGURE = '.figure, .declared, .computed, .derived, .host-time, .unmeasured';

interface Block {
  readonly where: string;
  readonly text: string;
}

/** Every block of text on the surface that is none of the kinds above. */
async function proseBlocks(page: Page): Promise<Block[]> {
  return page.evaluate((figure) => {
    const exempt = [
      'region-empty',
      'banner',
      'statement',
      'caveat',
      'legend',
      'figure-label',
      'score-lead',
      'run-status',
    ];
    const surface = document.querySelector('[data-testid="one-view"], .boot-view');
    if (surface === null) throw new Error('there is no surface to count prose on');
    const found: { where: string; text: string }[] = [];
    for (const node of surface.querySelectorAll('p, figcaption, blockquote')) {
      const element = node as HTMLElement;
      if (element.closest('[data-testid="not-operational"]') !== null) continue;
      if (element.closest('[data-help]') !== null) continue;
      if (element.closest('label, summary, button') !== null) continue;
      if (exempt.some((name) => element.classList.contains(name))) continue;
      if (element.matches(figure) || element.querySelector(figure) !== null) continue;
      if ((element.textContent ?? '').trim() === '') continue;
      // Where it is, so a failure names the region and the panel rather than the sentence
      // alone: the sentence is the easy half of finding it again.
      const region = element.closest('[data-testid^="region-"]')?.getAttribute('data-testid');
      const panel = element.closest('details')?.querySelector('summary')?.textContent;
      found.push({
        where: `${region ?? 'outside every region'}${panel === null || panel === undefined ? '' : ` / ${panel}`}`,
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
      });
    }
    return found;
  }, FIGURE);
}

const say = (blocks: Block[]): string =>
  blocks.map((block) => `\n  [${block.where}] ${block.text}`).join('');

/** Everything behind a disclosure, opened: a closed panel hides whatever is in it. */
async function openEverything(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('details')) {
      (node as HTMLDetailsElement).open = true;
    }
  });
}

test.describe('the application carries no prose', () => {
  test('on arrival, and with every disclosure opened', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('run-panel')).toBeVisible();

    const onArrival = await proseBlocks(page);
    expect(onArrival, `prose on the loaded application:${say(onArrival)}`).toEqual([]);

    await openEverything(page);
    const opened = await proseBlocks(page);
    expect(opened, `prose behind the disclosures:${say(opened)}`).toEqual([]);
  });

  test('with the row built, scored, a panel enlarged and a cell selected', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', {
      timeout: 60_000,
    });

    await page.getByTestId('enlarge-24').click();
    await page.getByTestId('panel-field-24-overlay').click({ position: { x: 40, y: 40 } });
    await openEverything(page);

    const blocks = await proseBlocks(page);
    expect(blocks, `prose on the working application:${say(blocks)}`).toEqual([]);
  });

  test('below the declared floor, where the surface has more to say and no more room', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/');
    await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
    await openEverything(page);

    const blocks = await proseBlocks(page);
    expect(blocks, `prose below the floor:${say(blocks)}`).toEqual([]);
  });

  /** FR-003 and FR-058, which is the one thing this beat may not take away. */
  test('and still states what j-ocean is not, without interaction', async ({ page }) => {
    await page.goto('/');
    const statement = page.getByTestId('not-operational');
    await expect(statement).toBeVisible();
    await expect(statement).toContainText('not an operational forecast system');

    // Visible without interaction is a claim about geometry, so it is measured: no disclosure
    // was opened, nothing was clicked, and the whole statement is inside the viewport.
    const box = await statement.boundingBox();
    const viewport = page.viewportSize();
    expect((box?.y ?? -1)).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
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
