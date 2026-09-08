import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The one notion of "something long is running" (NFR-04; the author's report, beat 018).
 *
 * ## Why there is a module for a boolean
 *
 * Three things on this surface take seconds: an advance of twelve hours, building the horizon
 * row -- which integrates the analysis forward four days, six times -- and scoring every
 * horizon against the truth record. Until this module there was a busy state for exactly one
 * of them, `view.integrating`, and a reader who pressed either of the others got a page that
 * looked idle while the main thread was blocked. Three cursor rules written beside three
 * pieces of state would drift; one flag cannot, so the surface asks this and the stylesheet
 * has one rule.
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
 * Nothing here times anything or reports a duration: this is the surface saying it is
 * working, not a measurement of how long it worked (Principle I -- host time is `timing.ts`).
 */

/** A thing the reader asked for that takes seconds. Named, so a failure can say which. */
export type LongOperation = 'integrating' | 'building the horizon row' | 'scoring every horizon';

/** How long to wait for the frame that paints the busy state before running the work anyway. */
const PAINT_BUDGET_MS = 100;

export interface LongOperations {
  /**
   * Which long operation is running, or null: this hook's own work, or the chunked advance the
   * shell drives itself. One derived answer, so the cursor cannot say idle while a pane says
   * busy -- and a name rather than a flag, so the workspace's own element says *which*, and a
   * test that fails says it too.
   */
  readonly running: LongOperation | null;
  /** Say what is about to happen, then do it once the surface has said so. */
  readonly begin: (what: LongOperation, work: () => void) => void;
}

/**
 * @param alreadyRunning the shell's own chunked advance, which yields between chunks and so
 * needs none of the scheduling here -- but is the same answer to the same question, and is
 * folded in rather than left as a second flag for the stylesheet to ask about.
 */
export function useLongOperations(alreadyRunning: LongOperation | null): LongOperations {
  const [what, setWhat] = useState<LongOperation | null>(null);
  /** The work waiting for a frame. Held in a ref: it is not rendered and must not re-render. */
  const pending = useRef<(() => void) | null>(null);

  const begin = useCallback((next: LongOperation, work: () => void): void => {
    // One at a time. The main thread is blocked for the whole of the work, so what this can
    // drop is a second press landing in the frame between the flag and the work -- and the
    // reader's answer to that is the first press, which is the one already running.
    if (pending.current !== null) return;
    pending.current = work;
    setWhat(next);
  }, []);

  useEffect(() => {
    if (what === null) return;
    const work = pending.current;
    if (work === null) return;

    let done = false;
    const run = (): void => {
      if (done) return;
      done = true;
      try {
        work();
      } finally {
        pending.current = null;
        setWhat(null);
      }
    };

    let after = 0;
    const frame = requestAnimationFrame(() => {
      after = window.setTimeout(run, 0);
    });
    const bound = window.setTimeout(run, PAINT_BUDGET_MS);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(after);
      window.clearTimeout(bound);
    };
  }, [what]);

  return { running: what ?? alreadyRunning, begin };
}
