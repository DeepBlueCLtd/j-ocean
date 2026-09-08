import { Declared } from '../figures.js';
import type { HelpEntry } from './entry.js';

/**
 * `centre/attribution` (SRD-v1 FR-016, FR-017; constitution Principle IV).
 *
 * The sentence about what the radius is a property of came off this region in beat 014
 * (`docs/narrative-disposition.json`, `help:centre/attribution`). Beat 018 took the two
 * clauses that had been explaining the field from inside the legend beneath the row: what the
 * hatching is for, and why every panel shows the same field. The legend keeps the labels --
 * *hatched where observations lead the background and the climatology*, *the same field on
 * every panel* -- and the reasons are here, which is the division spec 018 FR-007 draws.
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
    {
      feature: 'the hatched channel',
      body: () => (
        <>
          <p>
            The hatching marks the cells where the observations led the background and the
            climatology, and it is a second channel: the field reads with the colour taken
            out, in a monochrome print or to a reader who cannot separate the palette.
          </p>
          <p>
            It carries the same fact the darkness carries, drawn a second way rather than a
            second fact drawn once. A picture whose meaning is in its colour alone is a
            picture that says nothing to some of its readers.
          </p>
        </>
      ),
    },
    {
      feature: 'the same field on every panel',
      body: () => (
        <>
          <p>
            Every panel of the row draws the same attribution field, because this run makes
            one analysis, at the instant the forecast was issued. Six different fields would
            imply six analyses, so the legend says which it is rather than leaving the row to
            suggest otherwise.
          </p>
          <p>
            Attribution becomes one field per horizon when the forecast cycles &mdash; an
            analysis at each issue time, each with its own weights. That is a change to what
            the model does and not to how it is drawn, so it is owed rather than deferred.
          </p>
        </>
      ),
    },
  ],
};
