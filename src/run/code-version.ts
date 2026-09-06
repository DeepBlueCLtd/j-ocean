/**
 * The build this code came out of (beat 011, FR-001).
 *
 * Injected by the bundler at build time, and `unknown` where there is no build — under vitest,
 * for instance, where a manifest is written and read by the same process and the question does
 * not arise. `unknown` never equals a real commit, so a manifest carrying it always warns on
 * import, which is the honest behaviour rather than an inconvenient one.
 */
declare const __CODE_VERSION__: string | undefined;

export const CODE_VERSION: string =
  typeof __CODE_VERSION__ === 'string' ? __CODE_VERSION__ : 'unknown';
