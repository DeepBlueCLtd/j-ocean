import type { ClockConfiguration, ClockControl, SimulationClock } from '../ports/clock.js';

/**
 * The reference simulation clock (constitution Principle I).
 *
 * `Date.parse` and `new Date(ms)` appear below and neither is a host-clock read: both are
 * pure functions of an argument that came from configuration or from the step count. Gate
 * G-04 forbids the argument-free `new Date()` and `Date.now`, which are the forms that
 * read the host, and it is those the constitution names.
 */
class SteppedClock implements SimulationClock {
  readonly epochMs: number;
  readonly timestepSeconds: number;
  #step = 0;

  constructor(config: ClockConfiguration) {
    const epochMs = Date.parse(config.epoch);
    if (!Number.isFinite(epochMs)) {
      throw new RangeError(`the clock epoch ${config.epoch} is not an instant`);
    }
    if (!Number.isInteger(config.timestepSeconds) || config.timestepSeconds <= 0) {
      throw new RangeError('the timestep is a positive whole number of seconds');
    }
    this.epochMs = epochMs;
    this.timestepSeconds = config.timestepSeconds;
  }

  get step(): number {
    return this.#step;
  }

  instantMs(): number {
    return this.epochMs + this.#step * this.timestepSeconds * 1000;
  }

  instantIso(): string {
    return new Date(this.instantMs()).toISOString();
  }

  advanceInternal(steps: number): void {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new RangeError('a clock advances by a whole, non-negative number of steps');
    }
    this.#step += steps;
  }
}

/**
 * Create a clock and its advance handle. The caller — the run, and only the run — keeps
 * `advance`; everything else is handed `clock`, which has no way to move.
 */
export function createClock(config: ClockConfiguration): ClockControl {
  const clock = new SteppedClock(config);
  return {
    clock,
    advance(steps = 1) {
      clock.advanceInternal(steps);
    },
  };
}
