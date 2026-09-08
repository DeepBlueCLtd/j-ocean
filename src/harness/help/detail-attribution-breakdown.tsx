import type { HelpEntry } from './entry.js';

/**
 * `detail/attribution-breakdown` (SRD-v1 FR-018; SRD-v2 FR-047).
 *
 * The sentence about what a breakdown is an instrument of came off this region in beat 014
 * (`docs/narrative-disposition.json`, `help:detail/attribution-breakdown`); the first sentence
 * of each explanation is the walkthrough's fifth step, kept when the walkthrough retired.
 */
export const ENTRY: HelpEntry = {
  panel: 'detail/attribution-breakdown',
  explains: [
    {
      feature: "a cell's breakdown",
      body: () => (
        <>
          <p>
            Click a cell and this region fills with that cell&rsquo;s own breakdown: how much of
            the answer there came from observations, from the advected background, and from
            climatology.
          </p>
          <p>
            It is read from the weights the analysis actually used in that cell, not computed
            again for the picture. A breakdown is an instrument of a selected cell, never a
            per-panel summary &mdash; that was specified first and was wrong. A panel-wide bar
            can be computed from something other than the analysis, and eventually would be; a
            cell&rsquo;s weights cannot.
          </p>
        </>
      ),
    },
    {
      feature: "a measurement's own profile",
      body: () => (
        <>
          <p>
            Click a measurement&rsquo;s mark and it fills with that profile beside the
            model&rsquo;s derived one. Filling it moves nothing else on the surface, which is the
            point of it having a region of its own.
          </p>
          <p>
            The measured levels are kept behind the model&rsquo;s as a ghost, so what the
            instrument reported and what the model would have said in the same place are read
            against each other rather than one after the other.
          </p>
        </>
      ),
    },
  ],
};
