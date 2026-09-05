import { describe, expect, it } from 'vitest';
import { createDiffusionKernel, DIFFUSION_KERNEL_ID } from '../../src/model/diffusion-kernel.js';
import { stateBytes } from '../../src/model/grid.js';
import { SeededRng } from '../../src/run/rng.js';
import type { GridSpec } from '../../src/ports/kernel.js';

const grid: GridSpec = { nx: 16, ny: 12, cellSizeMetres: 5500 };
const ROOT = '6a09e667f3bcc908';

const advance = (seed: string, steps: number) => {
  const rng = new SeededRng(seed);
  const kernel = createDiffusionKernel();
  const state = kernel.createState(grid, rng.stream('model/initial-state'));
  const stream = rng.stream('model/kernel');
  for (let step = 0; step < steps; step += 1) {
    kernel.step(state, { step, instantMs: step * 600_000, timestepSeconds: 600, stream });
  }
  return state;
};

/**
 * The contract every kernel must satisfy (FR-002, FR-04). Beat 003's reduced-gravity
 * kernel and any later GPU kernel are accepted against this suite and, where they claim to
 * be the same model, against the reference's output to a recorded tolerance.
 */
describe('the model kernel port contract', () => {
  const kernel = createDiffusionKernel();

  it('publishes the fields it says it publishes, at the declared grid shape', () => {
    const state = kernel.createState(grid, new SeededRng(ROOT).stream('s'));
    expect(Object.keys(state.fields).sort()).toEqual([...kernel.fieldNames].sort());
    for (const name of kernel.fieldNames) {
      const field = state.fields[name];
      expect(field).toBeInstanceOf(Float64Array);
      expect(field?.length).toBe(grid.nx * grid.ny);
    }
    expect(state.grid).toEqual(grid);
  });

  it('integrates in typed arrays, never in arrays of objects', () => {
    const state = kernel.createState(grid, new SeededRng(ROOT).stream('s'));
    for (const field of Object.values(state.fields)) {
      expect(ArrayBuffer.isView(field)).toBe(true);
    }
  });

  it('is deterministic: the same seed gives byte-identical state', () => {
    expect(stateBytes(advance(ROOT, 50))).toEqual(stateBytes(advance(ROOT, 50)));
  });

  /**
   * The negative half, and the reason the kernel draws at all: a kernel that ignored its
   * stream would pass the test above however broken the RNG was (plan 001, Risks).
   */
  it('depends on its stream: a different seed gives a different state', () => {
    expect(stateBytes(advance(ROOT, 50))).not.toEqual(
      stateBytes(advance('0000000000000001', 50)),
    );
  });

  it('advances in place and stays finite', () => {
    const state = advance(ROOT, 200);
    const tracer = state.fields['tracer'] as Float64Array;
    expect(tracer.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('names itself, and declares whether it is the reference (FR-04)', () => {
    expect(kernel.id).toBe(DIFFUSION_KERNEL_ID);
    expect(kernel.isReference).toBe(true);
  });

  it('refuses a state it does not recognise rather than computing on it', () => {
    const foreign = { grid, fields: { salinity: new Float64Array(grid.nx * grid.ny) } };
    expect(() =>
      kernel.step(foreign, {
        step: 0,
        instantMs: 0,
        timestepSeconds: 600,
        stream: new SeededRng(ROOT).stream('s'),
      }),
    ).toThrow(/no tracer field/);
  });
});
