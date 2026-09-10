import type { HelpEntry } from './entry.js';

/**
 * `controls/manifest` (SRD-v1 FR-034; beat 011).
 *
 * The first paragraph came off the page above the paste box in beat 014
 * (`docs/narrative-disposition.json`, `help:controls/manifest`); the second is the
 * walkthrough's tenth step, kept when the walkthrough retired.
 */
export const ENTRY: HelpEntry = {
  panel: 'controls/manifest',
  explains: [
    {
      feature: 'importing a manifest',
      body: () => (
        <>
          <p>
            Paste one and this visit becomes that run &mdash; rebuilt from its seed and its
            edits, not restored. The schema, the format version, the configuration digest and
            the domain are all checked before anything is provisioned, so a refused import
            leaves the run you have alone.
          </p>
          <p>
            The manifest holds everything needed to rebuild this run and none of its state:
            replay is re-computation, not the restoration of a snapshot. Export it, import it in
            another browser, and the digests should match &mdash; that comparison is what caught
            an analysis that meant two different things.
          </p>
          <p>
            Nothing persists between visits: no storage, no cookie, no run in the address. The
            manifest is the only thing that leaves and the only thing that comes back, which is
            what makes a claim about a run something another person can check rather than
            something they have to take from you.
          </p>
          <p>
            Those sentences are about the forecast itself. A workspace also remembers how you
            arranged it &mdash; pane geometry and pane identity, under one declared key, and
            nothing else: a stored forecast would be a second way to bring one back with none
            of the checks above, while a stored pane width is a preference about furniture.
          </p>
        </>
      ),
    },
  ],
};
