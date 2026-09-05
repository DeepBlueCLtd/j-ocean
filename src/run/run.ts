import type { Configuration } from '../config/schema.js';
import type { ModelKernel, ModelState } from '../ports/kernel.js';
import type { RandomStream } from '../ports/rng.js';
import type { ClockControl, SimulationClock } from '../ports/clock.js';
import { createClock } from './clock.js';
import { SeededRng } from './rng.js';
import {
  assertManifestUsable,
  MANIFEST_FORMAT_VERSION,
  ManifestError,
  type RunManifest,
} from './manifest.js';
import { createDiffusionKernel } from '../model/diffusion-kernel.js';

/**
 * A run (constitution Principle I).
 *
 * The run owns determinism so that the model does not have to. It holds the root seed, the
 * RNG port, the clock's advance handle and the kernel's stream, and hands the kernel a
 * state and a step context — nothing else. That is what makes the kernel replaceable in
 * beat 003 without touching a line of this file, and what makes replay a property of the
 * foundation rather than of the ocean.
 *
 * It runs headlessly. Nothing here imports React, the DOM or a rendering module (FR-014).
 */

/** The stream names this run asks for. Both are recorded in the manifest (FR-003). */
export const INITIAL_STATE_STREAM = 'model/initial-state';
export const KERNEL_STREAM = 'model/kernel';

export interface CreateRunOptions {
  readonly config: Configuration;
  /** The digest of `config`, from the loader. Recorded in the manifest (FR-005). */
  readonly configDigest: string;
  /** Defaults to the declared `run.defaultSeed`: the recorded case (FR-012). */
  readonly seed?: string;
  /** Defaults to the reference CPU kernel (FR-04). */
  readonly kernel?: ModelKernel;
  /** False once a reader has asked for a new run (FR-012, FR-013). */
  readonly recordedCase?: boolean;
}

export class Run {
  readonly rng: SeededRng;
  readonly kernel: ModelKernel;
  readonly state: ModelState;
  readonly configDigest: string;
  readonly recordedCase: boolean;

  readonly #clockControl: ClockControl;
  readonly #kernelStream: RandomStream;
  readonly #clockConfig: { epoch: string; timestepSeconds: number };

  constructor(options: CreateRunOptions) {
    const { config, configDigest } = options;
    this.configDigest = configDigest;
    this.recordedCase = options.recordedCase ?? true;
    this.rng = new SeededRng(options.seed ?? config.run.defaultSeed);
    this.kernel = options.kernel ?? createDiffusionKernel();
    this.#clockConfig = {
      epoch: config.clock.epoch,
      timestepSeconds: config.clock.timestepSeconds,
    };
    this.#clockControl = createClock(this.#clockConfig);
    // The order these two streams are constructed in does not matter to their contents —
    // each is derived from the root seed and its own name — but it is fixed anyway so the
    // manifest of a replayed run is identical to the manifest of the original.
    this.state = this.kernel.createState(config.grid, this.rng.stream(INITIAL_STATE_STREAM));
    this.#kernelStream = this.rng.stream(KERNEL_STREAM);
  }

  /** The read-only clock every consumer sees. The advance handle is not exposed. */
  get clock(): SimulationClock {
    return this.#clockControl.clock;
  }

  get steps(): number {
    return this.#clockControl.clock.step;
  }

  /** Advance the run. Simulation time moves here and nowhere else. */
  advance(steps = 1): void {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new RangeError('a run advances by a whole, non-negative number of steps');
    }
    for (let i = 0; i < steps; i += 1) {
      this.kernel.step(this.state, {
        step: this.#clockControl.clock.step,
        instantMs: this.#clockControl.clock.instantMs(),
        timestepSeconds: this.#clockControl.clock.timestepSeconds,
        stream: this.#kernelStream,
      });
      this.#clockControl.advance(1);
    }
  }

  /** Everything needed to rebuild this run, and nothing of its state (FR-005). */
  exportManifest(): RunManifest {
    return {
      formatVersion: MANIFEST_FORMAT_VERSION,
      generatorVersion: this.rng.generatorVersion,
      kernelId: this.kernel.id,
      rootSeed: this.rng.rootSeed,
      derivedSeeds: this.rng.derivedSeeds(),
      clock: this.#clockConfig,
      configDigest: this.configDigest,
      steps: this.steps,
      recordedCase: this.recordedCase,
      counterfactual: null,
    };
  }
}

export function createRun(options: CreateRunOptions): Run {
  return new Run(options);
}

export interface CreateFromManifestOptions {
  readonly config: Configuration;
  readonly configDigest: string;
  readonly kernel?: ModelKernel;
  /**
   * Replay to the step the manifest records. On by default, because "a run is constructible
   * from a manifest alone" means the run you get back is the run that was exported, not a
   * fresh one that happens to share its seed.
   */
  readonly replay?: boolean;
}

/**
 * Rebuild a run from its manifest (FR-005, AT-04).
 *
 * Every refusal happens before anything is constructed, so a refused load leaves no run
 * behind — which is what the spec's third acceptance scenario asks for.
 */
export function createRunFromManifest(
  manifest: RunManifest,
  options: CreateFromManifestOptions,
): Run {
  const kernel = options.kernel ?? createDiffusionKernel();
  const probe = new SeededRng(manifest.rootSeed);
  assertManifestUsable(manifest, {
    generatorVersion: probe.generatorVersion,
    configDigest: options.configDigest,
  });
  if (manifest.kernelId !== kernel.id) {
    throw new ManifestError(
      `the manifest records kernel ${manifest.kernelId} and this run was given ` +
        `kernel ${kernel.id}; the same seed would not mean the same fields`,
    );
  }
  if (
    manifest.clock.epoch !== options.config.clock.epoch ||
    manifest.clock.timestepSeconds !== options.config.clock.timestepSeconds
  ) {
    throw new ManifestError(
      `the manifest clock (${manifest.clock.epoch}, ${String(manifest.clock.timestepSeconds)}s) ` +
        `is not the configured clock (${options.config.clock.epoch}, ` +
        `${String(options.config.clock.timestepSeconds)}s)`,
    );
  }

  const run = new Run({
    config: options.config,
    configDigest: options.configDigest,
    seed: manifest.rootSeed,
    kernel,
    recordedCase: manifest.recordedCase,
  });
  if (options.replay !== false) run.advance(manifest.steps);
  return run;
}
