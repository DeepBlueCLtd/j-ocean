import { expect, type Page } from '@playwright/test';

/**
 * The census one view is held to, in one module because four files now ask it (spec 018
 * SC-001, SC-008, FR-002, FR-012).
 *
 * Beat 018's first pass asked it in `one-view.spec.ts` at the declared floor and at one window
 * below it, and that was the hole a 6,584 px scrolling column walked through: a property
 * asserted at one size is a property nobody has tested at any other. `viewport-matrix.spec.ts`
 * now asks the same question at every viewport in the declared matrix, and it asks it with
 * **this** code rather than with a copy of it -- two censuses that each agree with the
 * requirement can still disagree with each other.
 *
 * ## What the fifth pass changed, and why the fourth could not see it
 *
 * The fourth pass looked only at elements whose computed `overflow` was `auto` or `scroll`.
 * That is a filter on the *declaration* and not on the *fact*: an element that overflows its
 * box with `overflow: visible` spills its content onto whatever is beside it, and one with
 * `overflow: hidden` cuts it off, and neither was counted. Both were on the surface while the
 * suite was green -- the pre-row centre's field spilled its own label 71 px onto the term list
 * beside it, at every viewport, and the manifest tab's two terms were cut off at every
 * viewport. So this walks **every** element and reports any whose content runs more than a
 * pixel past its own client box, on either axis, whatever its `overflow` says.
 *
 * The fourth pass also read the provenance tabs in the same task as the click that opened
 * them. The layout manager mounts a panel asynchronously, so what the census measured was
 * sometimes the tab that had just closed. That is what made the manifest's clipping look like
 * a flake: it was reported at three viewports of six and dismissed as marginal, when in fact
 * `scrollHeight` was 59 px against a client box of 12 to 53 px at **all** six. `selectTab`
 * now waits for the pane the tab names and for the arrangement to stop moving.
 *
 * What it asserts:
 *
 * 1. **the page does not scroll**, on either axis;
 * 2. **every element that overflows its box is one of three things**, decided in code: a
 *    declared list, an entry in `EXEMPT` with a written reason, or a defect. There is no
 *    fourth outcome and no threshold that hides the small ones;
 * 3. **a declared list says which list**, and never holds a body of text;
 * 4. **nothing is clipped by its pane**: a pane whose content does not fit is a fault whether
 *    it scrolls or not, and `overflow: hidden` is how not-fitting hides from a scrollbar test;
 * 5. **no two pieces of text are painted on top of each other.** This is a different property
 *    from overflow and it needs its own walk: a box can overflow without landing on anything,
 *    and a placed element can land on its neighbour without overflowing anything. The author
 *    reported *"the Horizons panel has text overwriting other text"* on a tree whose overflow
 *    census was green.
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

/** How far past its own box content may run before the census calls it overflow, in CSS px. */
export const OVERFLOW_TOLERANCE_PX = 1;

/** How far two pieces of text may intersect before the census calls it an overlap, in CSS px. */
export const OVERLAP_TOLERANCE_PX = 1;

/**
 * An element that overflows its box on purpose, and the reason it is allowed to.
 *
 * This list is the whole of the second outcome. It is here rather than spread through the walk
 * as conditions so that it can be **read**: every entry names a thing, the axis it is excused
 * on, and why -- and `because` is not decoration. An entry with an empty reason excuses
 * nothing (`exemptionsApply` drops it, so its element is reported as a defect) and
 * `unreviewableExemptions` names it. A threshold hides findings without saying so; a list with a
 * reason each cannot.
 */
export interface Exemption {
  /** What it is, in the surface's own words. */
  readonly what: string;
  /** The element, or an ancestor of it: matched with `matches` and with `closest`. */
  readonly matches: string;
  /** Which axis is excused. Anything on the other axis is still a defect. */
  readonly axis: 'horizontally' | 'vertically' | 'either';
  /** Why this is not a fault. Reviewable by somebody who was not here. */
  readonly because: string;
}

export const EXEMPT: readonly Exemption[] = [
  {
    what: 'the marks as text',
    matches: '.mark-list',
    axis: 'either',
    because:
      'a canvas says nothing to a reader who cannot see it, so every mark drawn over a field ' +
      'is also a list item. It is visually hidden -- 1 px square, `clip-path: inset(50%)` -- ' +
      'and painted nowhere, so its 744 px of content lands on nothing. It is in the ' +
      'accessibility tree, which is the whole of what it is for.',
  },
  {
    what: 'a closed disclosure',
    matches: 'details:not([open])',
    axis: 'either',
    because:
      "a closed `details` keeps its contents' layout boxes -- the engine hides them with " +
      '`content-visibility` rather than with `display: none` -- so a control folded away is ' +
      'measurable and painted nowhere. The manifest tab reported 253 px of button in a 209 px ' +
      'row that way before its own controls were made to fit, and nothing on the surface needs ' +
      'this entry today. It stays because what a reader sees when they open a disclosure is a ' +
      'state of its own, and that is the state to measure: `one-view.spec.ts` opens the paste ' +
      'box at the declared floor and asks the same census of it.',
  },
  {
    what: "the layout manager's live region",
    matches: '.dv-live-region',
    axis: 'either',
    because:
      'dockview announces panel changes through a visually hidden live region of its own. Like ' +
      'the mark list it is clipped to nothing and painted nowhere.',
  },
  {
    what: "the layout manager's tab strip",
    matches: '.dv-tabs-container',
    axis: 'horizontally',
    because:
      'the four provenance tabs need 464 px and the strip is 374 px wide at 1 920 x 900. It is ' +
      'a list of tabs and it scrolls as one, on the layout manager\'s own scrollbar, which is ' +
      'painted under the strip and is 4 px tall: measured, a wheel over the strip moves it to ' +
      'scrollLeft 90 and the Manifest tab comes fully inside the box. It carries no ' +
      '`data-scrolls` because it is not this surface\'s element to stamp.',
  },
  {
    what: "the layout manager's tab label",
    matches: '.dv-default-tab',
    axis: 'vertically',
    because:
      "the label's line box is 18 px inside a 16 px content box: leading, not a glyph. The " +
      'strip is 26 px tall and paints the label whole, which the overlap census below checks ' +
      'by measuring the text itself rather than the box around it.',
  },
  {
    what: "the status strip's digest",
    matches: '[data-testid="status-digest"]',
    axis: 'horizontally',
    because:
      'a 64-character digest ellipsised to 8 rem, on purpose and since it arrived: what a ' +
      'reader does with this figure is compare two visits, and a prefix compares as well as ' +
      'the whole. The whole of it is on the manifest tab, which is where a figure somebody ' +
      'copies belongs, and it is one line so nothing is cut off below.',
  },
];

/**
 * How much of a reason an exemption has to give before it counts as one.
 *
 * G-08 holds help entries to the same bar and for the same reason: an entry that is only its
 * own boilerplate teaches a reader nothing, and an exemption that says "deliberate" excuses a
 * finding without anybody having to defend it. Letters, so that a selector pasted into the
 * reason does not clear the bar.
 */
const MINIMUM_LETTERS = 60;

const reasoned = (one: Exemption): boolean =>
  one.matches.trim() !== '' && (one.because.match(/[a-z]/gi) ?? []).length >= MINIMUM_LETTERS;

/** Every exemption that excuses anything: one with no reason written is not an exemption. */
export function exemptionsApply(): readonly Exemption[] {
  return EXEMPT.filter(reasoned);
}

/** Every exemption that is not reviewable, by name. Asserted by `one-view.spec.ts`. */
export function unreviewableExemptions(): readonly string[] {
  return EXEMPT.filter((one) => !reasoned(one)).map((one) => one.what);
}

/** What the census decided about an element that overflows its box. There is no fourth. */
export type Verdict = 'a declared list' | 'exempt' | 'a defect';

export interface Overflowing {
  readonly where: string;
  readonly pane: string;
  readonly declaredKind: string | null;
  readonly list: string | null;
  readonly holdsProse: readonly string[];
  readonly axis: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  /** How far past its own box the content runs, in CSS px, on whichever axis is worse. */
  readonly over: number;
  readonly verdict: Verdict;
  /** The exemption that excused it, with its reason, or null. */
  readonly exemption: string | null;
}

export interface Overlap {
  readonly pane: string;
  readonly one: string;
  readonly oneText: string;
  readonly other: string;
  readonly otherText: string;
  readonly wide: number;
  readonly tall: number;
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
  readonly overflowing: readonly Overflowing[];
  readonly overlaps: readonly Overlap[];
  readonly clipped: readonly Clipped[];
}

export async function measure(page: Page): Promise<Measured> {
  return page.evaluate(
    ({ cards, listKind, exemptions, overflowTolerance, overlapTolerance }) => {
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
      const painted = (element: Element, stopAt: Element | null): boolean => {
        if (element.closest('details:not([open])') !== null && element.tagName !== 'SUMMARY') return false;
        for (let at: Element | null = element; at !== null && at !== stopAt; at = at.parentElement) {
          const style = getComputedStyle(at);
          if (style.clipPath !== 'none' || style.visibility === 'hidden' || style.display === 'none') {
            return false;
          }
        }
        return true;
      };

      const nameOf = (element: Element): string => {
        const testId = (element as HTMLElement).dataset['testid'] ?? '';
        const classes = typeof element.className === 'string' ? element.className : '';
        return (
          element.tagName.toLowerCase() +
          (testId === '' ? '' : `[data-testid="${testId}"]`) +
          (classes === '' ? '' : `.${classes.trim().split(/\s+/).join('.')}`)
        );
      };

      const paneOf = (element: Element): string =>
        element.closest<HTMLElement>('[data-pane-id]')?.dataset['paneId'] ?? 'outside every pane';

      /* ---- 1. Everything that overflows its own box, whatever its `overflow` says. ---- */

      const overflowing: {
        where: string;
        pane: string;
        declaredKind: string | null;
        list: string | null;
        holdsProse: string[];
        axis: string;
        scrollWidth: number;
        clientWidth: number;
        scrollHeight: number;
        clientHeight: number;
        over: number;
        verdict: 'a declared list' | 'exempt' | 'a defect';
        exemption: string | null;
      }[] = [];

      for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        if (element.closest(cards) !== null) continue;
        const pastX = element.scrollWidth - element.clientWidth;
        const pastY = element.scrollHeight - element.clientHeight;
        const overflowsX = pastX > overflowTolerance;
        const overflowsY = pastY > overflowTolerance;
        if (!overflowsX && !overflowsY) continue;

        const declaredKind = element.dataset['scrolls'] ?? null;
        const list = element.dataset['list'] ?? null;
        const excused = exemptions.find(
          (one) =>
            (element.matches(one.matches) || element.closest(one.matches) !== null) &&
            (one.axis === 'either' ||
              (one.axis === 'horizontally' && !overflowsY) ||
              (one.axis === 'vertically' && !overflowsX)),
        );
        const verdict =
          declaredKind === listKind ? 'a declared list' : excused !== undefined ? 'exempt' : 'a defect';

        overflowing.push({
          where: nameOf(element),
          pane: paneOf(element),
          declaredKind,
          list,
          holdsProse: declaredKind === listKind ? proseIn(element) : [],
          axis: `${overflowsX ? 'horizontally' : ''}${overflowsX && overflowsY ? ' and ' : ''}${overflowsY ? 'vertically' : ''}`,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          over: Math.max(overflowsY ? pastY : 0, overflowsX ? pastX : 0),
          verdict,
          exemption: excused === undefined ? null : `${excused.what}: ${excused.because}`,
        });
      }

      /* ---- 2. Nothing is painted on top of anything else. ----

         Measured on the **text** rather than on the boxes around it. A block's rectangle is
         the whole grid cell it sits in, so two boxes may intersect while their words are
         nowhere near each other -- a help control in a panel's corner and the number at the
         left of the same row is the case that taught this. A `Range` over each element's own
         text nodes gives one rectangle per painted line, tight to the glyphs.

         Each rectangle is then cut down by every clipping ancestor, because a scroller's
         content and an ellipsised digest are not painted outside the box that clips them: what
         is not painted cannot land on anything. */

      const clipTo = (rect: DOMRect, element: Element): DOMRect | null => {
        let left = rect.left;
        let top = rect.top;
        let right = rect.right;
        let bottom = rect.bottom;
        for (let at: Element | null = element; at !== null; at = at.parentElement) {
          const style = getComputedStyle(at);
          if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
          const box = at.getBoundingClientRect();
          if (style.overflowX !== 'visible') {
            left = Math.max(left, box.left);
            right = Math.min(right, box.right);
          }
          if (style.overflowY !== 'visible') {
            top = Math.max(top, box.top);
            bottom = Math.min(bottom, box.bottom);
          }
        }
        if (right - left < 1 || bottom - top < 1) return null;
        return new DOMRect(left, top, right - left, bottom - top);
      };

      const runs: { element: Element; pane: string; text: string; rects: DOMRect[] }[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id] *'))) {
        if (element.closest(cards) !== null) continue;
        let own = '';
        const rects: DOMRect[] = [];
        for (const node of Array.from(element.childNodes)) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          if ((node.textContent ?? '').trim() === '') continue;
          own += node.textContent ?? '';
          const range = document.createRange();
          range.selectNode(node);
          for (const rect of Array.from(range.getClientRects())) {
            if (rect.width < 1 || rect.height < 1) continue;
            const kept = clipTo(rect, element);
            if (kept !== null) rects.push(kept);
          }
        }
        if (rects.length === 0 || own.trim() === '') continue;
        if (!painted(element, null)) continue;
        runs.push({
          element,
          pane: paneOf(element),
          text: own.replace(/\s+/g, ' ').trim().slice(0, 40),
          rects,
        });
      }

      const overlaps: {
        pane: string;
        one: string;
        oneText: string;
        other: string;
        otherText: string;
        wide: number;
        tall: number;
      }[] = [];
      for (let i = 0; i < runs.length; i += 1) {
        for (let j = i + 1; j < runs.length; j += 1) {
          const one = runs[i];
          const other = runs[j];
          if (one === undefined || other === undefined) continue;
          if (one.element.contains(other.element) || other.element.contains(one.element)) continue;
          let wide = 0;
          let tall = 0;
          for (const a of one.rects) {
            for (const b of other.rects) {
              const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (across > overlapTolerance && down > overlapTolerance && across * down > wide * tall) {
                wide = across;
                tall = down;
              }
            }
          }
          if (wide === 0) continue;
          overlaps.push({
            pane: one.pane === other.pane ? one.pane : `${one.pane} over ${other.pane}`,
            one: nameOf(one.element),
            oneText: one.text,
            other: nameOf(other.element),
            otherText: other.text,
            wide: Math.round(wide),
            tall: Math.round(tall),
          });
        }
      }

      /* ---- 3. Nothing is clipped by its pane: every pane's painted content is inside the
         pane's own rectangle. Content inside a declared list scroller is excluded -- that is
         what the declaration is for -- and so is a placed card, which is not laid out with the
         panes. ---- */

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
            worst = nameOf(element);
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
        overflowing,
        overlaps,
        clipped,
      };
    },
    {
      cards: PLACED_CARDS,
      listKind: LIST,
      exemptions: exemptionsApply().map((one) => ({
        what: one.what,
        matches: one.matches,
        axis: one.axis,
        because: one.because,
      })),
      overflowTolerance: OVERFLOW_TOLERANCE_PX,
      overlapTolerance: OVERLAP_TOLERANCE_PX,
    },
  );
}

/**
 * SC-001 and SC-008, in six assertions, each naming what it found and where.
 *
 * The census is printed **before** it is judged, so that a run which fails leaves the whole
 * census in the log and not only the first assertion that broke. Returns the tallest scroll it
 * saw, so a caller walking a matrix can report the worst of them as a figure rather than as a
 * verdict (SC-008).
 */
export async function holdsOneView(page: Page, state: string): Promise<number> {
  const measured = await measure(page);

  const tallest = measured.overflowing.reduce((worst, one) => Math.max(worst, one.over), 0);
  console.log(
    `    ${state}: page ${String(measured.page.scrollWidth)}x${String(measured.page.scrollHeight)} ` +
      `in ${String(measured.page.clientWidth)}x${String(measured.page.clientHeight)}; ` +
      `over its box: ${
        measured.overflowing
          .map(
            (one) =>
              `${one.pane}/${one.where} ${one.axis} by ${String(one.over)} px [${one.verdict}${
                one.verdict === 'a declared list' ? `: ${String(one.list)}` : ''
              }]`,
          )
          .join(' | ') || 'nothing'
      }`,
  );

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
   * FR-002, with no threshold in it. Everything that runs past its own box is a declared list,
   * an exemption with a reason, or a defect -- and the failure names the pane, the element,
   * the axis and both figures, because "the controls pane scrolled six paragraphs of
   * explanation" and "the manifest tab scrolled a manifest" are the same sentence to a test
   * that only counts scrollbars.
   */
  const defects = measured.overflowing.filter((one) => one.verdict === 'a defect');
  expect(
    defects.map(
      (one) =>
        `${one.pane} / ${one.where} overflows ${one.axis}: ` +
        `scrollWidth ${String(one.scrollWidth)} in clientWidth ${String(one.clientWidth)}, ` +
        `scrollHeight ${String(one.scrollHeight)} in clientHeight ${String(one.clientHeight)} ` +
        `(declaring ${String(one.declaredKind)})`,
    ),
    `in the "${state}" state these run past their own box and are neither a declared list nor ` +
      'an exemption with a written reason. A pane may scroll a list, and may never scroll a ' +
      'body of text or spill one onto its neighbour (FR-002)',
  ).toEqual([]);

  const unnamed = measured.overflowing.filter(
    (one) => one.verdict === 'a declared list' && (one.list ?? '').trim() === '',
  );
  expect(
    unnamed.map((one) => `${one.pane} / ${one.where}`),
    `in the "${state}" state these declare themselves lists and do not say which list`,
  ).toEqual([]);

  const prosy = measured.overflowing.filter((one) => one.holdsProse.length > 0);
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

  /*
   * Nothing is painted on top of anything else. The author found this by looking at the
   * surface -- "the Horizons panel has text overwriting other text" -- on a tree whose
   * overflow census was green, which is the whole argument for asking it separately.
   */
  expect(
    measured.overlaps.map(
      (one) =>
        `in the ${one.pane} pane, ${one.one} "${one.oneText}" is painted over ${one.other} ` +
        `"${one.otherText}": ${String(one.wide)} x ${String(one.tall)} px of them intersect`,
    ),
    `in the "${state}" state two pieces of text are painted on top of each other. Text over ` +
      'text is unreadable whether or not either box overflows, so it is asked of the words ' +
      'themselves rather than of the boxes around them',
  ).toEqual([]);

  return tallest;
}

/**
 * Select a provenance tab by the words on it, and wait until the pane it names is the one on
 * the surface.
 *
 * The waiting is the point. The layout manager mounts a panel asynchronously, so a census
 * taken in the same task as the click measures the tab that is closing: that is why the
 * manifest tab's clipping was reported at three viewports of six and called a flake. The tab
 * carries the pane's id, so what is waited for is the pane itself, and then two frames in
 * which no pane's rectangle moves.
 */
export async function selectTab(page: Page, title: string): Promise<void> {
  const tab = page.locator('.dv-tab', { hasText: title }).first();
  const paneId = await tab.getAttribute('data-tab-panel-id');
  expect(paneId, `no .dv-tab reads "${title}"`).not.toBeNull();
  await tab.click();
  await expect(page.locator(`[data-pane-id="${String(paneId)}"]`)).toBeVisible();
  await settled(page);
}

/** Two frames in which no pane's rectangle moves. */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const snapshot = (): string =>
          JSON.stringify(
            Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]')).map((pane) => {
              const box = pane.getBoundingClientRect();
              return [pane.dataset['paneId'], box.x, box.y, box.width, box.height];
            }),
          );
        const before = snapshot();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve(before === snapshot());
          });
        });
      }),
  );
}
