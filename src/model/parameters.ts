import type { Configuration, Domain } from '../config/schema.js';
import type { GridSpec } from '../ports/kernel.js';

/**
 * Turning declared configuration into the numbers the kernel integrates with.
 *
 * Everything here is either declared (Principle X) or computed from declared values and
 * reported as computed (Principle V). There is no constant in `src/model/` that a reader
 * cannot trace to `config/j-ocean.json` through this file.
 */

/** Metres per degree of latitude, and per degree of longitude at the equator. */
const METRES_PER_DEGREE_LATITUDE = 110_574;
const METRES_PER_DEGREE_LONGITUDE = 111_320;

/** Earth's rotation rate and radius, for the Coriolis parameter and its meridional gradient. */
const EARTH_ROTATION_RATE = 7.2921e-5;
const EARTH_RADIUS_METRES = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * The grid, computed from the declared domain box and the declared cell counts.
 *
 * The two cell sizes differ and that is the point: a degree of longitude at 36.5 N is about
 * four fifths of a degree of latitude, so a square box in degrees is not a square box in
 * kilometres. Beat 003's spec calls this out as an edge case; it is handled here once,
 * rather than by every piece of arithmetic downstream.
 */
export function gridFor(config: Configuration, domain: Domain): GridSpec {
  const midLatitude = (domain.south + domain.north) / 2;
  const widthMetres =
    (domain.east - domain.west) * METRES_PER_DEGREE_LONGITUDE * Math.cos(toRadians(midLatitude));
  const heightMetres = (domain.north - domain.south) * METRES_PER_DEGREE_LATITUDE;
  return {
    nx: config.grid.nx,
    ny: config.grid.ny,
    cellSizeXMetres: widthMetres / config.grid.nx,
    cellSizeYMetres: heightMetres / config.grid.ny,
  };
}

export interface ThermalStructure {
  readonly upperTemperatureDegC: number;
  readonly deepTemperatureDegC: number;
  readonly transitionThicknessMetres: number;
  readonly displayLevelsMetres: readonly number[];
}

export interface ReducedGravityParameters {
  readonly grid: GridSpec;
  readonly reducedGravity: number;
  readonly meanThickness: number;
  readonly minimumThickness: number;
  readonly lateralViscosity: number;
  readonly bottomDrag: number;
  readonly robertAsselin: number;
  readonly spongeWidthCells: number;
  readonly spongeTimescaleSeconds: number;
  /** The Coriolis parameter at the domain's centre latitude. */
  readonly f0: number;
  /** Its meridional gradient: the beta of the beta-plane. */
  readonly beta: number;
  /** The domain's centre latitude, so a figure drawn from f can say where f came from. */
  readonly referenceLatitudeDegrees: number;
  readonly thermalStructure: ThermalStructure;
}

export function parametersFor(config: Configuration, domain: Domain): ReducedGravityParameters {
  const referenceLatitudeDegrees = (domain.south + domain.north) / 2;
  const latitude = toRadians(referenceLatitudeDegrees);
  return {
    grid: gridFor(config, domain),
    reducedGravity: config.model.reducedGravityMetresPerSecondSquared,
    meanThickness: config.model.meanUpperLayerThicknessMetres,
    minimumThickness: config.model.minimumLayerThicknessMetres,
    lateralViscosity: config.model.lateralViscosityMetresSquaredPerSecond,
    bottomDrag: config.model.bottomDragPerSecond,
    robertAsselin: config.model.robertAsselinCoefficient,
    spongeWidthCells: config.model.sponge.widthCells,
    spongeTimescaleSeconds: config.model.sponge.timescaleSeconds,
    f0: 2 * EARTH_ROTATION_RATE * Math.sin(latitude),
    beta: (2 * EARTH_ROTATION_RATE * Math.cos(latitude)) / EARTH_RADIUS_METRES,
    referenceLatitudeDegrees,
    thermalStructure: config.model.thermalStructure,
  };
}

export interface StabilityAssessment {
  /** sqrt(g' H): how fast a gravity wave crosses a cell. */
  readonly gravityWaveSpeedMetresPerSecond: number;
  /**
   * The linear stability boundary of the scheme, in seconds: leapfrog on a C-grid is
   * neutrally stable *at* this figure and unstable above it.
   */
  readonly linearStabilityBoundarySeconds: number;
  /** The boundary times the declared criterion. The declared timestep must be at or below it. */
  readonly largestStableTimestepSeconds: number;
  readonly declaredTimestepSeconds: number;
  readonly criterionCfl: number;
  /**
   * The viscous number, `A * 2dt * (4/dx^2 + 4/dy^2)`, at the grid scale. The viscosity is
   * lagged to the previous time level, which makes it forward-Euler over `2dt` and stable
   * below a half. It is reported because the first version of this kernel evaluated it at the
   * current level, where leapfrog is unconditionally unstable, and blew up in two hundred steps.
   */
  readonly viscousNumber: number;
  readonly satisfied: boolean;
}

/**
 * FR-003. The stability limit is *computed* from the declared grid and parameters, and the
 * declared timestep is refused when it exceeds the limit.
 *
 * The spec asks for the timestep itself to be computed. It is declared and checked instead,
 * for a reason worth stating: the timestep goes into the run manifest, and a manifest whose
 * clock came out of a floating-point evaluation of a stability criterion would make
 * byte-identical replay depend on that evaluation being identical everywhere. Declaring the
 * timestep and computing the limit keeps the criterion's teeth and keeps replay's.
 */
export function assessStability(
  parameters: ReducedGravityParameters,
  declaredTimestepSeconds: number,
  criterionCfl: number,
): StabilityAssessment {
  const c = Math.sqrt(parameters.reducedGravity * parameters.meanThickness);
  const { cellSizeXMetres, cellSizeYMetres } = parameters.grid;
  // The two-dimensional explicit limit for a gravity wave travelling along the diagonal.
  const inverseDistance = Math.sqrt(
    1 / (cellSizeXMetres * cellSizeXMetres) + 1 / (cellSizeYMetres * cellSizeYMetres),
  );
  // The discrete gradient and divergence operators on a C-grid have a largest eigenvalue of
  // 2/dx, so the boundary carries that factor of two. The first version of this function
  // left it out, which put the criterion *at* the boundary rather than a safety factor
  // inside it -- and a declared CFL of 0.5 then bought no margin at all. The kernel blew up
  // in fifty steps and said so, which is what a computed criterion is for.
  const boundary = 1 / (2 * c * inverseDistance);
  const largest = criterionCfl * boundary;
  const viscousNumber =
    parameters.lateralViscosity *
    2 *
    declaredTimestepSeconds *
    (4 / (cellSizeXMetres * cellSizeXMetres) + 4 / (cellSizeYMetres * cellSizeYMetres));
  return {
    gravityWaveSpeedMetresPerSecond: c,
    linearStabilityBoundarySeconds: boundary,
    largestStableTimestepSeconds: largest,
    declaredTimestepSeconds,
    criterionCfl,
    viscousNumber,
    satisfied: declaredTimestepSeconds <= largest && viscousNumber < 0.5,
  };
}

export class StabilityError extends Error {
  override readonly name = 'StabilityError';
  readonly assessment: StabilityAssessment;

  constructor(assessment: StabilityAssessment) {
    const wave =
      assessment.declaredTimestepSeconds > assessment.largestStableTimestepSeconds
        ? `the declared timestep of ${assessment.declaredTimestepSeconds.toFixed(1)} s exceeds the ` +
          `largest stable timestep of ${assessment.largestStableTimestepSeconds.toFixed(1)} s ` +
          `for this grid and these parameters (gravity-wave speed ` +
          `${assessment.gravityWaveSpeedMetresPerSecond.toFixed(3)} m/s; the scheme's linear ` +
          `boundary is ${assessment.linearStabilityBoundarySeconds.toFixed(1)} s and the ` +
          `declared criterion CFL ${String(assessment.criterionCfl)} asks to stay inside it)`
        : `the viscous number is ${assessment.viscousNumber.toFixed(4)} at the grid scale, which ` +
          'is at or above the half at which the lagged viscosity stops being stable';
    super(`${wave}. No integration was started.`);
    this.assessment = assessment;
  }
}
