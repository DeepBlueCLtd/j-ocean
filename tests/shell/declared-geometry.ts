import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The geometry the shell tests measure against, read from the file the shell is served.
 *
 * One module rather than a copy in each spec, because two tests that each recompute the same
 * arithmetic can agree with configuration and still disagree with each other.
 */

export const CONFIG_PATH = fileURLToPath(new URL('../../config/j-ocean.json', import.meta.url));

export interface DeclaredGeometry {
  readonly presentation: {
    readonly referenceViewportWidthPx: number;
    readonly minimumPanelWidthPx: number;
    readonly panelGapPx: number;
    readonly pageGutterPx: number;
    readonly controlsWidthPx?: number;
    readonly detailWidthPx?: number;
  };
  readonly horizons: { readonly leadHours: number[] };
}

export const declared = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as DeclaredGeometry;

/** The declared horizons, in order. The row draws exactly these and no others (G-05). */
export const LEADS: readonly number[] = [...declared.horizons.leadHours].sort((a, b) => a - b);

/**
 * The width at which beat 013's four regions hold every declared horizon at the declared
 * minimum panel width.
 *
 * `referenceViewportWidthPx` was declared by beat 007 for a page on which the row had the whole
 * window. The row now shares the window with a controls column and a detail column, so the
 * width at which "all six visible at once" is a promise is this arithmetic and no longer that
 * figure. T041 measures the floor from the built layout and declares it; until then the
 * geometry is measured against a figure derived from what configuration declares, so it moves
 * with the declaration rather than being chosen here.
 */
export const FOUR_REGION_WIDTH = ((): number => {
  const { presentation } = declared;
  // `flankingWidth` in `src/harness/Regions.tsx`: two panels and the gap between them, which
  // is what a column has to be to draw the profile editor whole.
  const flanking = 2 * presentation.minimumPanelWidthPx + presentation.panelGapPx;
  const controls = presentation.controlsWidthPx ?? flanking;
  const detail = presentation.detailWidthPx ?? flanking;
  const panels = LEADS.length;
  return (
    presentation.pageGutterPx +
    controls +
    detail +
    2 * presentation.panelGapPx +
    panels * presentation.minimumPanelWidthPx +
    (panels - 1) * presentation.panelGapPx
  );
})();
