import type { ThermalStructure } from '../model/parameters.js';
import type { TruthSource } from '../ports/truth-source.js';
import type { FieldContainer } from '../truth/container.js';
import { interfaceFromProfile } from './observation-operator.js';

/**
 * The truth, and the climatology, expressed in the analysis's own state variable.
 *
 * Both artefacts hold temperature; the analysis and the model work in interface depth. The
 * conversion is ADR-0005's operator applied to a whole column, so a forecast, its background,
 * its climatology reference and the truth it is scored against are all in the same units *by
 * the same relation*. Using one relation for the observations and another for the truth would
 * make every skill figure partly a measure of the difference between the two.
 *
 * This lives in `src/instruments/` because the operator does, and because both the analysis
 * ring and the scoring ring need it. It reads truth, which Principle II permits the
 * instruments module to do; what it does not do is produce an `Observation`.
 */

export interface FieldBox {
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
}

export interface FieldGrid {
  readonly nx: number;
  readonly ny: number;
}

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

/**
 * The interface depth implied by a container's temperature column at every model cell.
 * Used for the climatology, which has no time axis.
 */
export function interfaceFieldFromContainer(
  container: FieldContainer,
  structure: ThermalStructure,
  box: FieldBox,
  grid: FieldGrid,
): Float64Array {
  const lats = container.coordinate('latDegrees');
  const lons = container.coordinate('lonDegrees');
  const depths = container.coordinate('depthMetres');
  const values = container.decode('water_temperature');
  const out = new Float64Array(grid.nx * grid.ny);

  for (let iy = 0; iy < grid.ny; iy += 1) {
    const yi = nearest(lats, box.south + ((box.north - box.south) * (iy + 0.5)) / grid.ny);
    for (let ix = 0; ix < grid.nx; ix += 1) {
      const xi = nearest(lons, box.west + ((box.east - box.west) * (ix + 0.5)) / grid.nx);
      const column = depths.map((depthMetres, zi) => ({
        depthMetres,
        requestedDepthMetres: depthMetres,
        value: values[zi * lats.length * lons.length + yi * lons.length + xi] as number,
        flags: [],
      }));
      out[iy * grid.nx + ix] = interfaceFromProfile(column, 0.5, structure).depthMetres ?? Number.NaN;
    }
  }
  return out;
}

/**
 * The same, from the truth source at an instant. This is what scoring compares a forecast
 * against, and the reason it goes through the port rather than the artefact is Principle II:
 * scoring reads truth to compare after the fact, and it does so through the same interface
 * everything else does.
 */
export function interfaceFieldFromTruth(
  truth: TruthSource,
  structure: ThermalStructure,
  box: FieldBox,
  grid: FieldGrid,
  instantMs: number,
  variable = 'water_temperature',
): Float64Array {
  const depths = 'depthLevelsMetres' in truth ? (truth as { depthLevelsMetres(): readonly number[] }).depthLevelsMetres() : [];
  const out = new Float64Array(grid.nx * grid.ny);

  for (let iy = 0; iy < grid.ny; iy += 1) {
    const latDeg = box.south + ((box.north - box.south) * (iy + 0.5)) / grid.ny;
    for (let ix = 0; ix < grid.nx; ix += 1) {
      const lonDeg = box.west + ((box.east - box.west) * (ix + 0.5)) / grid.nx;
      const column = depths.map((depthMetres) => ({
        depthMetres,
        requestedDepthMetres: depthMetres,
        value: truth.sample({ variable, lonDeg, latDeg, depthMetres, instantMs }),
        flags: [],
      }));
      out[iy * grid.nx + ix] = interfaceFromProfile(column, 0.5, structure).depthMetres ?? Number.NaN;
    }
  }
  return out;
}
