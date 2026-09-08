import type { HelpEntry } from './entry.js';

/**
 * `scores` (SRD-v2 §7, the references and skill row; SRD-v1 FR-020 to FR-022).
 *
 * The last paragraph of each explanation came off the application in beat 014
 * (`docs/narrative-disposition.json`, `help:scores`); the first is the walkthrough's fourth
 * step, kept when the walkthrough retired.
 */
export const ENTRY: HelpEntry = {
  panel: 'scores',
  explains: [
    {
      feature: 'skill against a reference',
      body: () => (
        <>
          <p>
            Each panel&rsquo;s skill sits directly beneath that panel, in its own column, rather
            than in a table you would have to match against a heading. A raw error is meaningless
            alone, so there is never one here without two references the harness computes itself.
            Zero means no better than the reference; negative means worse, and it is reported
            rather than tuned. Read the six columns left to right and the decay is there without
            a curve being plotted.
          </p>
          <p>
            The two references are persistence, which is the ocean standing still, and
            climatology, which is the ocean being ordinary for the time of year. A harness that
            could only show the model winning would be an advertisement, so a negative figure is
            printed in the scorer&rsquo;s own words.
          </p>
          <p>
            There is no scores table anywhere else: a table would ask you to match a row label
            against a panel heading at every glance.
          </p>
        </>
      ),
    },
    {
      feature: 'anomalies about their own mean',
      body: () => (
        <>
          <p>
            A reduced-gravity model determines departures from a mean and not the mean itself, so
            every field is compared as an anomaly about its own. The offsets are published rather
            than absorbed.
          </p>
          <p>
            That is why each figure&rsquo;s provenance names the two means it removed, along with
            what it was scored against, where, and over what window. A score whose provenance is
            not on screen is an assertion.
          </p>
        </>
      ),
    },
  ],
};
