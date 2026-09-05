import { describe, expect, it } from 'vitest';
import { createConstantTruthSource } from './constant-truth-source.js';

/**
 * The contract every truth-source implementation must satisfy. Beat 002's HYCOM source
 * runs against this same suite; that is what a port is for.
 */
describe('the truth-source port contract', () => {
  const source = createConstantTruthSource();
  const query = {
    variable: 'temperature',
    lonDeg: -72,
    latDeg: 36,
    depthMetres: 100,
    instantMs: Date.parse('2019-06-02T00:00:00Z'),
  };

  it('is pure: the same query returns the same value', () => {
    expect(source.sample(query)).toBe(source.sample(query));
  });

  it('declares the resolution it was built at, rather than leaving it to be guessed', () => {
    // Review R-2: scoring refuses to make claims below this figure, and a refusal cannot
    // rest on a number the code inferred.
    expect(source.nativeResolutionDegrees).toBeGreaterThan(0);
    expect(Number.isFinite(source.nativeResolutionDegrees)).toBe(true);
  });

  it('states its coverage, in space and in time', () => {
    const coverage = source.coverage();
    expect(coverage.east).toBeGreaterThan(coverage.west);
    expect(coverage.north).toBeGreaterThan(coverage.south);
    expect(coverage.toMs).toBeGreaterThan(coverage.fromMs);
  });

  it('refuses a variable it does not hold rather than returning a plausible number', () => {
    expect(() => source.sample({ ...query, variable: 'salinity' })).toThrow(/no variable/);
  });
});
