import type { ModelState } from '../ports/kernel.js';
import { indexOf } from './grid.js';
import type { ThermalStructure } from './parameters.js';
import { THICKNESS } from './reduced-gravity.js';

/**
 * The vertical structure (FR-07, FR-010, review R-1).
 *
 * **Depth is displayed, never integrated.** The model has one active layer; what a reader
 * sees as a temperature profile is diagnosed from that layer's thickness under a declared
 * two-layer thermal structure, and it is never advected. Beat 004 uses the same relation as
 * the observation operator, which is what makes an XBT disagreeing with the profile a
 * finding rather than a defect (ADR-0005).
 *
 * **A level's kind does not change between states** (NFR-05). The surface is the upper
 * layer's own temperature and the deepest declared level is the deep layer's own, so those
 * two are `computed`; everything between them is `derived`, always, whatever the interface
 * happens to be doing. A kind that moved with the interface would be a kind a reader could
 * not rely on.
 */

export type FigureKind = 'computed' | 'derived';

export interface ProfileLevel {
  readonly depthMetres: number;
  readonly temperatureDegC: number;
  readonly kind: FigureKind;
}

export interface DiagnosedProfile {
  readonly latIndex: number;
  readonly lonIndex: number;
  /** The layer thickness, which is where the thermocline is put. A computed figure. */
  readonly interfaceDepthMetres: number;
  readonly levels: readonly ProfileLevel[];
  /** Said in the object, so a surface drawing it cannot forget to say it. */
  readonly note: string;
}

/**
 * A warm upper layer over a cold deep one, joined by a tanh transition of declared
 * thickness centred on the interface. Smooth, monotone, and with a single declared width --
 * which matters because beat 004 has to invert it to recover an interface depth from a
 * profile, and beat 010 lets a reader drag it.
 */
export function temperatureAt(
  depthMetres: number,
  interfaceDepthMetres: number,
  structure: ThermalStructure,
): number {
  const { upperTemperatureDegC: warm, deepTemperatureDegC: cold, transitionThicknessMetres } = structure;
  const s = Math.tanh((depthMetres - interfaceDepthMetres) / transitionThicknessMetres);
  return warm + (cold - warm) * 0.5 * (1 + s);
}

/**
 * How far into the tanh a measurement has to sit before it tells you anything. Beyond three
 * transition thicknesses the profile is within a quarter of a percent of a layer's own
 * temperature, and inverting it recovers the noise rather than the interface.
 */
const RESOLVABLE_TRANSITIONS = 3;
const RESOLVABLE_FRACTION = Math.tanh(RESOLVABLE_TRANSITIONS);

export interface InferredInterface {
  readonly depthMetres: number;
  /**
   * False when the measurement sits in the body of a layer rather than across the
   * thermocline. The relation is a tanh, so it saturates: a thermometer at 100 m in an ocean
   * whose interface is at 700 m reads the upper layer's own temperature and constrains the
   * interface hardly at all. Beat 004's instruments have to know that, because an
   * observation that constrains nothing must not be allowed to look as though it did.
   */
  readonly resolved: boolean;
}

/** The inverse: the interface depth a measurement implies, and whether it implies one. */
export function interfaceDepthFrom(
  depthMetres: number,
  temperatureDegC: number,
  structure: ThermalStructure,
): InferredInterface {
  const { upperTemperatureDegC: warm, deepTemperatureDegC: cold, transitionThicknessMetres } = structure;
  const fraction = (2 * (temperatureDegC - warm)) / (cold - warm) - 1;
  const resolved = Math.abs(fraction) <= RESOLVABLE_FRACTION;
  const clamped = Math.max(-RESOLVABLE_FRACTION, Math.min(RESOLVABLE_FRACTION, fraction));
  return { depthMetres: depthMetres - transitionThicknessMetres * Math.atanh(clamped), resolved };
}

export function diagnoseProfile(
  state: ModelState,
  lonIndex: number,
  latIndex: number,
  structure: ThermalStructure,
): DiagnosedProfile {
  const thickness = state.fields[THICKNESS] as Float64Array;
  const interfaceDepthMetres = thickness[indexOf(state.grid, lonIndex, latIndex)] as number;
  const levels = structure.displayLevelsMetres;
  const deepest = levels.length - 1;

  return {
    latIndex,
    lonIndex,
    interfaceDepthMetres,
    levels: levels.map((depthMetres, index) => ({
      depthMetres,
      temperatureDegC: temperatureAt(depthMetres, interfaceDepthMetres, structure),
      // Static by construction: the model's own two layers are the surface and the deepest
      // declared level, and nothing about the state can move which those are.
      kind: (index === 0 || index === deepest ? 'computed' : 'derived') as FigureKind,
    })),
    note:
      'Depth is displayed, not integrated. Every level between the model own two is derived ' +
      'from the layer thickness under a declared thermal structure, never advected.',
  };
}
