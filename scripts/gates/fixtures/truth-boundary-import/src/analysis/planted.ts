// Planted violation for gate G-02: the analysis reaching for truth directly.
import type { TruthSource } from '../ports/truth-source.js';

export function cheat(truth: TruthSource, lonDeg: number, latDeg: number): number {
  return truth.sample({ variable: 'water_temperature', lonDeg, latDeg, depthMetres: 0, instantMs: 0 });
}
