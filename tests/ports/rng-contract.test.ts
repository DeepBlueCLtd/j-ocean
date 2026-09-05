import { describe, expect, it } from 'vitest';
import { SeededRng, GENERATOR_VERSION } from '../../src/run/rng.js';
import { deriveSeed } from '../../src/run/seeds.js';

const ROOT = '6a09e667f3bcc908';

/** The contract every RNG port implementation must satisfy (FR-003). */
describe('the RNG port contract', () => {
  it('draws the same sequence from the same root seed', () => {
    const a = new SeededRng(ROOT).stream('alpha');
    const b = new SeededRng(ROOT).stream('alpha');
    const drawsA = Array.from({ length: 32 }, () => a.nextU32());
    const drawsB = Array.from({ length: 32 }, () => b.nextU32());
    expect(drawsA).toEqual(drawsB);
  });

  it('draws differently from a different root seed', () => {
    const a = new SeededRng(ROOT).stream('alpha');
    const b = new SeededRng('0000000000000001').stream('alpha');
    expect(Array.from({ length: 8 }, () => a.nextU32())).not.toEqual(
      Array.from({ length: 8 }, () => b.nextU32()),
    );
  });

  it('gives independent streams to different names', () => {
    const rng = new SeededRng(ROOT);
    const alpha = rng.stream('alpha');
    const beta = rng.stream('beta');
    expect(Array.from({ length: 8 }, () => alpha.nextU32())).not.toEqual(
      Array.from({ length: 8 }, () => beta.nextU32()),
    );
  });

  /**
   * The property the whole design turns on: a component's values do not depend on whether
   * another component drew first. A single generator handed out to callers fails this.
   */
  it('makes a stream independent of any other stream draw order', () => {
    const alphaOnItsOwn = new SeededRng(ROOT).stream('alpha');
    const alphaAlone = Array.from({ length: 16 }, () => alphaOnItsOwn.nextU32());

    const second = new SeededRng(ROOT);
    const beta = second.stream('beta');
    for (let i = 0; i < 500; i += 1) beta.nextU32();
    const alphaAfter = second.stream('alpha');
    expect(Array.from({ length: 16 }, () => alphaAfter.nextU32())).toEqual(alphaAlone);
  });

  it('replays a name from the start rather than continuing it', () => {
    const rng = new SeededRng(ROOT);
    const once = rng.stream('alpha');
    const firstFour = Array.from({ length: 4 }, () => once.nextU32());
    const again = rng.stream('alpha');
    expect(Array.from({ length: 4 }, () => again.nextU32())).toEqual(firstFour);
  });

  it('records every derived seed it has been asked for, in name order', () => {
    const rng = new SeededRng(ROOT);
    rng.stream('zulu');
    rng.stream('alpha');
    expect(rng.derivedSeeds()).toEqual({
      alpha: deriveSeed(ROOT, 'alpha'),
      zulu: deriveSeed(ROOT, 'zulu'),
    });
    expect(Object.keys(rng.derivedSeeds())).toEqual(['alpha', 'zulu']);
  });

  it('names its generator so that a manifest can refuse a mismatch', () => {
    expect(new SeededRng(ROOT).generatorVersion).toBe(GENERATOR_VERSION);
    expect(GENERATOR_VERSION).toMatch(/\/\d+$/);
  });

  it('refuses a seed that is not sixteen lowercase hex characters', () => {
    expect(() => new SeededRng('nope')).toThrow(/sixteen lowercase hex/);
    expect(() => new SeededRng('6A09E667F3BCC908')).toThrow(/sixteen lowercase hex/);
  });

  it('produces floats in [0, 1) and gaussians of about the right shape', () => {
    const stream = new SeededRng(ROOT).stream('statistics');
    let sum = 0;
    let sumSquares = 0;
    const n = 20_000;
    for (let i = 0; i < n; i += 1) {
      const u = stream.nextFloat();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
    for (let i = 0; i < n; i += 1) {
      const g = stream.nextGaussian();
      sum += g;
      sumSquares += g * g;
    }
    // Wide tolerances: this test exists to catch a generator that is broken, not to be a
    // statistical assessment of one. The figures are deterministic, so it cannot flake.
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
    expect(Math.abs(sumSquares / n - 1)).toBeLessThan(0.05);
  });
});
