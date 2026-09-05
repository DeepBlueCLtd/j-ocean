import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/run/run.js';
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
    const tracer = run.state.fields['tracer'];
    expect(tracer?.length).toBe(config.grid.nx * config.grid.ny);
    expect(run.clock.step).toBe(100);
  });
});
