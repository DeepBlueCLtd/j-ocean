import type { HelpEntry } from './entry.js';

export const ENTRY: HelpEntry = {
  panel: 'centre/horizon-row',
  explains: [
    {
      feature: 'building the row',
      body: () => (
        <p>
          Building the row means integrating the analysis forward four days, which takes a
          couple of seconds, so it happens when you ask. The panel this explains was deleted
          and this explanation survived it.
        </p>
      ),
    },
  ],
};
