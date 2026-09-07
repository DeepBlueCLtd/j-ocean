import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The geometry the shell tests measure against, read from the file the shell is served.
 *
 * One module rather than a copy in each spec, because two tests that each recompute the same
 * arithmetic can agree with configuration and still disagree with each other.
 *
 * Every figure here is **declared**. Beat 013 left the two column widths undeclared and
 * derived them in code, and T041 finished the job: `controlsWidthPx`, `detailWidthPx` and the
 * viewport floor are all in `config/j-ocean.json`, so this file reads them and computes
 * nothing. The floor itself was measured from the built layout by
 * `tests/shell/viewport-floor.spec.ts`, which still checks that the declaration is the
 * measurement.
 */

export const CONFIG_PATH = fileURLToPath(new URL('../../config/j-ocean.json', import.meta.url));

export interface DeclaredGeometry {
  readonly presentation: {
    readonly referenceViewportWidthPx: number;
    readonly minimumPanelWidthPx: number;
    /** FR-009, FR-010: the smallest viewport the four regions hold, measured then declared. */
    readonly minimumViewportWidthPx: number;
    readonly minimumViewportHeightPx: number;
    readonly panelGapPx: number;
    readonly pageGutterPx: number;
    readonly controlsWidthPx: number;
    readonly detailWidthPx: number;
  };
  readonly horizons: { readonly leadHours: number[] };
}

export const declared = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as DeclaredGeometry;

/** The declared horizons, in order. The row draws exactly these and no others (G-05). */
export const LEADS: readonly number[] = [...declared.horizons.leadHours].sort((a, b) => a - b);
