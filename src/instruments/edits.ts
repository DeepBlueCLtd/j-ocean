import type { Configuration } from '../config/schema.js';
import { interfaceObservationFrom, type SamplingContext, type XbtResult } from './instruments.js';
import { makeObservation, type Observation, type ObservationLevel } from './observation.js';

/**
 * The counterfactuals (FR-28 to FR-34), as data.
 *
 * An edit is a value, not a mutation. It lives in the manifest's counterfactual slot, it is
 * applied in order to a fresh run, and reverting is removing it -- which is why "revert
 * produces byte-identical results" is a property of the design rather than a promise about
 * undo.
 *
 * The edits divide in two, and the division is not arbitrary. **Three of them are edits to
 * the declared configuration** -- a bias on an instrument, quality control on or off, a
 * redrawn track -- and are applied by producing an edited configuration before anything is
 * sampled, so the instruments do exactly what they always do with what they are told. **Two
 * are edits to what was measured** -- withholding an observation, and dragging a profile --
 * and are applied to the observations afterwards.
 *
 * This module is in `src/instruments/` because an edited profile has to become an
 * `Observation`, and there is exactly one place in the tree where that may happen (G-02).
 */

export interface Waypoint {
  readonly lonDeg: number;
  readonly latDeg: number;
  readonly offsetHours: number;
}

export interface EditedLevel {
  readonly depthMetres: number;
  readonly value: number;
}

export type Edit =
  | { readonly kind: 'withhold'; readonly observationId: string }
  | { readonly kind: 'profile'; readonly observationId: string; readonly levels: readonly EditedLevel[] }
  | { readonly kind: 'bias'; readonly instrumentId: string; readonly biasDegC: number }
  | { readonly kind: 'quality-control'; readonly enabled: boolean }
  | { readonly kind: 'track'; readonly waypoints: readonly Waypoint[] };

/** What the status line says. One sentence per edit, in the order they were made (FR-001). */
export function describeEdit(edit: Edit): string {
  switch (edit.kind) {
    case 'withhold':
      return `withheld ${edit.observationId}`;
    case 'profile':
      return `edited the profile of ${edit.observationId}`;
    case 'bias':
      return `${edit.instrumentId} biased by ${edit.biasDegC.toFixed(2)} °C`;
    case 'quality-control':
      return `quality control ${edit.enabled ? 'on' : 'off'}`;
    case 'track':
      return `track redrawn with ${String(edit.waypoints.length)} waypoints`;
  }
}

const EARTH_RADIUS_KM = 6371;
const KM_PER_NAUTICAL_MILE = 1.852;

/** Great-circle distance. The track is short, but a flat-earth leg would still be a lie. */
export function distanceKm(a: Waypoint, b: Waypoint): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latDeg - a.latDeg);
  const dLon = toRadians(b.lonDeg - a.lonDeg);
  const lat1 = toRadians(a.latDeg);
  const lat2 = toRadians(b.latDeg);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * What a redrawn track asks of the vessel, and what was done about it (FR-009).
 *
 * The declared rule is to **stretch** rather than refuse: an edit a reader cannot make is
 * worse than one the surface explains, and a reader dragging a waypoint is asking "what if we
 * had gone there", not "could we have got there by Tuesday". The stretch is stated.
 */
export interface TrackStretch {
  readonly requiredKnots: number;
  readonly declaredKnots: number;
  readonly stretchFactor: number;
  readonly statement: string;
}

export interface EditedConfiguration {
  readonly config: Configuration;
  readonly stretch: TrackStretch | null;
}

export function configurationWith(
  config: Configuration,
  edits: readonly Edit[],
): EditedConfiguration {
  let instruments = config.instruments;
  let stretch: TrackStretch | null = null;

  for (const edit of edits) {
    if (edit.kind === 'quality-control') {
      instruments = {
        ...instruments,
        qualityControl: { ...instruments.qualityControl, enabled: edit.enabled },
      };
    }
    if (edit.kind === 'bias') {
      if (edit.instrumentId === instruments.surface.id) {
        instruments = {
          ...instruments,
          surface: { ...instruments.surface, biasDegC: edit.biasDegC },
        };
      }
      if (edit.instrumentId === instruments.xbt.id) {
        instruments = { ...instruments, xbt: { ...instruments.xbt, biasDegC: edit.biasDegC } };
      }
    }
    if (edit.kind === 'track') {
      const declaredKnots = instruments.track.vesselSpeedKnots;
      let worst = 0;
      for (let i = 1; i < edit.waypoints.length; i += 1) {
        const from = edit.waypoints[i - 1] as Waypoint;
        const to = edit.waypoints[i] as Waypoint;
        const hours = to.offsetHours - from.offsetHours;
        if (hours <= 0) continue;
        worst = Math.max(worst, distanceKm(from, to) / KM_PER_NAUTICAL_MILE / hours);
      }
      const factor = worst > declaredKnots ? worst / declaredKnots : 1;
      const first = edit.waypoints[0]?.offsetHours ?? 0;
      const waypoints = edit.waypoints.map((waypoint) => ({
        ...waypoint,
        offsetHours: first + (waypoint.offsetHours - first) * factor,
      }));
      instruments = { ...instruments, track: { ...instruments.track, waypoints } };
      stretch =
        factor === 1
          ? {
              requiredKnots: worst,
              declaredKnots,
              stretchFactor: 1,
              statement: `sailable at ${worst.toFixed(1)} knots, within the declared ${declaredKnots.toFixed(0)}`,
            }
          : {
              requiredKnots: worst,
              declaredKnots,
              stretchFactor: factor,
              statement:
                `this track would need ${worst.toFixed(1)} knots and the vessel is declared at ` +
                `${declaredKnots.toFixed(0)}, so the instants were stretched by a factor of ` +
                `${factor.toFixed(2)}`,
            };
    }
  }

  return { config: { ...config, instruments }, stretch };
}

/**
 * The edits to what was measured, applied to the sampled profiles.
 *
 * A withheld observation is **not deleted**: it is returned separately so the footprint can
 * keep drawing it in a withheld style. What was withheld is part of what the reader did, and
 * a measurement that vanished from the picture would make the counterfactual unreadable.
 *
 * An edited profile goes through the *same* observation operator as a measured one (FR-003).
 * There is no path by which a dragged profile becomes an interface depth by some other route,
 * which is the only reason the resulting difference field means anything.
 */
export interface EditedObservations {
  readonly results: readonly XbtResult[];
  readonly withheldIds: readonly string[];
  /** The measured levels of any profile that was edited, for the ghost (FR-003). */
  readonly ghosts: ReadonlyMap<string, readonly ObservationLevel[]>;
}

export function applyObservationEdits(
  results: readonly XbtResult[],
  edits: readonly Edit[],
  context: SamplingContext,
): EditedObservations {
  const withheldIds = edits
    .filter((edit): edit is Extract<Edit, { kind: 'withhold' }> => edit.kind === 'withhold')
    .map((edit) => edit.observationId);
  const ghosts = new Map<string, readonly ObservationLevel[]>();

  const edited = results.map((result) => {
    const change = edits.find(
      (edit): edit is Extract<Edit, { kind: 'profile' }> =>
        edit.kind === 'profile' && edit.observationId === result.profile.id,
    );
    if (change === undefined) return result;

    ghosts.set(result.profile.id, result.profile.levels ?? []);
    const levels: ObservationLevel[] = (result.profile.levels ?? []).map((level) => {
      const replacement = change.levels.find(
        (candidate) => Math.abs(candidate.depthMetres - level.depthMetres) < 1e-6,
      );
      return replacement === undefined ? level : { ...level, value: replacement.value };
    });

    const profile: Observation = makeObservation({
      id: result.profile.id,
      kind: result.profile.kind,
      variable: result.profile.variable,
      instrumentId: result.profile.instrumentId,
      lonDeg: result.profile.lonDeg,
      latDeg: result.profile.latDeg,
      depthMetres: result.profile.depthMetres,
      instantMs: result.profile.instantMs,
      value: result.profile.value,
      error: result.profile.error,
      // The checks are not re-run on an edited profile: a reader dragging a point is stating
      // what the instrument would have read, and quality control has already had its say
      // about the instrument. The vertical-inversion flag is the exception the operator
      // re-derives, because it is a property of the profile's shape rather than its source.
      flags: result.profile.flags.filter((flag) => flag.code !== 'vertical-inversion'),
      external: result.profile.external,
      streamName: result.profile.streamName,
      levels,
    });

    return { profile, interface: interfaceObservationFrom(profile, context, profile.external) };
  });

  return { results: edited, withheldIds, ghosts };
}

/** Whether an observation was withheld by this counterfactual. */
export function isWithheld(edits: readonly Edit[], observationId: string): boolean {
  return edits.some((edit) => edit.kind === 'withhold' && edit.observationId === observationId);
}
