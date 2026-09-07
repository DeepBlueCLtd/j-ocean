import { describe, expect, it } from 'vitest';
import {
  contentLabel,
  resolveCentreContent,
  THE_ROW,
  type CentreContent,
} from '../../src/harness/CentreContent.js';

/**
 * What the centre holds (spec 015 FR-001, FR-004, and the third edge case; SRD-v2 FR-049).
 *
 * The union is the whole of "never both, never neither", so what is left to check is the
 * resolution: the two places where what a reader asked for and what configuration declares can
 * disagree.
 *
 * **The undeclared horizon is here rather than in the browser, and that is a limitation worth
 * naming.** The surface reads its configuration once, at load, and an enlargement does not
 * survive a reload -- selection becomes addressable in beat 017 (FR-056). So there is no
 * sequence of clicks that reaches "the enlarged horizon is no longer declared" in a running
 * page, and a shell test claiming to reach it would be reaching something else. The rule
 * itself is small and total, so it is asserted where it can be asserted for real.
 */

const DECLARED = [0, 12, 24, 48, 72, 96];

describe('what the centre holds', () => {
  it('gives back what was asked for, above the floor', () => {
    expect(resolveCentreContent(THE_ROW, DECLARED, false)).toEqual({
      content: THE_ROW,
      undeclared: null,
    });
    const enlarged: CentreContent = { kind: 'enlarged', leadHours: 48 };
    expect(resolveCentreContent(enlarged, DECLARED, false)).toEqual({
      content: enlarged,
      undeclared: null,
    });
  });

  /**
   * FR-043's fallback is this union forced, not a presentation of its own: below the floor the
   * row is not on offer, so a centre that has not been asked for anything is enlarged on the
   * first declared horizon.
   */
  it('forces an enlargement below the floor, and keeps the one already chosen', () => {
    expect(resolveCentreContent(THE_ROW, DECLARED, true)).toEqual({
      content: { kind: 'enlarged', leadHours: 0 },
      undeclared: null,
    });
    expect(resolveCentreContent({ kind: 'enlarged', leadHours: 72 }, DECLARED, true)).toEqual({
      content: { kind: 'enlarged', leadHours: 72 },
      undeclared: null,
    });
  });

  /**
   * The spec's third edge case, and G-05's rule applied to the centre: a panel is never drawn
   * for a horizon configuration does not declare. The horizon that went is handed back so the
   * centre can say which, rather than the enlargement disappearing without a word.
   */
  it('returns to the row when the enlarged horizon is no longer declared, and says which', () => {
    expect(resolveCentreContent({ kind: 'enlarged', leadHours: 36 }, DECLARED, false)).toEqual({
      content: THE_ROW,
      undeclared: 36,
    });
  });

  it('falls back to the first declared horizon below the floor, where there is no row', () => {
    expect(resolveCentreContent({ kind: 'enlarged', leadHours: 36 }, DECLARED, true)).toEqual({
      content: { kind: 'enlarged', leadHours: 0 },
      undeclared: 36,
    });
  });

  /** A configuration declaring no horizons at all is refused by the schema; this does not crash. */
  it('has the row and nothing else where nothing is declared', () => {
    expect(resolveCentreContent(THE_ROW, [], true)).toEqual({ content: THE_ROW, undeclared: null });
    expect(resolveCentreContent({ kind: 'enlarged', leadHours: 48 }, [], true)).toEqual({
      content: THE_ROW,
      undeclared: 48,
    });
  });

  /**
   * SC-003 reads the ledger, so the label has to tell two enlargements apart: `enlarged` alone
   * would make a swap and a re-render indistinguishable, which is the whole of what is being
   * asserted.
   */
  it('labels a rendered content kind by what it is showing', () => {
    expect(contentLabel(THE_ROW)).toBe('row');
    expect(contentLabel({ kind: 'enlarged', leadHours: 48 })).toBe('enlarged(48)');
    expect(contentLabel({ kind: 'enlarged', leadHours: 96 })).toBe('enlarged(96)');
  });
});
