/**
 * A number that says what kind of number it is (NFR-05, constitution Principle V).
 *
 * Three kinds, and a figure does not change kind between states:
 *
 *  - **declared**: it came from configuration
 *  - **computed**: the model, the analysis or the scorer produced it
 *  - **derived**: it was diagnosed from computed state
 *
 * A fourth, **host time**, exists for the timing module alone and never appears in a score.
 *
 * Scoring emits most of the figures the surface draws, which is why the kind is carried on
 * the figure rather than decided where it is rendered: a value that arrived as `computed`
 * cannot be re-typed on its way to the screen.
 */
export type FigureKind = 'declared' | 'computed' | 'derived';

export interface Figure {
  readonly value: number;
  readonly kind: FigureKind;
  readonly unit: string;
}

export const computed = (value: number, unit: string): Figure => ({ value, kind: 'computed', unit });
export const declared = (value: number, unit: string): Figure => ({ value, kind: 'declared', unit });
export const derived = (value: number, unit: string): Figure => ({ value, kind: 'derived', unit });

/** Every figure on an object, for the test that asserts none of them is a bare number. */
export function figuresOf(value: unknown): Figure[] {
  const found: Figure[] = [];
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record['value'] === 'number' && typeof record['kind'] === 'string' && typeof record['unit'] === 'string') {
      found.push(node as Figure);
      return;
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return found;
}
