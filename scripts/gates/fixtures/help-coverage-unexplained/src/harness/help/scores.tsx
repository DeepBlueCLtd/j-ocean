import type { HelpEntry } from './entry.js';

export const ENTRY: HelpEntry = {
  panel: 'scores',
  explains: [
    {
      feature: 'skill against a reference',
      body: () => (
        <p>
          A raw error is meaningless on its own, so there is never one here without two
          references the harness computes itself: persistence and climatology. Zero means no
          better than the reference and negative means worse.
        </p>
      ),
    },
  ],
};
