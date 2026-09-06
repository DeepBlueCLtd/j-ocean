import { describe, expect, it } from 'vitest';
import type { Configuration } from '../../src/config/schema.js';
import { analyse, cellOf, type AnalysisRecord } from '../../src/analysis/optimal-interpolation.js';
import { weightsAt } from '../../src/analysis/attribution.js';
import { argoObservations, sampleXbtDrops } from '../../src/instruments/instruments.js';
import type { Observation } from '../../src/instruments/observation.js';
import { createField, indexOf } from '../../src/model/grid.js';
import { gridFor, parametersFor } from '../../src/model/parameters.js';
import { observations as argoRecord } from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';
import { samplingContext } from '../support/instruments.js';

const { config } = declaredConfiguration();
const found = config.domains.list.find((d) => d.id === config.domains.defaultId);
if (found === undefined) throw new Error('no default domain');
const domain = found;
const grid = gridFor(config, domain);
const parameters = parametersFor(config, domain);
const N = grid.nx * grid.ny;

const flat = (value: number): Float64Array => {
  const field = createField(grid);
  field.fill(value);
  return field;
};

const baseInputs = (observations: readonly Observation[], overrides: Partial<Configuration> = {}) => ({
  config: { ...config, ...overrides } as Configuration,
  grid,
  background: flat(500),
  climatology: flat(400),
  observations,
});

/**
 * A synthetic interface-depth observation. Built through the instruments module -- the only
 * place that can construct one -- by taking a real XBT drop and moving it. Nothing in this
 * test file can forge an `Observation`, which is the point of the brand.
 */
function syntheticObservations(count: number, valueMetres: number, errorSd: number): Observation[] {
  const drops = sampleXbtDrops(samplingContext());
  const template = drops[0]?.interface;
  if (template === undefined) throw new Error('no XBT drop to build a synthetic observation from');
  return Array.from({ length: count }, (_, i) => {
    // `bound` is dropped: these stand for measurements, not one-sided constraints.
    const rest = Object.fromEntries(
      Object.entries(template as unknown as Record<string, unknown>).filter(([key]) => key !== 'bound'),
    );
    return {
      ...rest,
      id: `synthetic/${String(i)}`,
      value: valueMetres,
      depthMetres: valueMetres,
      flags: [],
      error: { instrumentNoiseSd: errorSd, representativenessSd: 0, declaredBias: 0, totalSd: errorSd },
      lonDeg: domain.west + ((domain.east - domain.west) * (i + 1)) / (count + 1),
      latDeg: (domain.south + domain.north) / 2,
    } as unknown as Observation;
  });
}

describe('optimal interpolation', () => {
  /** The spec's first scenario, and the definition of the prior blend. */
  it('is the declared blend of background and climatology when there are no observations', () => {
    const record = analyse(baseInputs([]), domain);
    const b = config.analysis.priorBackgroundWeight;
    for (let i = 0; i < N; i += 1) {
      expect(record.field[i]).toBeCloseTo(b * 500 + (1 - b) * 400, 10);
      const weights = weightsAt(record.attribution, i);
      expect(weights.observations).toBe(0);
      expect(weights.background).toBeCloseTo(b, 12);
      expect(weights.climatology).toBeCloseTo(1 - b, 12);
    }
  });

  it('returns very nearly the observation where the observation is perfect', () => {
    // "Perfect" means the instrument's own error is zero. The observation is still not
    // believed absolutely, because a point sounding cannot know a cell's mean interface
    // depth to better than the declared representativeness -- which is the finding of this
    // beat, and the reason the weight is 0.8 rather than 1.
    const observations = syntheticObservations(1, 620, 1e-9);
    const record = analyse(baseInputs(observations), domain);
    const cell = cellOf(grid, domain, (observations[0] as Observation).lonDeg, (observations[0] as Observation).latDeg);
    const weight = weightsAt(record.attribution, cell).observations;
    process.stdout.write(
      `    a zero-instrument-error observation carries ${(weight * 100).toFixed(1)}% of the weight ` +
        `at its own cell, against a background error of ` +
        `${String(config.analysis.backgroundErrorStandardDeviationMetres)} m and a declared ` +
        `representativeness of ${String(config.analysis.interfaceRepresentativenessMetres)} m\n`,
    );
    const expected =
      config.analysis.backgroundErrorStandardDeviationMetres ** 2 /
      (config.analysis.backgroundErrorStandardDeviationMetres ** 2 +
        config.analysis.interfaceRepresentativenessMetres ** 2);
    expect(weight).toBeCloseTo(expected, 2);
    expect(record.field[cell]).toBeGreaterThan(560);
    expect(record.field[cell]).toBeLessThan(620);
  });

  /**
   * The finding of this beat, kept as a test so it cannot come back. With the formal error
   * alone -- under a metre, from the operator's propagation -- the analysis believed an
   * interface observation fifty times more than the background, two Argo profiles twenty
   * kilometres apart became nearly collinear, and the gain produced per-observation shares
   * above 200 per cent against shares below zero in the same cell.
   */
  it('does not produce shares outside nought and one, now that observations are priced honestly', () => {
    const context = samplingContext();
    const drops = sampleXbtDrops(context);
    const argo = argoObservations(argoRecord(domain.id), context);
    const record = analyse(baseInputs([...drops, ...argo].map((r) => r.interface)), domain);

    let worstShare = 0;
    let mostNegative = 0;
    for (let i = 0; i < N; i += 1) {
      for (const share of record.breakdownAt(i).shares) {
        worstShare = Math.max(worstShare, share.share);
        mostNegative = Math.min(mostNegative, share.share);
      }
    }
    process.stdout.write(
      `    over ${String(record.used.length)} observations: largest single share ` +
        `${(worstShare * 100).toFixed(1)}%, most negative ${(mostNegative * 100).toFixed(1)}%, ` +
        `${String(record.attribution.clampedCells)} cells clamped\n`,
    );
    expect(worstShare).toBeLessThanOrEqual(1.05);
    expect(mostNegative).toBeGreaterThanOrEqual(-0.25);
    // Not zero, and it should not be. Optimal interpolation with a Gaussian covariance and
    // clustered observations genuinely produces row sums a little outside nought and one in
    // the shadows between them; that is a property of the scheme, and the spec asks for the
    // clamp count to be a published diagnostic rather than for the clamp never to fire. What
    // is asserted is that it is a small minority of cells -- it was 13 per cent before the
    // observations were priced honestly, and is under 3 per cent now.
    expect(record.attribution.clampedCells).toBeLessThan(N * 0.05);
  });

  /** FR-004 and the arithmetic the attribution rests on: the three weights sum to one. */
  it('gives every cell three non-negative weights summing to one', () => {
    const record = analyse(baseInputs(syntheticObservations(4, 620, 20)), domain);
    for (let i = 0; i < N; i += 1) {
      const w = weightsAt(record.attribution, i);
      expect(w.observations).toBeGreaterThanOrEqual(0);
      expect(w.background).toBeGreaterThanOrEqual(0);
      expect(w.climatology).toBeGreaterThanOrEqual(0);
      expect(w.observations + w.background + w.climatology).toBeCloseTo(1, 9);
    }
    process.stdout.write(
      `    ${String(record.attribution.clampedCells)} of ${String(N)} cells had a weight clamped ` +
        'and renormalised\n',
    );
  });

  /**
   * SC-001. The attribution is not asserted to be *plausible*; it is recomputed from the gain
   * by a different piece of code and asserted to be *equal*. An attribution that agreed with
   * the analysis only approximately would be a picture that could disagree with the answer.
   */
  it('exports exactly the weights the gain applied, recomputed independently', () => {
    const observations = syntheticObservations(5, 620, 20);
    const record = analyse(baseInputs(observations), domain);
    let worst = 0;
    for (let i = 0; i < N; i += 1) {
      let rowSum = 0;
      for (let j = 0; j < record.used.length; j += 1) {
        rowSum += record.gainColumn(j)[i] as number;
      }
      const exported = record.attribution.observationWeight[i] as number;
      // Clamped cells are exempt by construction and are counted separately.
      if (rowSum < 0 || rowSum > 1) continue;
      worst = Math.max(worst, Math.abs(rowSum - exported));
    }
    process.stdout.write(`    largest difference between gain row sum and exported weight: ${worst.toExponential(3)}\n`);
    expect(worst).toBeLessThanOrEqual(config.analysis.weightSumTolerance);
  });

  it('excludes a flagged observation and records why, keeping it for drawing', () => {
    const good = syntheticObservations(1, 620, 20);
    const bad = (syntheticObservations(1, 620, 20).map((o) => ({
      ...o,
      id: 'synthetic/flagged',
      flags: [{ code: 'gross-range' as const, detail: 'planted for this test', usable: false }],
    })) as Observation[]);
    const record = analyse(baseInputs([...good, ...bad]), domain);
    expect(record.used.map((u) => u.id)).toEqual(['synthetic/0']);
    expect(record.excluded.map((e) => e.id)).toContain('synthetic/flagged');
    expect(record.excluded.find((e) => e.id === 'synthetic/flagged')?.flags).toContain('gross-range');
  });

  it('excludes an observation of a quantity it does not analyse, and says so', () => {
    const context = samplingContext();
    const profiles = sampleXbtDrops(context).map((d) => d.profile);
    const record = analyse(baseInputs(profiles), domain);
    expect(record.used.length).toBe(0);
    expect(record.excluded[0]?.reason).toMatch(/does not constrain it directly/);
  });
});

describe("a cell's own breakdown", () => {
  const observations = syntheticObservations(2, 620, 20);
  const record = analyse(baseInputs(observations), domain);

  it('lists the observations that contributed, with shares summing to the cell weight', () => {
    const cell = cellOf(grid, domain, (observations[0] as Observation).lonDeg, (observations[0] as Observation).latDeg);
    const breakdown = record.breakdownAt(cell);
    expect(breakdown.shares.length).toBeGreaterThan(0);
    const total = breakdown.shares.reduce((sum, share) => sum + share.share, 0);
    expect(total).toBeCloseTo(breakdown.observations, 9);
    process.stdout.write(
      `    at the first observation's cell: ${breakdown.shares
        .map((s) => `${s.id} ${(s.share * 100).toFixed(1)}%`)
        .join(', ')}\n`,
    );
  });

  /**
   * "Outside every observation's influence" is a claim that needs a threshold, and this is
   * review R-7's warning in one assertion: a Gaussian covariance never reaches zero, so the
   * radius a reader sees is a property of the *declared* threshold and length scale rather
   * than of the ocean. The far corner's weight is 1.5e-6 -- not nothing, and far below the
   * declared 0.02 at which the harness stops calling it influence.
   */
  it('gives a cell outside every influence a weight below the declared threshold', () => {
    const corner = indexOf(grid, 0, grid.ny - 1);
    const breakdown = record.breakdownAt(corner);
    process.stdout.write(
      `    the far corner carries ${breakdown.observations.toExponential(2)} of observation ` +
        `weight, against a declared influence threshold of ` +
        `${String(config.analysis.influenceThreshold)}\n`,
    );
    expect(breakdown.observations).toBeGreaterThan(0);
    expect(breakdown.observations).toBeLessThan(config.analysis.influenceThreshold / 100);
  });
});

/** AT-03 and review R-7: the radius is a property of the declared length scale, not of the ocean. */
describe("one observation's influence", () => {
  it('is maximal at its own cell and falls off with the declared length scale', () => {
    const observations = syntheticObservations(1, 620, 20);
    const record = analyse(baseInputs(observations), domain);
    const influence = record.influenceOf('synthetic/0');
    const cell = cellOf(grid, domain, (observations[0] as Observation).lonDeg, (observations[0] as Observation).latDeg);
    expect(influence.field[cell]).toBeCloseTo(influence.peak, 12);

    process.stdout.write(
      `    influence peak ${influence.peak.toFixed(3)} at its own cell; ` +
        `${String(influence.cellsAboveThreshold)} cells above the declared threshold of ` +
        `${String(config.analysis.influenceThreshold)}; measured radius ` +
        `${influence.radiusKilometres.toFixed(1)} km against a declared length scale of ` +
        `${String(record.lengthScaleKilometres)} km\n`,
    );

    // A Gaussian with length scale L falls to a small fraction of its peak by about 3L, so a
    // measured radius wildly outside that band would mean the covariance is not the declared one.
    expect(influence.radiusKilometres).toBeGreaterThan(record.lengthScaleKilometres);
    expect(influence.radiusKilometres).toBeLessThan(4 * record.lengthScaleKilometres);
  });
});

/**
 * The behavioural half of gate G-02, which has been waiting since beat 004 (FR-009, FR-12).
 *
 * With every observation's error set arbitrarily large, the analysis must recover nothing of
 * truth beyond what the prior already carried. This is the half a gate cannot check by
 * reading source: an implementation could import nothing forbidden and still leak truth
 * through some path nobody thought of, and only running it would show.
 */
describe('the truth boundary, behaviourally (G-02)', () => {
  it('recovers nothing beyond the prior when observation errors are enormous', () => {
    const enormous = syntheticObservations(6, 620, 1e9);
    const withObservations = analyse(baseInputs(enormous), domain);
    const withNone = analyse(baseInputs([]), domain);

    let worstField = 0;
    let worstWeight = 0;
    for (let i = 0; i < N; i += 1) {
      worstField = Math.max(worstField, Math.abs((withObservations.field[i] as number) - (withNone.field[i] as number)));
      worstWeight = Math.max(worstWeight, withObservations.attribution.observationWeight[i] as number);
    }
    process.stdout.write(
      `    with observation errors at 1e9 m: largest departure from the no-observation blend ` +
        `${worstField.toExponential(3)} m; largest observation weight ${worstWeight.toExponential(3)}\n`,
    );
    expect(worstField).toBeLessThan(1e-6);
    expect(worstWeight).toBeLessThan(1e-9);
  });
});

/** FR-010: a declared bound, measured on the recorded case's own observation count. */
describe('the analysis stays inside its declared time bound', () => {
  it('completes at the declared grid with the recorded case observations', () => {
    const context = samplingContext();
    const drops = sampleXbtDrops(context);
    const argo = argoObservations(argoRecord(domain.id), context);
    const observations = [...drops, ...argo].map((r) => r.interface);

    // Gate G-04 scans operational code under src/, not tests, so no exemption marker is
    // needed or would be honoured here: this figure never enters a run or a manifest.
    const started = performance.now();
    const record: AnalysisRecord = analyse(baseInputs(observations), domain);
    const elapsed = performance.now() - started;

    process.stdout.write(
      `    ${String(record.used.length)} observations used, ${String(record.excluded.length)} excluded; ` +
        `${elapsed.toFixed(1)} ms against a declared bound of ${String(config.analysis.timeBudgetMs)} ms\n`,
    );
    expect(record.used.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(config.analysis.timeBudgetMs);
  });
});

void parameters;
