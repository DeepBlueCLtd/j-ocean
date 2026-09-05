/**
 * The committed observation record (FR-010, FR-024).
 *
 * Argo profiles, as converted. The one thing this reader is careful about is the flags: a
 * quality flag is carried through at every level and is *never* used to drop a level. A
 * flagged observation is drawn as flagged, not omitted, and a reader who cannot see the
 * flagged ones cannot see what the analysis chose to ignore.
 */

/** Argo's own scale. 0 means no quality control was performed, not "good". */
export const ARGO_FLAGS: Readonly<Record<number, string>> = {
  0: 'no quality control performed',
  1: 'good',
  2: 'probably good',
  3: 'probably bad',
  4: 'bad',
  5: 'changed',
  8: 'estimated',
  9: 'missing',
};

/** The flags the analysis honours as usable. Everything else is drawn and not assimilated. */
export const USABLE_ARGO_FLAGS: readonly number[] = [1, 2];

export interface ObservationLevel {
  readonly pressureDbar: number;
  readonly pressureFlag: number;
  readonly temperatureDegC: number | null;
  readonly temperatureFlag: number;
  readonly salinityPsu?: number | null;
  readonly salinityFlag?: number;
}

export interface ObservationProfile {
  readonly platform: string;
  readonly cycle: number;
  readonly file: string;
  /** As reported. A float drifts through its cycle; the record claims only this instant. */
  readonly instant: string;
  readonly latDegrees: number;
  readonly lonDegrees: number;
  readonly levels: readonly ObservationLevel[];
}

export interface ObservationRecord {
  readonly format: 'j-ocean/observations';
  readonly version: number;
  readonly domain: string;
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly profiles: readonly ObservationProfile[];
}

export class ObservationRecordError extends Error {
  override readonly name = 'ObservationRecordError';
}

export function parseObservationRecord(text: string): ObservationRecord {
  const value = JSON.parse(text) as ObservationRecord;
  if (value.format !== 'j-ocean/observations') {
    throw new ObservationRecordError(`unexpected observation format ${String(value.format)}`);
  }
  return value;
}

/** How many levels carry a flag outside the usable set. Counted, never quietly dropped. */
export function flaggedLevelCount(record: ObservationRecord): number {
  let count = 0;
  for (const profile of record.profiles) {
    for (const level of profile.levels) {
      if (!USABLE_ARGO_FLAGS.includes(level.temperatureFlag)) count += 1;
    }
  }
  return count;
}

export function levelCount(record: ObservationRecord): number {
  return record.profiles.reduce((total, profile) => total + profile.levels.length, 0);
}
