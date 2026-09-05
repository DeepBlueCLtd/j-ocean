import type { ClimatologyReference } from './quality-control.js';
import type { FieldContainer } from '../truth/container.js';

/**
 * A climatology reference over a committed artefact.
 *
 * Principle II admits climatology as the one truth-derived quantity a consumer may hold
 * directly, because it is a build-step artefact with its own provenance rather than the truth
 * field at the valid instant. It lives here in beat 004 because the quality checks are its
 * only consumer; beat 005 adds the analysis as a second one.
 *
 * `spreadAt` is the reason this is not a one-line lookup. A departure has to be measured in
 * *something*, and the honest something is the spatial spread of the climatology at that
 * depth -- a figure the artefact can answer for -- rather than a threshold in degrees that
 * somebody chose and nobody rereads.
 */
export function climatologyReferenceOver(container: FieldContainer): ClimatologyReference {
  const lats = container.coordinate('latDegrees');
  const lons = container.coordinate('lonDegrees');
  const depths = container.coordinate('depthMetres');
  const values = container.decode('water_temperature');
  const spreads = new Map<number, number>();

  const nearest = (axis: readonly number[], target: number): number => {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < axis.length; i += 1) {
      const distance = Math.abs((axis[i] as number) - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  };

  return {
    valueAt(lonDeg, latDeg, depthMetres) {
      const plane = nearest(depths, depthMetres) * lats.length * lons.length;
      return values[plane + nearest(lats, latDeg) * lons.length + nearest(lons, lonDeg)] as number;
    },
    spreadAt(depthMetres) {
      const zi = nearest(depths, depthMetres);
      const cached = spreads.get(zi);
      if (cached !== undefined) return cached;
      let n = 0;
      let mean = 0;
      let sumSquares = 0;
      const plane = zi * lats.length * lons.length;
      for (let i = 0; i < lats.length * lons.length; i += 1) {
        const value = values[plane + i] as number;
        if (!Number.isFinite(value)) continue;
        n += 1;
        const delta = value - mean;
        mean += delta / n;
        sumSquares += delta * (value - mean);
      }
      const spread = n > 1 ? Math.sqrt(sumSquares / (n - 1)) : 0;
      spreads.set(zi, spread);
      return spread;
    },
  };
}
