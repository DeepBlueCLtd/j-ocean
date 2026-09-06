/**
 * The `Observation` type, and the only place in the tree that constructs one.
 *
 * Constitution Principle II: *the `Observation` type is opaque and constructed in the
 * instruments module alone. There is no constructor, cast or helper elsewhere by which a
 * truth value becomes an observation.*
 *
 * The opacity is enforced by the type system rather than by convention. Every observation
 * carries a brand keyed by a symbol this module declares and does not export, so a module
 * that wanted to fabricate one could not name the key. Gate G-02 holds the other half: it
 * fails if the brand appears anywhere but here, and if the truth-source port is imported by
 * the model or the analysis.
 */

/** Not exported. A module that cannot name this key cannot build an `Observation`. */
declare const OBSERVATION_BRAND: unique symbol;

/** The name the gate looks for. Exported so the gate and this file cannot drift apart. */
export const OBSERVATION_BRAND_NAME = 'OBSERVATION_BRAND';

/** What a quality check found. A flag is carried; it never drops the observation (FR-24). */
export type FlagCode =
  | 'gross-range'
  | 'climatology-departure'
  | 'vertical-inversion'
  | 'argo-flagged'
  | 'unresolved'
  /**
   * The instrument reached somewhere the truth record does not cover. An XBT infers its depth
   * from a fall rate, so a probe asked for 650 m may reach 663 m -- and the record stops where
   * it stops. The level is kept, flagged and valueless, because a reader looking at a profile
   * with a hole in it should be able to see that the hole is the *record's*, not the ocean's.
   */
  | 'outside-record';

export interface Flag {
  readonly code: FlagCode;
  /** Enough to draw it and to say why, without the reader going to the source. */
  readonly detail: string;
  /**
   * Whether the analysis will treat the observation as usable. A flag that did not say this
   * would leave every consumer to decide separately, and they would eventually disagree.
   */
  readonly usable: boolean;
}

/**
 * What an observation is worth, declared rather than assumed (FR-12).
 *
 * The three parts are kept separate because they answer different questions. Instrument
 * noise is what the device does; representativeness is what a point sample of the real ocean
 * cannot know about a 1/12-degree six-hourly record; bias is what a broken instrument adds
 * (FR-32). The surface can say which is which, and beat 005 weights by the total.
 */
export interface ObservationError {
  readonly instrumentNoiseSd: number;
  readonly representativenessSd: number;
  readonly declaredBias: number;
  /** The two random parts in quadrature. Bias is not variance and is not added here. */
  readonly totalSd: number;
}

export type ObservationKind = 'surface' | 'profile' | 'interface-depth';

export interface ObservationLevel {
  /** The depth actually sampled, which is not the depth asked for (FR-004, FR-23). */
  readonly depthMetres: number;
  readonly requestedDepthMetres: number;
  readonly value: number;
  readonly flags: readonly Flag[];
}

export interface Observation {
  readonly [OBSERVATION_BRAND]: true;
  /** Derived from the seed and the logical position, never from entropy (Principle I). */
  readonly id: string;
  readonly kind: ObservationKind;
  readonly variable: string;
  readonly instrumentId: string;
  readonly lonDeg: number;
  readonly latDeg: number;
  readonly depthMetres: number;
  readonly instantMs: number;
  readonly value: number;
  readonly error: ObservationError;
  readonly flags: readonly Flag[];
  /** True for Argo: a real measurement the truth record itself assimilated (ADR-0007). */
  readonly external: boolean;
  /** Which named RNG stream drew this observation's noise, for the manifest (FR-002). */
  readonly streamName: string;
  /** Present for a profile: one entry per sampled level. */
  readonly levels?: readonly ObservationLevel[];
  /**
   * Present on an interface-depth observation the operator could not resolve: the profile
   * establishes a bound rather than a value, and the analysis must treat it as one.
   */
  readonly bound?: { readonly direction: 'below' | 'above'; readonly depthMetres: number };
}

export interface ObservationFields {
  readonly id: string;
  readonly kind: ObservationKind;
  readonly variable: string;
  readonly instrumentId: string;
  readonly lonDeg: number;
  readonly latDeg: number;
  readonly depthMetres: number;
  readonly instantMs: number;
  readonly value: number;
  readonly error: ObservationError;
  readonly flags: readonly Flag[];
  readonly external: boolean;
  readonly streamName: string;
  readonly levels?: readonly ObservationLevel[];
  readonly bound?: { readonly direction: 'below' | 'above'; readonly depthMetres: number };
}

/**
 * The single construction site. Nothing outside this module calls it, and nothing outside
 * this file may: the brand is a symbol declared above and never exported.
 */
export function makeObservation(fields: ObservationFields): Observation {
  return fields as unknown as Observation;
}

/** Instrument noise and representativeness in quadrature. Bias is not a variance. */
export function errorOf(
  instrumentNoiseSd: number,
  representativenessSd: number,
  declaredBias: number,
): ObservationError {
  return {
    instrumentNoiseSd,
    representativenessSd,
    declaredBias,
    totalSd: Math.hypot(instrumentNoiseSd, representativenessSd),
  };
}

/** Whether every check that fired still leaves the observation usable by the analysis. */
export function isUsable(observation: Observation): boolean {
  return observation.flags.every((flag) => flag.usable);
}
