import type { ReactNode } from 'react';
import type { Configuration } from '../../config/schema.js';

/**
 * What a help entry is (SRD-v2 FR-52, FR-55; spec 016 FR-001, FR-005, FR-006).
 *
 * One module per panel, named for the panel, so the sentence that describes a thing is beside
 * the thing. `explains` has one item per feature the panel declares in `panels.json`, and gate
 * G-08 holds the two against each other in both directions: a declared feature with no
 * explanation, and an explanation for a feature -- or a panel -- that does not exist.
 *
 * **Help teaches and does not report.** A body takes the validated configuration and nothing
 * else. It cannot reach a run, a forecast, a score or a clock, because there is nothing here
 * to reach them with, and `tests/harness/help.test.ts` reads these sources and fails on any
 * interpolation of run state, any provenance-typed figure but `Declared`, and any digit that
 * is not read from configuration. Two sources for one fact is how a surface starts lying, and
 * the second source is always the one that goes stale.
 *
 * The body takes configuration rather than closing over it so that a number used to teach --
 * a length scale, a horizon -- is read from the file that declares it (Principle X) instead of
 * being restated as a literal beside it.
 */
export interface Explanation {
  /** The feature this explains. Exactly one of the panel's declared features. */
  readonly feature: string;
  readonly body: (config: Configuration) => ReactNode;
}

export interface HelpEntry {
  /** The panel this explains. One entry per panel, and the file is named for it. */
  readonly panel: string;
  readonly explains: readonly Explanation[];
}
