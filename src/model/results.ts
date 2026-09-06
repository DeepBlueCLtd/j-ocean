import type { GridSpec, ModelState } from '../ports/kernel.js';
import { cellCount } from './grid.js';
import type { ReducedGravityParameters, StabilityAssessment } from './parameters.js';
import { diagnoseProfile, type DiagnosedProfile } from './profile.js';
import {
  THICKNESS,
  VELOCITY_U,
  VELOCITY_V,
  clampedThickness,
  outcropCount,
  spongeWeights,
} from './reduced-gravity.js';

/**
 * The published results interface (FR-005, constitution III).
 *
 * The harness reads this and nothing else. Every field it hands out is a **copy**: the
 * integration buffers are not reachable through it, so a harness that wanted to reach into
 * integration state would have to change this file, which is a review, not an accident.
 *
 * Copying a hundred by hundred field is forty kilobytes and a fraction of a millisecond. The
 * boundary is worth more than that.
 */

export interface Invariants {
  /** The volume of the upper layer. Continuity conserves it exactly, up to the sponge. */
  readonly upperLayerVolumeCubicMetres: number;
  /** Available potential plus kinetic energy, in joules per unit density. */
  readonly totalEnergy: number;
  readonly kineticEnergy: number;
  readonly availablePotentialEnergy: number;
}

export interface ModelResults {
  readonly grid: GridSpec;
  /** Sea-surface height, from the layer thickness by the reduced-gravity relation. */
  seaSurfaceHeightMetres(): Float64Array;
  thicknessMetres(): Float64Array;
  velocityU(): Float64Array;
  velocityV(): Float64Array;
  /** The margin scoring must exclude, in cells and as a per-cell weight (FR-012). */
  readonly spongeWidthCells: number;
  spongeWeight(): Float64Array;
  invariants(): Invariants;
  /** How many times the outcrop clamp fired. A run with a non-zero count says so. */
  readonly outcrops: number;
  /** And how much water it added, in cubic metres. Every cubic metre of drift is accounted for. */
  readonly clampedVolumeCubicMetres: number;
  profileAt(lonIndex: number, latIndex: number): DiagnosedProfile;
  readonly stability: StabilityAssessment;
  readonly referenceLatitudeDegrees: number;
}

/** Earth gravity, for turning layer thickness into the surface height a reader recognises. */
const GRAVITY = 9.80665;

/**
 * The reduced-gravity relation, and the reason the domain mean is removed: a reduced-gravity
 * model has no absolute reference for its free surface, so only the departure from the mean
 * means anything. The same relation, inverted, initialises the model from truth.
 */
export function seaSurfaceHeightFrom(
  thickness: Float64Array,
  parameters: ReducedGravityParameters,
): Float64Array {
  const out = new Float64Array(thickness.length);
  let mean = 0;
  for (let i = 0; i < thickness.length; i += 1) mean += thickness[i] as number;
  mean /= thickness.length;
  const scale = parameters.reducedGravity / GRAVITY;
  for (let i = 0; i < thickness.length; i += 1) out[i] = scale * ((thickness[i] as number) - mean);
  return out;
}

export function invariantsOf(state: ModelState, parameters: ReducedGravityParameters): Invariants {
  const h = state.fields[THICKNESS] as Float64Array;
  const u = state.fields[VELOCITY_U] as Float64Array;
  const v = state.fields[VELOCITY_V] as Float64Array;
  const area = state.grid.cellSizeXMetres * state.grid.cellSizeYMetres;

  let volume = 0;
  let kinetic = 0;
  let potential = 0;
  for (let i = 0; i < h.length; i += 1) {
    const thickness = h[i] as number;
    volume += thickness * area;
    kinetic += 0.5 * thickness * ((u[i] as number) ** 2 + (v[i] as number) ** 2) * area;
    const departure = thickness - parameters.meanThickness;
    potential += 0.5 * parameters.reducedGravity * departure * departure * area;
  }
  return {
    upperLayerVolumeCubicMetres: volume,
    kineticEnergy: kinetic,
    availablePotentialEnergy: potential,
    totalEnergy: kinetic + potential,
  };
}

export function publishResults(
  state: ModelState,
  parameters: ReducedGravityParameters,
  stability: StabilityAssessment,
): ModelResults {
  const copy = (name: string): Float64Array => (state.fields[name] as Float64Array).slice();
  return {
    grid: state.grid,
    seaSurfaceHeightMetres: () => seaSurfaceHeightFrom(state.fields[THICKNESS] as Float64Array, parameters),
    thicknessMetres: () => copy(THICKNESS),
    velocityU: () => copy(VELOCITY_U),
    velocityV: () => copy(VELOCITY_V),
    spongeWidthCells: parameters.spongeWidthCells,
    spongeWeight: () => (spongeWeights(state) ?? new Float64Array(cellCount(state.grid))).slice(),
    invariants: () => invariantsOf(state, parameters),
    outcrops: outcropCount(state),
    clampedVolumeCubicMetres:
      clampedThickness(state) * state.grid.cellSizeXMetres * state.grid.cellSizeYMetres,
    profileAt: (lonIndex, latIndex) =>
      diagnoseProfile(state, lonIndex, latIndex, parameters.thermalStructure),
    stability,
    referenceLatitudeDegrees: parameters.referenceLatitudeDegrees,
  };
}
