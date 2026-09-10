import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The one notion of "something long is running", and how far it has got (NFR-04; the author's
 * report, beat 018).
 *
 * ## Why there is a module for a boolean
 *
 * Several things on this surface take seconds: an advance of twelve hours, building the horizon
 * row -- which integrates the analysis forward four days, six times -- re-issuing it at another
 * instant, applying an edit, reverting one, and scoring every horizon against the truth record.
 * Until this module there was a busy state for exactly one of them, `view.integrating`, and a
 * reader who pressed any of the others got a page that looked idle while the main thread was
 * blocked. A cursor rule written beside each piece of state would drift; one flag cannot, so the
 * surface asks this and the stylesheet has one rule.
 *
 * ## Why the work runs after a frame rather than in the handler
 *
 * The same lesson beat 018's sixth pass learned about `aria-busy`, one layer down. A
 * synchronous integration blocks the main thread from the moment the handler is entered, so a
 * flag set in that handler is committed to the DOM and never painted: the browser gets its
 * next chance to draw only once the work it describes is over. A busy cursor that appears
 * after the wait is not a busy cursor.
 *
 * So `begin` commits the flag and hands the work to the frame after the one that paints it.
 * `requestAnimationFrame` is the frame; the `setTimeout` inside it is what puts the work
 * *after* that frame's paint rather than in it. The wait is bounded by a timer of its own,
 * because a tab that is never painted never gets a frame -- and a control left disabled
 * forever, waiting for a frame that is not coming, would be a worse fault than a cursor that
 * arrived late.
 *
 * ## Why a count, and where it comes from
 *
 * The busy cursor says *something is happening*. It does not say how far along, and these are
 * the operations that cost seconds: *"there is no indication of progress -- which makes it
 * difficult to engage with."* So `beginChunked` takes work that is **already made of pieces**
 * and drives it one piece per frame, counting the pieces as they finish. The advance was
 * chunked from the start; `forecastInChunks` and `scoreHorizonByHorizon` yield once per declared
 * horizon, which is what the row and the scoring were always a loop over.
 *
 * The count is therefore a position in the work rather than a number chosen to look like one,
 * and the distinction is the whole point: a control that says *3 of 8* when the work has no
 * eighths is worse than a control that says nothing. **Every long operation on this surface
 * turned out to be made of pieces**, so `begin` takes a total and there is no second entry
 * point that runs work without one. If something arrives that cannot be chunked, the honest
 * answer is a busy state with no count, and it goes in here rather than into a control that
 * invents a denominator.
 *
 * Nothing here times anything or reports a duration: this is the surface saying it is
 * working and how far it has got, not a measurement of how long it took (Principle I -- host
 * time is `timing.ts`).
 */

/**
 * A thing the reader asked for that takes seconds. Named, so a failure can say which, and so
 * that the control which asked can tell its own work from a neighbour's: three of these end in
 * the same call to `buildRow`, and a reader who pressed *Re-issue* must not watch *Build the
 * horizon row* count up instead.
 */
export type LongOperation = 'integrating' | RowOperation | 'scoring every horizon';

/**
 * The four that end in the same rebuild of the horizon row. They are one piece of work and
 * four presses, so they share a count and a completion line and differ only in what the
 * control that asked says while it runs.
 */
export type RowOperation =
  | 'building the horizon row'
  | 're-issuing the row'
  | 'applying an edit'
  | 'reverting to the recorded case';

/** How long to wait for the frame that paints the busy state before running the work anyway. */
const PAINT_BUDGET_MS = 100;

/**
 * The widest a count that reaches `most` can be drawn, as the digits a control reserves its
 * width against.
 *
 * Zeros and not the figure's own digits, because this surface's serif draws `1` narrower than
 * the rest: `180` is not the widest three digits a label can hold, and reserving its width
 * leaves a pixel of reflow behind. One function rather than the trick written out at each
 * control, because a control that reserved the wrong width would be the walkthrough offer's
 * defect again -- a label that changed width and moved every pane in the dock by 11 px.
 */
export function widestCount(most: number): string {
  return '0'.repeat(String(most).length);
}

/** How far a long operation has got, in the pieces its own work is made of. */
export interface Progress {
  readonly done: number;
  readonly total: number;
}

/** Work that says how far it has got: one `yield` for each piece of it finished. */
export type ChunkedWork = () => Generator<void, void, void>;

export interface LongOperations {
  /**
   * Which long operation is running, or null: this hook's own work, or the chunked advance the
   * shell drives itself. One derived answer, so the cursor cannot say idle while a pane says
   * busy -- and a name rather than a flag, so the workspace's own element says *which*, and a
   * test that fails says it too.
   */
  readonly running: LongOperation | null;
  /**
   * How far the running operation has got, or null when it is running and cannot say. Null is
   * an honest indeterminate state and not a zero: a control shows the busy state without a
   * count rather than a count nobody computed.
   */
  readonly progress: Progress | null;
  /**
   * Say what is about to happen, then do it once the surface has said so: `total` pieces of
   * work, driven one to a frame and counted as each of them finishes.
   */
  readonly begin: (what: LongOperation, total: number, work: ChunkedWork) => void;
}

/**
 * @param alreadyRunning the shell's own chunked advance, which yields between chunks and so
 * needs none of the scheduling here -- but is the same answer to the same question, and is
 * folded in rather than left as a second flag for the stylesheet to ask about.
 * @param alreadyDone how far that advance has got, in steps, for the same reason.
 */
export function useLongOperations(
  alreadyRunning: LongOperation | null,
  alreadyDone: Progress | null,
): LongOperations {
  const [what, setWhat] = useState<LongOperation | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  /** The work waiting for a frame. Held in a ref: it is not rendered and must not re-render. */
  const pending = useRef<ChunkedWork | null>(null);

  const begin = useCallback(
    (next: LongOperation, pieces: number, work: ChunkedWork): void => {
      // One at a time. The main thread is blocked for the whole of each piece of the work, so
      // what this can drop is a second press landing between the flag and the work -- and the
      // reader's answer to that is the first press, which is the one already running.
      if (pending.current !== null) return;
      pending.current = work;
      setDone(0);
      setTotal(pieces);
      setWhat(next);
    },
    [],
  );

  useEffect(() => {
    if (what === null) return;
    const work = pending.current;
    if (work === null) return;

    let cancelled = false;
    let chunks: Generator<void, void, void> | null = null;
    let frame = 0;
    let afterPaint = 0;
    let bound = 0;

    const finish = (): void => {
      pending.current = null;
      setWhat(null);
    };

    const takeOne = (): void => {
      if (cancelled) return;
      chunks ??= work();
      let chunk;
      try {
        chunk = chunks.next();
      } catch (error) {
        finish();
        throw error;
      }
      if (chunk.done === true) {
        finish();
        return;
      }
      // One more piece behind us. React paints this before the next piece blocks the thread,
      // for the same reason the flag itself is committed before the first one does.
      setDone((sofar) => sofar + 1);
      schedule();
    };

    /* The next piece, on the frame after the one that paints where this one left off. Bounded
       by a timer for the reason the flag is: a tab that is never painted never gets a frame,
       and work that waits for one that is not coming never finishes. */
    function schedule(): void {
      let taken = false;
      const once = (): void => {
        if (taken || cancelled) return;
        taken = true;
        cancelAnimationFrame(frame);
        window.clearTimeout(afterPaint);
        window.clearTimeout(bound);
        takeOne();
      };
      frame = requestAnimationFrame(() => {
        afterPaint = window.setTimeout(once, 0);
      });
      bound = window.setTimeout(once, PAINT_BUDGET_MS);
    }

    schedule();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(afterPaint);
      window.clearTimeout(bound);
    };
  }, [what]);

  return {
    running: what ?? alreadyRunning,
    progress: what === null ? alreadyDone : { done, total },
    begin,
  };
}
