import { Declared } from '../figures.js';
import type { HelpEntry } from './entry.js';

/**
 * `controls/observation-footprint` (SRD-v2 §7, the observation footprint row; beat 008).
 *
 * The counts stay in this column because the toggles that change them are here. What the
 * footprint *is* is an explanation, and this is where it goes.
 */
export const ENTRY: HelpEntry = {
  panel: 'controls/observation-footprint',
  explains: [
    {
      feature: 'the observation footprint',
      body: (config) => (
        <>
          <p>
            The footprint is everything the run measured, drawn over every panel in the same
            marks: the vessel&rsquo;s surface track, sampled every{' '}
            <Declared>{config.instruments.track.sampleIntervalHours} h</Declared>; each XBT drop
            as a glyph whose length is the depth it reached; and Argo profiles, which are
            external and marked as external.
          </p>
          <p>
            It is drawn so that skill can be read against where somebody actually was. A panel
            that is right over the track and wrong two degrees away is a different result from a
            panel that is uniformly mediocre, and only the marks make the difference visible.
          </p>
          <p>
            A measurement that failed a check is drawn as flagged and never omitted. What the
            analysis rejected is part of what the harness did, and a footprint that quietly
            dropped it would be reporting a cleaner run than the one that happened.
          </p>
        </>
      ),
    },
  ],
};
