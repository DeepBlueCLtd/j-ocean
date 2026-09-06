import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/run/run.js';
import { THICKNESS } from '../../src/model/reduced-gravity.js';
import { declaredConfiguration } from '../support/config.js';

const { config, digest } = declaredConfiguration();

/**
 * FR-014 and SC-004, and the runtime half of constitution Principle III. Gate G-03 checks
 * the imports; this checks that the thing actually runs where there is no browser, which
 * is what makes a worker or a GPU kernel possible later without the harness present.
 */
describe('the model runs headlessly', () => {
  it('has no DOM to reach for', () => {
    expect(typeof globalThis.document).toBe('undefined');
    expect(typeof globalThis.window).toBe('undefined');
    expect('WebGLRenderingContext' in globalThis).toBe(false);
  });

  it('advances a run at the declared grid with no DOM present', () => {
    const run = createRun({ config, configDigest: digest });
    run.advance(100);
    expect(run.state.fields[THICKNESS]?.length).toBe(config.grid.nx * config.grid.ny);
    expect(run.clock.step).toBe(100);
  });

  it('reports the stability the criterion computed, and the run satisfies it', () => {
    const run = createRun({ config, configDigest: digest });
    expect(run.stability.satisfied).toBe(true);
    expect(run.stability.declaredTimestepSeconds).toBe(config.clock.timestepSeconds);
    expect(run.stability.declaredTimestepSeconds).toBeLessThanOrEqual(
      run.stability.largestStableTimestepSeconds,
    );
    process.stdout.write(
      `    gravity-wave speed ${run.stability.gravityWaveSpeedMetresPerSecond.toFixed(3)} m/s; ` +
        `linear boundary ${run.stability.linearStabilityBoundarySeconds.toFixed(1)} s; ` +
        `criterion admits ${run.stability.largestStableTimestepSeconds.toFixed(1)} s; ` +
        `declared ${String(run.stability.declaredTimestepSeconds)} s; ` +
        `viscous number ${run.stability.viscousNumber.toFixed(4)}\n`,
    );
  });
});
