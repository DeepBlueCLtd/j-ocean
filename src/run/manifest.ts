import { z } from 'zod';
import type { Edit } from '../instruments/edits.js';
import type { ClockConfiguration } from '../ports/clock.js';

/**
 * The run manifest (FR-005, FR-008, AT-04).
 *
 * What it holds is everything needed to rebuild a run: the root seed, the derived seeds by
 * name, the generator version, the clock configuration, the configuration digest, the
 * kernel it ran, how far it got, whether it is the recorded case, and the counterfactual
 * slot feature 010 fills.
 *
 * What it deliberately does **not** hold is state. Replay is re-computation, not the
 * restoration of a snapshot — which is the only reason the byte-identity test means
 * anything, since a snapshot compared with itself proves nothing.
 */

export const MANIFEST_FORMAT_VERSION = 3;

export interface RunManifest {
  readonly formatVersion: number;
  /** The RNG generator family and parameters (`RngPort.generatorVersion`). */
  readonly generatorVersion: string;
  readonly kernelId: string;
  readonly rootSeed: string;
  /** Every named stream the run asked for, with the seed derived for it. */
  readonly derivedSeeds: Readonly<Record<string, string>>;
  readonly clock: ClockConfiguration;
  /** The digest of the configuration this run was created against. */
  readonly configDigest: string;
  /** How many steps the run had taken when the manifest was exported. */
  readonly steps: number;
  /**
   * The instant the shore forecast was issued (beat 009, FR-009). It is a field of the
   * manifest and not of the configuration because it is a *reader's* choice: the row can be
   * re-issued, and a manifest that did not record which issue time produced the fields it
   * describes could not rebuild them.
   */
  readonly issueInstantMs: number;
  /**
   * The build this run came out of (beat 011, FR-001). "Byte-identical replay" is a promise
   * about the same code, so the manifest says which code that was. A mismatch is reported and
   * may be proceeded with: a reader with an older manifest is better served by a warned replay
   * than by a refusal, and the warning says identity is no longer guaranteed.
   */
  readonly codeVersion: string;
  /** The domain the run was made in. A manifest naming one this build lacks is refused. */
  readonly domainId: string;
  /** FR-012: false once a reader has asked for a new run. */
  readonly recordedCase: boolean;
  /**
   * FR-34, beat 010. The reader's edits, in order. Empty for the recorded case -- and the
   * slot was present from beat 001 rather than added here, so a manifest exported before the
   * counterfactuals existed and one exported after have the same shape.
   */
  readonly counterfactual: readonly Edit[];
}

/** Raised when a manifest cannot be honoured. Every message names both values compared. */
export class ManifestError extends Error {
  override readonly name = 'ManifestError';
}

export function serialiseManifest(manifest: RunManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * The manifest schema, and the only definition of one (FR-001, FR-002).
 *
 * It is **strict**, which is what makes FR-002 true rather than merely intended: a manifest
 * carrying a field, a score or an observation is rejected because it carries a key the schema
 * does not know, not because somebody remembered to look for those three words. The committed
 * JSON Schema under `schemas/` is generated from this one and checked against it by a test, so
 * there is a portable copy rather than a second definition.
 */
const editSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('withhold'), observationId: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('profile'),
    observationId: z.string().min(1),
    levels: z.array(z.strictObject({ depthMetres: z.number(), value: z.number() })),
  }),
  z.strictObject({
    kind: z.literal('bias'),
    instrumentId: z.string().min(1),
    biasDegC: z.number(),
  }),
  z.strictObject({ kind: z.literal('quality-control'), enabled: z.boolean() }),
  z.strictObject({
    kind: z.literal('track'),
    waypoints: z.array(
      z.strictObject({ lonDeg: z.number(), latDeg: z.number(), offsetHours: z.number() }),
    ),
  }),
]);

export const runManifestSchema = z.strictObject({
  formatVersion: z.number().int(),
  generatorVersion: z.string().min(1),
  kernelId: z.string().min(1),
  rootSeed: z.string().regex(/^[0-9a-f]{16}$/),
  derivedSeeds: z.record(z.string(), z.string().regex(/^[0-9a-f]{16}$/)),
  clock: z.strictObject({ epoch: z.string().min(1), timestepSeconds: z.number().int().positive() }),
  configDigest: z.string().min(1),
  steps: z.number().int().nonnegative(),
  issueInstantMs: z.number().int(),
  codeVersion: z.string().min(1),
  domainId: z.string().min(1),
  recordedCase: z.boolean(),
  counterfactual: z.array(editSchema),
});

/**
 * Parse a manifest. Shape only: whether it may be *used* is a separate question, asked by
 * `assertManifestUsable`, because "this is not a manifest" and "this manifest is not for this
 * tree" are different failures and a reader deserves to be told which.
 */
export function parseManifest(text: string): RunManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new ManifestError(
      `the manifest is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  // The version is checked before the shape, so a manifest from another version is told what
  // it is rather than being told about a field that moved.
  const version =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)['formatVersion']
      : undefined;
  if (version !== MANIFEST_FORMAT_VERSION) {
    throw new ManifestError(
      `manifest format version ${String(version)} cannot be read by this code, which writes ` +
        `and reads version ${String(MANIFEST_FORMAT_VERSION)}`,
    );
  }

  const parsed = runManifestSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ManifestError(
      `the manifest is not one this code can read: ${first?.path.join('.') ?? '(root)'}: ` +
        `${first?.message ?? 'invalid'}`,
    );
  }
  return parsed.data as RunManifest;
}


/**
 * The two refusals of FR-005. Each names both values, and refusing leaves no run behind
 * because the check happens before anything is constructed.
 */
export function assertManifestUsable(
  manifest: RunManifest,
  expected: { generatorVersion: string; configDigest: string; domainIds?: readonly string[] },
): void {
  if (expected.domainIds !== undefined && !expected.domainIds.includes(manifest.domainId)) {
    throw new ManifestError(
      `the manifest was made in domain "${manifest.domainId}" and this build declares ` +
        `${expected.domainIds.map((id) => `"${id}"`).join(', ')}`,
    );
  }
  if (manifest.generatorVersion !== expected.generatorVersion) {
    throw new ManifestError(
      `the manifest was written by generator ${manifest.generatorVersion} and this code ` +
        `runs generator ${expected.generatorVersion}; the same seed would not mean the ` +
        'same numbers, so the run is refused',
    );
  }
  if (manifest.configDigest !== expected.configDigest) {
    throw new ManifestError(
      `configuration digest mismatch: the manifest records ${manifest.configDigest} and ` +
        `the loaded configuration digests to ${expected.configDigest}`,
    );
  }
}

/**
 * The code-version difference, which is a **warning and not a refusal** (FR-005).
 *
 * A digest mismatch means the declared values differ, and a run made against other values is a
 * different run: that is refused. A code-version mismatch means the arithmetic may have
 * changed, which may or may not matter — and a reader holding a manifest from last month is
 * better served by a replay carrying a warning than by a door. So this returns a sentence
 * rather than throwing, and the surface prints it beside the run.
 */
export function codeVersionWarning(
  manifest: RunManifest,
  expected: { codeVersion: string },
): string | null {
  if (manifest.codeVersion === expected.codeVersion) return null;
  return (
    `this manifest was exported by build ${manifest.codeVersion} and this is build ` +
    `${expected.codeVersion}; the run will be rebuilt, but byte-identical results are only ` +
    'promised for the same code'
  );
}
