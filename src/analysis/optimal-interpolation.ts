import type { Configuration } from '../config/schema.js';
import type { GridSpec } from '../ports/kernel.js';
import { indexOf } from '../model/grid.js';
import { isUsable, type Observation } from '../instruments/observation.js';
import { makeAttribution, weightsAt, type Attribution, type CellWeights } from './attribution.js';

/**
 * Optimal interpolation (FR-16, review R-7, ADR-0006).
 *
 *     x_a = x_p + K (y - H x_p),      K = B H^T (H B H^T + R)^-1
 *
 * with `x_p` the declared blend of the advected background and the climatology, `B` an
 * isotropic Gaussian covariance with a declared length scale and variance, `R` diagonal from
 * each observation's own declared error, and `H` selecting the cell an observation sits in.
 *
 * **Why the weights are exact rather than estimated.** Rewriting the analysis as
 *
 *     x_a = (I - K H) x_p + K y
 *
 * and noting that `H` selects one cell per observation, so `H·1 = 1`, gives
 *
 *     sum_k (I - K H)_ik + sum_j K_ij = 1
 *
 * at every cell. The row sum of `K` *is* the weight the observations carried there, and one
 * minus it is the weight the prior carried, which the declared blend splits between
 * background and climatology. Nothing is estimated, smoothed or painted: the attribution
 * field is that arithmetic, exported from the same computation as the answer (Principle IV).
 */

export interface AnalysisInputs {
  readonly config: Configuration;
  readonly grid: GridSpec;
  /** The model's field at the analysis instant, in the analysis's state variable. */
  readonly background: Float64Array;
  /** The long-run mean in the same variable, for the declared prior blend. */
  readonly climatology: Float64Array;
  /** Everything the instruments produced. Flagged ones are excluded here and recorded. */
  readonly observations: readonly Observation[];
}

export interface ExcludedObservation {
  readonly id: string;
  readonly reason: string;
  readonly flags: readonly string[];
}

export interface UsedObservation {
  readonly id: string;
  readonly observation: Observation;
  readonly cellIndex: number;
  readonly errorSd: number;
  /** True where the observation was a one-sided bound admitted with inflated error. */
  readonly fromBound: boolean;
}

export interface CellBreakdown extends CellWeights {
  readonly cellIndex: number;
  /** Per-observation shares, largest first. They sum to the cell's observation weight. */
  readonly shares: readonly { readonly id: string; readonly share: number }[];
}

export interface InfluenceRegion {
  /** This observation's weight in every cell. */
  readonly field: Float64Array;
  readonly peak: number;
  /** Cells above the declared threshold, and the farthest of them from the observation. */
  readonly cellsAboveThreshold: number;
  readonly radiusKilometres: number;
}

export interface AnalysisRecord {
  readonly grid: GridSpec;
  /** The analysed field, in the analysis's state variable. */
  readonly field: Float64Array;
  readonly attribution: Attribution;
  readonly used: readonly UsedObservation[];
  readonly excluded: readonly ExcludedObservation[];
  /** The declared length scale, so a figure drawn from it can say where it came from. */
  readonly lengthScaleKilometres: number;
  breakdownAt(cellIndex: number): CellBreakdown;
  influenceOf(observationId: string): InfluenceRegion;
  /** For the test that recomputes the weights independently (SC-001). */
  gainColumn(observationIndex: number): Float64Array;
}

const KILOMETRE = 1000;

/** Cell centres in metres, so distances are the grid's own and not degrees pretending. */
function cellPosition(grid: GridSpec, index: number): [number, number] {
  const ix = index % grid.nx;
  const iy = Math.floor(index / grid.nx);
  return [(ix + 0.5) * grid.cellSizeXMetres, (iy + 0.5) * grid.cellSizeYMetres];
}

/** Which cell an observation sits in, given the box the grid is laid over. */
export function cellOf(
  grid: GridSpec,
  box: { west: number; east: number; south: number; north: number },
  lonDeg: number,
  latDeg: number,
): number {
  const fx = ((lonDeg - box.west) / (box.east - box.west)) * grid.nx;
  const fy = ((latDeg - box.south) / (box.north - box.south)) * grid.ny;
  const ix = Math.max(0, Math.min(grid.nx - 1, Math.floor(fx)));
  const iy = Math.max(0, Math.min(grid.ny - 1, Math.floor(fy)));
  return indexOf(grid, ix, iy);
}

/** Cholesky solve of a small dense symmetric positive-definite system, in place. */
function choleskyInverse(matrix: Float64Array, m: number): Float64Array {
  const l = new Float64Array(m * m);
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = matrix[i * m + j] as number;
      for (let k = 0; k < j; k += 1) sum -= (l[i * m + k] as number) * (l[j * m + k] as number);
      if (i === j) {
        if (sum <= 0) throw new RangeError('the observation covariance is not positive definite');
        l[i * m + j] = Math.sqrt(sum);
      } else {
        l[i * m + j] = sum / (l[j * m + j] as number);
      }
    }
  }

  // Invert by solving L L^T X = I one column at a time.
  const inverse = new Float64Array(m * m);
  const y = new Float64Array(m);
  for (let column = 0; column < m; column += 1) {
    for (let i = 0; i < m; i += 1) {
      let sum = i === column ? 1 : 0;
      for (let k = 0; k < i; k += 1) sum -= (l[i * m + k] as number) * (y[k] as number);
      y[i] = sum / (l[i * m + i] as number);
    }
    for (let i = m - 1; i >= 0; i -= 1) {
      let sum = y[i] as number;
      for (let k = i + 1; k < m; k += 1) sum -= (l[k * m + i] as number) * (inverse[k * m + column] as number);
      inverse[i * m + column] = sum / (l[i * m + i] as number);
    }
  }
  return inverse;
}

export function analyse(
  inputs: AnalysisInputs,
  box: { west: number; east: number; south: number; north: number },
): AnalysisRecord {
  const { config, grid, background, climatology } = inputs;
  const settings = config.analysis;
  const n = grid.nx * grid.ny;
  const lengthScaleMetres = settings.correlationLengthScaleKilometres * KILOMETRE;
  const variance = settings.backgroundErrorStandardDeviationMetres ** 2;
  const b = settings.priorBackgroundWeight;

  // The prior: the declared blend. With no observations this is the whole answer, and the
  // weights are exactly (b, 1 - b, 0), which is what the spec's first scenario asks for.
  const prior = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const clim = climatology[i] as number;
    prior[i] = Number.isFinite(clim)
      ? b * (background[i] as number) + (1 - b) * clim
      : (background[i] as number);
  }

  const used: UsedObservation[] = [];
  const excluded: ExcludedObservation[] = [];
  for (const observation of inputs.observations) {
    if (observation.kind !== 'interface-depth') {
      excluded.push({
        id: observation.id,
        reason:
          `this analysis works in ${settings.stateVariable}; a ${observation.kind} observation ` +
          'does not constrain it directly and enters only through the observation operator',
        flags: observation.flags.map((flag) => flag.code),
      });
      continue;
    }
    if (!isUsable(observation)) {
      excluded.push({
        id: observation.id,
        reason: observation.flags.map((flag) => flag.detail).join('; '),
        flags: observation.flags.map((flag) => flag.code),
      });
      continue;
    }
    const fromBound = observation.bound !== undefined;
    const value = fromBound ? observation.bound?.depthMetres ?? observation.value : observation.value;
    if (!Number.isFinite(value) || !Number.isFinite(observation.error.totalSd)) {
      excluded.push({
        id: observation.id,
        reason: 'the observation has no finite value or no finite error',
        flags: observation.flags.map((flag) => flag.code),
      });
      continue;
    }
    // The formal error the operator propagated is what the *instrument* could not know. It
    // is not what the observation is worth to a grid of 4.5 km cells: a point sounding of the
    // thermocline differs from a cell's mean interface depth by tens of metres of mesoscale
    // variability that no thermometer could have resolved. The declared representativeness
    // is added in quadrature, and without it the analysis believes an interface observation
    // fifty times more than the background and the gain falls apart (see the plan).
    const representativeness = settings.interfaceRepresentativenessMetres;
    const formal = observation.error.totalSd * (fromBound ? settings.boundErrorInflationFactor : 1);
    used.push({
      id: observation.id,
      observation,
      cellIndex: cellOf(grid, box, observation.lonDeg, observation.latDeg),
      errorSd: Math.hypot(formal, representativeness),
      fromBound,
    });
  }

  const m = used.length;
  const field = new Float64Array(prior);
  const observationWeight = new Float64Array(n);
  const backgroundWeight = new Float64Array(n);
  const climatologyWeight = new Float64Array(n);
  let gain = new Float64Array(0);

  if (m > 0) {
    // B H^T: the covariance between every cell and every observation's cell.
    const bht = new Float64Array(n * m);
    for (let j = 0; j < m; j += 1) {
      const [ox, oy] = cellPosition(grid, (used[j] as UsedObservation).cellIndex);
      for (let i = 0; i < n; i += 1) {
        const [x, y] = cellPosition(grid, i);
        const d2 = (x - ox) ** 2 + (y - oy) ** 2;
        bht[i * m + j] = variance * Math.exp(-d2 / (2 * lengthScaleMetres * lengthScaleMetres));
      }
    }

    // H B H^T + R.
    const system = new Float64Array(m * m);
    for (let i = 0; i < m; i += 1) {
      const [xi, yi] = cellPosition(grid, (used[i] as UsedObservation).cellIndex);
      for (let j = 0; j < m; j += 1) {
        const [xj, yj] = cellPosition(grid, (used[j] as UsedObservation).cellIndex);
        const d2 = (xi - xj) ** 2 + (yi - yj) ** 2;
        system[i * m + j] = variance * Math.exp(-d2 / (2 * lengthScaleMetres * lengthScaleMetres));
      }
      const sd = (used[i] as UsedObservation).errorSd;
      system[i * m + i] = (system[i * m + i] as number) + sd * sd;
    }

    const inverse = choleskyInverse(system, m);

    // K = (B H^T) (H B H^T + R)^-1.
    gain = new Float64Array(n * m);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < m; j += 1) {
        let sum = 0;
        for (let k = 0; k < m; k += 1) sum += (bht[i * m + k] as number) * (inverse[k * m + j] as number);
        gain[i * m + j] = sum;
      }
    }

    // The innovation, and the analysis.
    const innovation = new Float64Array(m);
    for (let j = 0; j < m; j += 1) {
      const entry = used[j] as UsedObservation;
      const value = entry.fromBound
        ? entry.observation.bound?.depthMetres ?? entry.observation.value
        : entry.observation.value;
      innovation[j] = value - (prior[entry.cellIndex] as number);
    }
    for (let i = 0; i < n; i += 1) {
      let increment = 0;
      let rowSum = 0;
      for (let j = 0; j < m; j += 1) {
        increment += (gain[i * m + j] as number) * (innovation[j] as number);
        rowSum += gain[i * m + j] as number;
      }
      field[i] = (prior[i] as number) + increment;
      observationWeight[i] = rowSum;
    }
  }

  // Clamp and renormalise, and count it. Slightly negative weights are a real consequence of
  // inverting a covariance matrix; hiding them would be worse than reporting them.
  let clampedCells = 0;
  for (let i = 0; i < n; i += 1) {
    let w = observationWeight[i] as number;
    if (w < 0 || w > 1) {
      clampedCells += 1;
      w = Math.max(0, Math.min(1, w));
      observationWeight[i] = w;
    }
    backgroundWeight[i] = (1 - w) * b;
    climatologyWeight[i] = (1 - w) * (1 - b);
  }

  const attribution = makeAttribution({
    nx: grid.nx,
    ny: grid.ny,
    observationWeight,
    backgroundWeight,
    climatologyWeight,
    clampedCells,
  });

  return {
    grid,
    field,
    attribution,
    used,
    excluded,
    lengthScaleKilometres: settings.correlationLengthScaleKilometres,

    breakdownAt(cellIndex) {
      const shares = used
        .map((entry, j) => ({ id: entry.id, share: (gain[cellIndex * m + j] as number) ?? 0 }))
        .filter((entry) => Math.abs(entry.share) > 0)
        .sort((a, b2) => b2.share - a.share);
      return { cellIndex, ...weightsAt(attribution, cellIndex), shares };
    },

    influenceOf(observationId) {
      const j = used.findIndex((entry) => entry.id === observationId);
      if (j === -1) throw new RangeError(`${observationId} did not enter this analysis`);
      const column = new Float64Array(n);
      let peak = 0;
      let above = 0;
      let farthest = 0;
      const [ox, oy] = cellPosition(grid, (used[j] as UsedObservation).cellIndex);
      for (let i = 0; i < n; i += 1) {
        const value = gain[i * m + j] as number;
        column[i] = value;
        if (value > peak) peak = value;
        if (value > config.analysis.influenceThreshold) {
          above += 1;
          const [x, y] = cellPosition(grid, i);
          farthest = Math.max(farthest, Math.hypot(x - ox, y - oy));
        }
      }
      return {
        field: column,
        peak,
        cellsAboveThreshold: above,
        radiusKilometres: farthest / KILOMETRE,
      };
    },

    gainColumn(observationIndex) {
      const column = new Float64Array(n);
      for (let i = 0; i < n; i += 1) column[i] = gain[i * m + observationIndex] as number;
      return column;
    },
  };
}
