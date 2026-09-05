import { describe, expect, it } from 'vitest';
import { geostrophicAgreement, initialiseFromTruth } from '../../src/model/initialise.js';
import { parametersFor } from '../../src/model/parameters.js';
import { createReducedGravityKernel } from '../../src/model/reduced-gravity.js';
import { invariantsOf, publishResults, seaSurfaceHeightFrom } from '../../src/model/results.js';
import { assessStability } from '../../src/model/parameters.js';
import { SeededRng } from '../../src/run/rng.js';
import { truthSource } from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();
const HOURS = 96;

const variance = (values: Float64Array): number => {
  let n = 0;
  let mean = 0;
  let sumSquares = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] as number;
    if (!Number.isFinite(value)) continue;
    n += 1;
    const delta = value - mean;
    mean += delta / n;
    sumSquares += delta * (value - mean);
  }
  return n > 1 ? sumSquares / (n - 1) : 0;
};

/**
 * AT-01 (SRD §9), FR-006 and SC-001.
 *
 * The model is initialised from the truth record at the run's first instant and integrated
 * for ninety-six hours, headlessly. What is asserted is not that the forecast is *good* --
 * that is beat 006's business, and it may well turn out that it is not -- but that the
 * integration is a physical one: it conserves what the scheme conserves, dissipates only
 * what the scheme dissipates, and neither decays to nothing nor blows up.
 *
 * Every figure is printed beside its tolerance. A conservation test whose numbers you cannot
 * see is a test that will pass quietly for a year while the margin disappears.
 */
describe.each(config.domains.list)('AT-01: ninety-six hours over $id', (domain) => {
  const parameters = parametersFor(config, domain);
  const stability = assessStability(
    parameters,
    config.clock.timestepSeconds,
    config.clock.stabilityCriterionCfl,
  );
  const kernel = createReducedGravityKernel(parameters);
  const truth = truthSource(domain.id);
  const startMs = Date.parse(config.truth.period.start);
  const steps = Math.round((HOURS * 3600) / config.clock.timestepSeconds);

  const { state, report } = initialiseFromTruth(
    kernel,
    parameters,
    truth,
    domain,
    startMs,
    'surface_elevation',
  );
  const initial = invariantsOf(state, parameters);
  const initialVariance = variance(seaSurfaceHeightFrom(state.fields['thickness'] as Float64Array, parameters));

  const stream = new SeededRng(config.run.defaultSeed).stream('model/kernel');
  const hourly: { hour: number; volume: number; energy: number }[] = [];
  for (let step = 0; step < steps; step += 1) {
    kernel.step(state, {
      step,
      instantMs: startMs + step * config.clock.timestepSeconds * 1000,
      timestepSeconds: config.clock.timestepSeconds,
      stream,
    });
    const elapsedHours = ((step + 1) * config.clock.timestepSeconds) / 3600;
    // The declared timestep divides an hour, so "each hour" (FR-006) is exact rather than
    // approximate. If a future timestep did not, this would silently diagnose less often --
    // so the count is asserted below.
    if (Number.isInteger(elapsedHours)) {
      const now = invariantsOf(state, parameters);
      hourly.push({ hour: elapsedHours, volume: now.upperLayerVolumeCubicMetres, energy: now.totalEnergy });
    }
  }
  const final = invariantsOf(state, parameters);
  const results = publishResults(state, parameters, stability);

  it('starts from a truth field that looks like a two-layer ocean', () => {
    const [thin, thick] = report.thicknessRangeMetres;
    // The record snaps to the source's own grid, so it covers a little less than the
    // declared box. The model integrates over the water the record has, and the shortfall
    // must stay inside one native cell or the declaration and the record have diverged.
    expect(report.shortfallDegrees).toBeGreaterThanOrEqual(0);
    expect(report.shortfallDegrees).toBeLessThanOrEqual(domain.nativeResolutionDegrees);
    process.stdout.write(
      `    initialised from truth at ${new Date(startMs).toISOString()}: layer thickness ` +
        `${thin.toFixed(1)} to ${thick.toFixed(1)} m about a declared mean of ` +
        `${String(parameters.meanThickness)} m; removed a mean sea-surface height of ` +
        `${report.meanSeaSurfaceHeightRemovedMetres.toFixed(4)} m; ${String(report.landCells)} land cells, ` +
        `${String(report.clampedCells)} clamped at the outcrop minimum\n`,
    );
    expect(thick).toBeGreaterThan(thin);
    expect(thin).toBeGreaterThanOrEqual(parameters.minimumThickness);
  });

  it('outcrops when the boundary is closed, which is why the boundary is not', () => {
    // Worth its own test because it is a finding rather than a formality. A closed box
    // around a front this strong does not stay a two-layer ocean: the layer thins to
    // nothing at the wall within half a day, the clamp fires, and volume stops being
    // conserved. FR-012's sponge is not a tidiness measure -- it is what makes the domain
    // an open piece of ocean rather than a bathtub.
    const closed = { ...parameters, spongeWidthCells: 0 };
    const closedKernel = createReducedGravityKernel(closed);
    const start = initialiseFromTruth(closedKernel, closed, truth, domain, startMs, 'surface_elevation');
    const before = invariantsOf(start.state, closed).upperLayerVolumeCubicMetres;
    const closedStream = new SeededRng(config.run.defaultSeed).stream('model/kernel');
    const shortRun = Math.round((12 * 3600) / config.clock.timestepSeconds);
    for (let step = 0; step < shortRun; step += 1) {
      closedKernel.step(start.state, {
        step,
        instantMs: startMs + step * config.clock.timestepSeconds * 1000,
        timestepSeconds: config.clock.timestepSeconds,
        stream: closedStream,
      });
    }
    const after = invariantsOf(start.state, closed).upperLayerVolumeCubicMetres;
    const closedResults = publishResults(start.state, closed, stability);
    const drift = (after - before) / before;
    process.stdout.write(
      `    12 h with the boundary closed: ${String(closedResults.outcrops)} outcrop clamps ` +
        `adding ${closedResults.clampedVolumeCubicMetres.toExponential(3)} m^3; volume drift ` +
        `${drift.toExponential(3)} relative\n`,
    );

    if (closedResults.outcrops === 0) {
      // Nothing entered and nothing left, so the flux-divergence form of continuity has
      // conserved volume to round-off. This is the assertion that tests the *scheme*.
      expect(Math.abs(drift)).toBeLessThanOrEqual(
        config.model.tolerances.closedBoundaryVolumeRelativeDrift,
      );
    } else {
      // The clamp fired, so volume is not conserved and the test says so rather than
      // widening a tolerance until the failure disappears. What is asserted is that the
      // clamp is the only thing adding water: the drift is positive and bounded by what the
      // clamp put in.
      expect(drift).toBeGreaterThan(0);
      expect(after - before).toBeLessThanOrEqual(closedResults.clampedVolumeCubicMetres);
    }
  });

  it('bounds the volume the open boundary exchanges, and says how much', () => {
    // The configuration that ships has a sponge, which is an open boundary: it relaxes the
    // margin toward the state it started from, and mass crosses it. That drift is bounded,
    // not absent, and pretending otherwise would mean either a tolerance loose enough to
    // hide a real error or a claim the model cannot make.
    const drift =
      Math.abs(final.upperLayerVolumeCubicMetres - initial.upperLayerVolumeCubicMetres) /
      initial.upperLayerVolumeCubicMetres;
    process.stdout.write(
      `    volume drift over ${String(HOURS)} h with the sponge on: ${drift.toExponential(3)} ` +
        `relative, tolerance ${config.model.tolerances.volumeRelativeDrift.toExponential(3)}\n`,
    );
    expect(drift).toBeLessThanOrEqual(config.model.tolerances.volumeRelativeDrift);
  });

  it('loses energy, and only as much as the scheme dissipates', () => {
    const drift = (final.totalEnergy - initial.totalEnergy) / initial.totalEnergy;
    process.stdout.write(
      `    energy: ${initial.totalEnergy.toExponential(4)} -> ${final.totalEnergy.toExponential(4)} ` +
        `(${(drift * 100).toFixed(2)}%), tolerance ` +
        `${(config.model.tolerances.energyRelativeDrift * 100).toFixed(0)}%\n`,
    );
    expect(Math.abs(drift)).toBeLessThanOrEqual(config.model.tolerances.energyRelativeDrift);
    // Viscosity, bottom drag and the Robert-Asselin filter all remove energy and nothing
    // adds any: a scheme that gained energy over four days would be a scheme with a sign
    // error, and this is the assertion that would catch it.
    expect(drift).toBeLessThanOrEqual(0);
  });

  it('keeps its structure: the field neither decays to nothing nor blows up', () => {
    const finalVariance = variance(results.seaSurfaceHeightMetres());
    const ratio = finalVariance / initialVariance;
    const [low, high] = config.model.tolerances.varianceBandOfInitial;
    process.stdout.write(
      `    sea-surface height variance ${initialVariance.toExponential(3)} -> ` +
        `${finalVariance.toExponential(3)} m^2, ratio ${ratio.toFixed(3)}, ` +
        `declared band ${String(low)} to ${String(high)}\n`,
    );
    expect(ratio).toBeGreaterThanOrEqual(low);
    expect(ratio).toBeLessThanOrEqual(high);
  });

  it('reports every outcrop it clamped rather than swallowing them', () => {
    process.stdout.write(`    outcrop clamps over ${String(HOURS)} h: ${String(results.outcrops)}\n`);
    expect(Number.isInteger(results.outcrops)).toBe(true);
  });

  it('is monotone in the sense the scheme dissipation predicts', () => {
    // Not strictly monotone -- the leapfrog exchanges energy between levels every step --
    // but the hourly series must not climb over the run as a whole.
    const first = hourly[0]?.energy ?? 0;
    const last = hourly[hourly.length - 1]?.energy ?? 0;
    expect(last).toBeLessThanOrEqual(first);
    expect(hourly.length).toBe(HOURS);
  });

  /**
   * FR-013's other half. The truth's own surface velocity is not imposed on the model -- it
   * carries barotropic and ageostrophic parts this model has no layer for, and imposing it
   * would launch a gravity-wave shock at step zero. It is used to *check* the geostrophic
   * initialisation instead, and this is that check, with its figure printed.
   */
  it('initialises a velocity that agrees with the truth own surface velocity', () => {
    const fresh = initialiseFromTruth(kernel, parameters, truth, domain, startMs, 'surface_elevation');
    const agreement = geostrophicAgreement(
      fresh.state,
      truth,
      domain,
      startMs,
      'velocity_east',
      'velocity_north',
    );
    process.stdout.write(
      `    geostrophic initialisation against the truth surface velocity: correlation ` +
        `${agreement.correlation.toFixed(3)} over ${String(agreement.n)} components; mean speed ` +
        `${agreement.modelSpeedMean.toFixed(3)} m/s against ${agreement.truthSpeedMean.toFixed(3)} m/s\n`,
    );
    expect(agreement.n).toBeGreaterThan(0);
    expect(agreement.correlation).toBeGreaterThan(0.3);
  });
});
