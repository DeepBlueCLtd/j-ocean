import type { TruthCoverage, TruthQuery, TruthSource } from '../../src/ports/truth-source.js';

/**
 * A constant-field truth source, for the truth-source contract test of beat 001 only
 * (spec 001, Assumptions). Beat 002 implements the port over the committed HYCOM subset;
 * this is a test double and lives under `tests/` so that it can never be reached from
 * `src/`.
 */
export function createConstantTruthSource(value = 17.5): TruthSource {
  const coverage: TruthCoverage = {
    west: -75,
    east: -70,
    south: 34,
    north: 39,
    fromMs: Date.parse('2019-06-01T00:00:00Z'),
    toMs: Date.parse('2019-06-15T00:00:00Z'),
  };
  return {
    id: 'constant/1',
    nativeResolutionDegrees: 1 / 12,
    variables: ['temperature'],
    coverage: () => coverage,
    sample(query: TruthQuery): number {
      if (!this.variables.includes(query.variable)) {
        throw new RangeError(`this source has no variable ${query.variable}`);
      }
      return value;
    },
  };
}
