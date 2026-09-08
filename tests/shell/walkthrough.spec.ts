import { expect, test, type Page } from '@playwright/test';
import { FLOOR } from './declared-geometry.js';

/**
 * How many steps there are, read off the surface rather than imported.
 *
 * The shell tests run against the built page and not against the sources, which is the whole
 * point of their being shell tests: a claim about what a reader meets is worth asserting on
 * what a reader is served. `tests/docs/disposition.test.ts` imports the steps for the other
 * half of the claim -- that each one says what the record says it says.
 */
async function stepCount(page: Page): Promise<number> {
  const text = (await page.getByTestId('walkthrough-progress').textContent()) ?? '';
  const match = /of (\d+)/.exec(text);
  expect(match, `the walkthrough does not say how many steps it has: "${text}"`).not.toBeNull();
  return Number(match?.[1] ?? 0);
}

/**
 * The walkthrough, offered and never imposed (spec 018 US5, FR-009, SC-004 of the spec's own
 * numbering; SRD-v2 §8.1).
 *
 * Beat 016 retired a walkthrough and wrote a test that the surface no longer carried one.
 * That test's subject is gone, and its claim is not: what beat 016 was really holding was
 * *nothing starts by itself and nothing sequences a reader who did not ask*. The first half is
 * asserted here, in the same words. The second half no longer applies, because a walkthrough
 * is a sequence by nature — it is panel help that may not sequence (FR-052), and the two
 * answer different questions.
 *
 * Three claims, and the third is what stops this becoming beat 016's problem again: every step
 * names a pane that is **on the surface**, checked in a browser rather than against a list. A
 * tour that pointed at a rectangle that is not there is the staleness FR-054 exists to prevent.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(FLOOR);
});

test.describe('a walkthrough of the workspace', () => {
  /** US5 scenario 1: a first visit starts nothing. */
  test('does not start by itself, on a first visit or any other', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await expect(page.getByTestId('walkthrough-card')).toHaveCount(0);

    // And still not after a reload, which is where a "first visit" flag would show itself.
    await page.reload();
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await expect(page.getByTestId('walkthrough-card')).toHaveCount(0);

    // Nothing about it is in storage either: a flag saying "this reader has seen it" would be
    // a thing persisted about a reader, and the only thing this surface persists is furniture.
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.join(' '), 'the walkthrough remembered something about the reader').not.toMatch(
      /walk|tour|seen|visit/i,
    );
  });

  test('is offered by name, and opens where the reader asks', async ({ page }) => {
    await page.goto('/');
    const offer = page.getByTestId('walkthrough-offer');
    await expect(offer).toBeVisible();
    await expect(offer).toContainText('workspace');

    await offer.click();
    await expect(page.getByTestId('walkthrough-card')).toBeVisible();
    await expect(page.getByTestId('walkthrough-progress')).toContainText(/^1 of \d+$/);
    expect(await stepCount(page), 'the walkthrough has no steps').toBeGreaterThan(2);
  });

  /**
   * US5 scenario 2, both halves: every step names a pane that exists, and the run underneath
   * stays usable while it is open.
   */
  test('names a pane that is on the surface at every step, and leaves the run usable', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await page.getByTestId('walkthrough-offer').click();

    const steps = await stepCount(page);
    for (let step = 0; step < steps; step += 1) {
      const card = page.getByTestId('walkthrough-card');
      await expect(card).toBeVisible();
      const pane = await card.getAttribute('data-walkthrough');
      expect(pane, `step ${String(step + 1)} names no pane`).not.toBeNull();
      /* The pane it names, on the surface. `pane-provenance/run` is the provenance pane's
         first tab: a step names a pane of the workspace, and a tabbed group is one pane. */
      const count = await page.evaluate(
        (name) =>
          document.querySelectorAll(`[data-pane-id="${name}"], [data-pane-id^="${name}/"]`).length,
        pane,
      );
      expect(count, `step ${String(step + 1)} names the pane "${String(pane)}", which is not on the surface`).toBeGreaterThan(0);
      // And it says something: a step that pointed at a pane and explained nothing would be a
      // tour of rectangles.
      expect(
        ((await card.textContent()) ?? '').trim().split(/\s+/).length,
        `step ${String(step + 1)} says nothing about the pane it names`,
      ).toBeGreaterThan(20);

      if (step + 1 < steps) await page.getByTestId('walkthrough-next').click();
    }

    // The run underneath is still usable with the card open: nothing is behind a scrim.
    await expect(page.getByTestId('walkthrough-card')).toBeVisible();
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('step-time')).not.toContainText('not yet measured', {
      timeout: 60_000,
    });

    await page.getByTestId('walkthrough-done').click();
    await expect(page.getByTestId('walkthrough-card')).toHaveCount(0);
  });

  /** It closes on Escape and on its own control, with focus returned, like panel help. */
  test('closes on Escape and on the control, with focus returned', async ({ page }) => {
    await page.goto('/');
    const offer = page.getByTestId('walkthrough-offer');
    await offer.click();
    await expect(page.getByTestId('walkthrough-card')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('walkthrough-card')).toHaveCount(0);
    await expect(offer).toBeFocused();
  });

  /**
   * The two paragraphs the below-the-floor notice used to carry are here, and they are
   * reachable from the presentation that used to carry them. A sentence moved to a place a
   * reader in that state cannot get to would not have been moved; it would have been dropped.
   */
  test('carries the below-the-floor explanation, reachable below the floor', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/');
    await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
    await page.getByTestId('walkthrough-offer').click();

    const steps = await stepCount(page);
    for (let step = 0; step < steps; step += 1) {
      const card = page.getByTestId('walkthrough-card');
      if ((await card.textContent())?.includes('When the window is too small') === true) {
        await expect(card).toContainText('one horizon at a time');
        await expect(card).toContainText('measured from the built workspace');
        return;
      }
      if (step + 1 < steps) await page.getByTestId('walkthrough-next').click();
    }
    throw new Error('the walkthrough has no step about the window being too small');
  });

  /** And it does not become panel help: it is one card, and there is only ever one. */
  test('is one card, and closing it leaves nothing standing', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('walkthrough-offer').click();
    await expect(page.locator('[data-walkthrough]')).toHaveCount(1);
    await page.getByTestId('walkthrough-next').click();
    await expect(page.locator('[data-walkthrough]')).toHaveCount(1);
    await page.getByTestId('walkthrough-offer').click();
    await expect(page.locator('[data-walkthrough]')).toHaveCount(0);
  });
});
