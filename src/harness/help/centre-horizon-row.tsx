import { Declared } from '../figures.js';
import type { HelpEntry } from './entry.js';

/**
 * `centre/horizon-row` (SRD-v1 FR-013, ADR-0003; beat 013's FR-048 statement).
 *
 * Three pieces of writing meet here. The sentence about what building costs came off this
 * region in beat 014 (`docs/narrative-disposition.json`, `help:centre/horizon-row`); the
 * argument for the row over a slider was the walkthrough's third step, and beat 016 kept it
 * when the walkthrough retired; and beat 018 took the sentence beneath the row that explained
 * what the row leaves out (`row-fidelity`).
 *
 * That last one is a distinction FR-051 and spec 018 FR-007 draw between them. FR-051 requires
 * the row to **state that it is showing the field alone**, and it does, in eight words in the
 * legend: *field only -- depths in the enlarged panel*. What the enlarged panel adds and why
 * the row cannot draw it is an explanation, and an explanation is this entry's.
 */
export const ENTRY: HelpEntry = {
  panel: 'centre/horizon-row',
  explains: [
    {
      feature: 'building the row',
      body: (config) => (
        <>
          <p>
            One panel per declared horizon, all visible together rather than behind a slider
            &mdash; a forecast is a shape over lead time, and you cannot see a shape one frame at
            a time.
          </p>
          <p>
            The declared horizons are{' '}
            <Declared>{config.horizons.leadHours.join(', ')} h</Declared>, and no panel is ever
            drawn for a horizon configuration has not declared.
          </p>
          <p>
            Building them means integrating the analysis forward four days, which takes a couple
            of seconds, so it happens when you ask: Build the horizon row is in the controls.
          </p>
        </>
      ),
    },
    {
      feature: 'what the row draws, and what it does not',
      body: () => (
        <>
          <p>
            At the width six panels share, each panel draws the field and nothing over it. The
            row shows the field alone at this size: the attribution layer and each measurement
            at the depth it reached are drawn in the enlarged panel.
          </p>
          <p>
            That is a limit of the picture and never of the arithmetic. Enlarging changes what
            is shown and not what was computed, so a measurement missing from a panel of the
            row informed the forecast exactly as much as it does in the enlargement.
          </p>
        </>
      ),
    },
  ],
};
