import type { ThermalStructure } from '../model/parameters.js';
import { interfaceDepthFrom, temperatureAt } from '../model/profile.js';
import type { ObservationLevel } from './observation.js';

/**
 * The observation operator (FR-005, review R-1, ADR-0005).
 *
 * A temperature profile in, an interface depth out. It is the same two-layer relation the
 * model draws a profile *from* (beat 003), inverted -- so a reader dragging a profile in
 * beat 010 is dragging the curve the analysis reads, and the consequence they see is the
 * consequence there is.
 *
 * The important part is the error propagation, and it is the reason this operator was chosen
 * over an anomaly-on-a-vertical-mode one. Differentiating the inverse gives
 *
 *     |dh/dT| = 2L / (|T_deep - T_upper| (1 - f^2))
 *
 * which diverges as `f` approaches +-1 -- that is, as the measurement moves out of the
 * thermocline and into the body of a layer. A level that constrains nothing therefore
 * acquires an enormous depth error and a weight near zero *through the arithmetic*, rather
 * than through a rule somebody remembered to write.
 */

export interface InterfaceEstimate {
  /** The interface depth the profile implies, in metres. Absent when only a bound is known. */
  readonly depthMetres: number | null;
  /** One standard deviation, propagated from the level temperature errors. */
  readonly sdMetres: number | null;
  /** How many levels contributed anything. Zero means the profile did not cross the thermocline. */
  readonly contributingLevels: number;
  /**
   * FR-005: when the interface is not reached, the profile still establishes a bound. Saying
   * "below 700 m" is a fact; inventing a depth there is not.
   */
  readonly bound: { readonly direction: 'below' | 'above'; readonly depthMetres: number } | null;
}

/** The sensitivity of the inferred depth to a temperature error at one level. */
export function depthSensitivity(
  temperatureDegC: number,
  structure: ThermalStructure,
): number {
  const span = structure.deepTemperatureDegC - structure.upperTemperatureDegC;
  const f = (2 * (temperatureDegC - structure.upperTemperatureDegC)) / span - 1;
  const clamped = Math.max(-0.999999, Math.min(0.999999, f));
  return Math.abs((2 * structure.transitionThicknessMetres) / (span * (1 - clamped * clamped)));
}

export function interfaceFromProfile(
  levels: readonly ObservationLevel[],
  temperatureSd: number,
  structure: ThermalStructure,
): InterfaceEstimate {
  let weightSum = 0;
  let weightedDepth = 0;
  let contributing = 0;

  for (const level of levels) {
    if (!Number.isFinite(level.value)) continue;
    if (level.flags.some((flag) => !flag.usable)) continue;
    const inferred = interfaceDepthFrom(level.depthMetres, level.value, structure);
    if (!inferred.resolved) continue;
    const sd = depthSensitivity(level.value, structure) * temperatureSd;
    if (!Number.isFinite(sd) || sd <= 0) continue;
    const weight = 1 / (sd * sd);
    weightSum += weight;
    weightedDepth += weight * inferred.depthMetres;
    contributing += 1;
  }

  if (contributing === 0) {
    // No level crossed the thermocline. Which side it is on is still known: a profile whose
    // deepest usable level is warmer than the halfway temperature has the interface below it.
    const usable = levels.filter(
      (level) => Number.isFinite(level.value) && level.flags.every((flag) => flag.usable),
    );
    if (usable.length === 0) {
      return { depthMetres: null, sdMetres: null, contributingLevels: 0, bound: null };
    }
    const deepest = usable[usable.length - 1] as ObservationLevel;
    const shallowest = usable[0] as ObservationLevel;
    const halfway = (structure.upperTemperatureDegC + structure.deepTemperatureDegC) / 2;
    const bound =
      deepest.value > halfway
        ? ({ direction: 'below', depthMetres: deepest.depthMetres } as const)
        : ({ direction: 'above', depthMetres: shallowest.depthMetres } as const);
    return { depthMetres: null, sdMetres: null, contributingLevels: 0, bound };
  }

  return {
    depthMetres: weightedDepth / weightSum,
    sdMetres: Math.sqrt(1 / weightSum),
    contributingLevels: contributing,
    bound: null,
  };
}

/** The forward direction, for a test that wants to build a profile the operator can read. */
export { temperatureAt };
