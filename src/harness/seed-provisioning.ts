/**
 * Drawing a root seed (constitution Principle I, exemption (b); FR-012, review R-4).
 *
 * The second and last place entropy may be read. It is read exactly once, before any run
 * exists, to produce a root seed which is then written into a manifest; from that moment
 * the run is a pure function of the seed and the configuration. A run never reads entropy,
 * and there is no path from here into one except through a manifest.
 *
 * The recorded case is not drawn: it is the declared `run.defaultSeed`, so that two
 * readers discussing it are discussing the same fields.
 */

const HEX = '0123456789abcdef';

/** A 64-bit seed as sixteen lowercase hex characters, the form configuration uses. */
export function drawRootSeed(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes); // j-ocean:allow-host-time exemption (b): one draw, before any run exists
  let hex = '';
  for (const byte of bytes) {
    hex += (HEX[byte >> 4] as string) + (HEX[byte & 0xf] as string);
  }
  return hex;
}
