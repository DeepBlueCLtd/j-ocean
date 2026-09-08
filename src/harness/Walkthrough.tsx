import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Configuration } from '../config/schema.js';
import { REGIONS, type RegionId } from './panels.js';
import { Declared } from './figures.js';

/**
 * The walkthrough, returned and masking (SRD-v2 §8.1; spec 018 US5, FR-009, FR-014, T040,
 * T041, T080 to T086).
 *
 * Beat 016 retired a walkthrough and was right to: a reader confused by attribution wants
 * attribution explained, not a tour that begins three panels away, and panel help answers
 * *what is this panel* where the reader already is. This one answers a different question.
 *
 * A workspace of docked panes raises **what am I looking at** — which pane is which, why they
 * are divided the way they are, and what a reader may do to the arrangement. Panel help cannot
 * answer that, because the answer is not about any one panel. So the two coexist, and the
 * division is the question each answers rather than a compromise between them.
 *
 * Four properties are the requirement rather than the styling.
 *
 * **It is offered and never imposed.** There is no first-visit flag, no storage, and no effect
 * that starts it: it runs when a reader presses the control and at no other time. A tour that
 * started by itself would be the surface deciding a reader was confused.
 *
 * **Every step names a pane that exists.** `step.pane` is a `RegionId`, so a step for a pane
 * the layout does not draw does not compile, and `tests/shell/walkthrough.spec.ts` walks every
 * step in a browser and requires the pane it names to be on the surface. A tour that pointed
 * at a rectangle that is not there is the staleness FR-054 exists to prevent, arriving through
 * the one door that beat left open.
 *
 * **A step masks everything it is not about, and the mask moves with the pane.** This reverses
 * a decision, and the reversal is the author's: until this pass the card was placed near the
 * pane it named and *nothing was covered*, on the reasoning that a reader should be able to
 * drag the issue time with the tour open. That reasoning answered the wrong question. *What am
 * I looking at* is answered by suppressing what you are **not** looking at, and a card in a
 * corner of a workspace of seven rectangles points at nothing in particular. So the scrim is
 * back, with the subject beat 016 deleted along with the spotlight: **the hole is the named
 * pane's own rectangle**, measured from the pane element rather than guessed, and the card is
 * placed beside it.
 *
 * Three things follow from that, and each is a requirement rather than a nicety.
 *
 * - **The hole follows the pane.** A reader may drag a sash, move a tab or resize the window
 *   while a step is open, and a mask that was correct only until they touched something would
 *   be worse than no mask: it would light the wrong rectangle and say nothing about it. So the
 *   rectangle is re-measured on every layout event the workspace can produce — a
 *   `ResizeObserver` over the pane and the dock, a `MutationObserver` over the dock's own
 *   subtree, and the window's resize and scroll — rather than read once when the step opened.
 * - **It masks and it does not reflow.** The scrim and the card are `position: fixed` and no
 *   pane is told anything, so opening the walkthrough and advancing it change **no** region's
 *   bounding rectangle, asserted to the pixel like beat 016's help and beat 015's enlargement.
 * - **The lit pane is operable and the dimmed area is not.** The scrim takes the clicks that
 *   land on it and closes on them; the hole is cut out of it, so what a step lights a reader
 *   can still work. A reader must not be able to act on a pane they cannot see, which is the
 *   half of "not modal" that the no-scrim decision got wrong. The control that opened the
 *   walkthrough stays above the scrim, because the way out may not be behind the thing it
 *   would close.
 *
 * Nothing animates. The mask is in its new place, not on its way there: this surface animates
 * nothing anywhere (beat 017 holds that as one claim over every element), so
 * `prefers-reduced-motion` asks nothing of the mask that is not already true of it.
 *
 * **It teaches and does not report.** A step takes the validated configuration and nothing
 * else: it cannot reach a run, a forecast or a score, because there is nothing here to reach
 * them with. That is FR-055's discipline applied to the second explainer, for FR-055's reason:
 * a second source for a live fact is the one that goes stale.
 */

export interface WalkthroughStep {
  /** The pane this step is about. One of the panes the layout draws, checked by the type. */
  readonly pane: RegionId;
  readonly title: string;
  readonly body: (config: Configuration) => ReactNode;
}

/**
 * The steps, in order.
 *
 * Two of them are **reclaimed** from beat 016's disposition record rather than newly written,
 * and `docs/narrative-disposition.json` records them as moving back. Beat 016 sent step 1's
 * opening to the site's welcome page and step 2's to the site's account of the four regions,
 * on the reasoning that a workspace-level explanation had nowhere to live once the tour was
 * gone. It has somewhere again, and a record that said only where matter went once would be a
 * record that cannot describe matter returning.
 */
export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    pane: 'status',
    title: 'What you are looking at',
    body: () => (
      <p>
        j-ocean is a teaching harness: a small, real ocean model, the simulated instruments that
        measure it, and an honest account of what each measurement was worth. It forecasts
        nothing you should act on.
      </p>
    ),
  },
  {
    pane: 'controls',
    title: 'Everything you can change',
    body: () => (
      <p>
        One pane for every cause: which ocean, when the forecast was issued, which instruments
        the analysis was allowed to see, and whether quality control was running. Change any of
        them and every panel and every score answers where they are, without you moving.
      </p>
    ),
  },
  {
    pane: 'horizons',
    title: 'The forecast, at every horizon at once',
    body: (config) => (
      <p>
        One panel per declared horizon &mdash;{' '}
        <Declared>{config.horizons.leadHours.join(', ')} h</Declared> &mdash; all visible
        together rather than behind a slider, each carrying its own skill figures beneath its
        own picture. A forecast is a shape over lead time, and a shape cannot be seen one frame
        at a time.
      </p>
    ),
  },
  {
    pane: 'selection',
    title: 'Whatever you last selected',
    body: () => (
      <p>
        Click a cell on any field and this pane fills with that cell&rsquo;s own breakdown;
        click a measurement&rsquo;s mark and it fills with that profile beside the
        model&rsquo;s derived one. Filling it moves nothing else, which is the point of it
        having a pane of its own.
      </p>
    ),
  },
  {
    pane: 'provenance',
    title: 'Where every figure came from',
    body: () => (
      <p>
        The run, the instruments, the record it is scored against and the manifest it replays
        from, as tabs. Every figure on this surface is typed by where it came from, and this is
        where the ones that describe the run itself are published.
      </p>
    ),
  },
  {
    pane: 'horizons',
    title: 'When the window is too narrow',
    body: (config) => (
      <>
        <p>
          All{' '}
          <Declared>{config.horizons.leadHours.length}</Declared> declared horizons side by
          side, each at the declared minimum of{' '}
          <Declared>{config.presentation.minimumPanelWidthPx} px</Declared>, want a viewport at
          least{' '}
          <Declared>{config.presentation.minimumViewportWidthPx} px</Declared> wide once the two
          flanking panes have taken the least they can be read at. It is a width, because width
          is what a row of six is short of; the workspace itself needs{' '}
          <Declared>{config.presentation.minimumViewportHeightPx} px</Declared> of height, which
          is less than the shortest laptop has. Both figures were measured from the built
          workspace, not chosen.
        </p>
        <p>
          Narrower than that, the workspace is unchanged and its centre shows one horizon at a
          time. The strip carries all of them and what each was worth, because comparison
          across horizons is the lesson; choosing one in the strip swaps the panel beneath it.
          Widen the window past the figure above and the row returns without a reload.
        </p>
      </>
    ),
  },
  {
    pane: 'status',
    title: 'The workspace is yours to arrange',
    body: () => (
      <p>
        Drag a sash to resize a pane, drag a tab to move or group one, and the arrangement you
        leave is the arrangement you return to. Only the furniture is remembered: no seed, no
        manifest and nothing the run computed, which travel as a manifest and are rebuilt rather
        than restored. <em>Default arrangement</em> puts it all back.
      </p>
    ),
  },
];

/** Every pane the steps name, for the test that holds them against the layout. */
export const WALKTHROUGH_PANES: readonly RegionId[] = WALKTHROUGH_STEPS.map((step) => step.pane);

export interface WalkthroughProps {
  readonly config: Configuration;
}

/** A rectangle in viewport coordinates. The mask's hole, and the pane it was measured from. */
interface Hole {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The elements that are the pane a step names.
 *
 * One selector, and it is the one `tests/shell/walkthrough.spec.ts` uses to ask whether a step's
 * pane is on the surface — `data-pane-id`, written by the layout manager onto the element it
 * makes for each pane. The prefixed form is the provenance pane, whose four tabs are four
 * panels of one pane: only the selected tab has a rectangle, so what `measure` unions is the
 * group that tab is in, and a pane a reader has split across two groups is both of them.
 *
 * The status strip matches the plain form and is not in the dock at all, which is the point of
 * asking the surface rather than the layout manager.
 */
function paneElements(pane: RegionId): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-pane-id="${pane}"], [data-pane-id^="${pane}/"]`,
    ),
  );
}

/**
 * The rectangle a step lights: the pane's own, measured now.
 *
 * `getBoundingClientRect` and not a figure from configuration, because the whole claim of the
 * mask is that the lit rectangle **is** the pane. A pane's width is whatever the reader last
 * dragged it to; a declared width would light where the pane started.
 *
 * **The pane, tab strip and all.** The element that carries `data-pane-id` is the pane's body,
 * and for a docked pane the layout manager puts its tabs in a strip 26 px above that body. The
 * hole is the group's rectangle where there is one, so a lit pane's tabs can be pressed and
 * dragged — a step that says *the run, the instruments, the record and the manifest, as tabs*
 * while making the tabs unpressable would be teaching what it forbids, and "the lit pane stays
 * operable" is a requirement rather than a nicety. Nothing here is guessed: the strip is part
 * of an element with a rectangle of its own, and the fallback is the pane's own body, which is
 * what the status strip is — it is not in the dock and has no tabs.
 */
function measure(pane: RegionId): Hole | null {
  let hole: Hole | null = null;
  for (const element of paneElements(pane)) {
    const rect = (element.closest<HTMLElement>('.dv-groupview') ?? element).getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    hole =
      hole === null
        ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
        : {
            left: Math.min(hole.left, rect.left),
            top: Math.min(hole.top, rect.top),
            right: Math.max(hole.right, rect.right),
            bottom: Math.max(hole.bottom, rect.bottom),
          };
  }
  return hole;
}

const same = (a: Hole | null, b: Hole | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.left === b.left &&
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom);

/**
 * The pane's rectangle, kept true while the step is open (FR-014, second clause).
 *
 * The reader may drag a sash, drag a tab into another group, close a pane or resize the window
 * with a step open, and each of those moves the rectangle the step is about. A mask measured
 * once would go on lighting where the pane *was*, which is worse than no mask: it would be
 * pointing confidently at the wrong thing.
 *
 * So every event the workspace can produce is subscribed to rather than one of them:
 *
 * - a **`ResizeObserver`** over the pane's own elements and over the dock, which is what a sash
 *   drag and a window resize come through;
 * - a **`MutationObserver`** over the workspace's subtree, which is what a tab move, a tab
 *   selection and a pane closing come through — the layout manager replaces elements for those,
 *   and an element that has been replaced is not one a `ResizeObserver` is still watching;
 * - the window's own `resize` and `scroll`.
 *
 * Every one of them schedules the same measurement on the next frame, so a sash drag firing
 * fifty events in a frame measures once; and the state is replaced only when the rectangle
 * actually differs, so a mutation that changed nothing geometric renders nothing.
 */
function usePaneHole(pane: RegionId | null): Hole | null {
  const [hole, setHole] = useState<Hole | null>(null);

  /* A layout effect, so the first measurement of a step's pane happens before the frame is
     painted. An ordinary effect runs after paint, and what got painted in between was the
     *previous* step's rectangle lit under the new step's name -- a mask pointing confidently
     at the wrong pane, for one frame, every time a reader pressed Next. */
  useLayoutEffect(() => {
    if (pane === null) {
      setHole(null);
      return;
    }
    const named: RegionId = pane;
    let frame: number | null = null;
    let live = true;

    const take = (): void => {
      frame = null;
      if (!live) return;
      const found = measure(named);
      /* Re-observed on every measurement: the layout manager replaces elements when a tab is
         moved or selected, and an observer still watching the old one is watching nothing. */
      for (const element of paneElements(named)) resize.observe(element);
      setHole((current) => (same(current, found) ? current : found));
    };

    const schedule = (): void => {
      if (frame !== null || !live) return;
      frame = requestAnimationFrame(take);
    };

    const resize = new ResizeObserver(schedule);
    const mutate = new MutationObserver(schedule);

    const workspace = document.querySelector<HTMLElement>('[data-testid="one-view"]');
    const dock = document.querySelector<HTMLElement>('[data-testid="workspace-dock"]');
    if (dock !== null) resize.observe(dock);
    if (workspace !== null) {
      resize.observe(workspace);
      mutate.observe(workspace, { subtree: true, childList: true, attributes: true });
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    take();

    return () => {
      live = false;
      if (frame !== null) cancelAnimationFrame(frame);
      resize.disconnect();
      mutate.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [pane]);

  return hole;
}

/** Where the card goes, how it is anchored there, and how tall it may be. */
export interface Placement {
  readonly side: 'right' | 'left' | 'below' | 'above' | 'within';
  readonly left: number;
  /** Anchored by its top edge, except above a pane, where it hangs from its bottom edge. */
  readonly top: number | null;
  readonly bottom: number | null;
  readonly maxHeight: number;
}

const clamp = (value: number, least: number, most: number): number =>
  Math.max(least, Math.min(most, value));

/**
 * The card, beside the pane it is about (FR-014, third clause).
 *
 * Placed from the **space around the hole**, which is known before the card renders. Beat 011
 * placed its card from the anchor's rectangle and the card's own measured height, and the two
 * arrive a frame apart: for one frame it used the previous step's height, and on a tall panel
 * that put the Next button below the bottom of the window. Nothing here measures the card.
 *
 * Beside first — a card to the right or left of a lit pane reads as belonging to it — then
 * below or above, then, for a pane with no room around it at all, inside the lit pane's own top
 * corner. The last is not a failure: a card inside the rectangle the step is about covers only
 * the thing it is explaining, which is the cheapest place to overlap. Exported because the
 * arithmetic is worth testing without a browser.
 */
export function placeCard(
  hole: Hole,
  viewport: { readonly width: number; readonly height: number },
  card: { readonly widthPx: number; readonly minimumHeightPx: number; readonly gapPx: number },
): Placement {
  const { widthPx, minimumHeightPx, gapPx } = card;
  const fullHeight = Math.max(0, viewport.height - 2 * gapPx);
  const fullWidth = Math.max(0, viewport.width - 2 * gapPx);
  /* Above and below a pane the card is centred on it, which is what makes it read as belonging
     to the strip along the foot rather than to whichever pane it happens to sit under. */
  const centred = hole.left + (hole.right - hole.left) / 2 - widthPx / 2;
  /* Beside a pane the card starts at the pane's own top edge, so the room it has is what is
     below that edge and not the whole window: a card allowed the window's full height would be
     pushed back up to the top of it by its own cap, and would no longer be beside anything. */
  const alongside = Math.max(0, viewport.height - hole.top - 2 * gapPx);

  const options = [
    {
      side: 'right' as const,
      width: viewport.width - hole.right - 2 * gapPx,
      height: alongside,
      left: hole.right + gapPx,
      top: hole.top,
    },
    {
      side: 'left' as const,
      width: hole.left - 2 * gapPx,
      height: alongside,
      left: hole.left - gapPx - widthPx,
      top: hole.top,
    },
    {
      side: 'below' as const,
      width: fullWidth,
      height: viewport.height - hole.bottom - 2 * gapPx,
      left: centred,
      top: hole.bottom + gapPx,
    },
    {
      side: 'above' as const,
      width: fullWidth,
      height: hole.top - 2 * gapPx,
      left: centred,
      top: null,
    },
    {
      side: 'within' as const,
      width: hole.right - hole.left - 2 * gapPx,
      height: hole.bottom - hole.top - 2 * gapPx,
      left: hole.right - gapPx - widthPx,
      top: hole.top + gapPx,
    },
  ];

  const area = (one: (typeof options)[number]): number =>
    Math.max(0, one.width) * Math.max(0, one.height);
  const chosen =
    options.find((one) => one.width >= widthPx && one.height >= minimumHeightPx) ??
    options.reduce((best, one) => (area(one) > area(best) ? one : best));

  const maxHeight = Math.max(minimumHeightPx, Math.min(fullHeight, chosen.height));
  const left = clamp(chosen.left, gapPx, Math.max(gapPx, viewport.width - gapPx - widthPx));
  if (chosen.top === null) {
    /* Anchored by its bottom edge, so a card shorter than the room above the pane still sits
       against the pane rather than floating at the top of the window. */
    return {
      side: chosen.side,
      left,
      top: null,
      bottom: clamp(viewport.height - hole.top + gapPx, gapPx, Math.max(gapPx, viewport.height - gapPx - minimumHeightPx)),
      maxHeight,
    };
  }
  return {
    side: chosen.side,
    left,
    top: clamp(chosen.top, gapPx, Math.max(gapPx, viewport.height - gapPx - maxHeight)),
    bottom: null,
    maxHeight,
  };
}

/**
 * The control, the mask it draws and the card it opens. Closed until a reader asks, always.
 */
export function Walkthrough({ config }: WalkthroughProps) {
  const [at, setAt] = useState<number | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const control = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setAt(null);
    control.current?.focus();
  }, []);

  useEffect(() => {
    if (at === null) return;
    card.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [at, close]);

  const step = at === null ? null : WALKTHROUGH_STEPS[at];
  const hole = usePaneHole(step?.pane ?? null);

  const { walkthroughCardWidthPx, walkthroughCardMinimumHeightPx, walkthroughCardGapPx } =
    config.presentation.workspace;

  /*
   * The card's own place, worked out from the hole and the declared figures alone (Principle X).
   *
   * `window.innerWidth` is the viewport the mask is drawn in, and it is read here rather than
   * stored: the hole is re-measured on a window resize, so this arithmetic runs again with it
   * and the two cannot disagree about how big the window is.
   */
  const placed =
    hole === null
      ? null
      : placeCard(
          hole,
          { width: window.innerWidth, height: window.innerHeight },
          {
            widthPx: walkthroughCardWidthPx,
            minimumHeightPx: walkthroughCardMinimumHeightPx,
            gapPx: walkthroughCardGapPx,
          },
        );

  /* The hole, handed to the stylesheet as four lengths. The stylesheet cuts the polygon out of
     the scrim from these and from nothing else, so there is one geometry and the hole cannot
     drift from the dim around it. */
  const maskStyle = (found: Hole): CSSProperties =>
    ({
      '--hole-left': `${String(found.left)}px`,
      '--hole-top': `${String(found.top)}px`,
      '--hole-right': `${String(found.right)}px`,
      '--hole-bottom': `${String(found.bottom)}px`,
    }) as CSSProperties;

  return (
    <>
      {/*
        * Both labels, one of them hidden, so the control is the width of the longer of them in
        * either state.
        *
        * This is not tidiness. The control sits in the status strip, the strip's height is what
        * the dock does not get, and a label that shrank from twenty-nine characters to twenty
        * let the strip reflow: the dock grew by 11 px and **every pane in it moved**, on the
        * click that opened a walkthrough whose whole claim is that it moves nothing. Measured
        * at the declared floor by the test below, which is where it was found.
        */}
      <button
        type="button"
        ref={control}
        className="walkthrough-offer"
        data-testid="walkthrough-offer"
        aria-expanded={at !== null}
        onClick={() => { setAt((current) => (current === null ? 0 : null)); }}
      >
        <span aria-hidden={at !== null}>Walk me through the workspace</span>
        <span aria-hidden={at === null}>Close the walkthrough</span>
      </button>

      {step !== undefined && step !== null && at !== null && hole !== null && (
        /*
         * The scrim. One element with the hole cut out of it, so what is dimmed and what is lit
         * are the same fact rather than two that agree today; and it takes the clicks that land
         * on it, so a reader cannot act on a pane they cannot see. Clicking it closes, which is
         * the same way out as Escape for a reader who has reached for the mouse.
         *
         * `aria-hidden`, and it is not a dialog: the card is the dialog and carries the words. A
         * scrim announced to a reader who is listening rather than looking would be furniture
         * read aloud.
         */
        <div
          className="walkthrough-mask"
          data-testid="walkthrough-mask"
          data-mask-pane={step.pane}
          data-step={String(at + 1)}
          aria-hidden="true"
          style={maskStyle(hole)}
          onClick={close}
        />
      )}

      {step !== undefined && step !== null && at !== null && (
        <div
          className="walkthrough-card"
          data-testid="walkthrough-card"
          data-walkthrough={step.pane}
          data-step={String(at + 1)}
          data-side={placed?.side ?? 'unplaced'}
          role="dialog"
          aria-label="A walkthrough of the workspace"
          tabIndex={-1}
          ref={card}
          style={
            placed === null
              ? undefined
              : {
                  left: `${String(Math.round(placed.left))}px`,
                  /* One of the two, and the other explicitly `auto`: a fixed box given both a
                     top and a bottom is stretched between them, which is a card as tall as the
                     window with three sentences at the top of it. */
                  ...(placed.top === null
                    ? { top: 'auto', bottom: `${String(Math.round(placed.bottom ?? 0))}px` }
                    : { top: `${String(Math.round(placed.top))}px`, bottom: 'auto' }),
                  maxHeight: `${String(Math.round(placed.maxHeight))}px`,
                }
          }
        >
          <h4>
            {step.title}
            <span className="walkthrough-pane" data-testid="walkthrough-pane">
              the <strong>{step.pane}</strong> pane
            </span>
          </h4>
          {step.body(config)}
          <div className="walkthrough-controls">
            <span className="walkthrough-progress" data-testid="walkthrough-progress">
              {at + 1} of {WALKTHROUGH_STEPS.length}
            </span>
            <button
              type="button"
              data-testid="walkthrough-back"
              disabled={at === 0}
              onClick={() => { setAt((current) => Math.max(0, (current ?? 0) - 1)); }}
            >
              Back
            </button>
            {at + 1 < WALKTHROUGH_STEPS.length ? (
              <button
                type="button"
                data-testid="walkthrough-next"
                onClick={() => { setAt((current) => Math.min(WALKTHROUGH_STEPS.length - 1, (current ?? 0) + 1)); }}
              >
                Next
              </button>
            ) : (
              <button type="button" data-testid="walkthrough-done" onClick={close}>
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** The panes the layout draws, so a step cannot name one it does not. */
export { REGIONS };
