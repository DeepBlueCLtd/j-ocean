import { Declared } from '../figures.js';
import type { HelpEntry } from './entry.js';

/**
 * `centre/horizon-panel` (SRD-v1 FR-014, FR-015, FR-019, FR-027; SRD-v2 FR-049 to FR-051).
 *
 * The panel a reader is most likely to be confused in front of, which is the whole argument of
 * FR-052: the explanation opens where they are looking rather than three panels away.
 */
export const ENTRY: HelpEntry = {
  panel: 'centre/horizon-panel',
  explains: [
    {
      feature: 'what a panel says',
      body: () => (
        <>
          <p>
            The picture is the interface between the two layers, drawn as an anomaly about its
            own mean: cool is a shallower interface, warm a deeper one. Under it the panel says
            the instant it is <em>valid for</em>, the instant it was <em>initialised from</em>,
            and the lead that was actually asked of the model &mdash; which is the difference
            between the two, and stops matching the heading the moment you move issue time.
          </p>
          <p>
            A panel outside its forecast&rsquo;s validity draws nothing and says why. There is no
            field to give it that would not be an extrapolation, and an extrapolation drawn
            beside five forecasts would be read as one of them.
          </p>
        </>
      ),
    },
    {
      feature: 'the attribution layer',
      body: (config) => (
        <>
          <p>
            <em>Show where the answer came from</em>, in the controls, replaces every
            panel&rsquo;s field with the weight observations carried in each cell. Dark is more,
            and the hatching marks the cells where observations carried more than the advected
            background and the climatology &mdash; above a declared threshold of{' '}
            <Declared>{config.presentation.attributionHatchThreshold}</Declared>.
          </p>
          <p>
            The hatch is a second channel on purpose. A field that could only be read in colour
            would be a field a monochrome print, or a reader who does not see the difference,
            could not read at all.
          </p>
        </>
      ),
    },
    {
      feature: 'enlarging a panel',
      body: () => (
        <>
          <p>
            Enlarging replaces what the centre region holds and nothing else. The controls, the
            scores and whatever is selected keep their places to the pixel, and the row survives
            above the panel as a strip carrying every horizon and what each was worth &mdash;
            because comparison across horizons is the lesson, and an enlargement that hid the
            other five would trade the lesson for the detail.
          </p>
          <p>
            It changes what is shown and never what is computed: the same field object is drawn
            large that was drawn small. What the room buys is fidelity &mdash; each measurement
            at the depth it actually reached, and a waypoint you can drag.
          </p>
        </>
      ),
    },
  ],
};
