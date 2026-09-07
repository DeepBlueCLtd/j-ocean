import { useEffect, useRef } from 'react';

/**
 * What the centre region holds (SRD-v2 FR-049, FR-050; spec 015 FR-001, FR-004).
 *
 * **Never both, never neither.** The centre carries the row, or exactly one enlarged horizon,
 * and this type is the only thing that decides which. Beat 013 had two states -- an
 * `enlarged: number | null` for the row and a separate `presentation` flag for the answer
 * below the viewport floor -- and two states that must never disagree are a rule somebody has
 * to remember. A discriminated union makes it a property of the type instead.
 *
 * The fallback below the floor (FR-043) is not a second arrangement of the same idea: it is
 * this union, **forced** to `enlarged`. `resolveCentreContent` is where that forcing happens,
 * and it is the one place either presentation asks what the centre holds.
 */

export type CentreContent =
  | { readonly kind: 'row' }
  /** The declared horizon whose panel has the centre. Never a horizon configuration has not declared. */
  | { readonly kind: 'enlarged'; readonly leadHours: number };

export const THE_ROW: CentreContent = { kind: 'row' };

/**
 * What a rendered content kind is called, in the ledger and on the element.
 *
 * `row`, or `enlarged(48)`. The lead time is part of the label because SC-003 is a claim about
 * a *swap*: `enlarged(48)` followed by `enlarged(96)` with no `row` between them is the whole
 * of it, and a label that said only `enlarged` could not tell the two apart.
 */
export function contentLabel(content: CentreContent): string {
  return content.kind === 'row' ? 'row' : `enlarged(${String(content.leadHours)})`;
}

export interface ResolvedCentreContent {
  readonly content: CentreContent;
  /**
   * The horizon that was enlarged and is no longer declared, if there is one. The centre says
   * so and returns to the row rather than drawing a panel for a horizon configuration does not
   * declare (spec 015 edge case, G-05).
   */
  readonly undeclared: number | null;
}

/**
 * The centre's contents, given what was asked for and what is declared.
 *
 * Two things happen here and nowhere else.
 *
 * **A configuration with fewer horizons.** An enlargement names a lead time; if a reloaded
 * configuration no longer declares it, drawing that panel would be a panel for an undeclared
 * horizon, which is exactly what G-05 exists to catch. So the enlargement is dropped, the
 * centre returns to the row, and the caller is handed the horizon it lost so it can say so.
 *
 * **Below the floor there is no row.** `mustEnlarge` is the FR-043 fallback, and it selects an
 * enlargement rather than laying out a single panel of its own: the first declared horizon
 * where nothing has been chosen. One implementation, at any viewport.
 */
export function resolveCentreContent(
  requested: CentreContent,
  declaredHorizons: readonly number[],
  mustEnlarge: boolean,
): ResolvedCentreContent {
  const first = declaredHorizons[0];
  if (requested.kind === 'enlarged' && !declaredHorizons.includes(requested.leadHours)) {
    return mustEnlarge && first !== undefined
      ? { content: { kind: 'enlarged', leadHours: first }, undeclared: requested.leadHours }
      : { content: THE_ROW, undeclared: requested.leadHours };
  }
  if (requested.kind === 'row' && mustEnlarge) {
    return first === undefined
      ? { content: THE_ROW, undeclared: null }
      : { content: { kind: 'enlarged', leadHours: first }, undeclared: null };
  }
  return { content: requested, undeclared: null };
}

/**
 * The render ledger (spec 015 T012, SC-003).
 *
 * "No unenlarged frame in between" is a claim about what was **rendered**, and this is the
 * instrument that makes it checkable. Every commit of the centre appends its content kind to
 * `data-centre-ledger`, so a swap reads `enlarged(48) enlarged(96)` and a swap that closed the
 * enlargement on the way would read `enlarged(48) row enlarged(96)`.
 *
 * It is not a timing assertion, deliberately (plan 015). A test that measured how long an
 * intermediate frame lasted would pass on a fast machine and fail on a slow one, which is a
 * test that measures the machine rather than the surface.
 *
 * Consecutive repeats are collapsed: a commit that re-renders the same content is not a frame
 * a reader could see anything different in, and the ledger is a record of what was shown.
 */
export function CentreLedger({ content }: { readonly content: CentreContent }) {
  const marker = useRef<HTMLSpanElement | null>(null);
  const label = contentLabel(content);

  // Deliberately without a dependency list: every commit of the centre is a rendered frame,
  // and the ledger is the record of them. The label is compared with the last entry rather
  // than with the previous render's, so React rendering twice records once.
  useEffect(() => {
    const element = marker.current;
    if (element === null) return;
    const ledger = element.dataset['centreLedger'] ?? '';
    const entries = ledger === '' ? [] : ledger.split(' ');
    if (entries[entries.length - 1] !== label) entries.push(label);
    element.dataset['centreLedger'] = entries.join(' ');
    element.dataset['centreContent'] = label;
  });

  // Hidden, so it takes no room in a region whose height is the beat's own requirement. It is
  // an instrument and not a figure: nothing here is for a reader to read.
  return <span ref={marker} hidden data-testid="centre-ledger" />;
}
