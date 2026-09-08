import { Declared } from '../figures.js';
import type { HelpEntry } from './entry.js';

/**
 * `controls/issue-time` (SRD-v2 §7, the lead time and issue time row).
 *
 * The one confusion this surface was built to remove. Staleness and lead time are conflated
 * almost everywhere a forecast is drawn, and only two controls can pull them apart: this one
 * moves the instant the forecast was made, and the row is the lead time being asked of it. The
 * middle paragraph is the walkthrough's third step, kept when the walkthrough retired.
 */
export const ENTRY: HelpEntry = {
  panel: 'controls/issue-time',
  explains: [
    {
      feature: 'lead time and issue time',
      body: (config) => (
        <>
          <p>
            A forecast has two ages and they are usually said as one number.
          </p>
          <p>
            Two axes, not one: lead time runs across the row, and issue time is a control on the
            left. Moving the issue time earlier gives the analysis fewer observations and is the
            clearest way to watch skill change.
          </p>
          <p>
            The row is the first axis, one panel per declared horizon &mdash;{' '}
            <Declared>{config.horizons.leadHours.join(', ')} h</Declared>. This slider is the
            second, and moving it leaves every panel valid for the instant it was already valid
            for. What changes is how long ago the analysis was run and how much it had to work
            with by then, so each panel becomes a longer forecast of the same moment. That is why
            the whole curve drops bodily rather than sliding sideways.
          </p>
          <p>
            Re-issuing re-integrates, so it happens when you ask rather than while you drag.
            Until you ask, the row says which forecast it is still showing.
          </p>
        </>
      ),
    },
  ],
};
