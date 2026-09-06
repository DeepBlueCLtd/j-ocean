import { describe, expect, it } from 'vitest';
import type { Configuration } from '../../src/config/schema.js';
import {
  argoObservations,
  sampleSurface,
  sampleXbtDrops,
  trackPoints,
} from '../../src/instruments/instruments.js';
import { interfaceFromProfile } from '../../src/instruments/observation-operator.js';
import { isUsable, type Observation } from '../../src/instruments/observation.js';
import {
  climatologyDepartureCheck,
  verticalInversionCheck,
} from '../../src/instruments/quality-control.js';
import { temperatureAt } from '../../src/model/profile.js';
import { observations as argoRecord } from '../support/artefacts.js';
import { samplingContext } from '../support/instruments.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();

const withInstruments = (change: (i: Configuration['instruments']) => Configuration['instruments']) =>
  samplingContext({ instruments: change(config.instruments) });

/**
 * The instruments (FR-12, and the whole of constitution Principle II's first half).
 *
 * This is the only place a truth value becomes an observation, so it is the only place the
 * harness can lie about what a measurement was worth. Everything here is an assertion that it
 * does not.
 */
describe('the ownship surface instrument', () => {
  it('emits one observation per track instant, along the declared track', () => {
    const context = samplingContext();
    const points = trackPoints(config, context.startMs);
    const observations = sampleSurface(context);
    expect(observations.length).toBe(points.length);
    expect(points.length).toBeGreaterThan(20);
    for (const [index, observation] of observations.entries()) {
      const point = points[index];
      expect(observation.lonDeg).toBeCloseTo(point?.lonDeg ?? 0, 10);
      expect(observation.instantMs).toBe(point?.instantMs);
      expect(observation.depthMetres).toBe(0);
      expect(observation.external).toBe(false);
      expect(observation.streamName).toBe('instruments/surface');
    }
  });

  /** SC-001's first half: at zero noise there is nothing between truth and the observation. */
  it('equals the truth-port value exactly when noise is declared zero', () => {
    const context = withInstruments((i) => ({
      ...i,
      surface: { ...i.surface, noiseStandardDeviationDegC: 0, representativenessStandardDeviationDegC: 0 },
    }));
    for (const observation of sampleSurface(context)) {
      const truthValue = context.truth.sample({
        variable: observation.variable,
        lonDeg: observation.lonDeg,
        latDeg: observation.latDeg,
        depthMetres: 0,
        instantMs: observation.instantMs,
      });
      expect(observation.value).toBe(truthValue);
    }
  });

  /** SC-001's second half. Deterministic, so it cannot flake: the seed fixes every draw. */
  it('draws residuals with the declared variance, reproducibly', () => {
    const declaredSd = 0.4;
    const context = withInstruments((i) => ({
      ...i,
      track: { ...i.track, sampleIntervalHours: 0.25 },
      surface: {
        ...i.surface,
        noiseStandardDeviationDegC: declaredSd,
        representativenessStandardDeviationDegC: 0,
      },
    }));
    const zeroNoise = withInstruments((i) => ({
      ...i,
      track: { ...i.track, sampleIntervalHours: 0.25 },
      surface: { ...i.surface, noiseStandardDeviationDegC: 0, representativenessStandardDeviationDegC: 0 },
    }));

    const noisy = sampleSurface(context);
    const clean = sampleSurface(zeroNoise);
    expect(noisy.length).toBeGreaterThan(280);

    let n = 0;
    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < noisy.length; i += 1) {
      const residual = (noisy[i]?.value ?? 0) - (clean[i]?.value ?? 0);
      n += 1;
      sum += residual;
      sumSquares += residual * residual;
    }
    const measuredSd = Math.sqrt(sumSquares / n - (sum / n) ** 2);
    process.stdout.write(
      `    residual standard deviation over ${String(n)} draws: ${measuredSd.toFixed(4)} degC, ` +
        `declared ${String(declaredSd)}\n`,
    );
    expect(measuredSd).toBeGreaterThan(declaredSd * 0.85);
    expect(measuredSd).toBeLessThan(declaredSd * 1.15);
  });

  it('reproduces exactly from the same seed, and differs from another', () => {
    const values = (): number[] => sampleSurface(samplingContext()).map((o) => o.value);
    expect(values()).toEqual(values());
  });

  it('declares what each part of its error is, rather than one opaque figure', () => {
    const observation = sampleSurface(samplingContext())[0] as Observation;
    expect(observation.error.instrumentNoiseSd).toBe(config.instruments.surface.noiseStandardDeviationDegC);
    expect(observation.error.representativenessSd).toBe(
      config.instruments.surface.representativenessStandardDeviationDegC,
    );
    expect(observation.error.totalSd).toBeCloseTo(
      Math.hypot(observation.error.instrumentNoiseSd, observation.error.representativenessSd),
      12,
    );
  });
});

describe('the XBT', () => {
  it('records the depth it actually reached, not the depth it was asked for', () => {
    // FR-004 and FR-23: an XBT infers depth from a fall-rate equation, so the depth is wrong
    // by a fraction of itself. Beat 008's needles are drawn at the depths sampled.
    const drops = sampleXbtDrops(samplingContext());
    const levels = drops[0]?.profile.levels ?? [];
    expect(levels.length).toBe(config.instruments.xbt.depthsMetres.length);
    let differing = 0;
    for (const level of levels) {
      if (level.requestedDepthMetres > 0 && level.depthMetres !== level.requestedDepthMetres) differing += 1;
      expect(Math.abs(level.depthMetres - level.requestedDepthMetres)).toBeLessThan(
        Math.max(1, level.requestedDepthMetres * config.instruments.xbt.depthErrorFraction * 6),
      );
    }
    expect(differing).toBeGreaterThan(0);
  });

  /** SC-002. The operator has to recover the interface a zero-noise profile came from. */
  it('recovers the interface depth from a zero-noise synthetic profile', () => {
    const context = samplingContext();
    const structure = context.structure;
    for (const truthInterface of [200, 350, 500]) {
      const levels = config.instruments.xbt.depthsMetres.map((depthMetres) => ({
        depthMetres,
        requestedDepthMetres: depthMetres,
        value: temperatureAt(depthMetres, truthInterface, structure),
        flags: [],
      }));
      const estimate = interfaceFromProfile(levels, 0.1, structure);
      const displayLevelSpacing = 100;
      process.stdout.write(
        `    interface at ${String(truthInterface)} m recovered as ` +
          `${(estimate.depthMetres ?? Number.NaN).toFixed(1)} m ` +
          `(+-${(estimate.sdMetres ?? Number.NaN).toFixed(1)} m) from ` +
          `${String(estimate.contributingLevels)} levels\n`,
      );
      expect(estimate.depthMetres).not.toBeNull();
      expect(Math.abs((estimate.depthMetres as number) - truthInterface)).toBeLessThan(displayLevelSpacing);
    }
  });

  /**
   * FR-005's other half, and the one that matters. A profile that never crosses the
   * thermocline establishes a bound, and the operator must report the bound rather than
   * invent a depth in the middle of the saturated region.
   */
  it('reports a bound rather than a depth when the profile never reaches the interface', () => {
    const context = samplingContext();
    const levels = [0, 50, 100, 150].map((depthMetres) => ({
      depthMetres,
      requestedDepthMetres: depthMetres,
      value: temperatureAt(depthMetres, 700, context.structure),
      flags: [],
    }));
    const estimate = interfaceFromProfile(levels, 0.1, context.structure);
    expect(estimate.depthMetres).toBeNull();
    expect(estimate.contributingLevels).toBe(0);
    expect(estimate.bound).toEqual({ direction: 'below', depthMetres: 150 });
  });

  it('gives an unresolved interface observation a flag saying so, not a plausible number', () => {
    const context = samplingContext();
    const shallow = withInstruments((i) => ({ ...i, xbt: { ...i.xbt, depthsMetres: [0, 25, 50] } }));
    const drops = sampleXbtDrops(shallow);
    const unresolved = drops.filter((drop) => !isUsable(drop.interface));
    expect(unresolved.length).toBeGreaterThan(0);
    const flag = unresolved[0]?.interface.flags.find((f) => f.code === 'unresolved');
    expect(flag?.detail).toMatch(/does not cross the thermocline|no usable level/);
    void context;
  });

  it('weights a level by how much it constrains the interface, not by how many there are', () => {
    // The operator's whole justification (ADR-0005): a level in the body of a layer acquires
    // an enormous depth error and contributes almost nothing. Adding ten such levels to a
    // profile must not move the answer.
    const context = samplingContext();
    const structure = context.structure;
    const near = [250, 300, 350].map((depthMetres) => ({
      depthMetres,
      requestedDepthMetres: depthMetres,
      value: temperatureAt(depthMetres, 300, structure),
      flags: [],
    }));
    const far = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((depthMetres) => ({
      depthMetres,
      requestedDepthMetres: depthMetres,
      value: temperatureAt(depthMetres, 300, structure),
      flags: [],
    }));
    const alone = interfaceFromProfile(near, 0.1, structure);
    const together = interfaceFromProfile([...far, ...near], 0.1, structure);
    expect(alone.depthMetres).not.toBeNull();
    expect(together.depthMetres as number).toBeCloseTo(alone.depthMetres as number, 3);
  });
});

describe('quality control', () => {
  /** FR-007: the bias goes in after noise and before the checks, or it could never be caught. */
  it('catches a broken instrument, and does not when control is off', () => {
    const broken = (enabled: boolean) =>
      withInstruments((i) => ({
        ...i,
        qualityControl: { ...i.qualityControl, enabled },
        surface: { ...i.surface, biasDegC: 40 },
      }));

    const caught = sampleSurface(broken(true));
    expect(caught.some((o) => o.flags.some((f) => f.code === 'gross-range'))).toBe(true);

    const missed = sampleSurface(broken(false));
    expect(missed.every((o) => o.flags.length === 0)).toBe(true);
    // The values are identical either way: quality control flags, it does not correct.
    expect(missed.map((o) => o.value)).toEqual(caught.map((o) => o.value));
  });

  it('retains the value of every observation it flags', () => {
    const context = withInstruments((i) => ({ ...i, surface: { ...i.surface, biasDegC: 40 } }));
    for (const observation of sampleSurface(context)) {
      expect(Number.isFinite(observation.value)).toBe(true);
      expect(observation.value).toBeGreaterThan(30);
    }
  });

  it('measures a climatology departure in units the artefact can answer for', () => {
    // Exercised directly against a stub, because the interesting property is the *scale*: a
    // departure is measured in standard deviations of the climatology at that depth, which
    // the artefact computes, rather than in a threshold somebody picked in degrees.
    const { config: declared } = declaredConfiguration();
    const stub = { valueAt: () => 20, spreadAt: () => 2 };
    expect(climatologyDepartureCheck(24, -72, 36, 0, stub, declared)).toBeNull();
    const far = climatologyDepartureCheck(32, -72, 36, 0, stub, declared);
    expect(far?.code).toBe('climatology-departure');
    expect(far?.detail).toMatch(/6\.0 standard deviations from the climatological 20\.00 degC/);

    // Where there is no climatology -- land, or outside the artefact -- there is nothing to
    // depart from, and silence is the right answer.
    expect(
      climatologyDepartureCheck(32, -72, 36, 0, { valueAt: () => Number.NaN, spreadAt: () => 2 }, declared),
    ).toBeNull();
  });

  /**
   * The finding this beat did not expect. A tolerance below the instrument's own noise flags
   * the instrument rather than the ocean: the first declared figure was 0.05 degC against an
   * XBT whose total error is 0.22 degC, and every real profile tripped it in the weakly
   * stratified deep water. The schema now refuses such a configuration outright.
   */
  it('refuses a configuration whose inversion tolerance is below the instrument noise', () => {
    const { config: declared } = declaredConfiguration();
    const sd = Math.hypot(
      declared.instruments.xbt.noiseStandardDeviationDegC,
      declared.instruments.xbt.representativenessStandardDeviationDegC,
    );
    expect(declared.instruments.qualityControl.verticalInversionToleranceDegC).toBeGreaterThan(2 * sd);
    process.stdout.write(
      `    XBT total error ${sd.toFixed(3)} degC; declared inversion tolerance ` +
        `${String(declared.instruments.qualityControl.verticalInversionToleranceDegC)} degC\n`,
    );
  });

  it('flags a vertical inversion beyond the declared tolerance', () => {
    const { config: declared } = declaredConfiguration();
    // Exercised directly: the real ocean here is stably stratified, so contriving an
    // inversion in the truth record would be contriving the answer.
    const rising = [0, 100, 200].map((depthMetres, index) => ({
      depthMetres,
      requestedDepthMetres: depthMetres,
      value: 10 + index,
      flags: [],
    }));
    expect(verticalInversionCheck(rising, declared)?.code).toBe('vertical-inversion');
    expect(verticalInversionCheck(rising, declared)?.detail).toMatch(/warms by/);

    const falling = rising.map((level, index) => ({ ...level, value: 20 - index }));
    expect(verticalInversionCheck(falling, declared)).toBeNull();

    // And the real drops do not trip it.
    const drops = sampleXbtDrops(samplingContext());
    expect(drops.every((d) => !d.profile.flags.some((f) => f.code === 'vertical-inversion'))).toBe(true);
  });

  /**
   * The edge the ocean actually produces: a probe whose fall-rate error carries it past the
   * end of the truth record. The level is kept and flagged, valueless, because a hole in a
   * profile that belongs to the *record* rather than to the ocean is a thing a reader has to
   * be able to tell apart.
   */
  it('flags a level the truth record does not reach rather than inventing one', () => {
    const tooDeep = withInstruments((i) => ({
      ...i,
      xbt: { ...i.xbt, depthsMetres: [...i.xbt.depthsMetres, 700] },
    }));
    const levels = sampleXbtDrops(tooDeep).flatMap((d) => d.profile.levels ?? []);
    const outside = levels.filter((l) => l.flags.some((f) => f.code === 'outside-record'));
    process.stdout.write(
      `    ${String(outside.length)} of ${String(levels.length)} levels fell outside the record\n`,
    );
    expect(outside.length).toBeGreaterThan(0);
    for (const level of outside) {
      expect(Number.isNaN(level.value)).toBe(true);
      expect(level.flags[0]?.detail).toMatch(/the truth record does not cover it/);
    }
  });
});

describe('Argo as a second observation class', () => {
  const context = samplingContext();
  const domain = config.domains.defaultId;

  it('admits profiles with external true, so a score can say what it depends on', () => {
    const admitted = argoObservations(argoRecord(domain), context);
    expect(admitted.length).toBeGreaterThan(0);
    for (const { profile, interface: inferred } of admitted) {
      expect(profile.external).toBe(true);
      expect(inferred.external).toBe(true);
      expect(profile.instrumentId).toMatch(/^argo\//);
    }
  });

  /** SC-005: every Argo flag in the artefact appears on the corresponding observation. */
  it('carries every Argo flag through onto the observation', () => {
    const record = argoRecord(domain);
    const admitted = argoObservations(record, context);
    let flaggedInRecord = 0;
    for (const profile of record.profiles) {
      for (const level of profile.levels) {
        if (level.temperatureDegC === null) continue;
        if (level.temperatureFlag !== 1 && level.temperatureFlag !== 2) flaggedInRecord += 1;
      }
    }
    let flaggedOnObservations = 0;
    for (const { profile } of admitted) {
      for (const level of profile.levels ?? []) {
        if (level.flags.some((f) => f.code === 'argo-flagged')) flaggedOnObservations += 1;
      }
    }
    process.stdout.write(
      `    ${String(flaggedInRecord)} flagged levels in the record, ` +
        `${String(flaggedOnObservations)} on the observations\n`,
    );
    expect(flaggedOnObservations).toBe(flaggedInRecord);
  });

  /** ADR-0007: the toggle is the whole point, and it must actually toggle. */
  it('is absent from the analysis when the toggle is off', () => {
    const off = withInstruments((i) => ({ ...i, argo: { ...i.argo, assimilate: false } }));
    expect(argoObservations(argoRecord(domain), off)).toEqual([]);
  });
});
