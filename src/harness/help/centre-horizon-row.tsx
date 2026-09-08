import { Declared } from '../figures.js';
import type { HelpEntry } from './entry.js';

/**
 * `centre/horizon-row` (SRD-v1 FR-013, ADR-0003; beat 013's FR-048 statement).
 *
 * Two pieces of writing meet here. The sentence about what building costs came off this region
 * in beat 014 (`docs/narrative-disposition.json`, `help:centre/horizon-row`); the argument for
 * the row over a slider was the walkthrough's third step, and beat 016 kept it when the
 * walkthrough retired.
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
  ],
};
