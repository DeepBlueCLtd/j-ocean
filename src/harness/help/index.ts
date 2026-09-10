import { ENTRY as centreAttribution } from './centre-attribution.js';
import { ENTRY as centreHorizonPanel } from './centre-horizon-panel.js';
import { ENTRY as centreHorizonRow } from './centre-horizon-row.js';
import { ENTRY as controlsEditing } from './controls-editing-what-was-measured.js';
import { ENTRY as controlsIssueTime } from './controls-issue-time.js';
import { ENTRY as controlsManifest } from './controls-manifest.js';
import { ENTRY as controlsObservationFootprint } from './controls-observation-footprint.js';
import { ENTRY as controlsRun } from './controls-run.js';
import { ENTRY as detailAttributionBreakdown } from './detail-attribution-breakdown.js';
import { ENTRY as scores } from './scores.js';
import type { Explanation, HelpEntry } from './entry.js';

/**
 * Every help entry there is (spec 016 FR-001, FR-004).
 *
 * One module per panel and one import per module, so adding an explanation is adding a file
 * and a line and nothing else. The collection is not the authority on what should exist --
 * `panels.json` is, and gate G-08 compares the two in both directions: a declared feature with
 * no explanation, and an explanation naming a feature or a panel that does not exist.
 */
export const HELP_ENTRIES: readonly HelpEntry[] = [
  controlsRun,
  controlsIssueTime,
  controlsEditing,
  controlsObservationFootprint,
  controlsManifest,
  centreHorizonRow,
  centreAttribution,
  centreHorizonPanel,
  scores,
  detailAttributionBreakdown,
];

const BY_PANEL = new Map(HELP_ENTRIES.map((entry) => [entry.panel, entry]));

/** What explains this panel, or nothing at all. A panel with nothing shows no control. */
export function helpFor(panelId: string): readonly Explanation[] {
  return BY_PANEL.get(panelId)?.explains ?? [];
}

export type { Explanation, HelpEntry };
