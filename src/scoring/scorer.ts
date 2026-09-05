import type { Configuration, Domain } from '../config/schema.js';
import type { TruthSource } from '../ports/truth-source.js';
import { computed, declared, type Figure } from './figure.js';

/**
 * Scoring (FR-20, FR-21, FR-22).
 *
 * A raw error figure means nothing on its own, so this module never returns one alone. Every
 * score carries the forecast's error, the same error for two references the harness builds
 * itself, and the two skill figures in the convention where **zero means no better than the
 * reference and negative means worse** -- and where negative, the statement says *worse than
 * persistence* in those words. The surface is not permitted to phrase that more kindly.
 *
 * It reads truth, which Principle II allows scoring to do after the fact, and it returns
 * figures, never fields, to anything in the model or analysis rings.
 */

export interface Region {
  readonly label: string;
  /** True where a cell counts. Already excludes the sponge margin. */
  readonly mask: Uint8Array;
  readonly cellCount: number;
}

export interface ScoreProvenance {
  readonly reference: string;
  readonly regionLabel: string;
  readonly marginCells: Figure;
  readonly cellsScored: Figure;
  readonly fromInstant: string;
  readonly validInstant: string;
  readonly metric: string;
  /** Review R-2: the truth's own resolution, below which this scorer refuses to resolve. */
  readonly resolutionFloorDegrees: Figure;
  readonly truthSource: string;
  /**
   * Review R-3 and ADR-0007. Non-null when the analysis assimilated an external observation
   * inside this window -- which the truth record itself assimilated, so the score is not
   * independent evidence. It says so, here, and the surface carries it.
   */
  readonly independenceCaveat: string | null;
  readonly externalObservationIds: readonly string[];
}

export interface Score {
  readonly forecastError: Figure;
  /**
   * The offsets removed before comparing, so nothing about them is hidden. A reduced-gravity
   * model determines departures from a mean and not the mean itself; these say where each
   * field's mean actually sat.
   */
  readonly meanOffsets: {
    readonly forecast: Figure;
    readonly truth: Figure;
    readonly climatology: Figure;
  };
  readonly persistenceError: Figure;
  readonly climatologyError: Figure;
  /** 1 - forecast/reference. Null where the reference is perfect and the ratio is undefined. */
  readonly skillAgainstPersistence: Figure | null;
  readonly skillAgainstClimatology: Figure | null;
  /** In the SRD's own words where the model is losing. The surface prints this verbatim. */
  readonly statement: string;
  readonly provenance: ScoreProvenance;
}

export class ScoringRefusal extends Error {
  override readonly name = 'ScoringRefusal';
}

/** The mean of a field over a region, ignoring cells it has no value for. */
export function regionMean(field: Float64Array, region: Region): number {
  let n = 0;
  let sum = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (region.mask[i] === 0) continue;
    const value = field[i] as number;
    if (!Number.isFinite(value)) continue;
    n += 1;
    sum += value;
  }
  return n === 0 ? Number.NaN : sum / n;
}

/**
 * Remove the region mean, and report what was removed.
 *
 * A reduced-gravity model has no absolute reference for its free surface: only departures
 * from the mean carry information, which is why the mean is removed at initialisation
 * (FR-013). Scoring has to use the same convention or it measures an offset that neither
 * field claims to determine -- and it did, at first, to the tune of a hundred metres of the
 * hundred and forty it was reporting.
 *
 * The offsets are not discarded. They are published as figures beside every score, because a
 * reader is entitled to know that the model's mean interface sits at 331 m while the truth's
 * diagnosed thermocline sits at 224 m, and to decide for themselves what that means.
 */
function withoutMean(field: Float64Array, region: Region): { anomaly: Float64Array; mean: number } {
  const mean = regionMean(field, region);
  const anomaly = new Float64Array(field.length);
  for (let i = 0; i < field.length; i += 1) anomaly[i] = (field[i] as number) - mean;
  return { anomaly, mean };
}

/** Root-mean-square difference over the region, ignoring cells either field has no value for. */
export function rootMeanSquare(a: Float64Array, b: Float64Array, region: Region): { rmse: number; n: number } {
  let n = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (region.mask[i] === 0) continue;
    const x = a[i] as number;
    const y = b[i] as number;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n += 1;
    sum += (x - y) * (x - y);
  }
  return { rmse: n === 0 ? Number.NaN : Math.sqrt(sum / n), n };
}

/** The whole domain minus the declared sponge margin (FR-012, and FR-004's "region"). */
export function domainRegion(config: Configuration, nx: number, ny: number): Region {
  const margin = config.model.sponge.widthCells;
  const mask = new Uint8Array(nx * ny);
  let count = 0;
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const inside = ix >= margin && iy >= margin && ix < nx - margin && iy < ny - margin;
      if (inside) {
        mask[iy * nx + ix] = 1;
        count += 1;
      }
    }
  }
  return { label: `the domain less its ${String(margin)}-cell sponge margin`, mask, cellCount: count };
}

/**
 * A disc, and its complement (AT-03, FR-006). Withholding one observation should degrade
 * skill in its neighbourhood and not elsewhere, and this is how that is measured.
 */
export function discRegion(
  config: Configuration,
  domain: Domain,
  nx: number,
  ny: number,
  centreLonDeg: number,
  centreLatDeg: number,
  radiusKilometres: number,
  complement = false,
): Region {
  const floorDegrees = domain.nativeResolutionDegrees;
  const radiusDegrees = radiusKilometres / 111.32;
  if (!complement && radiusDegrees < floorDegrees) {
    throw new ScoringRefusal(
      `a region of ${radiusKilometres.toFixed(1)} km is ${radiusDegrees.toFixed(4)} degrees across, ` +
        `finer than the truth record's own resolution of ${String(floorDegrees)} degrees. ` +
        'Scoring inside it would be scoring interpolation, not the ocean, so it is refused ' +
        '(review R-2).',
    );
  }

  const base = domainRegion(config, nx, ny);
  const mask = new Uint8Array(nx * ny);
  let count = 0;
  const kmPerLon = 111.32 * Math.cos(((domain.south + domain.north) / 2) * (Math.PI / 180));
  for (let iy = 0; iy < ny; iy += 1) {
    const latDeg = domain.south + ((domain.north - domain.south) * (iy + 0.5)) / ny;
    for (let ix = 0; ix < nx; ix += 1) {
      const index = iy * nx + ix;
      if (base.mask[index] === 0) continue;
      const lonDeg = domain.west + ((domain.east - domain.west) * (ix + 0.5)) / nx;
      const distance = Math.hypot((lonDeg - centreLonDeg) * kmPerLon, (latDeg - centreLatDeg) * 110.574);
      const inside = distance <= radiusKilometres;
      if (inside !== complement) {
        mask[index] = 1;
        count += 1;
      }
    }
  }
  return {
    label: complement
      ? `outside ${radiusKilometres.toFixed(0)} km of ${centreLatDeg.toFixed(2)}N ${Math.abs(centreLonDeg).toFixed(2)}W`
      : `within ${radiusKilometres.toFixed(0)} km of ${centreLatDeg.toFixed(2)}N ${Math.abs(centreLonDeg).toFixed(2)}W`,
    mask,
    cellCount: count,
  };
}

export interface ScoreInputs {
  readonly config: Configuration;
  readonly domain: Domain;
  readonly truth: TruthSource;
  /** The forecast, in the analysis's state variable. */
  readonly forecast: Float64Array;
  /** What the forecast started from. Held, this is the persistence reference. */
  readonly initial: Float64Array;
  readonly climatology: Float64Array;
  readonly truthAtValidInstant: Float64Array;
  readonly region: Region;
  readonly fromInstantMs: number;
  readonly validInstantMs: number;
  /** Ids of the external observations the analysis assimilated in this window (ADR-0007). */
  readonly externalObservationIds: readonly string[];
}

const METRE = 'm';

/** 1 - forecast/reference, or null where the reference is perfect and the ratio is undefined. */
function skill(forecastError: number, referenceError: number): number | null {
  if (!Number.isFinite(referenceError) || referenceError === 0) return null;
  return 1 - forecastError / referenceError;
}

export function score(inputs: ScoreInputs): Score {
  const { config, domain, region } = inputs;

  if (region.cellCount === 0) {
    throw new ScoringRefusal(
      `the region "${region.label}" has no cells left after the sponge margin is removed, so ` +
        'there is nothing to score',
    );
  }
  const coverage = inputs.truth.coverage();
  if (inputs.validInstantMs < coverage.fromMs || inputs.validInstantMs > coverage.toMs) {
    throw new ScoringRefusal(
      `the valid instant ${new Date(inputs.validInstantMs).toISOString()} is outside the truth ` +
        `record, which covers ${new Date(coverage.fromMs).toISOString()} to ` +
        `${new Date(coverage.toMs).toISOString()}. A forecast asked for an instant outside its ` +
        'validity says so rather than extrapolating silently.',
    );
  }

  // Every field is compared as an anomaly about its own regional mean. See `withoutMean`.
  const forecastField = withoutMean(inputs.forecast, region);
  const initialField = withoutMean(inputs.initial, region);
  const climatologyOwn = withoutMean(inputs.climatology, region);
  const truthField = withoutMean(inputs.truthAtValidInstant, region);

  const forecast = rootMeanSquare(forecastField.anomaly, truthField.anomaly, region);
  const persistence = rootMeanSquare(initialField.anomaly, truthField.anomaly, region);
  const climatology = rootMeanSquare(climatologyOwn.anomaly, truthField.anomaly, region);

  const againstPersistence = skill(forecast.rmse, persistence.rmse);
  const againstClimatology = skill(forecast.rmse, climatology.rmse);

  const parts: string[] = [];
  if (againstPersistence === null) {
    parts.push('persistence is perfect here, so skill against it is undefined rather than infinite');
  } else if (againstPersistence < 0) {
    // FR-021, in the SRD's own words. The surface prints this verbatim.
    parts.push(`worse than persistence by ${(-againstPersistence * 100).toFixed(1)} per cent`);
  } else {
    parts.push(`better than persistence by ${(againstPersistence * 100).toFixed(1)} per cent`);
  }
  if (againstClimatology === null) {
    parts.push('climatology is perfect here, so skill against it is undefined');
  } else if (againstClimatology < 0) {
    parts.push(`worse than climatology by ${(-againstClimatology * 100).toFixed(1)} per cent`);
  } else {
    parts.push(`better than climatology by ${(againstClimatology * 100).toFixed(1)} per cent`);
  }

  const external = inputs.externalObservationIds;
  const caveat =
    external.length === 0
      ? null
      : `the analysis assimilated ${String(external.length)} external observation` +
        `${external.length === 1 ? '' : 's'} (Argo) inside this window, and the truth record ` +
        'this score is computed against assimilated the same profiles. Skill measured this way ' +
        'is not independent evidence. ADR-0007 records the choice and how to reverse it.';

  return {
    forecastError: computed(forecast.rmse, METRE),
    meanOffsets: {
      forecast: computed(forecastField.mean, METRE),
      truth: computed(truthField.mean, METRE),
      climatology: computed(climatologyOwn.mean, METRE),
    },
    persistenceError: computed(persistence.rmse, METRE),
    climatologyError: computed(climatology.rmse, METRE),
    skillAgainstPersistence: againstPersistence === null ? null : computed(againstPersistence, ''),
    skillAgainstClimatology: againstClimatology === null ? null : computed(againstClimatology, ''),
    statement: parts.join('; '),
    provenance: {
      reference: 'persistence (the initial field held) and climatology (the committed artefact)',
      regionLabel: region.label,
      marginCells: declared(config.model.sponge.widthCells, 'cells'),
      cellsScored: computed(forecast.n, 'cells'),
      fromInstant: new Date(inputs.fromInstantMs).toISOString(),
      validInstant: new Date(inputs.validInstantMs).toISOString(),
      metric:
        'root-mean-square difference of interface-depth anomaly about the regional mean; the ' +
        'means removed are published beside the score, because a reduced-gravity model ' +
        'determines departures from a mean and not the mean itself',
      resolutionFloorDegrees: declared(domain.nativeResolutionDegrees, 'degrees'),
      truthSource: inputs.truth.id,
      independenceCaveat: caveat,
      externalObservationIds: external,
    },
  };
}
