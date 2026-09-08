import { expect, type Page } from '@playwright/test';

/**
 * The census one view is held to, in one module because two files now ask it (spec 018
 * SC-001, SC-008, FR-002, FR-012).
 *
 * Beat 018's first pass asked it in `one-view.spec.ts` at the declared floor and at one window
 * below it, and that was the hole a 6,584 px scrolling column walked through: a property
 * asserted at one size is a property nobody has tested at any other. `viewport-matrix.spec.ts`
 * now asks the same question at every viewport in the declared matrix, and it asks it with
 * **this** code rather than with a copy of it -- two censuses that each agree with the
 * requirement can still disagree with each other.
 *
 * What it asserts, and the second and third are the ones beat 013's test did not:
 *
 * 1. **the page does not scroll**, on either axis;
 * 2. **every scroller is a list**, and says which list -- a profile's levels, a manifest, the
 *    run's own figures -- and the failure names the pane and what kind of content it held;
 * 3. **nothing is clipped**: a pane whose content does not fit is a fault whether it scrolls
 *    or not, and `overflow: hidden` is how not-fitting hides from a scrollbar test.
 */

/**
 * What may scroll, and what it must say.
 *
 * `data-scrolls="list"` and a `data-list` naming the enumeration. There is no other admissible
 * value: beat 013's `data-scrolls="true"` said only that somebody meant it.
 */
export const LIST = 'list';

/**
 * Two placed cards are not panes and are not held to FR-002.
 *
 * Panel help (FR-052) and the walkthrough (FR-009) are `position: fixed` cards a reader opened
 * on purpose, capped to the room there is, and closed again with one key. They are the two
 * places explanation is *supposed* to live, and an explanation long enough to need scrolling
 * inside a card the reader asked for is not the surface explaining itself unbidden.
 */
export const PLACED_CARDS = '[data-help], [data-walkthrough]';

export interface Scroller {
  readonly where: string;
  readonly pane: string;
  readonly declaredKind: string | null;
  readonly list: string | null;
  readonly holdsProse: readonly string[];
  readonly axis: string;
  /** How far past its own box the content runs, in CSS px, on whichever axis is worse. */
  readonly over: number;
}

export interface Clipped {
  readonly pane: string;
  readonly below: number;
  readonly right: number;
  readonly worst: string;
}

export interface Measured {
  readonly page: {
    readonly scrollWidth: number;
    readonly clientWidth: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
  };
  readonly scrollers: readonly Scroller[];
  readonly clipped: readonly Clipped[];
}

export async function measure(page: Page): Promise<Measured> {
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

      const scrollers: {
        where: string;
        pane: string;
        declaredKind: string | null;
        list: string | null;
        holdsProse: string[];
        axis: string;
        over: number;
      }[] = [];
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
          over: Math.max(
            overflowsY ? element.scrollHeight - element.clientHeight : 0,
            overflowsX ? element.scrollWidth - element.clientWidth : 0,
          ),
        });
      }

      /* Nothing is clipped: every pane's painted content is inside the pane's own rectangle.
         Content inside a declared list scroller is excluded — that is what the declaration is
         for — and so is a placed card, which is not laid out with the panes. */
      const clipped: { pane: string; below: number; right: number; worst: string }[] = [];
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

/**
 * SC-001 and SC-008, in four assertions, each naming what it found and where.
 *
 * Returns the tallest scroll it saw, so a caller walking a matrix can report the worst of
 * them as a figure rather than as a verdict (SC-008).
 */
export async function holdsOneView(page: Page, state: string): Promise<number> {
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

  const tallest = measured.scrollers.reduce((worst, one) => Math.max(worst, one.over), 0);
  console.log(
    `    ${state}: page ${String(measured.page.scrollWidth)}x${String(measured.page.scrollHeight)} ` +
      `in ${String(measured.page.clientWidth)}x${String(measured.page.clientHeight)}; ` +
      `scrolling lists: ${
        measured.scrollers
          .map((one) => `${one.pane}/${String(one.list)} (${String(one.over)} px)`)
          .join(' | ') || 'none'
      }`,
  );
  return tallest;
}

/** Select a provenance tab by the words on it. */
export async function selectTab(page: Page, title: string): Promise<void> {
  await page.locator('.dv-tab', { hasText: title }).first().click();
}
