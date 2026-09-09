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

/**
 * Something painted outside its clipping ancestor that a reader is not meant to reach anyway.
 *
 * Held to the same bar as `EXEMPT`, in a list of its own because it excuses a different
 * finding: not "this box is bigger than itself" but "this thing is painted where nobody can
 * see it". The two questions have different answers -- a visually hidden list overflows *and*
 * is out of sight, and only the second is a reason it does not matter.
 */
export interface Reachable {
  /** What it is, in the surface's own words. */
  readonly what: string;
  /** The element, or an ancestor of it. */
  readonly matches: string;
  /** Why a reader not seeing this is not a fault. */
  readonly because: string;
}

export const REACHABLE: readonly Reachable[] = [
  {
    what: "the status strip's digest, ellipsised",
    matches: '[data-testid="status-digest"]',
    because:
      'a 64-character digest capped at 8 rem, on purpose and since it arrived: what a reader ' +
      'does with this figure is compare two visits, and a prefix compares as well as the ' +
      'whole. The end of it is genuinely not painted, which is why it is here rather than ' +
      'passing unnoticed, and the whole of it is on the manifest tab, which is where a figure ' +
      'somebody copies belongs. The overflow census carries the same exemption for the same ' +
      'measured reason.',
  },
  {
    what: "the layout manager's tab strip, scrolled",
    matches: '.dv-tabs-container',
    because:
      'the four provenance tabs need more width than the strip has at the narrower viewports, ' +
      'and the strip scrolls as one on the layout manager\'s own scrollbar -- measured, a ' +
      'wheel over it brings the Manifest tab fully inside the box. A tab out of sight in a ' +
      'strip that scrolls is reached the way any list item is reached, so the same exemption ' +
      'the overflow census carries applies here for the same measured reason.',
  },
];

const reachableReasoned = (one: Reachable): boolean =>
  one.matches.trim() !== '' && (one.because.match(/[a-z]/gi) ?? []).length >= MINIMUM_LETTERS;

/** Every out-of-sight exemption that excuses anything. */
export function reachableApply(): readonly Reachable[] {
  return REACHABLE.filter(reachableReasoned);
}

/** Every out-of-sight exemption that is not reviewable, by name. */
export function unreviewableReachable(): readonly string[] {
  return REACHABLE.filter((one) => !reachableReasoned(one)).map((one) => one.what);
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

/**
 * How much of a control or a line of text has to survive its clipping ancestors before the
 * census calls it reachable.
 *
 * A share and not a margin in pixels, because what matters is whether the thing is *there*: a
 * button with a tenth of itself showing is a button a reader cannot read the label of, at any
 * size. One is impossible to hold -- sub-pixel rounding takes a fraction off almost every box
 * -- and a half is the point past which the thing is more absent than present.
 */
export const VISIBLE_MINIMUM = 0.5;

/** An element painted, wholly or substantially, outside the box that clips it. */
export interface OutsideClip {
  readonly pane: string;
  /** The control or the text, by tag, test id and classes. */
  readonly what: string;
  /** Its words, so a failure names the control a reader was looking for. */
  readonly text: string;
  readonly kind: 'a control' | 'text';
  /** The ancestor that took the most off it, and how it clips. */
  readonly clippedBy: string;
  readonly clipRect: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };
  readonly ownRect: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };
  /** How much of the element's own area survives every clip, from 0 to 1. */
  readonly visible: number;
  readonly verdict: 'reachable' | 'exempt' | 'a defect';
  readonly exemption: string | null;
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
  readonly outside: readonly OutsideClip[];
}

export async function measure(page: Page): Promise<Measured> {
  return page.evaluate(
    ({ cards, listKind, exemptions, reachable, overflowTolerance, overlapTolerance, visibleMinimum }) => {
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

      /* Inside a pane, and inside a modal decision. The modal is not laid out with the panes --
         it is in the top layer, against the viewport -- but it carries words a reader has to
         read, and two of them printed on top of each other would be as unreadable there as
         anywhere else. */
      const runs: { element: Element; pane: string; text: string; rects: DOMRect[] }[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id] *, .modal *'))) {
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
          /* A modal is drawn **over** the workspace on purpose -- that is what the top layer is
             -- so its words landing on the words behind it is the feature and not the fault.
             What is asked of it is that its own words do not land on each other, which is the
             same question asked of every pane. */
          if ((one.element.closest('.modal') === null) !== (other.element.closest('.modal') === null)) {
            continue;
          }
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

      /* ---- 4. Nothing a reader has to see or reach is painted outside the box that clips it.

         Check 3 asks whether a **pane's** content fits the pane. That is a question about one
         element, and it is the question that missed the defect this check was written for: the
         over-budget notice was 1,012 px of content in a controls pane that had grown to hold
         it, inside a dockview part 656 px tall with `overflow: hidden`. Every element measured
         as fitting its own box and as fitting the pane's; the pane did not fit its *ancestor*,
         and `Integrate anyway` was painted 356 px below the bottom of the window with no
         scrollbar anywhere to reach it. A control a reader cannot see or reach is the defect,
         whichever box did the clipping.

         So this walks up from each control and each line of text through the ancestors that
         actually clip it -- respecting `position`, because a fixed card is not clipped by the
         pane it is drawn over -- and intersects the element with each of their boxes. An
         ancestor a reader can scroll is not counted: content inside a scroller is reached by
         scrolling, which is what a scroller is. What is left is content behind `overflow:
         hidden`, or outside the window, which is reached by nothing. ---- */

      const viewport = { left: 0, top: 0, right: root.clientWidth, bottom: root.clientHeight };

      /** Whether this element establishes a containing block for fixed and absolute descendants. */
      const anchors = (style: CSSStyleDeclaration): boolean =>
        style.transform !== 'none' ||
        style.filter !== 'none' ||
        style.perspective !== 'none' ||
        style.willChange.includes('transform') ||
        style.willChange.includes('filter') ||
        /paint|layout|strict|content/.test(style.contain);

      interface Clipper {
        what: string;
        box: typeof viewport;
        clipsX: boolean;
        clipsY: boolean;
        scrollsX: boolean;
        scrollsY: boolean;
      }

      /**
       * Every box that clips this element, nearest first, with the window last.
       *
       * It starts at the element and not at its parent, and that is not a detail: the manifest
       * is a `<pre>` whose own text is its child, and it is its **own** declared scroller. Left
       * out of its own walk, its text was measured where the scroller had put it and judged
       * against the pane -- 83 per cent of a manifest reported unreachable while a reader can
       * read all of it with a wheel.
       */
      const clippersOf = (element: Element): Clipper[] => {
        const found: Clipper[] = [];
        let position = getComputedStyle(element).position;
        for (let at: Element | null = element; at !== null; at = at.parentElement) {
          const style = getComputedStyle(at);
          const anchored = anchors(style);
          const positioned = style.position !== 'static' || anchored;
          /* A fixed element is laid out in the window, so only an ancestor that anchors it
             clips it; an absolute one is clipped only by a positioned ancestor. Everything
             else is clipped by every overflowing ancestor above it -- and an element always
             clips its own content, whatever its position. */
          const holds =
            at === element
              ? true
              : position === 'fixed'
                ? anchored
                : position === 'absolute'
                  ? positioned
                  : true;
          if (holds) {
            const box = at.getBoundingClientRect();
            const clipsX = style.overflowX !== 'visible';
            const clipsY = style.overflowY !== 'visible';
            /* An axis a reader can scroll is an axis on which nothing is out of reach: what is
               below the fold of a list comes up on a wheel. It is the same fact check 2 exempts
               a declared list for, and it has to be known here as well, or every item below the
               fold of every list on the surface is reported as unreachable. */
            const scrollsX =
              (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
              at.scrollWidth - at.clientWidth > 1;
            const scrollsY =
              (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
              at.scrollHeight - at.clientHeight > 1;
            if (clipsX || clipsY) {
              found.push({
                what: nameOf(at),
                box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
                clipsX,
                clipsY,
                scrollsX,
                scrollsY,
              });
            }
            /* Above an ancestor that contains it, the element travels with that ancestor, so
               it is that ancestor's positioning that decides what clips next. */
            position = style.position;
          }
        }
        /* The window itself. The page does not scroll -- check 1 says so -- so anything
           painted outside it is out of sight for the same reason. */
        found.push({
          what: 'the window',
          box: viewport,
          clipsX: true,
          clipsY: true,
          scrollsX: false,
          scrollsY: false,
        });
        return found;
      };

      const areaOf = (rects: DOMRect[]): number =>
        rects.reduce((sum, one) => sum + one.width * one.height, 0);

      const outside: {
        pane: string;
        what: string;
        text: string;
        kind: 'a control' | 'text';
        clippedBy: string;
        clipRect: { top: number; bottom: number; left: number; right: number };
        ownRect: { top: number; bottom: number; left: number; right: number };
        visible: number;
        verdict: 'reachable' | 'exempt' | 'a defect';
        exemption: string | null;
      }[] = [];

      const CONTROLS =
        'a[href], button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';

      /* One walk over both populations: every control, and every element with words of its
         own. A control is measured by its border box -- half a button is half a control -- and
         text by the rectangles of its own lines, which is what the overlap census measures for
         the same reason: a block's box is the grid cell it sits in. */
      const candidates = new Map<Element, 'a control' | 'text'>();
      for (const element of Array.from(document.querySelectorAll<HTMLElement>(CONTROLS))) {
        candidates.set(element, 'a control');
      }
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        if (candidates.has(element)) continue;
        for (const node of Array.from(element.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') {
            candidates.set(element, 'text');
            break;
          }
        }
      }

      for (const [element, kind] of candidates) {
        if (!painted(element, null)) continue;
        const rects: DOMRect[] = [];
        if (kind === 'a control') {
          const box = element.getBoundingClientRect();
          if (box.width >= 1 && box.height >= 1) rects.push(box);
        } else {
          for (const node of Array.from(element.childNodes)) {
            if (node.nodeType !== Node.TEXT_NODE) continue;
            if ((node.textContent ?? '').trim() === '') continue;
            const range = document.createRange();
            range.selectNode(node);
            for (const rect of Array.from(range.getClientRects())) {
              if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
            }
          }
        }
        if (rects.length === 0) continue;
        const own = areaOf(rects);
        if (own < 1) continue;

        /*
         * How much of it a reader can put on screen, as a share of itself.
         *
         * A share carried through the walk rather than one comparison at the end, because the
         * two things an ancestor can do to a rectangle are different in kind. An axis it clips
         * and cannot scroll **takes** part of the rectangle: that share is lost, and the
         * ancestor that took the most is the one to name. An axis it can scroll takes nothing
         * -- it only decides *where* the rectangle is -- so the rectangle is moved into the
         * scroller's own box, as a wheel would move it, and the walk goes on from there. That
         * way an item below the fold of a list is judged by whether the **list** is on screen,
         * which is the only honest question to ask about it.
         */
        const clippers = clippersOf(element);
        let kept = rects.map((one) => new DOMRect(one.x, one.y, one.width, one.height));
        let visible = 1;
        let worstBy = '';
        let worstBox = viewport;
        let worstTook = 0;
        for (const clipper of clippers) {
          const before = areaOf(kept);
          const cutX = clipper.clipsX && !clipper.scrollsX;
          const cutY = clipper.clipsY && !clipper.scrollsY;
          if (cutX || cutY) {
            const next: DOMRect[] = [];
            for (const rect of kept) {
              const left = cutX ? Math.max(rect.left, clipper.box.left) : rect.left;
              const right = cutX ? Math.min(rect.right, clipper.box.right) : rect.right;
              const top = cutY ? Math.max(rect.top, clipper.box.top) : rect.top;
              const bottom = cutY ? Math.min(rect.bottom, clipper.box.bottom) : rect.bottom;
              if (right - left > 0 && bottom - top > 0) {
                next.push(new DOMRect(left, top, right - left, bottom - top));
              }
            }
            kept = next;
            const took = before - areaOf(kept);
            if (before > 0) visible *= areaOf(kept) / before;
            if (took > worstTook) {
              worstTook = took;
              worstBy = clipper.what;
              worstBox = { ...clipper.box };
            }
          }
          if (kept.length === 0) break;
          const scrollX = clipper.clipsX && clipper.scrollsX;
          const scrollY = clipper.clipsY && clipper.scrollsY;
          if (scrollX || scrollY) {
            /* Scrolled into view: the lines are taken together, because a wheel moves them
               together, and placed inside the scroller's box on the axis it scrolls. */
            const one = kept.reduce(
              (box, rect) => ({
                left: Math.min(box.left, rect.left),
                top: Math.min(box.top, rect.top),
                right: Math.max(box.right, rect.right),
                bottom: Math.max(box.bottom, rect.bottom),
              }),
              { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
            );
            if (scrollX) {
              one.left = clipper.box.left;
              one.right = Math.min(clipper.box.right, clipper.box.left + (one.right - one.left));
            }
            if (scrollY) {
              one.top = clipper.box.top;
              one.bottom = Math.min(clipper.box.bottom, clipper.box.top + (one.bottom - one.top));
            }
            kept = [new DOMRect(one.left, one.top, one.right - one.left, one.bottom - one.top)];
          }
        }
        if (kept.length === 0) visible = 0;
        if (visible >= 1 - 1e-6) continue;

        const union = rects.reduce(
          (box, one) => ({
            left: Math.min(box.left, one.left),
            top: Math.min(box.top, one.top),
            right: Math.max(box.right, one.right),
            bottom: Math.max(box.bottom, one.bottom),
          }),
          { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const excused = reachable.find(
          (one) => element.matches(one.matches) || element.closest(one.matches) !== null,
        );
        outside.push({
          pane: paneOf(element),
          what: nameOf(element),
          text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
          kind,
          clippedBy: worstBy,
          clipRect: {
            top: Math.round(worstBox.top),
            bottom: Math.round(worstBox.bottom),
            left: Math.round(worstBox.left),
            right: Math.round(worstBox.right),
          },
          ownRect: {
            top: Math.round(union.top),
            bottom: Math.round(union.bottom),
            left: Math.round(union.left),
            right: Math.round(union.right),
          },
          visible: Math.round(visible * 1000) / 1000,
          verdict:
            visible >= visibleMinimum ? 'reachable' : excused !== undefined ? 'exempt' : 'a defect',
          exemption: excused === undefined ? null : `${excused.what}: ${excused.because}`,
        });
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
        outside,
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
      reachable: reachableApply().map((one) => ({
        what: one.what,
        matches: one.matches,
        because: one.because,
      })),
      overflowTolerance: OVERFLOW_TOLERANCE_PX,
      overlapTolerance: OVERLAP_TOLERANCE_PX,
      visibleMinimum: VISIBLE_MINIMUM,
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
  return judgeOneView(await measure(page), state);
}

/**
 * The census's verdict, apart from the taking of it.
 *
 * Split out because one state cannot be measured and judged in one call: the integrating state
 * lasts as long as an advance does, and `holdsOneViewIntegrating` below has to know it caught
 * the surface in that state *before* it starts asserting things about it. Every other caller
 * asks `holdsOneView`, which is these two in the order they were always in.
 */
export function judgeOneView(measured: Measured, state: string): number {
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
  console.log(
    `    ${state}: painted outside what clips it: ${
      measured.outside
        .map(
          (one) =>
            `${one.pane}/${one.what} ${String(Math.round(one.visible * 100))}% visible inside ` +
            `${one.clippedBy} [${one.verdict}]`,
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
   * Nothing a reader has to reach is painted outside the box that clips it (spec 018 FR-016).
   *
   * The check above asks whether a pane's content fits the pane, and that is why it reported
   * nothing on the day *Integrate anyway* was 356 px below the foot of the window: the pane had
   * grown to hold the notice, and it was the pane's own **ancestor** that clipped it. This one
   * names the control and the ancestor that cut it off, because "something is clipped
   * somewhere" is not a report anybody can act on.
   */
  const unreachable = measured.outside.filter((one) => one.verdict === 'a defect');
  expect(
    unreachable.map(
      (one) =>
        `${one.pane} / ${one.what} (${one.kind}${one.text === '' ? '' : `, "${one.text}"`}) is ` +
        `painted ${String(Math.round((1 - one.visible) * 100))}% outside ${one.clippedBy}: it ` +
        `runs ${String(one.ownRect.top)}..${String(one.ownRect.bottom)} down and ` +
        `${String(one.ownRect.left)}..${String(one.ownRect.right)} across, and the clip is ` +
        `${String(one.clipRect.top)}..${String(one.clipRect.bottom)} by ` +
        `${String(one.clipRect.left)}..${String(one.clipRect.right)}`,
    ),
    `in the "${state}" state something a reader has to see or reach is painted outside the box ` +
      'that clips it. An element that fits its own box and its own pane can still be painted ' +
      'outside an ancestor of the pane, where there is no scrollbar to reach it and no ' +
      'overflow for an overflow census to find',
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
 * The configuration request the shell makes, so a test can answer it with a figure of its own.
 *
 * One figure is changed to census the integrating state, and it is `model.chunkSteps`: how far
 * an advance goes before it yields (NFR-04). Set to one step it yields 180 times instead of
 * three, which changes nothing about how far the run goes -- `tests/harness/advance.test.ts`
 * holds every chunking to the same bytes -- and gives the census somewhere to stand.
 */
export const CONFIG_REQUEST = /j-ocean.*\.json$/;

/**
 * Press the advance and see it through, whether or not the budget stops to ask.
 *
 * The over-budget question was a banner in the controls pane until beat 018's eighth pass, and
 * a test that pressed the advance and then pressed something else went on working whether the
 * question was up or not. What the surface was letting through was a reader clicking past a
 * question it had just asked, with the advance suspended behind it. It is a modal now, so the
 * question is answered before anything else happens -- here, the way a reader who wants the
 * advance would answer it.
 *
 * Asked *if it is asked* rather than waited for, because whether the projected time exceeds the
 * declared budget depends on how fast the machine running the suite is. The tests that are
 * **about** the refusal serve themselves a budget no machine can meet; these are the ones that
 * merely need a run with some host time in it.
 */
export async function advanceThroughTheBudget(page: Page, timeout = 120_000): Promise<void> {
  await page.getByTestId('advance').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="over-budget"]') !== null ||
      document.querySelector<HTMLButtonElement>('[data-testid="advance"]')?.disabled === false,
    undefined,
    { timeout },
  );
  if ((await page.getByTestId('over-budget').count()) > 0) {
    await page.getByTestId('proceed-anyway').click();
  }
  await expect(page.getByTestId('advance')).toBeEnabled({ timeout });
}

/**
 * The reader's own declared font size, set the way a reader sets it (spec 018 FR-016).
 *
 * Not an injected stylesheet and not a page zoom. `Page.setFontSizes` is the browser's own
 * default text size -- the preference under *Appearance* -- so what changes is the root font
 * size, which is what every `rem` on this surface is measured in and what the reader actually
 * has a control for. A stylesheet planted by a test would be a different mechanism producing a
 * similar picture, and it is the mechanism that is the subject: SRD-v2's edge cases name *"deep
 * browser zoom, or a large declared font"*, and nothing had ever tested either.
 */
export async function readerFontSize(page: Page, px: number): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: px } });
}

/**
 * The reader's font sizes the censuses are run at, beside the 16 px default (spec 018 FR-016).
 *
 * Two sizes and not a sweep. 20 px and 24 px are half again and half as much again as the
 * default, which is the range a reader reaches with two or three presses of the browser's own
 * text-size control; below 20 nothing on this surface has ever moved, and above 24 the
 * question stops being *does the layout hold* and becomes *what should a workspace of seven
 * panes do on a screen that now holds a third of what it did*, which is a different beat.
 */
export const READER_FONTS: readonly number[] = [20, 24];

/** Yield after every step, so the integrating state has gaps a census can be taken in. */
export async function yieldEveryStep(page: Page): Promise<void> {
  await page.route(CONFIG_REQUEST, async (route) => {
    const response = await route.fetch();
    const config = JSON.parse(await response.text()) as { model: { chunkSteps: number } };
    config.model.chunkSteps = 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(config),
    });
  });
}

/**
 * How much slower than the machine the browser runs the page while the advance is censused.
 *
 * The shipped advance is 180 steps and is over in about a seventh of a second, and a census
 * taken across a socket costs more than that to ask -- so unthrottled, every attempt measures
 * the surface *after* the advance and calls it the integrating state. The browser's own CPU
 * throttle holds the state open without changing a declared figure, a step count, or what any
 * label says: it slows the page and nothing else. Thirty is measured rather than chosen -- at
 * ten the advance was over before the census returned, and at thirty the census lands about
 * seven steps in with the state still up.
 */
const CENSUS_THROTTLE = 30;

/**
 * The census of an advance: while it runs, and once it has finished (spec 018 FR-002).
 *
 * A new state for the census, and the author's request is why: a control that relabels itself
 * while it works and a confirmation that appears when it is done are exactly the things that
 * overflow a box, land on a neighbour or wrap a strip to two rows. Neither had ever been
 * measured, because neither had ever been on the surface.
 *
 * It is reached the way a reader reaches it -- press, be refused on the frame budget, press
 * *Integrate anyway* -- rather than by routing the budget out of the way, because the figure
 * the strip prints is that budget and a test that changes it is measuring a strip no reader
 * has. The refusal is certain under the throttle: the projected time for the longest horizon
 * is thousands of times the declared 16 ms.
 */
export async function holdsOneViewIntegrating(page: Page, where: string): Promise<number> {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: CENSUS_THROTTLE });
  let tallest = 0;
  try {
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('over-budget')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('proceed-anyway').click();
    /* Let the arrangement stop moving first, for the reason `selectTab` does: the layout
       manager sizes its panes asynchronously, so a census taken in the same task as the click
       measures an arrangement that is still moving. It is not what keeps this state green --
       the surface holds the strip's height across an advance so that the dock is never resized
       under a reader mid-integration (see `.status-figures dd` and `.announcement` in
       `index.css`, and what the census found before they did) -- but a census that measures
       before the layout manager has answered is measuring nothing in particular. */
    await settled(page);
    const measured = await measure(page);
    // Measured first and judged after, because the state has to be the one that was asked
    // about: a census of the integrating state taken after the advance ended is a census of
    // something else that would pass and mean nothing.
    expect(
      await page.getByTestId('one-view').getAttribute('data-working'),
      `the advance was over before the census of "${where}, integrating" could be taken`,
    ).toBe('integrating');
    tallest = judgeOneView(measured, `${where}, integrating`);
  } finally {
    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }

  await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 120_000 });
  await expect(page.getByTestId('advance-report')).toContainText('Integrated');
  return Math.max(tallest, await holdsOneView(page, `${where}, integrated`));
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
