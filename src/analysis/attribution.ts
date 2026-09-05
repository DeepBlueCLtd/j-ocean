/**
 * The attribution field, and the only place in the tree that constructs one.
 *
 * Constitution Principle IV: *the attribution field is the analysis's own weights, drawn as a
 * field.* Not a picture computed to illustrate the answer -- the same arithmetic that
 * produced the answer, exported beside it. A picture computed from the same arithmetic as
 * the answer cannot disagree with it; a picture painted to illustrate the answer can, and
 * eventually will.
 *
 * The opacity is enforced the same way `Observation`'s is: a brand keyed by a symbol this
 * file declares and never exports, plus gate G-06, which fails if that symbol's name appears
 * anywhere else -- and in particular if anything under `src/harness/` tries to build one.
 */

/** Not exported. A module that cannot name this key cannot build an `Attribution`. */
declare const ATTRIBUTION_BRAND: unique symbol;

/** Three weights per cell, in the order the surface draws them. */
export interface CellWeights {
  readonly observations: number;
  readonly background: number;
  readonly climatology: number;
}

export interface Attribution {
  readonly [ATTRIBUTION_BRAND]: true;
  readonly nx: number;
  readonly ny: number;
  /** Weight carried by observations in each cell. The other two follow from the prior blend. */
  readonly observationWeight: Float64Array;
  readonly backgroundWeight: Float64Array;
  readonly climatologyWeight: Float64Array;
  /**
   * The spec's fifth edge case, published rather than swallowed: how many cells had a weight
   * clamped from slightly negative to zero and were renormalised. A non-zero count is not an
   * error, but it is a thing a reader is entitled to know happened.
   */
  readonly clampedCells: number;
}

export interface AttributionFields {
  readonly nx: number;
  readonly ny: number;
  readonly observationWeight: Float64Array;
  readonly backgroundWeight: Float64Array;
  readonly climatologyWeight: Float64Array;
  readonly clampedCells: number;
}

/** The single construction site (G-06). Called once, by the analysis, from the gain. */
export function makeAttribution(fields: AttributionFields): Attribution {
  return fields as unknown as Attribution;
}

/** A cell's three weights, for the breakdown the surface draws (FR-18). */
export function weightsAt(attribution: Attribution, index: number): CellWeights {
  return {
    observations: attribution.observationWeight[index] as number,
    background: attribution.backgroundWeight[index] as number,
    climatology: attribution.climatologyWeight[index] as number,
  };
}
