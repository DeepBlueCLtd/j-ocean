import type { Configuration } from '../config/schema.js';
import type { Flag, ObservationLevel } from './observation.js';

/**
 * The declared quality checks (FR-006, FR-24).
 *
 * The rule these all obey: **a check produces a flag and never drops an observation.** A
 * measurement the harness rejected is a measurement the reader has to be able to see,
 * because what the analysis chose to ignore is exactly as interesting as what it used.
 *
 * The checks are declared in configuration and can be switched off as a whole, which is the
 * data half of FR-032's "break an instrument" counterfactual: a broken instrument with
 * quality control on is caught, and with it off is not, and a reader gets to watch the
 * difference.
 */

export interface ClimatologyReference {
  /** The long-run mean at this position and depth, or NaN where there is none. */
  valueAt(lonDeg: number, latDeg: number, depthMetres: number): number;
  /**
   * The spatial standard deviation of the climatology at this depth. Used as the scale a
   * departure is measured in, so that "five standard deviations" means something the
   * artefact can answer for rather than a figure somebody picked.
   */
  spreadAt(depthMetres: number): number;
}

export function grossRangeCheck(value: number, config: Configuration): Flag | null {
  const { minimumDegC, maximumDegC } = config.instruments.qualityControl.grossRange;
  if (value >= minimumDegC && value <= maximumDegC) return null;
  return {
    code: 'gross-range',
    detail:
      `${value.toFixed(3)} degC is outside the declared plausible range of ` +
      `${String(minimumDegC)} to ${String(maximumDegC)} degC`,
    usable: false,
  };
}

export function climatologyDepartureCheck(
  value: number,
  lonDeg: number,
  latDeg: number,
  depthMetres: number,
  climatology: ClimatologyReference,
  config: Configuration,
): Flag | null {
  const mean = climatology.valueAt(lonDeg, latDeg, depthMetres);
  const spread = climatology.spreadAt(depthMetres);
  // No climatology here -- land, or outside the artefact -- so there is nothing to depart
  // from. Silence is the right answer; inventing a departure would be worse than none.
  if (!Number.isFinite(mean) || !Number.isFinite(spread) || spread <= 0) return null;

  const departures = Math.abs(value - mean) / spread;
  const limit = config.instruments.qualityControl.climatologyDepartureStandardDeviations;
  if (departures <= limit) return null;
  return {
    code: 'climatology-departure',
    detail:
      `${departures.toFixed(1)} standard deviations from the climatological ` +
      `${mean.toFixed(2)} degC at ${depthMetres.toFixed(0)} m, and the declared limit is ` +
      `${String(limit)}`,
    usable: false,
  };
}

/**
 * A profile that gets warmer with depth by more than the declared tolerance. Real inversions
 * exist, which is why the tolerance is declared and not zero, and why the flag says the
 * figure rather than merely that something was wrong.
 */
export function verticalInversionCheck(
  levels: readonly ObservationLevel[],
  config: Configuration,
): Flag | null {
  const tolerance = config.instruments.qualityControl.verticalInversionToleranceDegC;
  let worst = 0;
  let atDepth = 0;
  const measured = levels.filter((level) => Number.isFinite(level.value));
  for (let i = 1; i < measured.length; i += 1) {
    const above = measured[i - 1] as ObservationLevel;
    const below = measured[i] as ObservationLevel;
    const rise = below.value - above.value;
    if (rise > worst) {
      worst = rise;
      atDepth = below.depthMetres;
    }
  }
  if (worst <= tolerance) return null;
  return {
    code: 'vertical-inversion',
    detail:
      `the profile warms by ${worst.toFixed(3)} degC at ${atDepth.toFixed(0)} m, and the ` +
      `declared tolerance is ${tolerance.toFixed(3)} degC`,
    usable: false,
  };
}

/** Argo's own flags, mapped onto this project's set (FR-008, ADR-0007). */
export function argoFlag(code: number): Flag | null {
  if (code === 1 || code === 2) return null;
  const meanings: Readonly<Record<number, string>> = {
    0: 'no quality control was performed',
    3: 'probably bad',
    4: 'bad',
    5: 'changed',
    8: 'estimated',
    9: 'missing',
  };
  return {
    code: 'argo-flagged',
    detail: `Argo flag ${String(code)}: ${meanings[code] ?? 'not a flag Argo defines'}`,
    // Argo's own judgement, honoured by the same semantics as a failed check of ours.
    usable: false,
  };
}
