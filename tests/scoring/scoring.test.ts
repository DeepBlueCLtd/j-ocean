import { describe, expect, it } from 'vitest';
import { interfaceFieldFromTruth } from '../../src/instruments/interface-field.js';
import { runForecast, type ForecastResult } from '../../src/run/forecast.js';
import { figuresOf } from '../../src/scoring/figure.js';
import {
  discRegion,
  domainRegion,
  score,
  ScoringRefusal,
  type Region,
  type Score,
} from '../../src/scoring/scorer.js';
import { climatologyContainer, observations as argoRecord, truthSource } from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();
const found = config.domains.list.find((d) => d.id === config.domains.defaultId);
if (found === undefined) throw new Error('no default domain');
const domain = found;

const truth = truthSource(domain.id);
const issueInstantMs =
  Date.parse(config.truth.period.start) + config.forecast.spinUpHours * 3_600_000;

const result: ForecastResult = runForecast({
  config,
  domain,
  truth,
  climatology: climatologyContainer(domain.id),
  argo: argoRecord(domain.id),
  issueInstantMs,
});
const region = domainRegion(config, result.parameters.grid.nx, result.parameters.grid.ny);

const truthAt = (instantMs: number): Float64Array =>
  interfaceFieldFromTruth(
    truth,
    result.parameters.thermalStructure,
    result.box,
    result.parameters.grid,
    instantMs,
  );

const scoreAt = (leadHours: number, overrides: Partial<Parameters<typeof score>[0]> = {}): Score => {
  const validInstantMs = issueInstantMs + leadHours * 3_600_000;
  return score({
    config,
    domain,
    truth,
    forecast: result.byHorizon.get(leadHours) as Float64Array,
    initial: result.initial,
    climatology: result.climatologyField,
    truthAtValidInstant: truthAt(validInstantMs),
    region,
    fromInstantMs: issueInstantMs,
    validInstantMs,
    externalObservationIds: result.externalObservationIds,
    ...overrides,
  });
};

/** The identities of SC-001. A scorer that got these wrong could not be trusted with anything. */
describe('the skill convention', () => {
  const validInstantMs = issueInstantMs + 24 * 3_600_000;
  const base = {
    config,
    domain,
    truth,
    climatology: result.climatologyField,
    truthAtValidInstant: truthAt(validInstantMs),
    region,
    fromInstantMs: issueInstantMs,
    validInstantMs,
    externalObservationIds: [] as readonly string[],
  };

  it('scores zero against persistence when the forecast is the initial field held', () => {
    const held = score({ ...base, forecast: result.initial, initial: result.initial });
    expect(held.skillAgainstPersistence?.value).toBeCloseTo(0, 12);
    expect(held.statement).toMatch(/better than persistence by 0\.0 per cent/);
  });

  it('scores one against both references when the forecast is the truth', () => {
    const perfect = score({ ...base, forecast: base.truthAtValidInstant, initial: result.initial });
    expect(perfect.skillAgainstPersistence?.value).toBeCloseTo(1, 9);
    expect(perfect.skillAgainstClimatology?.value).toBeCloseTo(1, 9);
    expect(perfect.forecastError.value).toBeCloseTo(0, 9);
  });

  /** FR-021, in the SRD's own words. This is Principle VI made testable. */
  it('says "worse than persistence" in those words when it is', () => {
    const noise = new Float64Array(result.initial.length);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (result.initial[i] as number) + 400 * Math.sin(i);
    const bad = score({ ...base, forecast: noise, initial: result.initial });
    expect(bad.skillAgainstPersistence?.value).toBeLessThan(0);
    expect(bad.statement).toContain('worse than persistence');
  });

  it('says the reference is perfect rather than dividing by zero', () => {
    const perfectReference = score({
      ...base,
      forecast: result.initial,
      initial: base.truthAtValidInstant,
    });
    expect(perfectReference.skillAgainstPersistence).toBeNull();
    expect(perfectReference.statement).toContain('persistence is perfect here');
  });
});

describe('every score carries its provenance', () => {
  const s = scoreAt(24);

  it('names the reference, the region, the window, the metric and the floor', () => {
    const p = s.provenance;
    expect(p.reference).toMatch(/persistence.*climatology/);
    expect(p.regionLabel).toMatch(/sponge margin/);
    expect(p.marginCells.value).toBe(config.model.sponge.widthCells);
    expect(p.fromInstant).toBe(new Date(issueInstantMs).toISOString());
    expect(p.validInstant).toBe(new Date(issueInstantMs + 24 * 3_600_000).toISOString());
    expect(p.metric).toMatch(/root-mean-square/);
    expect(p.resolutionFloorDegrees.value).toBe(domain.nativeResolutionDegrees);
    expect(p.truthSource).toContain(domain.id);
  });

  /** ADR-0007 and review R-3: the caveat travels with the figure. */
  it('carries the independence caveat when the analysis assimilated Argo', () => {
    expect(result.externalObservationIds.length).toBeGreaterThan(0);
    expect(s.provenance.independenceCaveat).toMatch(/not independent evidence/);
    expect(s.provenance.externalObservationIds.length).toBe(result.externalObservationIds.length);
  });

  it('carries no caveat when nothing external was assimilated', () => {
    expect(scoreAt(24, { externalObservationIds: [] }).provenance.independenceCaveat).toBeNull();
  });

  /** NFR-05: every number is a Figure with a kind, and the kind survives serialisation. */
  it('types every figure it emits, and the kinds survive JSON', () => {
    const figures = figuresOf(s);
    expect(figures.length).toBeGreaterThan(8);
    for (const figure of figures) {
      expect(['declared', 'computed', 'derived']).toContain(figure.kind);
    }
    const roundTripped = figuresOf(JSON.parse(JSON.stringify(s)));
    expect(roundTripped.map((f) => f.kind)).toEqual(figures.map((f) => f.kind));
  });

  it('publishes the offsets it removed rather than hiding them', () => {
    process.stdout.write(
      `    means removed: forecast ${s.meanOffsets.forecast.value.toFixed(1)} m, truth ` +
        `${s.meanOffsets.truth.value.toFixed(1)} m, climatology ` +
        `${s.meanOffsets.climatology.value.toFixed(1)} m\n`,
    );
    expect(Number.isFinite(s.meanOffsets.forecast.value)).toBe(true);
    expect(s.provenance.metric).toMatch(/means removed are published/);
  });
});

describe('the scorer refuses rather than pretending', () => {
  /** Review R-2: the floor is the truth artefact's own resolution, carried from beat 002. */
  it('refuses a region finer than the truth records own resolution', () => {
    expect(() =>
      discRegion(config, domain, result.parameters.grid.nx, result.parameters.grid.ny, -72, 36, 1),
    ).toThrow(ScoringRefusal);
    try {
      discRegion(config, domain, result.parameters.grid.nx, result.parameters.grid.ny, -72, 36, 1);
    } catch (error) {
      expect((error as Error).message).toMatch(/finer than the truth record's own resolution/);
      expect((error as Error).message).toMatch(/scoring interpolation, not the ocean/);
    }
  });

  /** FR-027's validity statement rests on this refusal. */
  it('refuses a valid instant outside the truth record', () => {
    expect(() => scoreAt(24, { validInstantMs: Date.parse('2020-01-01T00:00:00Z') })).toThrow(
      /outside the truth record/,
    );
  });

  it('refuses a region with nothing left in it', () => {
    const empty: Region = { label: 'nothing', mask: new Uint8Array(region.mask.length), cellCount: 0 };
    expect(() => scoreAt(24, { region: empty })).toThrow(/nothing to score/);
  });
});

/** AT-03's scoring half: skill inside a disc and outside it, each with its own provenance. */
describe('local skill', () => {
  it('scores inside and outside a region, and both name the region', () => {
    const drop = config.instruments.drops[2];
    if (drop === undefined) throw new Error('no drop to centre a region on');
    const inside = discRegion(config, domain, result.parameters.grid.nx, result.parameters.grid.ny, drop.lonDeg, drop.latDeg, 120);
    const outside = discRegion(config, domain, result.parameters.grid.nx, result.parameters.grid.ny, drop.lonDeg, drop.latDeg, 120, true);

    const within = scoreAt(24, { region: inside });
    const beyond = scoreAt(24, { region: outside });

    expect(within.provenance.regionLabel).toMatch(/within 120 km/);
    expect(beyond.provenance.regionLabel).toMatch(/outside 120 km/);
    expect(inside.cellCount + outside.cellCount).toBe(region.cellCount);

    process.stdout.write(
      `    within 120 km of the third drop: skill against persistence ` +
        `${(within.skillAgainstPersistence?.value ?? Number.NaN).toFixed(3)} over ` +
        `${String(within.provenance.cellsScored.value)} cells; outside it ` +
        `${(beyond.skillAgainstPersistence?.value ?? Number.NaN).toFixed(3)} over ` +
        `${String(beyond.provenance.cellsScored.value)} cells\n`,
    );
  });
});
