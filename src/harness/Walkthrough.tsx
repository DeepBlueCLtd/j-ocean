import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Configuration } from '../config/schema.js';
import { REGIONS, type RegionId } from './panels.js';
import { Declared } from './figures.js';

/**
 * The walkthrough, returned (SRD-v2 §8.1; spec 018 US5, FR-009, T040, T041).
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
 * Three properties are the requirement rather than the styling.
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
 * **The run underneath stays usable.** The card is placed rather than laid out — fixed, in a
 * corner of the pane it is about — and nothing is covered by a scrim. A reader may drag the
 * issue time while the walkthrough is open, and what the walkthrough says will still be true.
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
    title: 'When the window is too small',
    body: (config) => (
      <>
        <p>
          All{' '}
          <Declared>{config.horizons.leadHours.length}</Declared> declared horizons side by
          side, each at the declared minimum of{' '}
          <Declared>{config.presentation.minimumPanelWidthPx} px</Declared>, want a viewport of
          at least{' '}
          <Declared>
            {config.presentation.minimumViewportWidthPx} &times;{' '}
            {config.presentation.minimumViewportHeightPx} px
          </Declared>{' '}
          once the two flanking panes have taken the least they can be read at. That figure was
          measured from the built workspace, not chosen.
        </p>
        <p>
          Below it the application shows one horizon at a time. The strip carries all of them
          and what each was worth, because comparison across horizons is the lesson; choosing
          one in the strip swaps the panel beneath it. Widen the window past the figure above
          and the full workspace returns without a reload.
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

/**
 * The control, and the card it opens. Closed until a reader asks, always.
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

  return (
    <>
      <button
        type="button"
        ref={control}
        className="walkthrough-offer"
        data-testid="walkthrough-offer"
        aria-expanded={at !== null}
        onClick={() => { setAt((current) => (current === null ? 0 : null)); }}
      >
        {at === null ? 'Walk me through the workspace' : 'Close the walkthrough'}
      </button>

      {step !== undefined && step !== null && at !== null && (
        <div
          className="walkthrough-card"
          data-testid="walkthrough-card"
          data-walkthrough={step.pane}
          data-step={String(at + 1)}
          role="dialog"
          aria-label="A walkthrough of the workspace"
          tabIndex={-1}
          ref={card}
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
