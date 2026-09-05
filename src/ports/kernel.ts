import type { RandomStream } from './rng.js';

/**
 * Port: the model kernel (constitution Principle VIII, SRD §2.1, FR-04).
 *
 * State in, advanced state out. The kernel is handed everything it needs — the state, the
 * step index, the instant, the timestep and one stream — and reaches for nothing: not a
 * seed, not a clock, not configuration. That is what makes the GPU implementation of §10
 * cheap to adopt, and what makes the CPU kernel a *reference* rather than merely the one
 * that happens to exist.
 *
 * FR-04: the CPU kernel remains the reference after any faster kernel lands, and a second
 * kernel is accepted only against the reference's output to a tolerance recorded in the
 * accepting test.
 */

/**
 * The grid a kernel integrates on.
 *
 * `nx` and `ny` come from configuration; the two cell sizes are computed from the declared
 * domain box and that grid, and they differ. A five-degree box is not square in kilometres
 * at Gulf Stream latitudes -- about 4.5 km east-west against 5.5 km north-south -- so a
 * single declared cell size would be declaring something untrue.
 */
export interface GridSpec {
  readonly nx: number;
  readonly ny: number;
  readonly cellSizeXMetres: number;
  readonly cellSizeYMetres: number;
}

/**
 * Model state: typed arrays, never arrays of objects (constitution, Technology). Fields
 * are named so that the harness can read published fields without knowing the kernel.
 */
export interface ModelState {
  readonly grid: GridSpec;
  readonly fields: Readonly<Record<string, Float64Array>>;
}

/** Everything a kernel is permitted to know about when it is stepped. */
export interface StepContext {
  readonly step: number;
  readonly instantMs: number;
  readonly timestepSeconds: number;
  /** The kernel's own stream. Its name is recorded in the manifest like any other. */
  readonly stream: RandomStream;
}

export interface ModelKernel {
  /** Stable identifier, recorded wherever a result is attributed to a kernel. */
  readonly id: string;
  /**
   * True for the CPU reference implementation. Exactly one registered kernel may set it,
   * and a second kernel is accepted against that one (FR-04).
   */
  readonly isReference: boolean;
  /** The fields this kernel publishes. */
  readonly fieldNames: readonly string[];
  /** Allocate an initial state. Deterministic given the grid and the stream. */
  createState(grid: GridSpec, stream: RandomStream): ModelState;
  /** Advance the state in place by one timestep. */
  step(state: ModelState, context: StepContext): void;
}
