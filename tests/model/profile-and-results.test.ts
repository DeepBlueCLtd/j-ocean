import { describe, expect, it } from 'vitest';
import { createField, indexOf } from '../../src/model/grid.js';
import { assessStability, parametersFor } from '../../src/model/parameters.js';
import { diagnoseProfile, interfaceDepthFrom, temperatureAt } from '../../src/model/profile.js';
import { createReducedGravityKernel, THICKNESS, VELOCITY_U, VELOCITY_V } from '../../src/model/reduced-gravity.js';
import { publishResults } from '../../src/model/results.js';
import { SeededRng } from '../../src/run/rng.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();
const domain = config.domains.list[0];
if (domain === undefined) throw new Error('no declared domains');
const parameters = parametersFor(config, domain);
const structure = parameters.thermalStructure;
const kernel = createReducedGravityKernel(parameters);
const stability = assessStability(parameters, config.clock.timestepSeconds, config.clock.stabilityCriterionCfl);

const stateWithThickness = (metres: number) => {
  const { grid } = parameters;
  const thickness = createField(grid);
  thickness.fill(metres);
  return kernel.adopt({
    grid,
    fields: { [THICKNESS]: thickness, [VELOCITY_U]: createField(grid), [VELOCITY_V]: createField(grid) },
  });
};

/**
 * FR-07 and FR-010: depth is displayed, never integrated.
 *
 * The assertion that matters most is the one about *kind*. NFR-05 says a figure does not
 * change kind between states, so a level cannot be `computed` when the interface happens to
 * sit on it and `derived` when it does not. Getting that wrong would produce a surface whose
 * typography a reader could not learn.
 */
describe('the diagnosed vertical profile', () => {
  it('has one level per declared display level, in declared order', () => {
    const profile = diagnoseProfile(stateWithThickness(400), 10, 10, structure);
    expect(profile.levels.map((level) => level.depthMetres)).toEqual(structure.displayLevelsMetres);
  });

  it('is warm at the top, cold at the bottom, and monotone between', () => {
    const profile = diagnoseProfile(stateWithThickness(400), 10, 10, structure);
    const temperatures = profile.levels.map((level) => level.temperatureDegC);
    expect(temperatures[0]).toBeGreaterThan(temperatures[temperatures.length - 1] as number);
    for (let i = 1; i < temperatures.length; i += 1) {
      expect(temperatures[i]).toBeLessThanOrEqual(temperatures[i - 1] as number);
    }
    expect(temperatures[0]).toBeCloseTo(structure.upperTemperatureDegC, 1);
    expect(temperatures[temperatures.length - 1]).toBeCloseTo(structure.deepTemperatureDegC, 1);
  });

  it('puts the thermocline where the layer thickness says, and says it is computed', () => {
    for (const metres of [200, 400, 600]) {
      const profile = diagnoseProfile(stateWithThickness(metres), 5, 5, structure);
      expect(profile.interfaceDepthMetres).toBe(metres);
      expect(temperatureAt(metres, metres, structure)).toBeCloseTo(
        (structure.upperTemperatureDegC + structure.deepTemperatureDegC) / 2,
        10,
      );
    }
  });

  /** The one that would be easy to get wrong, and expensive to get wrong. */
  it('gives every level a kind that does not move when the interface does', () => {
    const shallow = diagnoseProfile(stateWithThickness(120), 3, 3, structure);
    const deep = diagnoseProfile(stateWithThickness(680), 3, 3, structure);
    expect(shallow.levels.map((level) => level.kind)).toEqual(deep.levels.map((level) => level.kind));

    const kinds = shallow.levels.map((level) => level.kind);
    expect(kinds[0]).toBe('computed');
    expect(kinds[kinds.length - 1]).toBe('computed');
    expect(kinds.slice(1, -1).every((kind) => kind === 'derived')).toBe(true);
  });

  it('says in the object that the levels between are derived, so a surface cannot forget to', () => {
    const profile = diagnoseProfile(stateWithThickness(400), 0, 0, structure);
    expect(profile.note).toMatch(/displayed, not integrated/);
    expect(profile.note).toMatch(/derived/);
  });

  /**
   * Review R-1 and ADR-0005: the same relation the profile is drawn from is the one beat
   * 004's instruments invert to turn a temperature into an interface depth. If it did not
   * invert cleanly, an XBT and the profile beside it would disagree for a reason that was
   * nobody's fault and nothing's finding.
   */
  it('inverts exactly where the measurement crosses the thermocline', () => {
    for (const interfaceDepth of [150, 300, 500, 700]) {
      for (const offset of [-150, -60, 0, 60, 150]) {
        const depth = interfaceDepth + offset;
        const inferred = interfaceDepthFrom(depth, temperatureAt(depth, interfaceDepth, structure), structure);
        expect(inferred.resolved).toBe(true);
        expect(inferred.depthMetres).toBeCloseTo(interfaceDepth, 6);
      }
    }
  });

  /**
   * The half that matters more. A thermometer in the body of a layer reads that layer's own
   * temperature and constrains the interface hardly at all, because the relation is a tanh
   * and it saturates. Beat 004's instruments have to be told so: an observation that
   * constrains nothing must not be allowed to look as though it did.
   */
  it('says when a measurement is too far from the thermocline to constrain it', () => {
    const interfaceDepth = 700;
    const shallow = interfaceDepthFrom(100, temperatureAt(100, interfaceDepth, structure), structure);
    expect(shallow.resolved).toBe(false);
    process.stdout.write(
      `    a measurement at 100 m with the interface at ${String(interfaceDepth)} m infers ` +
        `${shallow.depthMetres.toFixed(1)} m and reports itself unresolved\n`,
    );

    const deep = interfaceDepthFrom(700, temperatureAt(700, 150, structure), structure);
    expect(deep.resolved).toBe(false);
  });
});

/**
 * FR-005 and constitution III: the harness reads published fields and never reaches into
 * integration state. This is the test that would fail if somebody added a getter returning a
 * buffer, which is the accident this boundary exists to prevent.
 */
describe('the published results interface', () => {
  const state = stateWithThickness(500);
  const results = publishResults(state, parameters, stability);

  it('hands out copies, so a harness cannot write into the integration buffers', () => {
    const published = results.thicknessMetres();
    const internal = state.fields[THICKNESS] as Float64Array;
    expect(published).not.toBe(internal);
    published[0] = -12345;
    expect(internal[0]).toBe(500);
  });

  it('copies every field it publishes, not merely the first one', () => {
    for (const getter of [results.thicknessMetres, results.velocityU, results.velocityV, results.spongeWeight]) {
      expect(getter()).not.toBe(getter());
    }
  });

  it('exposes no integration buffer under any name', () => {
    const values = Object.values(results as unknown as Record<string, unknown>);
    for (const value of values) {
      expect(ArrayBuffer.isView(value)).toBe(false);
    }
    expect(Object.keys(results)).not.toContain('fields');
    expect(Object.keys(results)).not.toContain('state');
  });

  it('publishes the margin scoring must exclude', () => {
    expect(results.spongeWidthCells).toBe(config.model.sponge.widthCells);
    const weight = results.spongeWeight();
    expect(weight[indexOf(parameters.grid, 0, 0)]).toBeGreaterThan(0);
    expect(
      weight[indexOf(parameters.grid, Math.floor(parameters.grid.nx / 2), Math.floor(parameters.grid.ny / 2))],
    ).toBe(0);
  });

  it('turns layer thickness into a sea-surface height a reader recognises', () => {
    const eta = results.seaSurfaceHeightMetres();
    // A uniform layer has no anomaly: the domain mean is removed because a reduced-gravity
    // model has no absolute reference for its free surface.
    for (let i = 0; i < eta.length; i += 1) expect(eta[i]).toBeCloseTo(0, 12);
  });

  it('reports the stability the criterion computed', () => {
    expect(results.stability.satisfied).toBe(true);
    expect(results.stability.declaredTimestepSeconds).toBe(config.clock.timestepSeconds);
  });
});

/**
 * FR-011 and ADR-0002. The CPU kernel is the reference and stays the reference; a second
 * kernel is accepted against it to a recorded tolerance.
 *
 * SC-005 asks for the case nobody remembers to write: when there is no second kernel, the
 * test must say "reference only" rather than pass silently, so that no second kernel is
 * never mistaken for a second kernel accepted.
 */
describe('kernel acceptance', () => {
  /** Every kernel registered in the tree. Today there is one, and the test says so. */
  const registered = [createReducedGravityKernel(parameters)];

  it('runs every registered kernel against the reference, and says when there is only one', () => {
    const reference = registered.filter((kernel) => kernel.isReference);
    expect(reference.length).toBe(1);
    const others = registered.filter((kernel) => !kernel.isReference);

    if (others.length === 0) {
      process.stdout.write(
        `    reference only: ${String(registered.length)} kernel registered, ` +
          `${reference[0]?.id ?? ''}, and no second kernel to accept against it. The ` +
          `recorded tolerance is a relative ` +
          `${config.model.tolerances.kernelAcceptanceRelative.toExponential(0)} (ADR-0002).\n`,
      );
      expect(others.length).toBe(0);
      return;
    }

    const integrate = (kernel: typeof registered[number]) => {
      const rng = new SeededRng(config.run.defaultSeed);
      const state = kernel.createState(parameters.grid, rng.stream('model/initial-state'));
      const stream = rng.stream('model/kernel');
      for (let step = 0; step < 100; step += 1) {
        kernel.step(state, {
          step,
          instantMs: step * config.clock.timestepSeconds * 1000,
          timestepSeconds: config.clock.timestepSeconds,
          stream,
        });
      }
      return state;
    };

    const expected = integrate(reference[0] as typeof registered[number]);
    for (const candidate of others) {
      const actual = integrate(candidate);
      for (const name of candidate.fieldNames) {
        const a = expected.fields[name] as Float64Array;
        const b = actual.fields[name] as Float64Array;
        let worst = 0;
        let scale = 0;
        for (let i = 0; i < a.length; i += 1) {
          worst = Math.max(worst, Math.abs((a[i] as number) - (b[i] as number)));
          scale = Math.max(scale, Math.abs(a[i] as number));
        }
        const relative = scale === 0 ? worst : worst / scale;
        process.stdout.write(
          `    ${candidate.id} against ${reference[0]?.id ?? ''}, field ${name}: ` +
            `relative ${relative.toExponential(3)}, recorded tolerance ` +
            `${config.model.tolerances.kernelAcceptanceRelative.toExponential(0)}\n`,
        );
        expect(relative).toBeLessThanOrEqual(config.model.tolerances.kernelAcceptanceRelative);
      }
    }
  });
});
