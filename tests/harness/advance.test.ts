import { describe, expect, it } from 'vitest';
import {
  ADVANCE_HOURS,
  beginAdvance,
  projectedHorizonMs,
  stepsPerAdvance,
} from '../../src/harness/advance.js';
import { stateBytes } from '../../src/model/grid.js';
import { createRun } from '../../src/run/run.js';
import { declaredConfiguration } from '../support/config.js';

const { config, digest: configDigest } = declaredConfiguration();
const STEPS = stepsPerAdvance(config);
const CHUNK = config.model.chunkSteps;

const freshRun = () => createRun({ config, configDigest });

/**
 * The advance the control names, driven the way the shell drives it (FR-008, FR-009, NFR-04).
 *
 * ## What this exists to catch
 *
 * G-07 digests the state after a twelve-hour advance, and it produced that state by calling
 * `Run.advance(180)` in a headless script. The shell drove the model down a different path --
 * chunked, and with a measuring probe in front of the chunks -- and that path was digested by
 * nothing. So the shell's control advanced **252 steps, sixteen hours and forty-eight
 * minutes**, under a label saying twelve, and passed every gate this repository has: the probe
 * advanced the run to time it, the budget refusal kept those steps and counted none of them,
 * and "Integrate anyway" then took a fresh `stepsPerAdvance` from where the probe had left it.
 *
 * The drive is `src/harness/advance.ts` now and the gate calls it, so a change to the
 * chunking moves `state.afterDeclaredAdvance.bytes`. This asks the other half, which a digest
 * of one path cannot: that every way a reader can reach the end of an advance -- straight
 * through, or refused in the middle and resumed -- lands on the same bytes as one call to
 * `Run.advance(180)`. A digest holds a path against yesterday; this holds the paths against
 * each other.
 */
describe('the twelve-hour advance', () => {
  it('is 180 steps of the declared timestep, and the declared chunk does not divide it', () => {
    expect(STEPS).toBe(Math.round((ADVANCE_HOURS * 3600) / config.clock.timestepSeconds));
    expect(STEPS).toBe(180);
    // The remainder matters: a chunk size that divided the advance would hide an off-by-one
    // chunk at the end of it. 72, 72, 36.
    expect(STEPS % CHUNK).not.toBe(0);
  });

  it('lands where one call to Run.advance lands, chunked', () => {
    const chunked = freshRun();
    beginAdvance({ run: chunked, chunkSteps: CHUNK, targetStep: STEPS }).runToTarget();

    const direct = freshRun();
    direct.advance(STEPS);

    expect(chunked.steps).toBe(STEPS);
    expect(stateBytes(chunked.state)).toEqual(stateBytes(direct.state));
    expect(chunked.clock.instantIso()).toBe(direct.clock.instantIso());
  });

  /**
   * The author's own interaction: press, be refused on the budget, press "Integrate anyway".
   *
   * The probe's chunk is taken before the reader can be asked -- it is what the step time is
   * measured on -- so it is counted toward the advance rather than thrown away. Resuming
   * finishes the remainder, and the run stands at twelve hours and not at sixteen forty-eight.
   */
  it('lands in the same place when the budget is refused in the middle and then proceeded', () => {
    const run = freshRun();
    const target = run.steps + STEPS;

    // The press. One chunk, measured, and then the reader is asked.
    const probe = beginAdvance({ run, chunkSteps: CHUNK, targetStep: target });
    const first = probe.takeChunk();
    expect(first.first).toBe(true);
    expect(first.steps).toBe(CHUNK);
    expect(run.steps).toBe(CHUNK);
    expect(first.stepsRemaining).toBe(STEPS - CHUNK);

    // "Integrate anyway", with the target the refusal left standing.
    beginAdvance({ run, chunkSteps: CHUNK, targetStep: target }).runToTarget();

    const direct = freshRun();
    direct.advance(STEPS);
    expect(run.steps).toBe(STEPS);
    expect(stateBytes(run.state)).toEqual(stateBytes(direct.state));
  });

  it('lands on twenty-four hours after two advances, not on thirty-three thirty-six', () => {
    const run = freshRun();
    // The first, refused and proceeded; the second, straight through. Both are twelve hours.
    const first = run.steps + STEPS;
    beginAdvance({ run, chunkSteps: CHUNK, targetStep: first }).takeChunk();
    beginAdvance({ run, chunkSteps: CHUNK, targetStep: first }).runToTarget();
    beginAdvance({ run, chunkSteps: CHUNK, targetStep: run.steps + STEPS }).runToTarget();

    const direct = freshRun();
    direct.advance(2 * STEPS);
    expect(run.steps).toBe(2 * STEPS);
    expect(stateBytes(run.state)).toEqual(stateBytes(direct.state));
    // 504 steps is what the shell used to reach here: 33 h 36 min under a control that has
    // been pressed twice for twelve hours each.
    expect(run.steps).not.toBe(504);
  });

  it('takes the remainder as its last chunk and refuses a chunk past the target', () => {
    const run = freshRun();
    const advance = beginAdvance({ run, chunkSteps: CHUNK, targetStep: STEPS });
    expect(advance.takeChunk().steps).toBe(CHUNK);
    expect(advance.takeChunk().steps).toBe(CHUNK);
    const last = advance.takeChunk();
    expect(last.steps).toBe(STEPS - 2 * CHUNK);
    expect(last.stepsRemaining).toBe(0);
    expect(last.first).toBe(false);
    expect(advance.stepsRemaining()).toBe(0);
    expect(() => advance.takeChunk()).toThrow(RangeError);
  });

  it('refuses a chunk size that is not a whole positive number of steps', () => {
    expect(() => beginAdvance({ run: freshRun(), chunkSteps: 0, targetStep: STEPS })).toThrow(
      RangeError,
    );
    expect(() => beginAdvance({ run: freshRun(), chunkSteps: 1.5, targetStep: STEPS })).toThrow(
      RangeError,
    );
  });

  /** FR-008's projection: host time in, host time out, over the longest declared horizon. */
  it('projects the longest declared horizon from one step time', () => {
    const longest = Math.max(...config.horizons.leadHours);
    const steps = (longest * 3600) / config.clock.timestepSeconds;
    expect(projectedHorizonMs(1, config)).toBe(steps);
    expect(projectedHorizonMs(0.5, config)).toBe(steps / 2);
  });
});
