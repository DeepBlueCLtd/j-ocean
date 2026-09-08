import { Declared } from '../figures.js';
import type { HelpEntry } from './entry.js';

/**
 * `centre/attribution` (SRD-v1 FR-016, FR-017; constitution Principle IV).
 *
 * The sentence about what the radius is a property of came off this region in beat 014
 * (`docs/narrative-disposition.json`, `help:centre/attribution`).
 */
export const ENTRY: HelpEntry = {
  panel: 'centre/attribution',
  explains: [
    {
      feature: 'the influence radius',
      body: (config) => (
        <>
          <p>
            Dark is where observations carried the weight; pale is where the answer came from
            the advected background and the climatology instead. It is not a picture drawn to
            illustrate the answer: it is the analysis&rsquo;s own gain, exported from the same
            arithmetic that produced the field, which is why it cannot disagree with it.
          </p>
          <p>
            How far a measurement reaches is the declared correlation length scale,{' '}
            <Declared>{config.analysis.correlationLengthScaleKilometres} km</Declared>, and not
            something the ocean was asked about. An observation across a front influences the far
            side exactly as much as its own, which the flow would not.
          </p>
          <p>
            That is the honest limit of this analysis, and seeing it as a circle rather than
            reading it in a paragraph is the reason the weights are drawn at all.
          </p>
        </>
      ),
    },
  ],
};
