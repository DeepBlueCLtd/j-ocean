import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The geometry the shell tests measure against, read from the file the shell is served.
 *
 * One module rather than a copy in each spec, because two tests that each recompute the same
 * arithmetic can agree with configuration and still disagree with each other.
 *
 * Every figure here is **declared**. Beat 013 left the two column widths undeclared and
 * derived them in code, and T041 finished the job. Beat 018 changed what the floor is made of
 * rather than that it is declared: the flanking panes now flex, so the floor is built from
 * `workspace.paneMinimumWidthPx` and not from the widths the panes *open* at. The floor itself
 * is still measured from the built workspace by `tests/shell/viewport-floor.spec.ts`, which
 * still checks that the declaration is the measurement.
 */

export const CONFIG_PATH = fileURLToPath(new URL('../../config/j-ocean.json', import.meta.url));

export interface DeclaredGeometry {
  readonly presentation: {
    /** The window the workspace is designed for, on both axes (spec 018 FR-011). */
    readonly referenceViewportWidthPx: number;
    readonly referenceViewportHeightPx: number;
    readonly minimumPanelWidthPx: number;
    /** FR-009, FR-010: the smallest viewport the workspace holds, measured then declared. */
    readonly minimumViewportWidthPx: number;
    readonly minimumViewportHeightPx: number;
    readonly panelGapPx: number;
    readonly pageGutterPx: number;
    /** What the flanking panes open at. Not what the floor is made of: see `workspace`. */
    readonly controlsWidthPx: number;
    readonly detailWidthPx: number;
    readonly workspace: {
      readonly statusHeightPx: number;
      readonly provenanceFraction: number;
      /** FR-045: the most of the horizons pane the skill curve may take. */
      readonly skillCurveFraction: number;
      readonly paneMinimumWidthPx: number;
      readonly paneMinimumHeightPx: number;
      readonly sashWidthPx: number;
      readonly storageKey: string;
      readonly layoutVersion: number;
    };
  };
  readonly horizons: { readonly leadHours: number[] };
}

export const declared = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as DeclaredGeometry;

/** The declared horizons, in order. The row draws exactly these and no others (G-05). */
export const LEADS: readonly number[] = [...declared.horizons.leadHours].sort((a, b) => a - b);

/** The reference viewport, on both axes: where the workspace is measured and photographed. */
export const REFERENCE = {
  width: declared.presentation.referenceViewportWidthPx,
  height: declared.presentation.referenceViewportHeightPx,
};

/** The declared floor, on both axes: the smallest window the workspace lays out in. */
export const FLOOR = {
  width: declared.presentation.minimumViewportWidthPx,
  height: declared.presentation.minimumViewportHeightPx,
};

/** What the horizon row itself needs: every declared horizon at the declared minimum. */
export const ROW_WIDTH_PX =
  LEADS.length * declared.presentation.minimumPanelWidthPx +
  (LEADS.length - 1) * declared.presentation.panelGapPx +
  declared.presentation.pageGutterPx;

/**
 * Every pane the workspace draws, by the id the layout manager knows it by.
 *
 * Not a second list: it is the ids `src/harness/App.tsx` hands the workspace, and
 * `tests/shell/workspace.spec.ts` asserts that exactly these are on the surface, so a pane
 * added or renamed without this being updated fails by name rather than passing unnoticed.
 */
export const PANE_IDS: readonly string[] = [
  'controls',
  'horizons',
  'selection',
  'provenance/run',
  'provenance/instruments',
  'provenance/truth',
  'provenance/manifest',
];
