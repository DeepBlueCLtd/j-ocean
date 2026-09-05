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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Parse a manifest. Shape only: whether it may be *used* is a separate question, asked by
 * `assertManifestUsable`, because "this is not a manifest" and "this manifest is not for
 * this tree" are different failures and a reader deserves to be told which.
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
  if (!isRecord(value)) throw new ManifestError('the manifest is not an object');

  const required = [
    'formatVersion', 'generatorVersion', 'kernelId', 'rootSeed', 'derivedSeeds',
    'clock', 'configDigest', 'steps', 'issueInstantMs', 'recordedCase', 'counterfactual',
  ] as const;
  const missing = required.filter((key) => !(key in value));
  if (missing.length > 0) {
    throw new ManifestError(`the manifest is missing: ${missing.join(', ')}`);
  }
  if (value['formatVersion'] !== MANIFEST_FORMAT_VERSION) {
    throw new ManifestError(
      `manifest format version ${String(value['formatVersion'])} cannot be read by this ` +
        `code, which writes and reads version ${String(MANIFEST_FORMAT_VERSION)}`,
    );
  }
  const clock = value['clock'];
  if (!isRecord(clock) || typeof clock['epoch'] !== 'string' || typeof clock['timestepSeconds'] !== 'number') {
    throw new ManifestError('the manifest clock configuration is malformed');
  }
  if (!Array.isArray(value['counterfactual'])) {
    throw new ManifestError('the manifest counterfactual slot is not a list of edits');
  }
  return value as unknown as RunManifest;
}

/**
 * The two refusals of FR-005. Each names both values, and refusing leaves no run behind
 * because the check happens before anything is constructed.
 */
export function assertManifestUsable(
  manifest: RunManifest,
  expected: { generatorVersion: string; configDigest: string },
): void {
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
