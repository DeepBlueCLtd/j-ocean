import declarations from './panels.json';

/**
 * What every panel of the surface has (SRD-v2 FR-52 to FR-54; spec 016 FR-004).
 *
 * **There is one list of panels, and this is it.** `panels.json` holds it; this module turns
 * it into the type the components take, and a panel is drawn by *naming its declaration* --
 * `<PanelHead panel="controls/manifest" />` -- so a heading on the surface and an entry in the
 * list are the same fact rather than two facts that agree today. That is the whole discipline
 * of FR-054: help kept separately from the thing it explains goes stale silently, and a second
 * list of panels would be that staleness reintroduced by the fix for it.
 *
 * The panes are declared here too, and `Workspace.tsx` lays out from them. So a panel's pane
 * is one of the panes the layout draws, checked by the type rather than by inspection.
 *
 * Gate G-08 reads the same file: every declared feature has a help entry, every entry names a
 * declared panel and feature, and every panel named in `src/harness/` is declared. A panel
 * that declared nothing would therefore not pass trivially -- it would fail to be rendered.
 */

/**
 * The panes of the workspace (SRD-v2 §8.1, ADR-0014), in the order the layout places them.
 *
 * Beat 013 had four regions in a CSS grid: controls, centre, scores, detail. Beat 018 keeps
 * the division by rate of change and loses the grid. `scores` is gone as a place, because each
 * horizon's figures now live **inside its own panel** -- which is what FR-046 asked for and is
 * not achievable across independent panes -- and `centre` and `detail` are named for what they
 * hold rather than for where they sit, because a reader may dock them anywhere.
 *
 * `status` is in this list and is not a dockview pane: it is the strip that carries the
 * statement of FR-58, and a statement that could be closed, tabbed or dragged behind another
 * pane is not one the surface is making. It is a pane for the purposes of gate G-08, which
 * holds every panel's declaration against a place the layout draws.
 *
 * The export keeps its name. `Workspace.tsx` lays out from it, every panel declaration names
 * one of these, and gate G-08 reads this very line -- one list of places, not two.
 */
export const REGIONS = ['controls', 'horizons', 'selection', 'provenance', 'status'] as const;

/** A pane of the workspace. Beat 013 called it a region and the name is kept for the type. */
export type RegionId = (typeof REGIONS)[number];

export interface PanelDeclaration {
  /** `controls/manifest`, `scores`. The region, then what the panel is, where that helps. */
  readonly id: string;
  readonly region: RegionId;
  /** The words at the panel's head. Drawn from here, so the list and the surface agree. */
  readonly heading: string;
  /**
   * The regions or layers this panel has: what it can be asked about. Each one needs a help
   * entry of its own and G-08 names any that has not got one.
   */
  readonly features: readonly string[];
  /**
   * Why this panel has nothing to explain, present exactly when `features` is empty.
   *
   * FR-053 says a panel with no help shows no control and that the absence is information.
   * A reason recorded here is what makes it information: "nobody has written it yet" and
   * "there is nothing to write" look identical from the surface, and only one of them is a
   * finished panel.
   */
  readonly nothingToExplain?: string;
}

interface PanelFile {
  readonly record: string;
  readonly beat: string;
  readonly panels: readonly PanelDeclaration[];
}

export const PANELS: readonly PanelDeclaration[] = (declarations as PanelFile).panels;

const BY_ID = new Map(PANELS.map((panel) => [panel.id, panel]));

/**
 * The declaration for a panel, by id.
 *
 * It throws rather than returning null. A panel drawn from a declaration that does not exist
 * is the failure this list exists to prevent, and G-08 catches it before the tree is built --
 * so reaching this throw means the gate was not run, and a silent fallback would hide that.
 */
export function panelDeclaration(id: string): PanelDeclaration {
  const found = BY_ID.get(id);
  if (found === undefined) {
    throw new Error(
      `no panel is declared with the id "${id}"; declare it in src/harness/panels.json ` +
        '(gate G-08 fails on this too, and is where it should have been caught)',
    );
  }
  return found;
}

/** Whether this panel has anything to explain, which is whether it offers a help control. */
export function hasHelp(panel: PanelDeclaration): boolean {
  return panel.features.length > 0;
}
