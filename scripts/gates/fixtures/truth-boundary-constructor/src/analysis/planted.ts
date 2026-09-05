// Planted violation for gate G-02: a second place that can forge an Observation.
declare const OBSERVATION_BRAND: unique symbol;

export function forge(value: number): { [OBSERVATION_BRAND]: true; value: number } {
  return { value } as unknown as { [OBSERVATION_BRAND]: true; value: number };
}
