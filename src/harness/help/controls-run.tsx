import { Declared } from '../figures.js';
import type { HelpEntry } from './entry.js';

/**
 * `controls/run` (SRD-v2 FR-08, FR-007; spec 018 FR-016).
 *
 * The panel had nothing to explain while its four buttons each said on their own face what
 * they would do. What it has now is the one thing a button's face cannot say: why pressing
 * *Integrate 12 hours* sometimes stops and asks.
 *
 * These words came off the over-budget notice when it became a modal decision
 * (`docs/narrative-disposition.json`, `help:controls/run`). A decision prompt leads with the
 * figures and the choice; three sentences about what a frame budget is were explaining rather
 * than deciding, and FR-007 says where explanation goes.
 */
export const ENTRY: HelpEntry = {
  panel: 'controls/run',
  explains: [
    {
      feature: 'the frame budget',
      body: (config) => (
        <>
          <p>
            An advance is measured before it is finished. Its first chunk is taken and timed,
            and what that step time projects for the longest declared horizon is held against
            the declared frame budget of{' '}
            <Declared>{config.budget.frameBudgetMs} ms</Declared>. Over it, the surface stops
            and asks before going on.
          </p>
          <p>
            The chunk it was measured on counts toward the advance you asked for; nothing
            beyond it has been integrated. Declining leaves the run exactly there, and the
            control is ready to be pressed again.
          </p>
          <p>
            The page is saying so rather than freezing. A budget nobody is told about is a
            surface that goes quiet for seconds and offers no account of itself afterwards,
            which is the thing this question exists to prevent.
          </p>
        </>
      ),
    },
  ],
};
