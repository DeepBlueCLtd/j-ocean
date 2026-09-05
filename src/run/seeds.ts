/**
 * Seed derivation (FR-003, constitution Principle I).
 *
 * A run has one root seed. Every stream it hands out is derived from that seed and the
 * stream's *name*, never from a counter, a call order or anything else that a change
 * elsewhere in the program could disturb. That is the whole of why two components can
 * draw in either order and get the same values.
 *
 * The arithmetic is SplitMix64 over 64-bit integers, done in `bigint` so it is exact.
 * Speed does not matter here: derivation happens once per named stream, not per draw.
 */

const MASK64 = (1n << 64n) - 1n;

/** SplitMix64, as published. Used for derivation and for seeding the draw generator. */
export function splitmix64(state: bigint): { value: bigint; next: bigint } {
  const next = (state + 0x9e3779b97f4a7c15n) & MASK64;
  let z = next;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  z = z ^ (z >> 31n);
  return { value: z & MASK64, next };
}

/** FNV-1a over the UTF-8 bytes of a name, 64-bit. A name's contribution to its seed. */
export function fnv1a64(name: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(name)) {
    hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & MASK64;
  }
  return hash;
}

/** Sixteen lowercase hex characters, the form a seed takes in configuration and manifests. */
export function seedToHex(seed: bigint): string {
  return (seed & MASK64).toString(16).padStart(16, '0');
}

export function hexToSeed(hex: string): bigint {
  if (!/^[0-9a-f]{16}$/.test(hex)) {
    throw new RangeError(`a seed is exactly sixteen lowercase hex characters, not ${hex}`);
  }
  return BigInt(`0x${hex}`);
}

/**
 * The derivation itself: mix the root seed with the name's hash, then run it through
 * SplitMix64 so that two names differing in one bit do not give seeds differing in one bit.
 */
export function deriveSeed(rootSeedHex: string, name: string): string {
  const root = hexToSeed(rootSeedHex);
  const mixed = (root ^ fnv1a64(name)) & MASK64;
  return seedToHex(splitmix64(mixed).value);
}
