import type { ModelState } from '../ports/kernel.js';
import type { TruthSource } from '../ports/truth-source.js';
import { createField, indexOf } from './grid.js';
import type { ReducedGravityParameters } from './parameters.js';
import type { ReducedGravityKernel } from './reduced-gravity.js';
import { THICKNESS, VELOCITY_U, VELOCITY_V } from './reduced-gravity.js';

/**
 * Initialising the model from the truth record (FR-013).
 *
 * Two declared relations, and the reasons for both.
 *
 * **Thickness from sea-surface height.** In a one-and-a-half layer reduced-gravity model the
 * free surface and the interface are rigidly related: `eta = (g'/g)(h - H)`, so
 * `h = H + (g/g') eta`. With `g' = 0.02` that factor is about 490, which turns a
 * half-metre sea-surface anomaly into a two-hundred-and-fifty-metre interface displacement --
 * which is what a Gulf Stream front actually looks like in a two-layer ocean.
 *
 * The domain mean of the truth's sea-surface height is removed first. A reduced-gravity
 * model has no absolute reference for its free surface, so only the departure from the mean
 * carries information, and keeping the steric offset would put the layer somewhere arbitrary.
 *
 * **Velocity from geostrophy, not from the truth's own velocity.** The spec's FR-013 maps
 * both fields across. This maps the height and then puts the velocity in geostrophic balance
 * with the thickness the model actually holds:
 *
 *     u = -(g'/f) dh/dy,   v = +(g'/f) dh/dx
 *
 * The reason is that the truth's surface velocity contains barotropic, ageostrophic and
 * tidal parts this model has no layer for. Imposing it would launch a gravity-wave shock at
 * step zero and the first day of every forecast would be spent radiating it away. The
 * truth's velocity is not discarded: it is what the initialisation is *checked against*, and
 * `geostrophicAgreement` below is that check, run as a test with its figures printed.
 */

const GRAVITY = 9.80665;

/** Bilinear sampling of the truth field onto the model grid, in the model's own coordinates. */
export interface DomainBox {
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
}

const lonAt = (box: DomainBox, ix: number, nx: number): number =>
  box.west + ((box.east - box.west) * (ix + 0.5)) / nx;
const latAt = (box: DomainBox, iy: number, ny: number): number =>
  box.south + ((box.north - box.south) * (iy + 0.5)) / ny;

/**
 * The box the model's cells are actually laid over.
 *
 * The declared domain box is what was *requested*; the record covers what the source's own
 * grid could give, which is up to one native cell less on each side. The model integrates
 * over the water the record has, and the difference is reported rather than clamped away --
 * a cell whose truth came from an extrapolation would be a cell the harness could not score.
 */
export function effectiveBox(box: DomainBox, coverage: DomainBox): DomainBox {
  return {
    west: Math.max(box.west, coverage.west),
    east: Math.min(box.east, coverage.east),
    south: Math.max(box.south, coverage.south),
    north: Math.min(box.north, coverage.north),
  };
}

export interface InitialisationReport {
  readonly instantMs: number;
  /** The box the cells were laid over, which is the declared box intersected with coverage. */
  readonly box: DomainBox;
  /** How far, in degrees, the record falls short of the declared box on its worst side. */
  readonly shortfallDegrees: number;
  readonly meanSeaSurfaceHeightRemovedMetres: number;
  readonly thicknessRangeMetres: readonly [number, number];
  /** How many cells the truth records as land, and therefore where the mean stood in. */
  readonly landCells: number;
  readonly clampedCells: number;
}

export interface Initialisation {
  readonly state: ModelState;
  readonly report: InitialisationReport;
}

/**
 * Build the model's initial state from the truth source. The model never imports the truth
 * artefact: it is handed a `TruthSource`, which is the port, which is the boundary
 * Principle II is about.
 */
export function initialiseFromTruth(
  kernel: ReducedGravityKernel,
  parameters: ReducedGravityParameters,
  truth: TruthSource,
  box: DomainBox,
  instantMs: number,
  elevationVariable: string,
): Initialisation {
  const { grid } = parameters;
  const coverage = truth.coverage();
  const sampleBox = effectiveBox(box, coverage);
  const shortfallDegrees = Math.max(
    sampleBox.west - box.west,
    box.east - sampleBox.east,
    sampleBox.south - box.south,
    box.north - sampleBox.north,
  );
  const elevation = createField(grid);
  let sum = 0;
  let counted = 0;
  let landCells = 0;

  for (let iy = 0; iy < grid.ny; iy += 1) {
    for (let ix = 0; ix < grid.nx; ix += 1) {
      const value = truth.sample({
        variable: elevationVariable,
        lonDeg: lonAt(sampleBox, ix, grid.nx),
        latDeg: latAt(sampleBox, iy, grid.ny),
        depthMetres: 0,
        instantMs,
      });
      elevation[indexOf(grid, ix, iy)] = value;
      if (Number.isFinite(value)) {
        sum += value;
        counted += 1;
      } else {
        landCells += 1;
      }
    }
  }
  const mean = counted > 0 ? sum / counted : 0;

  // Land takes the domain mean. The alternative -- leaving NaN in a prognostic field -- would
  // make every downstream figure NaN, and this model has no land: it is a box of open ocean
  // with a sponge at its edges, and the shelf corner is inside the sponge.
  const thickness = createField(grid);
  const factor = GRAVITY / parameters.reducedGravity;
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  let clampedCells = 0;
  for (let i = 0; i < thickness.length; i += 1) {
    const anomaly = Number.isFinite(elevation[i] as number) ? (elevation[i] as number) - mean : 0;
    let h = parameters.meanThickness + factor * anomaly;
    if (h < parameters.minimumThickness) {
      h = parameters.minimumThickness;
      clampedCells += 1;
    }
    thickness[i] = h;
    if (h < lowest) lowest = h;
    if (h > highest) highest = h;
  }

  const velocityU = createField(grid);
  const velocityV = createField(grid);
  const centre = (grid.ny - 1) / 2;
  for (let iy = 0; iy < grid.ny; iy += 1) {
    const f = parameters.f0 + parameters.beta * (iy - centre) * grid.cellSizeYMetres;
    for (let ix = 0; ix < grid.nx; ix += 1) {
      const here = indexOf(grid, ix, iy);
      const east = indexOf(grid, Math.min(ix + 1, grid.nx - 1), iy);
      const west = indexOf(grid, Math.max(ix - 1, 0), iy);
      const north = indexOf(grid, ix, Math.min(iy + 1, grid.ny - 1));
      const south = indexOf(grid, ix, Math.max(iy - 1, 0));
      const dhdx = ((thickness[east] as number) - (thickness[west] as number)) / (2 * grid.cellSizeXMetres);
      const dhdy = ((thickness[north] as number) - (thickness[south] as number)) / (2 * grid.cellSizeYMetres);
      velocityU[here] = (-parameters.reducedGravity / f) * dhdy;
      velocityV[here] = (parameters.reducedGravity / f) * dhdx;
    }
  }

  const state = kernel.adopt({ grid, fields: { [THICKNESS]: thickness, [VELOCITY_U]: velocityU, [VELOCITY_V]: velocityV } });
  return {
    state,
    report: {
      instantMs,
      box: sampleBox,
      shortfallDegrees,
      meanSeaSurfaceHeightRemovedMetres: mean,
      thicknessRangeMetres: [lowest, highest],
      landCells,
      clampedCells,
    },
  };
}

export interface GeostrophicAgreement {
  readonly n: number;
  /** Pearson correlation between the initialised velocity and the truth's own surface velocity. */
  readonly correlation: number;
  readonly modelSpeedMean: number;
  readonly truthSpeedMean: number;
}

/**
 * What the truth's own velocity is used for: checking the initialisation rather than
 * imposing it. A geostrophic velocity derived from the sea-surface height should look like
 * the ocean's surface velocity where the flow is balanced -- which across a strong front it
 * largely is -- and this figure says how much.
 */
export function geostrophicAgreement(
  state: ModelState,
  truth: TruthSource,
  box: DomainBox,
  instantMs: number,
  eastVariable: string,
  northVariable: string,
): GeostrophicAgreement {
  const { grid } = state;
  const u = state.fields[VELOCITY_U] as Float64Array;
  const v = state.fields[VELOCITY_V] as Float64Array;

  const sampleBox = effectiveBox(box, truth.coverage());
  const model: number[] = [];
  const observed: number[] = [];
  let modelSpeed = 0;
  let truthSpeed = 0;

  for (let iy = 0; iy < grid.ny; iy += 1) {
    for (let ix = 0; ix < grid.nx; ix += 1) {
      const query = {
        lonDeg: lonAt(sampleBox, ix, grid.nx),
        latDeg: latAt(sampleBox, iy, grid.ny),
        depthMetres: 0,
        instantMs,
      };
      const tu = truth.sample({ ...query, variable: eastVariable });
      const tv = truth.sample({ ...query, variable: northVariable });
      if (!Number.isFinite(tu) || !Number.isFinite(tv)) continue;
      const here = indexOf(grid, ix, iy);
      model.push(u[here] as number, v[here] as number);
      observed.push(tu, tv);
      modelSpeed += Math.hypot(u[here] as number, v[here] as number);
      truthSpeed += Math.hypot(tu, tv);
    }
  }

  const n = model.length;
  const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
  const mm = mean(model);
  const om = mean(observed);
  let covariance = 0;
  let modelVariance = 0;
  let observedVariance = 0;
  for (let i = 0; i < n; i += 1) {
    const a = (model[i] as number) - mm;
    const b = (observed[i] as number) - om;
    covariance += a * b;
    modelVariance += a * a;
    observedVariance += b * b;
  }

  return {
    n,
    correlation: covariance / Math.sqrt(modelVariance * observedVariance),
    modelSpeedMean: modelSpeed / (n / 2),
    truthSpeedMean: truthSpeed / (n / 2),
  };
}
