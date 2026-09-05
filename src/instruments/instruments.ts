import type { Configuration } from '../config/schema.js';
import type { ThermalStructure } from '../model/parameters.js';
import type { RngPort } from '../ports/rng.js';
import type { TruthSource } from '../ports/truth-source.js';
import type { ObservationRecord } from '../truth/observations.js';
import {
  errorOf,
  makeObservation,
  type Flag,
  type Observation,
  type ObservationLevel,
} from './observation.js';
import { interfaceFromProfile } from './observation-operator.js';
import {
  argoFlag,
  climatologyDepartureCheck,
  grossRangeCheck,
  verticalInversionCheck,
  type ClimatologyReference,
} from './quality-control.js';

/**
 * The instruments (constitution Principle II, FR-12).
 *
 * This is the only module in the tree that imports the truth-source port in order to produce
 * observations, and `observation.ts` beside it is the only file that can construct one. Gate
 * G-02 holds both halves.
 *
 * Everything an observation is worth is priced here: the declared instrument noise, the
 * declared representativeness, any declared bias, the depth an XBT actually reached rather
 * than the depth it was asked for, and the flags every declared check produced. Nothing
 * downstream may add to that list, because nothing downstream knows anything the instrument
 * did not.
 */

/** Stream names. Each instrument derives its own, so no two can disturb each other's draws. */
export const SURFACE_STREAM = 'instruments/surface';
export const XBT_STREAM = 'instruments/xbt';
export const XBT_DEPTH_STREAM = 'instruments/xbt-depth';

export interface SamplingContext {
  readonly config: Configuration;
  readonly truth: TruthSource;
  readonly rng: RngPort;
  readonly climatology: ClimatologyReference;
  readonly structure: ThermalStructure;
  /** The instant the run starts. Every declared offset is measured from it. */
  readonly startMs: number;
}

export interface TrackPoint {
  readonly lonDeg: number;
  readonly latDeg: number;
  readonly instantMs: number;
  readonly offsetHours: number;
}

/**
 * The ownship's track: declared waypoints, sampled at a declared interval, with position
 * linearly interpolated along each leg. It is deliberately a declared path rather than a
 * generated one; beat 012's lawnmower and steered tracks are generated, and the contrast
 * between them is the experiment.
 */
export function trackPoints(config: Configuration, startMs: number): TrackPoint[] {
  const { waypoints, sampleIntervalHours } = config.instruments.track;
  const first = waypoints[0] as { offsetHours: number };
  const last = waypoints[waypoints.length - 1] as { offsetHours: number };
  const points: TrackPoint[] = [];

  for (let hours = first.offsetHours; hours <= last.offsetHours + 1e-9; hours += sampleIntervalHours) {
    let leg = 0;
    while (leg < waypoints.length - 2 && (waypoints[leg + 1] as { offsetHours: number }).offsetHours < hours) {
      leg += 1;
    }
    const a = waypoints[leg] as { lonDeg: number; latDeg: number; offsetHours: number };
    const b = waypoints[leg + 1] as { lonDeg: number; latDeg: number; offsetHours: number };
    const span = b.offsetHours - a.offsetHours;
    const t = span === 0 ? 0 : (hours - a.offsetHours) / span;
    points.push({
      lonDeg: a.lonDeg + (b.lonDeg - a.lonDeg) * t,
      latDeg: a.latDeg + (b.latDeg - a.latDeg) * t,
      offsetHours: hours,
      instantMs: startMs + hours * 3_600_000,
    });
  }
  return points;
}

/** Deterministic from the seed and the logical position, never from entropy (Principle I). */
const identifierFor = (instrumentId: string, index: number, suffix = ''): string =>
  `${instrumentId}/${String(index).padStart(4, '0')}${suffix}`;

function applyChecks(
  value: number,
  lonDeg: number,
  latDeg: number,
  depthMetres: number,
  context: SamplingContext,
): Flag[] {
  if (!context.config.instruments.qualityControl.enabled) return [];
  const flags: Flag[] = [];
  const gross = grossRangeCheck(value, context.config);
  if (gross !== null) flags.push(gross);
  const departure = climatologyDepartureCheck(
    value,
    lonDeg,
    latDeg,
    depthMetres,
    context.climatology,
    context.config,
  );
  if (departure !== null) flags.push(departure);
  return flags;
}

/**
 * The surface instrument (FR-003). One observation per track instant: truth sampled through
 * the port, declared noise added, then any declared bias, then the checks.
 *
 * The order matters and is the spec's: **bias after noise and before checks** (FR-007). A
 * bias added after the checks would be a bias quality control could never catch, which would
 * make the "break an instrument" counterfactual a demonstration of nothing.
 */
export function sampleSurface(context: SamplingContext): Observation[] {
  const declared = context.config.instruments.surface;
  const stream = context.rng.stream(SURFACE_STREAM);
  const error = errorOf(
    declared.noiseStandardDeviationDegC,
    declared.representativenessStandardDeviationDegC,
    declared.biasDegC,
  );

  return trackPoints(context.config, context.startMs).map((point, index) => {
    const truthValue = context.truth.sample({
      variable: declared.variable,
      lonDeg: point.lonDeg,
      latDeg: point.latDeg,
      depthMetres: 0,
      instantMs: point.instantMs,
    });
    const value = truthValue + error.totalSd * stream.nextGaussian() + declared.biasDegC;
    return makeObservation({
      id: identifierFor(declared.id, index),
      kind: 'surface',
      variable: declared.variable,
      instrumentId: declared.id,
      lonDeg: point.lonDeg,
      latDeg: point.latDeg,
      depthMetres: 0,
      instantMs: point.instantMs,
      value,
      error,
      flags: applyChecks(value, point.lonDeg, point.latDeg, 0, context),
      external: false,
      streamName: SURFACE_STREAM,
    });
  });
}

/**
 * A profile with no level worth reading is flagged as such, whatever the reason: every level
 * null in the source, or every level valueless because the probe reached past the end of the
 * truth record. What matters to a reader is that it measured nothing.
 */
function noUsableLevelFlags(levels: readonly ObservationLevel[]): Flag[] {
  const usable = levels.filter((level) => Number.isFinite(level.value));
  return usable.length > 0
    ? []
    : [
        {
          code: 'unresolved',
          detail: 'no usable level in this profile: it measured nothing',
          usable: false,
        },
      ];
}

export interface XbtResult {
  /** The profile as measured, levels and all. Beat 008 draws its needles from this. */
  readonly profile: Observation;
  /**
   * What the analysis actually consumes: the interface depth the profile implies, or a bound
   * when it implies only that. Two observations from one drop, because they are two
   * different claims and the surface has to be able to draw both.
   */
  readonly interface: Observation;
}

/**
 * The XBT (FR-004, FR-005). It samples truth at the declared depths -- and records the depth
 * it *actually reached*, which is not the depth asked for: an XBT infers its depth from a
 * fall-rate equation, so the error is a declared fraction of the depth itself.
 */
export function sampleXbtDrops(context: SamplingContext): XbtResult[] {
  const declared = context.config.instruments.xbt;
  const stream = context.rng.stream(XBT_STREAM);
  const depthStream = context.rng.stream(XBT_DEPTH_STREAM);
  const error = errorOf(
    declared.noiseStandardDeviationDegC,
    declared.representativenessStandardDeviationDegC,
    declared.biasDegC,
  );

  return context.config.instruments.drops.map((drop, index) => {
    const instantMs = context.startMs + drop.offsetHours * 3_600_000;
    const levels: ObservationLevel[] = declared.depthsMetres.map((requestedDepthMetres) => {
      const depthMetres =
        requestedDepthMetres * (1 + declared.depthErrorFraction * depthStream.nextGaussian());
      // The noise draw happens whether or not the sample succeeds, so that a probe which
      // overshot the record does not silently shift every later draw in the stream.
      const noise = error.totalSd * stream.nextGaussian();

      let truthValue: number;
      try {
        truthValue = context.truth.sample({
          variable: declared.variable,
          lonDeg: drop.lonDeg,
          latDeg: drop.latDeg,
          depthMetres: Math.max(0, depthMetres),
          instantMs,
        });
      } catch (cause) {
        // The probe reached past the end of the record. There is no truth here to sample, and
        // inventing one -- by clamping the depth, say -- would be reporting a measurement from
        // a place the harness has no record of.
        return {
          depthMetres,
          requestedDepthMetres,
          value: Number.NaN,
          flags: [
            {
              code: 'outside-record' as const,
              detail:
                `the probe reached ${depthMetres.toFixed(1)} m and the truth record does not ` +
                `cover it: ${cause instanceof Error ? cause.message : String(cause)}`,
              usable: false,
            },
          ],
        };
      }

      const value = truthValue + noise + declared.biasDegC;
      return {
        depthMetres,
        requestedDepthMetres,
        value,
        flags: applyChecks(value, drop.lonDeg, drop.latDeg, depthMetres, context),
      };
    });

    const profileFlags: Flag[] = [...noUsableLevelFlags(levels)];
    if (context.config.instruments.qualityControl.enabled) {
      const inversion = verticalInversionCheck(levels, context.config);
      if (inversion !== null) profileFlags.push(inversion);
    }

    const profile = makeObservation({
      id: identifierFor(declared.id, index),
      kind: 'profile',
      variable: declared.variable,
      instrumentId: declared.id,
      lonDeg: drop.lonDeg,
      latDeg: drop.latDeg,
      depthMetres: Math.max(...declared.depthsMetres),
      instantMs,
      value: Number.NaN,
      error,
      flags: profileFlags,
      external: false,
      streamName: XBT_STREAM,
      levels,
    });

    return { profile, interface: interfaceObservationFrom(profile, context, false) };
  });
}

/**
 * Turn a profile observation into the interface-depth observation the analysis consumes.
 * Shared by the XBT and by Argo, because the operator does not care which instrument a
 * profile came from -- only what it measured and what that measurement is worth.
 */
export function interfaceObservationFrom(
  profile: Observation,
  context: SamplingContext,
  external: boolean,
): Observation {
  const levels = profile.levels ?? [];
  const estimate = interfaceFromProfile(levels, profile.error.totalSd, context.structure);

  const flags: Flag[] = [...profile.flags];
  if (estimate.depthMetres === null) {
    flags.push({
      code: 'unresolved',
      detail:
        estimate.bound === null
          ? 'no usable level in this profile'
          : `this profile does not cross the thermocline; it establishes only that the ` +
            `interface is ${estimate.bound.direction} ${estimate.bound.depthMetres.toFixed(0)} m`,
      usable: false,
    });
  }

  return makeObservation({
    id: `${profile.id}/interface`,
    kind: 'interface-depth',
    variable: 'interface_depth',
    instrumentId: profile.instrumentId,
    lonDeg: profile.lonDeg,
    latDeg: profile.latDeg,
    depthMetres: estimate.depthMetres ?? Number.NaN,
    instantMs: profile.instantMs,
    value: estimate.depthMetres ?? Number.NaN,
    error: {
      instrumentNoiseSd: estimate.sdMetres ?? Number.POSITIVE_INFINITY,
      representativenessSd: 0,
      declaredBias: 0,
      totalSd: estimate.sdMetres ?? Number.POSITIVE_INFINITY,
    },
    flags,
    external,
    streamName: profile.streamName,
    ...(estimate.bound === null ? {} : { bound: estimate.bound }),
  });
}

/**
 * Argo (FR-008, ADR-0007). Real profiles, admitted behind a toggle, with their own flags
 * mapped onto this project's set and `external: true` so that every score computed with them
 * can say the truth record assimilated them.
 */
export function argoObservations(
  record: ObservationRecord,
  context: SamplingContext,
): XbtResult[] {
  if (!context.config.instruments.argo.assimilate) return [];

  return record.profiles.map((argo, index) => {
    const levels: ObservationLevel[] = argo.levels
      .filter((level) => level.temperatureDegC !== null)
      .map((level) => {
        const flags: Flag[] = [];
        const flag = argoFlag(level.temperatureFlag);
        if (flag !== null) flags.push(flag);
        return {
          // Argo reports pressure in decibars, which is within a per cent of depth in metres
          // at these depths. The approximation is declared here rather than hidden.
          depthMetres: level.pressureDbar,
          requestedDepthMetres: level.pressureDbar,
          value: level.temperatureDegC as number,
          flags,
        };
      });

    const profile = makeObservation({
      id: `argo/${argo.platform}/${String(argo.cycle)}/${String(index)}`,
      kind: 'profile',
      variable: 'water_temperature',
      instrumentId: `argo/${argo.platform}`,
      lonDeg: argo.lonDegrees,
      latDeg: argo.latDegrees,
      depthMetres: levels.length === 0 ? 0 : (levels[levels.length - 1] as ObservationLevel).depthMetres,
      instantMs: Date.parse(argo.instant),
      value: Number.NaN,
      error: errorOf(
        context.config.instruments.xbt.noiseStandardDeviationDegC,
        context.config.instruments.xbt.representativenessStandardDeviationDegC,
        0,
      ),
      /*
       * A profile that measured nothing carries a flag of its own (FR-24, beat 008).
       *
       * Five delayed-mode profiles in the recorded case report a temperature at no level at
       * all: every level is null with an Argo flag of 4. The *derived* interface observation
       * has always been flagged `unresolved` and excluded from the analysis, which is
       * correct. But the profile that the footprint draws carried no flag, so a profile that
       * measured nothing was drawn exactly like one that measured everything. The flag
       * belongs on the thing that is drawn, not only on the thing that is consumed.
       */
      flags: noUsableLevelFlags(levels),
      external: true,
      streamName: 'external/argo',
      levels,
    });

    return { profile, interface: interfaceObservationFrom(profile, context, true) };
  });
}
