/**
 * The instrument that makes "recomputes nothing" checkable (SRD-v1 FR-14, SRD-v2 FR-051).
 *
 * Beat 007's requirement is that enlarging changes what is shown and never what is computed,
 * and it says the assertion is by **identity**: the same `Float64Array` object is in the panel
 * before and after. That is a claim about an object, and an object cannot be got out of a
 * browser -- `page.evaluate` returns a structured clone, and a clone of a copy is
 * indistinguishable from a clone of the original. So beat 007's browser test compared the
 * canvas's rendering backend instead, which is a weaker thing that happened to hold.
 *
 * This leaves the array on the canvas that drew it. The test then compares `===` **inside the
 * page**, where identity is still identity, across an enlargement and across a strip swap.
 * Deep equality would not do: a recomputed copy of an anomaly field is equal to the original
 * and is exactly the failure FR-051 exists to forbid.
 *
 * It is an instrument, not a figure. Nothing reads it but a test, and it holds a reference the
 * surface already holds, so it keeps nothing alive that was going to be collected.
 */

interface CanvasHoldingAField extends HTMLCanvasElement {
  /** The array most recently drawn into this canvas, by reference. */
  jOceanField?: Float64Array;
}

export function holdsField(canvas: HTMLCanvasElement, values: Float64Array): void {
  (canvas as CanvasHoldingAField).jOceanField = values;
}
