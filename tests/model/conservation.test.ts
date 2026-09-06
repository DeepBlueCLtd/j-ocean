import { describe, expect, it } from 'vitest';
import { createField, indexOf } from '../../src/model/grid.js';
import { assessStability, parametersFor } from '../../src/model/parameters.js';
import { createReducedGravityKernel, THICKNESS, VELOCITY_U, VELOCITY_V } from '../../src/model/reduced-gravity.js';
import { invariantsOf, publishResults } from '../../src/model/results.js';
import { SeededRng } from '../../src/run/rng.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();
const domain = config.domains.list[0];
if (domain === undefined) throw new Error('no declared domains');

/**
 * The scheme's own conservation, in a setting where nothing else can confound it.
 *
 * AT-01 integrates the real ocean, where a closed box around the Gulf Stream front outcrops
 * the layer and the clamp fires. That is a fact about the ocean, not about the arithmetic.
 * This suite is about the arithmetic: a smooth bump on a deep layer, no sponge, no
 * possibility of outcropping, and the flux-divergence form of continuity has nothing to do
 * but conserve.
 */
describe('the scheme conserves what it claims to conserve', () => {
  const parameters = {
    ...parametersFor(config, domain),
    spongeWidthCells: 0,
    // Deep enough that the clamp cannot fire whatever the bump does over a day.
    meanThickness: 1000,
    minimumThickness: 1,
  };
  const { grid } = parameters;
  const stability = assessStability(parameters, config.clock.timestepSeconds, config.clock.stabilityCriterionCfl);
  const kernel = createReducedGravityKernel(parameters);

  const stateWithBump = () => {
    const thickness = createField(grid);
    const centreX = (grid.nx - 1) / 2;
    const centreY = (grid.ny - 1) / 2;
    const width = grid.nx / 8;
    for (let iy = 0; iy < grid.ny; iy += 1) {
      for (let ix = 0; ix < grid.nx; ix += 1) {
        const r2 = ((ix - centreX) / width) ** 2 + ((iy - centreY) / width) ** 2;
        thickness[indexOf(grid, ix, iy)] = parameters.meanThickness + 100 * Math.exp(-r2);
      }
    }
    return kernel.adopt({
      grid,
      fields: { [THICKNESS]: thickness, [VELOCITY_U]: createField(grid), [VELOCITY_V]: createField(grid) },
    });
  };

  it('conserves upper-layer volume to round-off over a day', () => {
    const state = stateWithBump();
    const before = invariantsOf(state, parameters).upperLayerVolumeCubicMetres;
    const stream = new SeededRng(config.run.defaultSeed).stream('model/kernel');
    const steps = Math.round((24 * 3600) / config.clock.timestepSeconds);
    for (let step = 0; step < steps; step += 1) {
      kernel.step(state, {
        step,
        instantMs: step * config.clock.timestepSeconds * 1000,
        timestepSeconds: config.clock.timestepSeconds,
        stream,
      });
    }
    const after = invariantsOf(state, parameters).upperLayerVolumeCubicMetres;
    const results = publishResults(state, parameters, stability);
    const drift = Math.abs(after - before) / before;
    process.stdout.write(
      `    volume drift over 24 h, smooth bump, no sponge, no clamp: ${drift.toExponential(3)} ` +
        `relative (${String(results.outcrops)} clamps), tolerance ` +
        `${config.model.tolerances.closedBoundaryVolumeRelativeDrift.toExponential(3)}\n`,
    );
    expect(results.outcrops).toBe(0);
    expect(drift).toBeLessThanOrEqual(config.model.tolerances.closedBoundaryVolumeRelativeDrift);
  });

  it('radiates the bump away as gravity waves rather than sitting on it', () => {
    // A geostrophically unbalanced bump must adjust: the height anomaly falls and kinetic
    // energy appears. A scheme that left it alone would not be solving shallow water.
    const state = stateWithBump();
    const start = invariantsOf(state, parameters);
    const stream = new SeededRng(config.run.defaultSeed).stream('model/kernel');
    for (let step = 0; step < 200; step += 1) {
      kernel.step(state, {
        step,
        instantMs: step * config.clock.timestepSeconds * 1000,
        timestepSeconds: config.clock.timestepSeconds,
        stream,
      });
    }
    const now = invariantsOf(state, parameters);
    expect(start.kineticEnergy).toBe(0);
    expect(now.kineticEnergy).toBeGreaterThan(0);
    expect(now.availablePotentialEnergy).toBeLessThan(start.availablePotentialEnergy);
    expect(now.totalEnergy).toBeLessThanOrEqual(start.totalEnergy);
  });
});
