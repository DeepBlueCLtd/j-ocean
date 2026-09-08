import { expect, test, type Page } from '@playwright/test';
import { holdsOneView, settled } from './census.js';
import { BELOW_THE_ROW, FLOOR, REFERENCE, VIEWPORT_MATRIX, declared } from './declared-geometry.js';
import { decodePng } from './greyscale.js';

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

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The hole, read from the mask as it is drawn.
 *
 * The four lengths the stylesheet cuts the polygon out of, and not a second geometry: the
 * `clip-path` is built from these and from nothing else, so reading them is reading the hole.
 */
async function hole(page: Page): Promise<Box | null> {
  return page.evaluate(() => {
    const mask = document.querySelector<HTMLElement>('[data-testid="walkthrough-mask"]');
    if (mask === null) return null;
    const style = getComputedStyle(mask);
    const at = (name: string): number => Number.parseFloat(style.getPropertyValue(name));
    return {
      left: at('--hole-left'),
      top: at('--hole-top'),
      right: at('--hole-right'),
      bottom: at('--hole-bottom'),
    };
  });
}

/**
 * The rectangle the named pane actually occupies, measured in the browser.
 *
 * The pane's body carries `data-pane-id` -- the prefixed form is the provenance pane, whose
 * four tabs are four panels of one pane -- and the rectangle a reader sees is that body
 * together with the tab strip the layout manager puts above it. Both are measured here rather
 * than derived from a declared figure, which is the whole point: the hole has to be the pane
 * as it *is*, at whatever width the reader last dragged it to.
 */
async function paneBox(page: Page, pane: string): Promise<Box | null> {
  return page.evaluate((name) => {
    let box: { left: number; top: number; right: number; bottom: number } | null = null;
    const found = document.querySelectorAll<HTMLElement>(
      `[data-pane-id="${name}"], [data-pane-id^="${name}/"]`,
    );
    for (const element of Array.from(found)) {
      const rect = (element.closest<HTMLElement>('.dv-groupview') ?? element).getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      box =
        box === null
          ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
          : {
              left: Math.min(box.left, rect.left),
              top: Math.min(box.top, rect.top),
              right: Math.max(box.right, rect.right),
              bottom: Math.max(box.bottom, rect.bottom),
            };
    }
    return box;
  }, pane);
}

/** The worst of the four edges, in CSS px. Reported as a figure and asserted against a bound. */
function drift(one: Box, other: Box): number {
  return Math.max(
    Math.abs(one.left - other.left),
    Math.abs(one.top - other.top),
    Math.abs(one.right - other.right),
    Math.abs(one.bottom - other.bottom),
  );
}

/**
 * The tolerance between the hole and the pane it is cut for, in CSS px.
 *
 * A literal, and deliberately: it is not a property of this application, it is how much
 * disagreement between two `getBoundingClientRect` readings of the same rectangle counts as
 * agreement. Beat 016 recorded the claim it deleted as *the spotlight's rectangle is the
 * controls region's rectangle **to two pixels***, and this is that number, kept.
 */
const TOLERANCE_PX = 2;

/** Every region whose rectangle may not move when the walkthrough opens (FR-014, SC-010). */
async function regionBoxes(page: Page): Promise<Record<string, Box | null>> {
  return page.evaluate(() => {
    const box = (testId: string): { left: number; top: number; right: number; bottom: number } | null => {
      const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    return {
      controls: box('pane-controls'),
      horizons: box('pane-horizons'),
      selection: box('pane-selection'),
      status: box('pane-status'),
      dock: box('workspace-dock'),
    };
  });
}

const extents = async (page: Page): Promise<{ width: number; height: number }> =>
  page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));

/** Walk to the first step about this pane, and leave the walkthrough open on it. */
async function stepAbout(page: Page, pane: string): Promise<void> {
  await page.getByTestId('walkthrough-offer').click();
  const card = page.getByTestId('walkthrough-card');
  await expect(card).toBeVisible();
  const steps = await stepCount(page);
  for (let step = 0; step < steps; step += 1) {
    if ((await card.getAttribute('data-walkthrough')) === pane) return;
    await page.getByTestId('walkthrough-next').click();
  }
  throw new Error(`the walkthrough has no step about the ${pane} pane`);
}

/**
 * The walkthrough, offered and never imposed, and masking what a step is not about (spec 018
 * US5, FR-009, FR-014, SC-004 and SC-010 of the spec's own numbering; SRD-v2 §8.1).
 *
 * Beat 016 retired a walkthrough and wrote a test that the surface no longer carried one.
 * That test's subject is gone, and its claim is not: what beat 016 was really holding was
 * *nothing starts by itself and nothing sequences a reader who did not ask*. The first half is
 * asserted here, in the same words. The second half no longer applies, because a walkthrough
 * is a sequence by nature — it is panel help that may not sequence (FR-052), and the two
 * answer different questions.
 *
 * **A claim beat 016 deleted returns with a subject.** That beat struck out
 * *`rings the panel its step is about, not some other part of the page`* with the note "Gone.
 * There is no spotlight". There is one again, at the author's request, and the assertion is
 * back in the same terms and to the same two pixels: the hole is the named pane's own
 * rectangle, measured from the pane rather than declared, at **every** step.
 *
 * The three things a mask can get wrong are each their own test, because each fails
 * differently: it can light the wrong rectangle, it can go stale the moment a reader touches
 * the workspace, and it can push the surface around on its way in.
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
    await expect(page.getByTestId('walkthrough-mask')).toHaveCount(0);

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
   * US5 scenario 2, and FR-014's first clause: every step names a pane that exists, and the
   * mask lights **that** pane and not some other part of the surface.
   *
   * The two are one walk because they are one question asked of the same step. The card is
   * held to saying something as well, because a tour that pointed at a lit rectangle and
   * explained nothing would be a tour of rectangles.
   */
  test('lights the pane its step is about at every step, and says something about it', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await page.getByTestId('walkthrough-offer').click();

    const steps = await stepCount(page);
    let worst = 0;
    for (let step = 0; step < steps; step += 1) {
      const card = page.getByTestId('walkthrough-card');
      await expect(card).toBeVisible();
      const pane = await card.getAttribute('data-walkthrough');
      expect(pane, `step ${String(step + 1)} names no pane`).not.toBeNull();

      /* The pane it names, on the surface. `pane-provenance/run` is the provenance pane's
         first tab: a step names a pane of the workspace, and a tabbed group is one pane. */
      const box = await paneBox(page, String(pane));
      expect(
        box,
        `step ${String(step + 1)} names the pane "${String(pane)}", which is not on the surface`,
      ).not.toBeNull();

      // And the mask is cut for that pane. The mask says which pane it believes it is about,
      // so a hole in the right place for the wrong reason fails here rather than passing.
      await expect(page.getByTestId('walkthrough-mask')).toHaveAttribute(
        'data-mask-pane',
        String(pane),
      );
      const cut = await hole(page);
      expect(cut, `step ${String(step + 1)} draws no mask`).not.toBeNull();
      const off = drift(cut as Box, box as Box);
      worst = Math.max(worst, off);
      expect(
        off,
        `step ${String(step + 1)} lights a rectangle ${off.toFixed(1)} px from the ` +
          `${String(pane)} pane's own: the mask must light the pane its step is about, not ` +
          'some other part of the surface',
      ).toBeLessThanOrEqual(TOLERANCE_PX);

      expect(
        ((await card.textContent()) ?? '').trim().split(/\s+/).length,
        `step ${String(step + 1)} says nothing about the pane it names`,
      ).toBeGreaterThan(20);

      if (step + 1 < steps) await page.getByTestId('walkthrough-next').click();
    }
    console.log(
      `    the hole is the named pane's own rectangle at all ${String(steps)} steps; the worst ` +
        `edge is ${worst.toFixed(2)} px out, against a tolerance of ${String(TOLERANCE_PX)}`,
    );

    await page.getByTestId('walkthrough-done').click();
    await expect(page.getByTestId('walkthrough-card')).toHaveCount(0);
    await expect(page.getByTestId('walkthrough-mask')).toHaveCount(0);
  });

  /**
   * FR-014's second clause. A mask that is correct only until the reader touches something is
   * worse than none: it points confidently at the wrong rectangle.
   *
   * Three things move a pane, and each reaches the mask by a different mechanism -- a sash
   * drag and a window resize through the `ResizeObserver`, a tab move through the
   * `MutationObserver`, because the layout manager builds new elements for a tab that has been
   * moved and an observer still watching the old one is watching nothing.
   */
  test('follows the pane through a sash drag, a tab move and a window resize', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(REFERENCE);
    await page.goto('/');
    await page.evaluate(() => { window.localStorage.clear(); });
    await page.reload();
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await stepAbout(page, 'horizons');

    const agrees = async (after: string): Promise<Box> => {
      const cut = await hole(page);
      const box = await paneBox(page, 'horizons');
      expect(cut, `the mask is gone after ${after}`).not.toBeNull();
      const off = drift(cut as Box, box as Box);
      expect(
        off,
        `after ${after} the hole is ${off.toFixed(1)} px from the horizons pane: the mask ` +
          'stopped following the pane it is about',
      ).toBeLessThanOrEqual(TOLERANCE_PX);
      return cut as Box;
    };

    /*
     * That the pane actually moved, waited for rather than asserted on the next line. The
     * layout manager measures its container asynchronously, so a rectangle read in the same
     * task as a resize is the rectangle before it -- and a test that read one would report
     * "the mask followed" over a workspace that had not moved yet.
     */
    const moves = async (what: string, from: Box): Promise<void> => {
      await expect
        .poll(
          async () => {
            const box = await paneBox(page, 'horizons');
            return box === null ? '' : [box.left, box.top, box.right, box.bottom].join(',');
          },
          { message: `${what} rearranged nothing, so nothing was tested` },
        )
        .not.toBe([from.left, from.top, from.right, from.bottom].join(','));
    };

    const first = await agrees('opening');

    /* A sash drag, by the mouse, exactly as a reader performs it. The layout manager's sashes
       sit above the scrim by its own stacking -- a reader may still resize a pane with a step
       open, which is what the last step of the walkthrough tells them to do. */
    const sash = page.locator('.dv-sash').first();
    const grip = await sash.boundingBox();
    expect(grip, 'the workspace has no sash to drag').not.toBeNull();
    const handle = grip as { x: number; y: number; width: number; height: number };
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 200, handle.y + handle.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    await expect(page.getByTestId('walkthrough-card')).toBeVisible();
    await moves('the sash drag', first);
    const dragged = await agrees('a sash drag');

    /*
     * A tab moved into another group.
     *
     * The scrim is told to ignore the pointer for the length of the drag, and that is the one
     * place in this file where the test reaches past what a reader can do. It is deliberate: a
     * reader cannot drag a *dimmed* pane's tab onto a *dimmed* pane, and a scrim that let them
     * would not be masking anything. What is under test here is not the pointer path, it is
     * whether the mask re-measures when the dock rearranges underneath it.
     */
    await page.evaluate(() => {
      const mask = document.querySelector<HTMLElement>('[data-testid="walkthrough-mask"]');
      if (mask !== null) mask.style.pointerEvents = 'none';
    });
    await page
      .locator('.dv-tab', { hasText: 'Horizons' })
      .first()
      .dragTo(page.getByTestId('pane-selection'), { targetPosition: { x: 100, y: 200 } });
    await page.evaluate(() => {
      const mask = document.querySelector<HTMLElement>('[data-testid="walkthrough-mask"]');
      if (mask !== null) mask.style.pointerEvents = '';
    });
    await expect(page.getByTestId('walkthrough-card')).toBeVisible();
    await moves('the tab move', dragged);
    const moved = await agrees('a tab moved into another group');

    // And the window itself, which is the one a reader can always reach.
    await page.setViewportSize({ width: REFERENCE.width - 400, height: REFERENCE.height - 200 });
    await expect(page.getByTestId('walkthrough-card')).toBeVisible();
    await moves('the window resize', moved);
    await agrees('a window resize');
  });

  /**
   * FR-014's third clause, and SC-010. It masks and it does not reflow: the scrim and the card
   * are placed rather than laid out, so opening the walkthrough and advancing it change no
   * region's bounding rectangle.
   *
   * To the pixel, because "does not move" admits of no tolerance -- a surface that shifted by
   * two pixels when a reader asked for an explanation teaches the same caution as one that
   * reflowed. The same discipline beat 015 held for enlargement and beat 016 for panel help.
   */
  test('changes no region’s rectangle, and does not grow the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('run-panel')).toBeVisible();
    /* The baseline is the arrangement the reader has, which is the one the layout manager has
       finished laying out: it sizes its panes on the first frame at which the grid knows its
       own width, so a snapshot taken in the frame before that is three equal thirds and every
       later comparison is against a layout nobody ever saw. */
    await settled(page);

    const before = await regionBoxes(page);
    const extentBefore = await extents(page);

    await page.getByTestId('walkthrough-offer').click();
    await expect(page.getByTestId('walkthrough-mask')).toBeVisible();
    expect(await regionBoxes(page), 'opening the walkthrough moved a pane').toEqual(before);
    expect(await extents(page), 'opening the walkthrough grew the page').toEqual(extentBefore);

    // And every advance after it: the mask moves and the surface does not.
    const steps = await stepCount(page);
    for (let step = 1; step < steps; step += 1) {
      await page.getByTestId('walkthrough-next').click();
      expect(
        await regionBoxes(page),
        `advancing to step ${String(step + 1)} moved a pane`,
      ).toEqual(before);
      expect(await extents(page), `advancing to step ${String(step + 1)} grew the page`).toEqual(
        extentBefore,
      );
    }

    await page.getByTestId('walkthrough-done').click();
    expect(await regionBoxes(page), 'closing the walkthrough moved a pane').toEqual(before);
  });

  /**
   * FR-014's fourth clause. A reader must not be able to act on a pane they cannot see, and
   * they must be able to act on the one they can.
   *
   * The first half is the claim that replaces beat 018's *the run underneath stays usable*,
   * whose subject was the decision this pass reverses. What survives of it is the half that is
   * still true and now matters more: the pane a step is about goes on working, so a reader
   * reading about the controls can use the controls.
   */
  test('leaves the lit pane operable, and the dimmed surface not', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await stepAbout(page, 'controls');

    /* What the pointer would reach, asked of the browser rather than inferred: at the middle
       of the lit pane, and at the middle of every pane that is not lit. */
    const reached = await page.evaluate(() => {
      const at = (name: string): string => {
        const element = document.querySelector<HTMLElement>(`[data-pane-id="${name}"]`);
        if (element === null) return 'absent';
        const rect = element.getBoundingClientRect();
        const found = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return found?.closest('[data-testid="walkthrough-mask"]') === null ? 'the surface' : 'the scrim';
      };
      return {
        controls: at('controls'),
        horizons: at('horizons'),
        selection: at('selection'),
        status: at('status'),
      };
    });
    expect(reached.controls, 'the lit pane is behind the scrim').toBe('the surface');
    expect(
      [reached.horizons, reached.selection, reached.status],
      'a pane the step is not about can still be pressed, so the mask masks nothing',
    ).toEqual(['the scrim', 'the scrim', 'the scrim']);

    // And the lit pane really works: the control the run is advanced by is in it.
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('step-time')).not.toContainText('not yet measured', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('walkthrough-card')).toBeVisible();
  });

  /**
   * It closes on Escape, on the scrim and on its own control, with focus returned.
   *
   * The scrim is the third of those because the scrim is what a reader's mouse now meets: a
   * mask whose only way out is a key would strand a reader who reached for the pointer. And
   * the control that opened it stays above the scrim, because the way out may not be behind
   * the thing it closes.
   */
  test('closes on Escape, on the scrim and on the control, with focus returned', async ({
    page,
  }) => {
    await page.goto('/');
    const offer = page.getByTestId('walkthrough-offer');

    await offer.click();
    await expect(page.getByTestId('walkthrough-card')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('walkthrough-card')).toHaveCount(0);
    await expect(page.getByTestId('walkthrough-mask')).toHaveCount(0);
    await expect(offer).toBeFocused();

    await offer.click();
    await expect(page.getByTestId('walkthrough-mask')).toBeVisible();
    // A click on the dim, which is where a reader who has given up points.
    await page.getByTestId('walkthrough-mask').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('walkthrough-card')).toHaveCount(0);
    await expect(offer).toBeFocused();

    // And the control itself, which is only pressable because it is above the scrim.
    await offer.click();
    await expect(page.getByTestId('walkthrough-card')).toBeVisible();
    await offer.click();
    await expect(page.getByTestId('walkthrough-card')).toHaveCount(0);
  });

  /**
   * FR-057 and SC-006, of the mask. The dim is a share of the ink at a declared opacity, so it
   * should survive a monochrome print -- but "should" is what a measurement is for.
   *
   * Measured on the same paper in both places. A lit pane and a dimmed pane hold different
   * words at different weights, so comparing arbitrary pixels would be comparing the writing;
   * the brightest pixel in each is that pane's own background, which is the one surface the
   * two have in common.
   */
  test('keeps its margin between lit and dimmed through a greyscale rendering', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(REFERENCE);
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await stepAbout(page, 'horizons');
    await page.evaluate(() => {
      document.documentElement.style.filter = 'grayscale(1)';
    });

    const boxes = await page.evaluate(() => {
      const of = (name: string): { x: number; y: number; width: number; height: number } | null => {
        const element = document.querySelector<HTMLElement>(`[data-pane-id="${name}"]`);
        if (element === null) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      return { lit: of('horizons'), dimmed: of('controls') };
    });
    const pixels = decodePng(await page.screenshot());

    let colourful = 0;
    const paperOf = (box: { x: number; y: number; width: number; height: number } | null): number => {
      let brightest = -1;
      for (let y = box === null ? 0 : box.y + 8; y < (box?.y ?? 0) + (box?.height ?? 0) - 8; y += 4) {
        for (let x = box === null ? 0 : box.x + 8; x < (box?.x ?? 0) + (box?.width ?? 0) - 8; x += 4) {
          const [r, g, b] = pixels.channelsAt(x, y);
          if (Math.max(Math.abs(r - g), Math.abs(g - b)) > 4) colourful += 1;
          brightest = Math.max(brightest, pixels.luminanceAt(x, y));
        }
      }
      return brightest;
    };

    const lit = paperOf(boxes.lit);
    const dimmed = paperOf(boxes.dimmed);
    expect(colourful, 'the saturation filter did not apply, so nothing here was measured').toBe(0);

    const margin = lit - dimmed;
    console.log(
      `    the mask through grayscale(1): the lit pane's paper is ${lit.toFixed(1)} of 255 and ` +
        `the dimmed pane's is ${dimmed.toFixed(1)}, margin ${margin.toFixed(1)} against a ` +
        'declared 40',
    );
    expect(
      margin,
      'with the colour taken out the mask is flat, so a monochrome reader cannot tell which ' +
        'pane the step is about',
    ).toBeGreaterThan(40);
  });

  /**
   * FR-012, of the walkthrough. A fixed overlay sized wrong is a classic way to put a
   * scrollbar on a page that had none, and it is the defect this beat has been caught by
   * twice -- so the census is asked with the mask open, at more than one viewport.
   *
   * The same census `viewport-matrix.spec.ts` asks, in the same code rather than a copy of it.
   */
  for (const viewport of [VIEWPORT_MATRIX[0], VIEWPORT_MATRIX[5]]) {
    const size = `${String(viewport?.width)} x ${String(viewport?.height)}`;
    test(`scrolls nothing with a step open at ${size}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: viewport?.width ?? 0, height: viewport?.height ?? 0 });
      await page.goto('/');
      await page.evaluate(() => { window.localStorage.clear(); });
      await page.reload();
      await expect(page.getByTestId('pane-controls')).toBeVisible();

      await page.getByTestId('walkthrough-offer').click();
      const steps = await stepCount(page);
      for (let step = 0; step < steps; step += 1) {
        const pane = await page.getByTestId('walkthrough-card').getAttribute('data-walkthrough');
        await holdsOneView(page, `${size}, the walkthrough on the ${String(pane)} step`);
        if (step + 1 < steps) await page.getByTestId('walkthrough-next').click();
      }
    });
  }

  /**
   * The mask does not animate between steps: it is simply in the new place.
   *
   * Asked in both media states rather than only under `prefers-reduced-motion`, because this
   * surface animates nothing anywhere -- beat 017 holds that as one claim over every element
   * -- so a mask that moved smoothly for a reader who had expressed no preference would be the
   * first thing on the surface that did.
   */
  for (const motion of ['reduce', 'no-preference'] as const) {
    test(`does not animate between steps, under prefers-reduced-motion: ${motion}`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference' });
      await page.goto('/');
      await expect(page.getByTestId('pane-controls')).toBeVisible();
      await page.getByTestId('walkthrough-offer').click();
      await expect(page.getByTestId('walkthrough-mask')).toBeVisible();
      await page.getByTestId('walkthrough-next').click();

      const moving = await page.evaluate(() => {
        const named: string[] = [];
        for (const testId of ['walkthrough-mask', 'walkthrough-card']) {
          const element = document.querySelector(`[data-testid="${testId}"]`);
          if (element === null) continue;
          const style = getComputedStyle(element);
          const durations = [style.transitionDuration, style.animationDuration]
            .flatMap((value) => value.split(',').map((part) => part.trim()))
            .filter((value) => value !== '0s' && value !== '');
          if (durations.length > 0) named.push(`${testId}: ${durations.join(' ')}`);
        }
        return named;
      });
      expect(moving, `the mask or its card moves under ${motion}`).toEqual([]);
    });
  }

  /**
   * The two paragraphs the below-the-floor notice used to carry are here, and they are
   * reachable from the presentation that used to carry them. A sentence moved to a place a
   * reader in that state cannot get to would not have been moved; it would have been dropped.
   */
  test('carries the below-the-floor explanation, reachable below the floor', async ({ page }) => {
    await page.setViewportSize({ width: BELOW_THE_ROW.width, height: BELOW_THE_ROW.height });
    await page.goto('/');
    await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
    await page.getByTestId('walkthrough-offer').click();

    const steps = await stepCount(page);
    for (let step = 0; step < steps; step += 1) {
      const card = page.getByTestId('walkthrough-card');
      if ((await card.textContent())?.includes('When the window is too narrow') === true) {
        await expect(card).toContainText('one horizon at a time');
        await expect(card).toContainText('measured from the built workspace');
        return;
      }
      if (step + 1 < steps) await page.getByTestId('walkthrough-next').click();
    }
    throw new Error('the walkthrough has no step about the window being too small');
  });

  /** And it does not become panel help: it is one card, over one scrim, and there is only ever one. */
  test('is one card over one scrim, and closing it leaves nothing standing', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('walkthrough-offer').click();
    await expect(page.locator('[data-walkthrough]')).toHaveCount(1);
    await expect(page.locator('.walkthrough-mask')).toHaveCount(1);
    await page.getByTestId('walkthrough-next').click();
    await expect(page.locator('[data-walkthrough]')).toHaveCount(1);
    await expect(page.locator('.walkthrough-mask')).toHaveCount(1);
    await page.getByTestId('walkthrough-offer').click();
    await expect(page.locator('[data-walkthrough]')).toHaveCount(0);
    await expect(page.locator('.walkthrough-mask')).toHaveCount(0);
  });

  /**
   * The card is beside the pane its step is about, and wholly inside the window.
   *
   * Placed from the space around the lit rectangle rather than from its own measured height,
   * which is the mistake beat 011 made and wrote down: the anchor's rectangle and the card's
   * height arrive a frame apart, and for that frame the card was placed with the previous
   * step's height -- on one panel that put its Next button below the bottom edge.
   */
  test('places the card beside the lit pane, wholly inside the window', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(REFERENCE);
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    await page.getByTestId('walkthrough-offer').click();

    const gap = declared.presentation.workspace.walkthroughCardGapPx;
    const steps = await stepCount(page);
    const sides: string[] = [];
    for (let step = 0; step < steps; step += 1) {
      const card = page.getByTestId('walkthrough-card');
      const pane = String(await card.getAttribute('data-walkthrough'));
      sides.push(`${pane}: ${String(await card.getAttribute('data-side'))}`);
      const measured = await card.evaluate((element) => ({
        rect: element.getBoundingClientRect().toJSON() as Box,
        window: { width: window.innerWidth, height: window.innerHeight },
      }));
      expect(measured.rect.top, `the card is off the top of the window on step ${String(step + 1)}`).toBeGreaterThanOrEqual(0);
      expect(measured.rect.left, `the card is off the left of the window on step ${String(step + 1)}`).toBeGreaterThanOrEqual(0);
      expect(measured.rect.bottom).toBeLessThanOrEqual(measured.window.height + 1);
      expect(measured.rect.right).toBeLessThanOrEqual(measured.window.width + 1);

      // Beside the pane, and not somewhere else in the window: the near edge of the card is
      // the declared gap from the lit rectangle, whichever side it took.
      const box = (await paneBox(page, pane)) as Box;
      const near = Math.min(
        Math.abs(measured.rect.left - box.right),
        Math.abs(measured.rect.right - box.left),
        Math.abs(measured.rect.top - box.bottom),
        Math.abs(measured.rect.bottom - box.top),
        // A pane with no room around it takes the card into its own corner.
        Math.abs(measured.rect.left - box.left),
        Math.abs(measured.rect.right - box.right),
      );
      expect(
        near,
        `on step ${String(step + 1)} the card is ${near.toFixed(1)} px from the ${pane} pane, ` +
          `which is not beside it (the declared gap is ${String(gap)} px)`,
      ).toBeLessThanOrEqual(gap + TOLERANCE_PX);

      if (step + 1 < steps) await page.getByTestId('walkthrough-next').click();
    }
    console.log(`    the card is placed: ${sides.join('; ')}`);
  });
});
