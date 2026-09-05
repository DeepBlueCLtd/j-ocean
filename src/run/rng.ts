import type { RandomStream, RngPort } from '../ports/rng.js';
import { deriveSeed, hexToSeed, splitmix64 } from './seeds.js';

/**
 * The reference RNG implementation (constitution Principle I).
 *
 * xoshiro128** for the draws, SplitMix64 to expand a 64-bit seed into its 128-bit state,
 * as its authors prescribe. Both are integer-exact in TypeScript, neither reads anything
 * of the host, and both are small enough to be read rather than trusted.
 *
 * The version string below is recorded in every manifest. Changing the generator, the
 * seeding, or the mapping from a draw to a float changes what a seed means, and therefore
 * must change this string: an old manifest then refuses to load instead of replaying into
 * different numbers under the same name.
 */
export const GENERATOR_VERSION = 'xoshiro128starstar+splitmix64/1';

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

class Xoshiro128StarStar implements RandomStream {
  readonly name: string;
  readonly seed: string;
  #s0: number;
  #s1: number;
  #s2: number;
  #s3: number;
  /** A held second normal deviate: Box–Muller produces them in pairs. */
  #spare: number | null = null;

  constructor(name: string, seedHex: string) {
    this.name = name;
    this.seed = seedHex;
    let state = hexToSeed(seedHex);
    const words: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const drawn = splitmix64(state);
      state = drawn.next;
      words.push(Number(drawn.value & 0xffffffffn) >>> 0);
    }
    this.#s0 = words[0] as number;
    this.#s1 = words[1] as number;
    this.#s2 = words[2] as number;
    this.#s3 = words[3] as number;
    // An all-zero state is a fixed point of xoshiro. The seeding above cannot produce one
    // for any seed SplitMix64 can reach, but the generator is not left depending on that.
    if ((this.#s0 | this.#s1 | this.#s2 | this.#s3) === 0) this.#s0 = 1;
  }

  nextU32(): number {
    const result = (Math.imul(rotl(Math.imul(this.#s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (this.#s1 << 9) >>> 0;
    this.#s2 = (this.#s2 ^ this.#s0) >>> 0;
    this.#s3 = (this.#s3 ^ this.#s1) >>> 0;
    this.#s1 = (this.#s1 ^ this.#s2) >>> 0;
    this.#s0 = (this.#s0 ^ this.#s3) >>> 0;
    this.#s2 = (this.#s2 ^ t) >>> 0;
    this.#s3 = rotl(this.#s3, 11);
    return result;
  }

  /** [0, 1), 53 significant bits, so the float has the resolution a double affords. */
  nextFloat(): number {
    const hi = this.nextU32() >>> 5;
    const lo = this.nextU32() >>> 6;
    return (hi * 67108864 + lo) / 9007199254740992;
  }

  /** Box–Muller. Polar form would reject draws, which makes the stream position depend
   *  on the values drawn; that is harmless but harder to reason about in a replay. */
  nextGaussian(): number {
    if (this.#spare !== null) {
      const spare = this.#spare;
      this.#spare = null;
      return spare;
    }
    // Excluding zero keeps the logarithm finite; the substitution is uniform on (0, 1].
    const u1 = 1 - this.nextFloat();
    const u2 = this.nextFloat();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    this.#spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  }
}

/**
 * The RNG port for one run. It records every name it has been asked for so that the
 * manifest carries the derived seeds (FR-003) without any component having to remember to
 * declare them.
 */
export class SeededRng implements RngPort {
  readonly generatorVersion = GENERATOR_VERSION;
  readonly rootSeed: string;
  readonly #derived = new Map<string, string>();

  constructor(rootSeedHex: string) {
    hexToSeed(rootSeedHex);
    this.rootSeed = rootSeedHex;
  }

  stream(name: string): RandomStream {
    if (name.length === 0) throw new RangeError('a stream name may not be empty');
    let seed = this.#derived.get(name);
    if (seed === undefined) {
      seed = deriveSeed(this.rootSeed, name);
      this.#derived.set(name, seed);
    }
    // A construction, not a lookup: the same name asked for twice replays from the start.
    return new Xoshiro128StarStar(name, seed);
  }

  derivedSeeds(): Readonly<Record<string, string>> {
    return Object.fromEntries([...this.#derived.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  }
}
