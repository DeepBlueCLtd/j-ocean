import type { HelpEntry } from './entry.js';

export const ENTRY: HelpEntry = {
  panel: 'centre/attribution',
  explains: [
    {
      feature: 'the influence radius',
      body: () => (
        <p>
          How far a measurement reaches is the declared correlation length scale, and not
          something the ocean was asked about. An observation across a front influences the far
          side exactly as much as its own, which the flow would not.
        </p>
      ),
    },
  ],
};
