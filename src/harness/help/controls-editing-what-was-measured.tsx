import type { HelpEntry } from './entry.js';

/**
 * `controls/editing-what-was-measured` (SRD-v1 FR-028, FR-031; beat 010).
 *
 * Both paragraphs arrived from the application page: beat 014 found them explaining controls
 * rather than reporting anything, and sent them here by name
 * (`docs/narrative-disposition.json`, `help:controls/editing-what-was-measured`).
 */
export const ENTRY: HelpEntry = {
  panel: 'controls/editing-what-was-measured',
  explains: [
    {
      feature: 'editing a profile',
      body: () => (
        <>
          <p>
            A profile is edited where it was measured: enlarge a panel, click a needle, and the
            measurement fills the detail region with its levels draggable and the measured
            profile kept behind them as a ghost.
          </p>
          <p>
            There is no button for it here, and there should not be. It edits one measurement,
            so it belongs at that measurement rather than in the column of things that drive
            every panel at once.
          </p>
        </>
      ),
    },
    {
      feature: 'redrawing the track',
      body: () => (
        <>
          <p>
            Enlarge a panel and drag a waypoint. The instruments resample truth where you put
            it, through the same instruments and the same noise streams.
          </p>
          <p>
            So this is not a picture of a different track: it is the run the vessel would have
            made, measured with the errors it would have had. Sail somewhere the front is not
            and watch the analysis lose the front.
          </p>
        </>
      ),
    },
  ],
};
