import type { TruthCoverage, TruthQuery, TruthSource } from '../ports/truth-source.js';
import { ContainerError, FieldContainer } from './container.js';

/**
 * The truth-source port over a committed artefact (FR-010).
 *
 * Beat 001 declared this port and exercised it with a constant field. This is its real
 * implementation, and it is what the instruments of beat 004 and the scoring of beat 006
 * consume -- the instruments through Principle II's boundary, the scoring after the fact.
 *
 * The interpolation is **declared, not discovered**: linear in time, bilinear in space,
 * linear in depth. Two consequences follow and both are deliberate.
 *
 *  - Sampling exactly at a stored node, depth and instant returns the stored value, so a
 *    reader can check one number against the artefact by hand.
 *  - A cell that the artefact records as land contributes nothing plausible: if any corner
 *    of an interpolation is land, the answer is `NaN`. Averaging around land would invent
 *    ocean, and this port would rather say it does not know.
 *
 * `nativeResolutionDegrees` is read from the artefact rather than inferred, because beat
 * 006 declines to score below it and a refusal cannot rest on a number the code guessed
 * (review R-2).
 */

export const SURFACE_ELEVATION = 'surface_elevation';
export const WATER_TEMPERATURE = 'water_temperature';

interface Axis {
  readonly values: readonly number[];
  readonly ascending: boolean;
}

const axisOf = (values: readonly number[]): Axis => ({
  values,
  ascending: values.length < 2 || (values[1] as number) > (values[0] as number),
});

/** The bracketing indices and the weight of the upper one, for one axis. */
function bracket(axis: Axis, target: number): { lower: number; upper: number; weight: number } {
  const { values } = axis;
  const last = values.length - 1;
  if (values.length === 1) return { lower: 0, upper: 0, weight: 0 };

  const first = values[0] as number;
  const final = values[last] as number;
  const low = axis.ascending ? first : final;
  const high = axis.ascending ? final : first;
  if (target < low || target > high) {
    throw new RangeError(
      `${String(target)} is outside this artefact, which covers ${String(low)} to ${String(high)}`,
    );
  }

  let lower = 0;
  let upper = last;
  while (upper - lower > 1) {
    const middle = (lower + upper) >> 1;
    const value = values[middle] as number;
    if (axis.ascending ? value <= target : value >= target) lower = middle;
    else upper = middle;
  }
  const a = values[lower] as number;
  const b = values[upper] as number;
  const span = b - a;
  return { lower, upper, weight: span === 0 ? 0 : (target - a) / span };
}

export class ArtefactTruthSource implements TruthSource {
  readonly id: string;
  readonly nativeResolutionDegrees: number;
  readonly variables: readonly string[];

  readonly #container: FieldContainer;
  readonly #time: Axis;
  readonly #depth: Axis;
  readonly #lat: Axis;
  readonly #lon: Axis;

  constructor(container: FieldContainer) {
    this.#container = container;
    this.id = `${container.header.kind}/${container.header.domain}`;
    this.nativeResolutionDegrees = container.header.nativeResolutionDegrees;
    this.variables = container.header.variables.map((variable) => variable.name);
    this.#time = axisOf(container.header.coordinates['timeMs'] ?? []);
    this.#depth = axisOf(container.coordinate('depthMetres'));
    this.#lat = axisOf(container.coordinate('latDegrees'));
    this.#lon = axisOf(container.coordinate('lonDegrees'));
  }

  /** What the artefact covers. Beat 006 refuses to make claims outside it. */
  coverage(): TruthCoverage {
    const lat = this.#lat.values;
    const lon = this.#lon.values;
    const time = this.#time.values;
    return {
      west: Math.min(...lon),
      east: Math.max(...lon),
      south: Math.min(...lat),
      north: Math.max(...lat),
      fromMs: time.length > 0 ? Math.min(...time) : 0,
      toMs: time.length > 0 ? Math.max(...time) : 0,
    };
  }

  /** The instants the artefact stores, for a caller that wants to sample where it is exact. */
  instantsMs(): readonly number[] {
    return this.#time.values;
  }

  depthLevelsMetres(): readonly number[] {
    return this.#depth.values;
  }

  /** The artefact's provenance, so that a figure drawn from it can say where it came from. */
  provenance(): Readonly<Record<string, unknown>> {
    return this.#container.header.provenance;
  }

  sample(query: TruthQuery): number {
    const variable = this.#container.variable(query.variable);
    const dims = variable.dims;
    const shape = variable.shape;

    const x = bracket(this.#lon, query.lonDeg);
    const y = bracket(this.#lat, query.latDeg);
    const hasTime = dims.includes('time');
    const hasDepth = dims.includes('depth');
    const t = hasTime ? bracket(this.#time, query.instantMs) : { lower: 0, upper: 0, weight: 0 };
    const z = hasDepth ? bracket(this.#depth, query.depthMetres) : { lower: 0, upper: 0, weight: 0 };

    // Strides, computed from the header's own dimension order rather than assumed.
    const strides = new Map<string, number>();
    let stride = 1;
    for (let axis = dims.length - 1; axis >= 0; axis -= 1) {
      strides.set(dims[axis] as string, stride);
      stride *= shape[axis] as number;
    }
    const latStride = strides.get('lat') as number;
    const lonStride = strides.get('lon') as number;
    const timeStride = strides.get('time') ?? 0;
    const depthStride = strides.get('depth') ?? 0;

    const corner = (ti: number, zi: number, yi: number, xi: number): number =>
      this.#container.at(query.variable, ti * timeStride + zi * depthStride + yi * latStride + xi * lonStride);

    const lerp = (a: number, b: number, weight: number): number => a + (b - a) * weight;

    const overSpace = (ti: number, zi: number): number =>
      lerp(
        lerp(corner(ti, zi, y.lower, x.lower), corner(ti, zi, y.lower, x.upper), x.weight),
        lerp(corner(ti, zi, y.upper, x.lower), corner(ti, zi, y.upper, x.upper), x.weight),
        y.weight,
      );

    const overDepth = (ti: number): number =>
      hasDepth ? lerp(overSpace(ti, z.lower), overSpace(ti, z.upper), z.weight) : overSpace(ti, 0);

    return hasTime ? lerp(overDepth(t.lower), overDepth(t.upper), t.weight) : overDepth(0);
  }
}

/** Load a container from bytes. The same code path in Node and in the browser. */
export function truthSourceFromBytes(bytes: ArrayBuffer): ArtefactTruthSource {
  return new ArtefactTruthSource(new FieldContainer(bytes));
}

export { ContainerError };
