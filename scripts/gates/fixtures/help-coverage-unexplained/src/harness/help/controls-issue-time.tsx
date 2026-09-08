import type { HelpEntry } from './entry.js';

export const ENTRY: HelpEntry = {
  panel: 'controls/issue-time',
  explains: [
    {
      feature: 'lead time and issue time',
      body: () => (
        <p>
          Lead time is how far ahead a forecast looks and issue time is when it was made. The
          row is the first axis; this control is the second, and conflating them is the one
          confusion this surface was built to remove.
        </p>
      ),
    },
  ],
};
