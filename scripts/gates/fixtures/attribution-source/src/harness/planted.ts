// Planted violation for gate G-06: the harness painting an attribution field of its own.
// This is the failure the SRD arrived at by specifying a summary bar first and finding it was
// wrong: a summary can be computed from something other than the analysis, and then the
// picture and the answer can disagree.
declare const ATTRIBUTION_BRAND: unique symbol;

export function paintAttribution(observationCount: number, cells: number) {
  const observationWeight = new Float64Array(cells).fill(observationCount / (observationCount + 1));
  return { observationWeight } as unknown as { [ATTRIBUTION_BRAND]: true };
}
