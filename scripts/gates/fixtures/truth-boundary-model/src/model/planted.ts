// Planted violation for gate G-02, the other importer the constitution names. This is not a
// hypothetical: beat 003 put `initialiseFromTruth` under src/model/, where it held the
// truth-source port, and writing this gate is what made that visible. It lives in src/run/
// now, which satisfies FR-013 ("initialisation goes through the port") and Principle II
// ("the model imports neither the truth port nor the scoring module") at the same time.
import type { TruthSource } from '../ports/truth-source.js';

export function initialise(truth: TruthSource): number {
  return truth.sample({ variable: 'surface_elevation', lonDeg: -72, latDeg: 36, depthMetres: 0, instantMs: 0 });
}
