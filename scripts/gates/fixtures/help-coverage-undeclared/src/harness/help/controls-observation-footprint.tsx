import type { HelpEntry } from './entry.js';

export const ENTRY: HelpEntry = {
  panel: 'controls/observation-footprint',
  explains: [
    {
      feature: 'the observation footprint',
      body: () => (
        <p>
          The footprint is everything the run measured, drawn over every panel in the same
          marks: the vessel&rsquo;s surface track, each XBT drop, and the external profiles it
          was allowed to see.
        </p>
      ),
    },
  ],
};
