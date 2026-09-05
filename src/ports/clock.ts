/**
 * Port: simulation time (constitution Principle I, SRD §2.1).
 *
 * All simulation time comes from here. The host clock is not simulation time and never
 * stands in for it: the harness's timing module may measure how long the machinery took
 * (Principle I exemption (a)), but that figure is host time, is marked as such, and does
 * not enter this port.
 *
 * The interface is split deliberately. Consumers receive a `SimulationClock`, which can
 * only be read. The advance handle is a separate object the run holds and does not pass
 * on, so "no consumer can advance it independently" is a fact about the types rather than
 * a convention to be remembered.
 */

/** What every consumer sees: the same instant, and no way to move it. */
export interface SimulationClock {
  /** The instant step zero is valid for, in milliseconds since the Unix epoch. */
  readonly epochMs: number;
  /** The declared timestep (configuration `clock.timestepSeconds`). */
  readonly timestepSeconds: number;
  /** How many steps have been taken. */
  readonly step: number;
  /** The current instant, in milliseconds since the Unix epoch. */
  instantMs(): number;
  /** The current instant as an ISO 8601 UTC string, for display and for the manifest. */
  instantIso(): string;
}

/** The advance handle. Held by the run; never handed to a consumer. */
export interface ClockControl {
  readonly clock: SimulationClock;
  /** Advance by whole steps. Simulation time moves here and nowhere else. */
  advance(steps?: number): void;
}

/** The clock configuration a run manifest records (FR-005). */
export interface ClockConfiguration {
  readonly epoch: string;
  readonly timestepSeconds: number;
}
