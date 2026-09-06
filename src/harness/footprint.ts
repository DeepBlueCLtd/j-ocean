import type { Flag, Observation } from '../instruments/observation.js';
import type { Marker } from './FieldView.js';

/**
 * The observation footprint (FR-23, FR-24): what the vessel measured, as drawable marks.
 *
 * This module **reads the run's observations and computes nothing else**. It does not sample
 * truth, it does not ask the model for anything, and it holds no arithmetic beyond placing a
 * longitude and a latitude on a grid. FR-009 of this beat says so, and a test asserts it by
 * reading this file's own imports -- a footprint that could reach truth would be a picture
 * of the answer rather than a picture of what was measured.
 *
 * The two distinctions the footprint exists to keep are both **temporal** and both easy to
 * lose. An observation taken *after* a forecast was initialised did not inform it, and drawing
 * it identically to one that did would credit the forecast with information it never had. And
 * an observation that failed a quality check is part of what the harness did: it is drawn as
 * flagged, never omitted.
 */

export interface Box {
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
}

export interface Grid {
  readonly nx: number;
  readonly ny: number;
}

/** One sampled level of a profile, as drawn. */
export interface NeedleLevel {
  /** The depth actually reached, not the depth asked for. */
  readonly depthMetres: number;
  readonly value: number;
  readonly flagged: boolean;
  /** False where the probe reached past the end of the truth record: kept, and valueless. */
  readonly hasValue: boolean;
}

export interface FootprintMark {
  readonly id: string;
  readonly kind: 'track' | 'drop' | 'external';
  /** Fractional grid coordinates, x east, y north. */
  readonly x: number;
  readonly y: number;
  readonly lonDeg: number;
  readonly latDeg: number;
  readonly instantMs: number;
  readonly instrumentId: string;
  readonly flags: readonly Flag[];
  readonly flagged: boolean;
  /**
   * FR-002: taken after the instant this forecast was initialised from, so it did not inform
   * it. Drawn distinctly, because a mark that did not inform a forecast must not look like
   * one that did.
   */
  readonly afterInitialisation: boolean;
  /** Inside the sponge margin, which scoring excludes and the analysis does not. */
  readonly insideMargin: boolean;
  /**
   * Withheld from the analysis by the reader. Drawn in a withheld style and never omitted:
   * what a reader withheld is part of what the reader did (FR-006).
   */
  readonly withheld: boolean;
}

export interface TrackMark extends FootprintMark {
  readonly kind: 'track';
  readonly value: number;
  readonly unit: string;
}

export interface Needle extends FootprintMark {
  readonly kind: 'drop' | 'external';
  readonly levels: readonly NeedleLevel[];
  readonly shallowestMetres: number;
  /** The deepest depth actually sampled. The needle's extent is this and nothing else. */
  readonly deepestMetres: number;
  /** The probe went past the floor of the displayed volume; the needle says it continues. */
  readonly continuesBelow: boolean;
  /** ADR-0007: drawn either way, and the hover says which. */
  readonly assimilated: boolean;
  /** Co-located needles are offset by a declared amount so both are visible. */
  readonly offsetIndex: number;
  /**
   * The profile reports no value at any level. Five delayed-mode Argo profiles in the
   * recorded case are like this. A needle of zero extent would look like a probe that reached
   * the surface and stopped, so they are drawn as what they are: a position, an instant, and
   * nothing measured.
   */
  readonly measuredNothing: boolean;
}

export interface Footprint {
  readonly track: readonly TrackMark[];
  readonly needles: readonly Needle[];
  /** FR-007: a run with quality control off says so wherever the footprint is drawn. */
  readonly qualityControlEnabled: boolean;
  /** The floor of the displayed volume, from the declared display levels. */
  readonly volumeFloorMetres: number;
}

export interface FootprintInput {
  readonly surface: readonly Observation[];
  readonly drops: readonly Observation[];
  readonly argo: readonly Observation[];
  readonly box: Box;
  readonly grid: Grid;
  /** The instant the forecasts in this row were initialised from. */
  readonly initialisedFromMs: number;
  readonly spongeWidthCells: number;
  readonly volumeFloorMetres: number;
  readonly colocationToleranceDegrees: number;
  readonly qualityControlEnabled: boolean;
  readonly assimilateArgo: boolean;
  /** FR-006 of beat 010: withheld by the reader, and still drawn. */
  readonly withheldIds?: readonly string[];
}

const flaggedAnywhere = (observation: Observation): boolean =>
  observation.flags.length > 0 ||
  (observation.levels ?? []).some((level) => level.flags.length > 0);

export function footprintOf(input: FootprintInput): Footprint {
  const { box, grid } = input;
  const place = (lonDeg: number, latDeg: number): { x: number; y: number } => ({
    x: ((lonDeg - box.west) / (box.east - box.west)) * grid.nx,
    y: ((latDeg - box.south) / (box.north - box.south)) * grid.ny,
  });

  const inMargin = (x: number, y: number): boolean => {
    const w = input.spongeWidthCells;
    return x < w || y < w || x > grid.nx - w || y > grid.ny - w;
  };

  const common = (observation: Observation) => {
    const { x, y } = place(observation.lonDeg, observation.latDeg);
    return {
      id: observation.id,
      x,
      y,
      lonDeg: observation.lonDeg,
      latDeg: observation.latDeg,
      instantMs: observation.instantMs,
      instrumentId: observation.instrumentId,
      flags: observation.flags,
      flagged: flaggedAnywhere(observation),
      afterInitialisation: observation.instantMs > input.initialisedFromMs,
      insideMargin: inMargin(x, y),
      withheld: (input.withheldIds ?? []).some(
        (id) => id === observation.id || id === `${observation.id}/interface`,
      ),
    };
  };

  const track: TrackMark[] = [...input.surface]
    .sort((a, b) => a.instantMs - b.instantMs)
    .map((observation) => ({
      ...common(observation),
      kind: 'track' as const,
      value: observation.value,
      unit: '°C',
    }));

  // Co-located needles: an offset index each, so two drops at one position are two needles
  // rather than one drawn twice. The tolerance is declared, not guessed at a pixel size.
  const placed: { lonDeg: number; latDeg: number; count: number }[] = [];
  const offsetFor = (lonDeg: number, latDeg: number): number => {
    const tolerance = input.colocationToleranceDegrees;
    const found = placed.find(
      (p) => Math.abs(p.lonDeg - lonDeg) <= tolerance && Math.abs(p.latDeg - latDeg) <= tolerance,
    );
    if (found === undefined) {
      placed.push({ lonDeg, latDeg, count: 1 });
      return 0;
    }
    found.count += 1;
    return found.count - 1;
  };

  const needleFrom = (
    observation: Observation,
    kind: 'drop' | 'external',
    assimilated: boolean,
  ): Needle => {
    const levels: NeedleLevel[] = (observation.levels ?? []).map((level) => ({
      depthMetres: level.depthMetres,
      value: level.value,
      flagged: level.flags.length > 0,
      hasValue: Number.isFinite(level.value),
    }));
    const measured = levels.filter((level) => level.hasValue);
    const depths = measured.map((level) => level.depthMetres);
    const deepestMetres = depths.length === 0 ? 0 : Math.max(...depths);
    const shallowestMetres = depths.length === 0 ? 0 : Math.min(...depths);
    return {
      ...common(observation),
      kind,
      levels,
      shallowestMetres,
      deepestMetres,
      continuesBelow: deepestMetres > input.volumeFloorMetres,
      measuredNothing: measured.length === 0,
      assimilated,
      offsetIndex: offsetFor(observation.lonDeg, observation.latDeg),
    };
  };

  const needles: Needle[] = [
    ...input.drops.map((observation) => needleFrom(observation, 'drop', true)),
    ...input.argo.map((observation) => needleFrom(observation, 'external', input.assimilateArgo)),
  ].sort((a, b) => a.instantMs - b.instantMs);

  return {
    track,
    needles,
    qualityControlEnabled: input.qualityControlEnabled,
    volumeFloorMetres: input.volumeFloorMetres,
  };
}

/** Every mark, for the counting the acceptance criteria do. */
export function marksOf(footprint: Footprint): readonly FootprintMark[] {
  return [...footprint.track, ...footprint.needles];
}

/**
 * The footprint as the field overlay draws it. One producer: every panel's marks come from
 * here, so a mark cannot mean one thing on one panel and something else on another.
 *
 * A surface measurement's intensity is its place in the track's **own** range, which is
 * therefore a computed figure and is printed in the legend. Declaring a fixed temperature
 * range instead would have saturated every mark on a day the ocean did not oblige.
 */
export function markersFrom(footprint: Footprint): Marker[] {
  const values = footprint.track.map((mark) => mark.value);
  const low = values.length === 0 ? 0 : Math.min(...values);
  const high = values.length === 0 ? 1 : Math.max(...values);
  const span = high - low;

  return [
    ...footprint.track.map((mark) => ({
      id: mark.id,
      x: mark.x,
      y: mark.y,
      kind: 'track' as const,
      flagged: mark.flagged,
      intensity: span === 0 ? 0.5 : (mark.value - low) / span,
      afterInitialisation: mark.afterInitialisation,
      withheld: mark.withheld,
    })),
    ...footprint.needles.map((needle) => ({
      id: needle.id,
      x: needle.x,
      y: needle.y,
      kind: needle.kind,
      flagged: needle.flagged,
      depthFraction: Math.min(1, needle.deepestMetres / footprint.volumeFloorMetres),
      afterInitialisation: needle.afterInitialisation,
      continuesBelow: needle.continuesBelow,
      withheld: needle.withheld,
    })),
  ];
}

/** The range the intensities were scaled against, for the legend to state. */
export function trackValueRange(footprint: Footprint): { low: number; high: number } {
  const values = footprint.track.map((mark) => mark.value);
  return values.length === 0
    ? { low: 0, high: 0 }
    : { low: Math.min(...values), high: Math.max(...values) };
}
