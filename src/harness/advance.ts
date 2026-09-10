import type { Configuration } from '../config/schema.js';

/**
 * The advance the shell offers, as arithmetic rather than as a loop inside a component
 * (FR-008, FR-009, NFR-04; spec 013 FR-001).
 *
 * ## Why this is a module and not eight lines of `App.tsx`
 *
 * G-07 digests the state after a twelve-hour advance, and until this module existed it
 * produced that state by calling `Run.advance(180)` in `scripts/gates/surface-invariance.ts`
 * — a *second* implementation of the shell's advance, written beside the first and asserted
 * against nothing. The shell drove the model down a different path: chunked, and with a
 * measuring probe in front of the chunks. The gate never walked that path, so a control that
 * advanced sixteen hours and forty-eight minutes while its label said twelve passed every
 * check the repository has.
 *
 * So the arithmetic that decides how far an advance goes, and how many steps each chunk of
 * it takes, is here, and both callers ask this module rather than each other's authors. It is
 * the move `scoring-run.ts` made for the row's scores in beat 013, for the same reason: a
 * record of what the shell computes is worth what its subject is worth, and a transcription
 * is not the subject.
 *
 * ## An advance is a target, not a number of steps
 *
 * The defect this module was written for is what happens when a chunk is taken and then not
 * counted. The shell measures its first chunk before it knows whether the budget allows the
 * rest, so that chunk is *taken*; the reader is then asked whether to go on. Counting steps
 * taken so far — `done = 0`, `done += chunk` — leaves the refusal and the proceed-anyway as
 * two independent advances of twelve hours each, from a run already 72 steps on. An advance
 * that knows where it is **going** cannot do that: a chunk taken before the question was
 * asked is a chunk of the answer, and resuming means finishing the remainder.
 *
 * ## No clock here
 *
 * `takeChunk` advances and says how far; it does not time itself. Timing is host time
 * (Principle I, exemption (a)) and belongs to `timing.ts`, which is the one module that may
 * read it — and keeping it out of here is what lets a gate call this and still say truthfully
 * that it reads no clock.
 */

/** How far the shell integrates when a reader asks. Twelve hours, in declared timesteps. */
export const ADVANCE_HOURS = 12;

/** The twelve hours as steps of the declared timestep. 180 at 240 s. */
export function stepsPerAdvance(config: Configuration): number {
  return Math.round((ADVANCE_HOURS * 3600) / config.clock.timestepSeconds);
}

/**
 * FR-008: what the longest declared horizon would cost at this step time.
 *
 * Host time in, host time out. It is arithmetic on a measurement rather than a measurement,
 * which is why it is here.
 *
 * **This is not what the advance costs, and the notice used to say it was.** NFR-04 gauges the
 * machine against the worst case the surface can be asked for, which is the longest declared
 * horizon: 96 h, 1 440 steps, and the row's own integration walks all of it. The control the
 * reader pressed is twelve hours, 180 steps. So this figure is about eight times the cost of
 * the press that produced it, and a notice that printed it alone under the heading of that
 * press attributed a figure to something it is not about (Principle V). The check is still
 * this one — FR-008 is written about the longest declared horizon and means it — and the
 * notice now prints `projectedAdvanceMs` beside it, each with what it is the cost of.
 */
export function projectedHorizonMs(perStepMs: number, config: Configuration): number {
  const longestHorizonHours = Math.max(...config.horizons.leadHours);
  return perStepMs * ((longestHorizonHours * 3600) / config.clock.timestepSeconds);
}

/**
 * What the advance the reader just pressed will cost at this step time.
 *
 * The whole of it and not the remainder: the control says *Integrate {ADVANCE_HOURS} hours*,
 * the reader is deciding about that, and `stepsPerAdvance` is what that costs however many
 * chunks of it have already been taken. Host time in, host time out.
 */
export function projectedAdvanceMs(perStepMs: number, config: Configuration): number {
  return perStepMs * stepsPerAdvance(config);
}

/** What one chunk of an advance did. */
export interface AdvanceChunk {
  /** Steps this chunk took. The declared chunk size, or the remainder if that is smaller. */
  readonly steps: number;
  /** Steps still between the run and the target once this chunk is applied. */
  readonly stepsRemaining: number;
  /** Whether this was the first chunk of this advance: the one the budget is measured on. */
  readonly first: boolean;
}

/** The least a run has to look like to be advanced. */
export interface Advanceable {
  readonly steps: number;
  advance: (steps: number) => void;
}

export interface Advance {
  /** The step count this advance ends at. It does not move once the advance has begun. */
  readonly targetStep: number;
  /** How many steps are left before the control has done what it says. */
  readonly stepsRemaining: () => number;
  /** Take the next chunk, and say what it did. Refuses once the target is reached. */
  readonly takeChunk: () => AdvanceChunk;
  /** Every remaining chunk, one after another, with nothing between them. */
  readonly runToTarget: () => void;
}

export interface BeginAdvanceOptions {
  readonly run: Advanceable;
  /** `model.chunkSteps`: how far the run goes before it yields (NFR-04). */
  readonly chunkSteps: number;
  /**
   * Where this advance ends. Resuming a refused advance passes the target it already had,
   * which is the whole of how a probe's chunk stays counted.
   */
  readonly targetStep: number;
}

export function beginAdvance({ run, chunkSteps, targetStep }: BeginAdvanceOptions): Advance {
  if (!Number.isInteger(chunkSteps) || chunkSteps < 1) {
    throw new RangeError('an advance is chunked by a whole, positive number of steps');
  }
  if (!Number.isInteger(targetStep)) {
    throw new RangeError('an advance ends at a whole step');
  }

  let chunksTaken = 0;
  const stepsRemaining = (): number => Math.max(0, targetStep - run.steps);

  const takeChunk = (): AdvanceChunk => {
    const steps = Math.min(chunkSteps, stepsRemaining());
    if (steps === 0) {
      throw new RangeError('this advance has reached its target and has no chunk left to take');
    }
    run.advance(steps);
    const first = chunksTaken === 0;
    chunksTaken += 1;
    return { steps, stepsRemaining: stepsRemaining(), first };
  };

  const runToTarget = (): void => {
    while (stepsRemaining() > 0) takeChunk();
  };

  return { targetStep, stepsRemaining, takeChunk, runToTarget };
}
