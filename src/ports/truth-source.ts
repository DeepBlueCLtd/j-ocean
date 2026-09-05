/**
 * Port: the truth source (constitution Principle VIII, SRD §2.1, FR-09).
 *
 * A committed HYCOM subset today, conceivably another reanalysis. Beat 001 declares the
 * interface and exercises it with a constant field; beat 002 implements it over the
 * committed artefact.
 *
 * Constitution Principle II governs who may hold one of these: the instruments module
 * alone, for the purpose of producing observations, and the scoring module after the
 * fact. Gate G-02 enforces that from beat 004. The port carries no affordance for
 * bypassing the instrument because there is nothing to bypass — it returns truth, and the
 * rule is about who may ask.
 */

/** A point query. Position in degrees, depth positive downwards, instant in Unix ms. */
export interface TruthQuery {
  readonly variable: string;
  readonly lonDeg: number;
  readonly latDeg: number;
  readonly depthMetres: number;
  readonly instantMs: number;
}

/** What the source covers. Scoring refuses to make claims outside it (review R-2). */
export interface TruthCoverage {
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
  readonly fromMs: number;
  readonly toMs: number;
}

export interface TruthSource {
  readonly id: string;
  /**
   * The source's own resolution, in degrees. Recorded from the first artefact and never
   * inferred: review R-2 turns on scoring refusing to resolve below this figure, and a
   * figure the code guessed could not carry that refusal honestly.
   */
  readonly nativeResolutionDegrees: number;
  readonly variables: readonly string[];
  coverage(): TruthCoverage;
  /** Sample truth. Pure: the same query returns the same value for the life of the source. */
  sample(query: TruthQuery): number;
}
