import type { GridSpec, ModelKernel, ModelState, StepContext } from '../ports/kernel.js';
import type { RandomStream } from '../ports/rng.js';
import { cellCount, createField, indexOf, wrap } from './grid.js';

/**
 * The trivial reference kernel of beat 001.
 *
 * This is a placeholder for the contract test and for the replay test, and beat 003
 * *replaces* it rather than extending it (spec 001, Assumptions). It is not an ocean and
 * does not pretend to be one: a scalar tracer diffusing on a periodic grid, with a small
 * stochastic forcing drawn from the kernel's own stream.
 *
 * The forcing is not decoration. A kernel whose output did not depend on its stream would
 * replay identically no matter how broken the RNG was, and the replay test would pass for
 * the wrong reason (plan 001, Risks).
 */
export const DIFFUSION_KERNEL_ID = 'scalar-diffusion/1';

/**
 * Dimensionless, and chosen well inside the explicit stability limit of 0.25 for a
 * five-point Laplacian in two dimensions. It is a property of this placeholder kernel, not
 * a declared value of the system, which is why it is here and not in configuration.
 */
const DIFFUSION_NUMBER = 0.15;
const FORCING_AMPLITUDE = 0.05;

class ScalarDiffusionKernel implements ModelKernel {
  readonly id = DIFFUSION_KERNEL_ID;
  readonly isReference = true;
  readonly fieldNames = ['tracer'] as const;

  createState(grid: GridSpec, stream: RandomStream): ModelState {
    const tracer = createField(grid);
    for (let i = 0; i < tracer.length; i += 1) tracer[i] = stream.nextGaussian();
    return { grid, fields: { tracer } };
  }

  step(state: ModelState, context: StepContext): void {
    const { grid } = state;
    const tracer = state.fields['tracer'];
    if (tracer === undefined) throw new TypeError(`${this.id} was handed a state with no tracer field`);

    const next = new Float64Array(tracer.length);
    for (let iy = 0; iy < grid.ny; iy += 1) {
      for (let ix = 0; ix < grid.nx; ix += 1) {
        const here = indexOf(grid, ix, iy);
        const laplacian =
          (tracer[indexOf(grid, wrap(ix + 1, grid.nx), iy)] as number) +
          (tracer[indexOf(grid, wrap(ix - 1, grid.nx), iy)] as number) +
          (tracer[indexOf(grid, ix, wrap(iy + 1, grid.ny))] as number) +
          (tracer[indexOf(grid, ix, wrap(iy - 1, grid.ny))] as number) -
          4 * (tracer[here] as number);
        next[here] = (tracer[here] as number) + DIFFUSION_NUMBER * laplacian;
      }
    }

    // Exactly two draws per step, in a fixed order, from the one stream the run holds
    // for this kernel: the stream's position after N steps is a function of N alone.
    const cell = Math.floor(context.stream.nextFloat() * cellCount(grid));
    next[cell] = (next[cell] as number) + FORCING_AMPLITUDE * context.stream.nextGaussian();

    tracer.set(next);
  }
}

/** The CPU reference implementation (FR-04). Beat 003 replaces its arithmetic, not its role. */
export function createDiffusionKernel(): ModelKernel {
  return new ScalarDiffusionKernel();
}
