import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * The walkthrough: a reader's first pass over the shell.
 *
 * Every panel on this page already says what it is. What none of them says is why it is
 * next to the one above it, and a reader arriving cold has no reason to guess. The
 * walkthrough is that missing sentence, said once per panel, anchored to the panel it is
 * about so the reader is never asked to hold a description and a figure apart.
 *
 * Two things it deliberately is not. It is not a tour of features the page might have:
 * every step resolves against a `data-testid` that must be on the page, and a step whose
 * anchor is absent is dropped rather than shown against nothing (Principle VI -- the
 * harness can lose, and a walkthrough describing a panel that is not there is the sort of
 * loss that looks like success). And it is not modal: the page stays legible underneath,
 * because the point of a step is the thing it is pointing at.
 *
 * The anchors are load-bearing, so `tests/shell/shell.spec.ts` walks every step and fails
 * if one cannot find its element. A renamed panel breaks the build rather than quietly
 * shortening the tour.
 */

interface Step {
  /** Anchors in preference order: the first that is on the page wins. */
  readonly testIds: readonly string[];
  readonly title: string;
  readonly body: React.ReactNode;
}

/**
 * In region order, and then in the order of the disclosures beneath the controls. Beat 013
 * left the page nothing to scroll, so a tour is no longer a walk down it: it is the four
 * regions in the order a reader meets them -- what this is, what you change, what it answers,
 * what that was worth, and what you are inspecting -- followed by the run's provenance.
 */
const STEPS: readonly Step[] = [
  {
    testIds: ['not-operational'],
    title: 'What you are looking at',
    body: (
      <>
        <p>
          j-ocean is a teaching harness: a small, real ocean model, the simulated
          instruments that measure it, and an honest account of what each measurement was
          worth. It forecasts nothing you should act on.
        </p>
        <p>
          Every number on the page is typed by where it came from, and the four kinds never
          change appearance between panels:
        </p>
        <ul className="walkthrough-legend">
          <li>
            <span className="figure declared">declared</span> &mdash; a value in
            configuration, validated before anything ran
          </li>
          <li>
            <span className="figure computed">computed</span> &mdash; produced by the model
            or the analysis on this visit
          </li>
          <li>
            <span className="figure derived">derived</span> &mdash; read off a committed
            artefact the build regenerates
          </li>
          <li>
            <span className="figure host-time">host time</span> &mdash; how long the
            machinery took, never simulation time
          </li>
        </ul>
      </>
    ),
  },
  {
    testIds: ['region-controls'],
    title: 'Everything you can change',
    body: (
      <>
        <p>
          One column for every cause: which ocean, when the forecast was issued, which
          instruments the analysis was allowed to see, and whether quality control was
          running. Change any of them and every panel and every score answers where they are,
          without you moving.
        </p>
        <p className="walkthrough-note">
          A control that acts on one panel alone is not here; it is at that panel.
        </p>
      </>
    ),
  },
  {
    testIds: ['region-centre'],
    title: 'The forecast, at every horizon at once',
    body: (
      <>
        <p>
          One panel per declared horizon, all visible together rather than behind a slider
          &mdash; a forecast is a shape over lead time, and you cannot see a shape one frame
          at a time.
        </p>
        <p>
          Two axes, not one: <em>lead time</em> runs across the row, and <em>issue time</em>
          {' '}is a control on the left. Moving the issue time earlier gives the analysis fewer
          observations and is the clearest way to watch skill change.
        </p>
        <p className="walkthrough-note">
          Building the row integrates four days forward, so it happens when you ask.
        </p>
      </>
    ),
  },
  {
    testIds: ['region-scores'],
    title: 'What each forecast was worth',
    body: (
      <p>
        Each panel&rsquo;s skill sits directly beneath that panel, in its own column, rather
        than in a table you would have to match against a heading. A raw error is meaningless
        alone, so there is never one here without two references the harness computes itself.
        Zero means <em>no better than the reference</em>; negative means <em>worse</em>, and
        it is reported rather than tuned. Read the six columns left to right and the decay is
        there without a curve being plotted.
      </p>
    ),
  },
  {
    testIds: ['region-detail'],
    title: 'Whatever you last selected',
    body: (
      <p>
        Click a cell and this region fills with that cell&rsquo;s own breakdown: how much of
        the answer there came from observations, from the advected background, and from
        climatology. Click a measurement&rsquo;s mark and it fills with that profile beside
        the model&rsquo;s derived one. Filling it moves nothing else on the surface, which is
        the point of it having a region of its own.
      </p>
    ),
  },
  {
    testIds: ['run-panel'],
    title: 'Which run this is',
    body: (
      <>
        <p>
          A run is a seed and the state it grew into. The seed here is the declared one, so
          what you see is the recorded case &mdash; the same run described in the
          documentation, reproducible by anyone.
        </p>
        <p>
          Nothing persists between visits: no storage, no cookie, no run in the URL. Reload
          and this run is rebuilt from the seed rather than restored.
        </p>
      </>
    ),
  },
  {
    testIds: ['declared-panel'],
    title: 'Everything that was decided in advance',
    body: (
      <p>
        Grid, timestep, reduced gravity, instrument noise, forecast horizons. No component
        in the tree holds a literal for any of them, so changing the ocean means editing
        configuration, not code &mdash; and a configuration that does not validate stops the
        page rather than quietly substituting a default.
      </p>
    ),
  },
  {
    testIds: ['instruments-panel'],
    title: 'How truth reaches the model',
    body: (
      <p>
        Only here. One module turns the truth record into observations &mdash; ownship
        surface samples, XBT drops, external Argo profiles &mdash; and the model has no other
        route to it. A build gate fails if anything else imports truth, which is what makes
        the skill figures mean anything at all.
      </p>
    ),
  },
  {
    testIds: ['truth-panel'],
    title: 'The record it is scored against',
    body: (
      <p>
        A real HYCOM subset and real Argo profiles, regenerated from a digest-verified
        download by a build gate. Nothing here was written by hand; a file that had been
        would fail the build. The harness did not author the thing it is marked against.
      </p>
    ),
  },
  {
    testIds: ['manifest-panel'],
    title: 'Taking the run with you',
    body: (
      <p>
        The manifest holds everything needed to rebuild this run and none of its state:
        replay is re-computation, not the restoration of a snapshot. Export it, import it in
        another browser, and the digests should match &mdash; that comparison is what caught
        an analysis that meant two different things.
      </p>
    ),
  },
  {
    testIds: ['deferrals-panel'],
    title: 'What it deliberately does not do',
    body: (
      <p>
        Four capabilities are assessed, deferred, and cheap to adopt. Each has a written
        trigger, and a test measures the triggers on every run &mdash; so this list fails
        when it becomes wrong instead of going stale.
      </p>
    ),
  },
];

interface Placement {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

const CARD_WIDTH_PX = 360;
const CARD_MARGIN_PX = 12;
/** Below this, a gap is not worth putting the card in: it would be mostly scrollbar. */
const MIN_CARD_SPACE_PX = 260;

function anchorFor(step: Step): HTMLElement | null {
  for (const testId of step.testIds) {
    const found = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (found !== null) return found;
  }
  return null;
}

export function Walkthrough() {
  const [open, setOpen] = useState(false);
  /**
   * A position in `STEPS`, not in the list a reader is shown. The two differ whenever a
   * panel is absent, and holding the position in the declared list means a step that
   * appears mid-tour -- the run panel finishing its provisioning is the ordinary case --
   * inserts itself without moving the reader onto something else.
   */
  const [position, setPosition] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /**
   * Which steps have an anchor *now*. Recomputed when the document changes rather than
   * fixed when the walkthrough opens: a reader who asks what they are looking at while the
   * page is still provisioning was previously shown a one-step tour, which is exactly the
   * moment the question gets asked.
   */
  const [resolvable, setResolvable] = useState<readonly number[]>([]);

  const refresh = useCallback(() => {
    setResolvable((current) => {
      const found = STEPS.flatMap((step, at) => (anchorFor(step) === null ? [] : [at]));
      return found.length === current.length && found.every((at, i) => at === current[i])
        ? current
        : found;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    const observer = new MutationObserver(() => { refresh(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); };
  }, [open, refresh]);

  const start = useCallback(() => {
    setPosition(0);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setPlacement(null);
    buttonRef.current?.focus();
  }, []);

  const steps = useMemo(() => resolvable.map((at) => STEPS[at] as Step), [resolvable]);
  /* Where the reader is in the list they can see. A position whose own step has just
     disappeared falls back to the last one before it, so the card never blanks. */
  const index = useMemo(() => {
    const exact = resolvable.indexOf(position);
    if (exact >= 0) return exact;
    const earlier = resolvable.filter((at) => at < position).length - 1;
    return Math.max(0, earlier);
  }, [resolvable, position]);
  const step = open ? steps[index] : undefined;

  const measure = useCallback(() => {
    if (step === undefined) return;
    const anchor = anchorFor(step);
    if (anchor === null) {
      setPlacement(null);
      return;
    }
    const box = anchor.getBoundingClientRect();
    setPlacement({ top: box.top, left: box.left, width: box.width, height: box.height });
  }, [step]);

  /**
   * Brings the step's anchor into view -- inside whichever region owns it.
   *
   * Beat 013 left the page nothing to scroll, so scrolling the window would do nothing at
   * all: a disclosure part-way down the controls column is reached by scrolling *that
   * column*, and `block: 'nearest'` is what asks the nearest scrollable ancestor rather than
   * the document. `nearest` on both axes also means an anchor already on screen is not
   * moved, which is the common case now that everything is in one viewport.
   *
   * The scroll is where the ring's position comes from, so the measurement is left to the
   * scroll listener: a rect read here describes where the region was before the scroll.
   */
  useEffect(() => {
    if (step === undefined) return;
    const anchor = anchorFor(step);
    if (anchor === null) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    anchor.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onChange = () => { measure(); };
    // Captured, not bubbled: a scroll event fired on a region does not reach the window, and
    // since beat 013 every scroll is a region's rather than the page's.
    const options = { capture: true, passive: true } as const;
    window.addEventListener('scroll', onChange, options);
    window.addEventListener('resize', onChange);
    return () => {
      window.removeEventListener('scroll', onChange, options);
      window.removeEventListener('resize', onChange);
    };
  }, [open, measure]);

  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, index]);

  /* Escape is answered at the window rather than on the card. A reader who has clicked into
     the page to try what a step described no longer has the card focused, and the control
     that gets them out should not depend on where they last clicked. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open, close]);


  const last = steps.length === 0 ? 0 : steps.length - 1;
  const next = useCallback(() => {
    const at = resolvable[Math.min(index + 1, last)];
    if (at !== undefined) setPosition(at);
  }, [resolvable, index, last]);
  const back = useCallback(() => {
    const at = resolvable[Math.max(index - 1, 0)];
    if (at !== undefined) setPosition(at);
  }, [resolvable, index]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowRight') { next(); return; }
      if (event.key === 'ArrowLeft') { back(); }
    },
    [next, back],
  );

  /**
   * Below the anchor, else above it, else along the bottom of the window.
   *
   * The choice is made from the *space* around the anchor and the card is then given a
   * matching `max-height`, rather than from the card's own height. Measuring the card meant
   * placing it from last step's height for a frame -- long enough to leave it hanging off
   * the bottom of the window with its Next button below the edge, which is what an earlier
   * version did on the field panel. Space is known before the card is rendered, and a
   * capped card scrolls its own text instead of leaving the window.
   *
   * The bottom of the window is the fallback because an anchor taller than the screen
   * cannot be sat outside of, and a panel leads with the heading and the prose the step has
   * just named.
   */
  const cardStyle = useMemo((): React.CSSProperties => {
    if (placement === null) return { display: 'none' };
    const width = Math.min(CARD_WIDTH_PX, window.innerWidth - 2 * CARD_MARGIN_PX);
    const left = Math.max(
      CARD_MARGIN_PX,
      Math.min(placement.left, window.innerWidth - width - CARD_MARGIN_PX),
    );
    const anchored = { left: `${left}px`, width: `${width}px` };
    const spaceBelow =
      window.innerHeight - (placement.top + placement.height) - 2 * CARD_MARGIN_PX;
    if (spaceBelow >= MIN_CARD_SPACE_PX) {
      return {
        ...anchored,
        top: `${placement.top + placement.height + CARD_MARGIN_PX}px`,
        maxHeight: `${spaceBelow}px`,
      };
    }
    const spaceAbove = placement.top - 2 * CARD_MARGIN_PX;
    if (spaceAbove >= MIN_CARD_SPACE_PX) {
      return {
        ...anchored,
        bottom: `${window.innerHeight - placement.top + CARD_MARGIN_PX}px`,
        maxHeight: `${spaceAbove}px`,
      };
    }
    return {
      ...anchored,
      bottom: `${CARD_MARGIN_PX}px`,
      maxHeight: `${window.innerHeight - 2 * CARD_MARGIN_PX}px`,
    };
  }, [placement]);

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className="help-button"
        data-testid="help-button"
        aria-label="Open the walkthrough: what each panel on this page is"
        aria-expanded={open}
        onClick={() => { if (open) { close(); } else { start(); } }}
      >
        ?
      </button>

      {open && step !== undefined && (
        <>
          {placement !== null && (
            <div
              className="walkthrough-spotlight"
              data-testid="walkthrough-spotlight"
              style={{
                top: `${placement.top}px`,
                left: `${placement.left}px`,
                width: `${placement.width}px`,
                height: `${placement.height}px`,
              }}
            />
          )}

          <div
            className="walkthrough-card"
            data-testid="walkthrough-card"
            style={cardStyle}
            role="dialog"
            aria-labelledby="walkthrough-title"
            tabIndex={-1}
            ref={cardRef}
            onKeyDown={onKeyDown}
          >
            <p className="walkthrough-progress" data-testid="walkthrough-progress">
              Step {index + 1} of {steps.length}
            </p>
            <h2 id="walkthrough-title" data-testid="walkthrough-title">{step.title}</h2>
            <div className="walkthrough-body">{step.body}</div>
            <div className="walkthrough-controls">
              <button
                type="button"
                onClick={back}
                disabled={index === 0}
                data-testid="walkthrough-back"
              >
                Back
              </button>
              {index === last ? (
                <button type="button" onClick={close} data-testid="walkthrough-done">
                  Done
                </button>
              ) : (
                <button type="button" onClick={next} data-testid="walkthrough-next">
                  Next
                </button>
              )}
              <button
                type="button"
                className="walkthrough-close"
                onClick={close}
                data-testid="walkthrough-close"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
