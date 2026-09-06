import type { GridSpec, ModelKernel, ModelState, StepContext } from '../ports/kernel.js';
import type { RandomStream } from '../ports/rng.js';
import { createField, indexOf, wrap } from './grid.js';
import type { ReducedGravityParameters } from './parameters.js';

/**
 * The one-and-a-half layer reduced-gravity model (FR-05, ADR-0001).
 *
 * An active upper layer of thickness `h` over a motionless deep layer, on an Arakawa C-grid,
 * integrated by leapfrog with a Robert-Asselin filter. Three prognostic fields, all typed
 * arrays, and nothing in this file imports anything that draws.
 *
 * **The scheme.** Momentum is written in vector-invariant form, which is what makes the
 * nonlinear terms conserve energy rather than merely approximate it:
 *
 *     du/dt = + q (h v)~ - d/dx (g' h + K) + viscosity - drag
 *     dv/dt = - q (h u)~ - d/dy (g' h + K) + viscosity - drag
 *     dh/dt = - d/dx (h u) - d/dy (h v)
 *
 * where `q = (f + zeta) / h` is potential vorticity at the cell corner, `K = (u^2 + v^2)/2`
 * is kinetic energy, and `~` marks the four-point average that carries a mass flux from the
 * faces where it lives to the face where the term is needed. This is Sadourny's
 * energy-conserving form, and it is chosen because the invariant test of AT-01 is only worth
 * running against a scheme that could plausibly pass it.
 *
 * **Why leapfrog.** It is second-order, cheap, and has no amplitude error, which is what a
 * ninety-six hour integration needs. Its computational mode is real and is damped by the
 * declared Robert-Asselin coefficient, which costs a little energy -- and that cost is
 * visible in the invariant test rather than hidden by loosening the tolerance.
 *
 * **The C-grid.** `h` at cell centres, `u` on the eastern face, `v` on the northern face,
 * vorticity at the north-east corner. Indices are periodic in the arithmetic and the sponge
 * layer handles the fact that the domain is a box in an open ocean (FR-012).
 */

export const REDUCED_GRAVITY_KERNEL_ID = 'reduced-gravity/1';

/** Field names published by this kernel. The harness reads these and no buffer of its own. */
export const THICKNESS = 'thickness';
export const VELOCITY_U = 'velocityU';
export const VELOCITY_V = 'velocityV';

/**
 * Leapfrog needs the previous time level, and the sponge needs the state it relaxes toward.
 * Both live beside the state rather than in it, because `ModelState` is what the port
 * declares and what the harness reads: scheme bookkeeping is the kernel's business.
 */
interface Scratch {
  readonly previous: { h: Float64Array; u: Float64Array; v: Float64Array };
  readonly relaxTo: { h: Float64Array; u: Float64Array; v: Float64Array };
  readonly spongeWeight: Float64Array;
  readonly coriolis: Float64Array;
  /** Working buffers, allocated once. A step that allocated would allocate half a megabyte
   *  per step, and a thousand-step replay would spend its time in the collector. */
  readonly work: {
    fluxU: Float64Array;
    fluxV: Float64Array;
    potentialVorticity: Float64Array;
    kinetic: Float64Array;
    nextH: Float64Array;
    nextU: Float64Array;
    nextV: Float64Array;
  };
  /** Neighbour index tables, so the inner loops do no modulo arithmetic. */
  readonly xPlus: Int32Array;
  readonly xMinus: Int32Array;
  readonly yPlus: Int32Array;
  readonly yMinus: Int32Array;
  /** True until the first step has been taken; the first step is forward, not leapfrog. */
  started: boolean;
  /** FR-005: how many times the outcrop clamp has fired. Published, never swallowed. */
  outcrops: number;
  /**
   * And how much water it added doing so, in metres of thickness summed over every event.
   * The count alone would say the clamp fired; this says what it cost, which is what lets
   * the conservation test account for every cubic metre of the drift rather than tolerate it.
   */
  clampedThicknessMetres: number;
}

const scratchOf = new WeakMap<ModelState, Scratch>();

/** The scheme bookkeeping for a state, for the diagnostics that need it. */
export function outcropCount(state: ModelState): number {
  return scratchOf.get(state)?.outcrops ?? 0;
}

/** The thickness the outcrop clamp has added, summed over every event. */
export function clampedThickness(state: ModelState): number {
  return scratchOf.get(state)?.clampedThicknessMetres ?? 0;
}

export function spongeWeights(state: ModelState): Float64Array | undefined {
  return scratchOf.get(state)?.spongeWeight;
}

/**
 * The sponge (FR-012): one at the boundary, zero in the interior, smooth in between. The
 * relaxation is toward the initial state, so the interior evolves and the margin remembers
 * where it started. Scoring excludes the margin, and beat 006 reads the width to do it.
 */
function buildSponge(grid: GridSpec, widthCells: number): Float64Array {
  const weight = createField(grid);
  if (widthCells <= 0) return weight;
  for (let iy = 0; iy < grid.ny; iy += 1) {
    for (let ix = 0; ix < grid.nx; ix += 1) {
      const distance = Math.min(ix, iy, grid.nx - 1 - ix, grid.ny - 1 - iy);
      if (distance >= widthCells) continue;
      // cos^2 taper: one at the wall, zero at the inner edge, with zero gradient at both.
      const s = (widthCells - distance) / widthCells;
      weight[indexOf(grid, ix, iy)] = s * s;
    }
  }
  return weight;
}

/** The Coriolis parameter on a beta-plane about the domain's centre latitude. */
function buildCoriolis(grid: GridSpec, f0: number, beta: number): Float64Array {
  const f = createField(grid);
  const centre = (grid.ny - 1) / 2;
  for (let iy = 0; iy < grid.ny; iy += 1) {
    const y = (iy - centre) * grid.cellSizeYMetres;
    for (let ix = 0; ix < grid.nx; ix += 1) f[indexOf(grid, ix, iy)] = f0 + beta * y;
  }
  return f;
}

export interface InitialFields {
  readonly thickness: Float64Array;
  readonly velocityU: Float64Array;
  readonly velocityV: Float64Array;
}

export class ReducedGravityKernel implements ModelKernel {
  readonly id = REDUCED_GRAVITY_KERNEL_ID;
  readonly isReference = true;
  readonly fieldNames = [THICKNESS, VELOCITY_U, VELOCITY_V] as const;
  readonly parameters: ReducedGravityParameters;

  constructor(parameters: ReducedGravityParameters) {
    this.parameters = parameters;
  }

  /**
   * A state at rest, with a small seeded perturbation. This is the port's `createState`, and
   * it is what the contract and replay tests exercise; a run over a real domain is
   * initialised from truth instead (see `initialise.ts`), which is a declared relation and
   * not a random one.
   */
  createState(grid: GridSpec, stream: RandomStream): ModelState {
    const thickness = createField(grid);
    const velocityU = createField(grid);
    const velocityV = createField(grid);
    const amplitude = this.parameters.meanThickness * 0.02;
    for (let i = 0; i < thickness.length; i += 1) {
      thickness[i] = this.parameters.meanThickness + amplitude * stream.nextGaussian();
    }
    return this.adopt({ grid, fields: { thickness, velocityU, velocityV } });
  }

  /** Take a state built elsewhere -- from truth, say -- and prepare the scheme's bookkeeping. */
  adopt(state: ModelState): ModelState {
    const { grid } = state;
    const h = state.fields[THICKNESS] as Float64Array;
    const u = state.fields[VELOCITY_U] as Float64Array;
    const v = state.fields[VELOCITY_V] as Float64Array;
    const n = grid.nx * grid.ny;
    const xPlus = new Int32Array(grid.nx);
    const xMinus = new Int32Array(grid.nx);
    for (let ix = 0; ix < grid.nx; ix += 1) {
      xPlus[ix] = wrap(ix + 1, grid.nx);
      xMinus[ix] = wrap(ix - 1, grid.nx);
    }
    const yPlus = new Int32Array(grid.ny);
    const yMinus = new Int32Array(grid.ny);
    for (let iy = 0; iy < grid.ny; iy += 1) {
      yPlus[iy] = wrap(iy + 1, grid.ny) * grid.nx;
      yMinus[iy] = wrap(iy - 1, grid.ny) * grid.nx;
    }

    scratchOf.set(state, {
      previous: { h: h.slice(), u: u.slice(), v: v.slice() },
      relaxTo: { h: h.slice(), u: u.slice(), v: v.slice() },
      spongeWeight: buildSponge(grid, this.parameters.spongeWidthCells),
      coriolis: buildCoriolis(grid, this.parameters.f0, this.parameters.beta),
      work: {
        fluxU: new Float64Array(n),
        fluxV: new Float64Array(n),
        potentialVorticity: new Float64Array(n),
        kinetic: new Float64Array(n),
        nextH: new Float64Array(n),
        nextU: new Float64Array(n),
        nextV: new Float64Array(n),
      },
      xPlus,
      xMinus,
      yPlus,
      yMinus,
      started: false,
      outcrops: 0,
      clampedThicknessMetres: 0,
    });
    return state;
  }

  step(state: ModelState, context: StepContext): void {
    const scratch = scratchOf.get(state);
    if (scratch === undefined) {
      throw new TypeError(
        `${this.id} was handed a state it did not prepare; build one with createState or adopt`,
      );
    }
    const { grid } = state;
    const p = this.parameters;
    const nx = grid.nx;
    const ny = grid.ny;
    const dx = grid.cellSizeXMetres;
    const dy = grid.cellSizeYMetres;
    const n = nx * ny;

    const h = state.fields[THICKNESS] as Float64Array;
    const u = state.fields[VELOCITY_U] as Float64Array;
    const v = state.fields[VELOCITY_V] as Float64Array;
    const { previous, work, xPlus, xMinus, yPlus, yMinus, coriolis } = scratch;
    const { fluxU, fluxV, potentialVorticity, kinetic, nextH, nextU, nextV } = work;

    // The first step is forward: leapfrog has no previous level to reach back to yet.
    const dt = scratch.started ? 2 * context.timestepSeconds : context.timestepSeconds;
    const baseH = scratch.started ? previous.h : h;
    const baseU = scratch.started ? previous.u : u;
    const baseV = scratch.started ? previous.v : v;

    // Mass fluxes, on the faces where the velocities live.
    for (let iy = 0; iy < ny; iy += 1) {
      const row = iy * nx;
      const rowNorth = yPlus[iy] as number;
      for (let ix = 0; ix < nx; ix += 1) {
        const here = row + ix;
        const east = row + (xPlus[ix] as number);
        const north = rowNorth + ix;
        fluxU[here] = 0.5 * ((h[here] as number) + (h[east] as number)) * (u[here] as number);
        fluxV[here] = 0.5 * ((h[here] as number) + (h[north] as number)) * (v[here] as number);
      }
    }

    // Potential vorticity at the north-east corner; kinetic energy at the centre.
    for (let iy = 0; iy < ny; iy += 1) {
      const row = iy * nx;
      const rowNorth = yPlus[iy] as number;
      const rowSouth = yMinus[iy] as number;
      for (let ix = 0; ix < nx; ix += 1) {
        const here = row + ix;
        const xE = xPlus[ix] as number;
        const xW = xMinus[ix] as number;
        const east = row + xE;
        const north = rowNorth + ix;
        const northEast = rowNorth + xE;
        const relative =
          ((v[east] as number) - (v[here] as number)) / dx -
          ((u[north] as number) - (u[here] as number)) / dy;
        const cornerThickness =
          0.25 * ((h[here] as number) + (h[east] as number) + (h[north] as number) + (h[northEast] as number));
        potentialVorticity[here] = ((coriolis[here] as number) + relative) / cornerThickness;
        const uW = u[row + xW] as number;
        const vS = v[rowSouth + ix] as number;
        kinetic[here] =
          0.25 *
          ((u[here] as number) * (u[here] as number) + uW * uW + (v[here] as number) * (v[here] as number) + vS * vS);
      }
    }

    for (let iy = 0; iy < ny; iy += 1) {
      const row = iy * nx;
      const rowNorth = yPlus[iy] as number;
      const rowSouth = yMinus[iy] as number;
      for (let ix = 0; ix < nx; ix += 1) {
        const here = row + ix;
        const xE = xPlus[ix] as number;
        const xW = xMinus[ix] as number;
        const east = row + xE;
        const west = row + xW;
        const north = rowNorth + ix;
        const south = rowSouth + ix;
        const northWest = rowNorth + xW;
        const southEast = rowSouth + xE;

        // Continuity: the divergence of the mass flux.
        nextH[here] =
          (baseH[here] as number) -
          dt *
            (((fluxU[here] as number) - (fluxU[west] as number)) / dx +
              ((fluxV[here] as number) - (fluxV[south] as number)) / dy);

        // Momentum, vector-invariant. The four-point averages carry each mass flux from the
        // faces it lives on to the face where the vorticity term is needed.
        const vAtU =
          0.25 *
          ((fluxV[here] as number) +
            (fluxV[east] as number) +
            (fluxV[south] as number) +
            (fluxV[southEast] as number));
        const uAtV =
          0.25 *
          ((fluxU[here] as number) +
            (fluxU[west] as number) +
            (fluxU[north] as number) +
            (fluxU[northWest] as number));

        const bernoulliX =
          (p.reducedGravity * ((h[east] as number) - (h[here] as number)) +
            ((kinetic[east] as number) - (kinetic[here] as number))) /
          dx;
        const bernoulliY =
          (p.reducedGravity * ((h[north] as number) - (h[here] as number)) +
            ((kinetic[north] as number) - (kinetic[here] as number))) /
          dy;

        // Viscosity and drag are evaluated at the *previous* time level, not the current one.
        // Leapfrog is unconditionally unstable for a diffusion term evaluated at time n --
        // the grid-scale mode grows like (1 + 2r)^n -- and the first version of this kernel
        // did exactly that and blew up inside two hundred steps. Lagging them makes the two
        // terms forward-Euler over 2*dt, which is stable while the viscous number stays
        // below a half; `assessStability` computes it and the run refuses if it does not.
        const laplacianU =
          ((baseU[east] as number) - 2 * (baseU[here] as number) + (baseU[west] as number)) / (dx * dx) +
          ((baseU[north] as number) - 2 * (baseU[here] as number) + (baseU[south] as number)) / (dy * dy);
        const laplacianV =
          ((baseV[east] as number) - 2 * (baseV[here] as number) + (baseV[west] as number)) / (dx * dx) +
          ((baseV[north] as number) - 2 * (baseV[here] as number) + (baseV[south] as number)) / (dy * dy);

        nextU[here] =
          (baseU[here] as number) +
          dt *
            (0.5 * ((potentialVorticity[here] as number) + (potentialVorticity[south] as number)) * vAtU -
              bernoulliX +
              p.lateralViscosity * laplacianU -
              p.bottomDrag * (baseU[here] as number));
        nextV[here] =
          (baseV[here] as number) +
          dt *
            (-0.5 * ((potentialVorticity[here] as number) + (potentialVorticity[west] as number)) * uAtV -
              bernoulliY +
              p.lateralViscosity * laplacianV -
              p.bottomDrag * (baseV[here] as number));
      }
    }

    // The sponge (FR-012): relax the margin toward where it started, leave the interior alone.
    if (p.spongeWidthCells > 0) {
      const rate = context.timestepSeconds / p.spongeTimescaleSeconds;
      for (let i = 0; i < n; i += 1) {
        const weight = (scratch.spongeWeight[i] as number) * rate;
        if (weight === 0) continue;
        nextH[i] = (nextH[i] as number) + weight * ((scratch.relaxTo.h[i] as number) - (nextH[i] as number));
        nextU[i] = (nextU[i] as number) + weight * ((scratch.relaxTo.u[i] as number) - (nextU[i] as number));
        nextV[i] = (nextV[i] as number) + weight * ((scratch.relaxTo.v[i] as number) - (nextV[i] as number));
      }
    }

    // Outcropping: clamp at the declared minimum and count it. A run with a non-zero count
    // says so, rather than quietly producing a field that conserves nothing.
    for (let i = 0; i < n; i += 1) {
      if ((nextH[i] as number) < p.minimumThickness) {
        scratch.clampedThicknessMetres += p.minimumThickness - (nextH[i] as number);
        nextH[i] = p.minimumThickness;
        scratch.outcrops += 1;
      }
    }

    if (scratch.started) {
      // Robert-Asselin: damp the computational mode leapfrog admits. It costs a little
      // energy, and that cost shows up in the invariant test rather than being hidden.
      const nu = p.robertAsselin;
      for (let i = 0; i < n; i += 1) {
        previous.h[i] =
          (h[i] as number) + nu * ((previous.h[i] as number) - 2 * (h[i] as number) + (nextH[i] as number));
        previous.u[i] =
          (u[i] as number) + nu * ((previous.u[i] as number) - 2 * (u[i] as number) + (nextU[i] as number));
        previous.v[i] =
          (v[i] as number) + nu * ((previous.v[i] as number) - 2 * (v[i] as number) + (nextV[i] as number));
      }
    } else {
      previous.h.set(h);
      previous.u.set(u);
      previous.v.set(v);
      scratch.started = true;
    }

    h.set(nextH);
    u.set(nextU);
    v.set(nextV);
  }
}

export function createReducedGravityKernel(parameters: ReducedGravityParameters): ReducedGravityKernel {
  return new ReducedGravityKernel(parameters);
}
