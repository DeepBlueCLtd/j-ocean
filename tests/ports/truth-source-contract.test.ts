import { describe, expect, it } from 'vitest';
import type { TruthQuery, TruthSource } from '../../src/ports/truth-source.js';
import { createConstantTruthSource } from './constant-truth-source.js';
import { WATER_TEMPERATURE } from '../../src/truth/artefact-truth-source.js';
import { truthSource } from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';

/**
 * The contract every truth-source implementation must satisfy.
 *
 * It runs against both implementations: beat 001's constant field, and beat 002's real
 * source over the committed HYCOM artefact. That is what a port is for, and running the
 * suite against only the test double would prove nothing about the one that ships.
 */
const implementations: readonly { name: string; source: TruthSource; query: TruthQuery }[] = [
  {
    name: 'the constant field (a test double)',
    source: createConstantTruthSource(),
    query: {
      variable: 'temperature',
      lonDeg: -72,
      latDeg: 36,
      depthMetres: 100,
      instantMs: Date.parse('2019-06-02T00:00:00Z'),
    },
  },
  (() => {
    const { config } = declaredConfiguration();
    const artefact = truthSource(config.domains.defaultId);
    const coverage = artefact.coverage();
    return {
      name: 'the committed HYCOM artefact',
      source: artefact,
      query: {
        variable: WATER_TEMPERATURE,
        lonDeg: (coverage.west + coverage.east) / 2,
        latDeg: (coverage.south + coverage.north) / 2,
        depthMetres: 100,
        instantMs: coverage.fromMs,
      },
    };
  })(),
];

describe.each(implementations)('the truth-source port contract: $name', ({ source, query }) => {

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
    expect(() => source.sample({ ...query, variable: 'a-variable-no-source-holds' })).toThrow(
      /no variable/,
    );
  });
});
