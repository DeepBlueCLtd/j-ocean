import { z } from 'zod';

/**
 * The declared values (constitution Principle X).
 *
 * Every number the SRD calls *declared* is named here and nowhere else. A component that
 * wants the grid size, the timestep, the frame budget or a horizon takes it from a loaded
 * `Configuration`; there is no literal for any of them in `src/`.
 *
 * The schema is the single source of both the runtime check and the static type, which is
 * why it is written in code rather than as a separate JSON Schema document: a
 * hand-written interface beside a `.json` schema is two claims about the same thing, and
 * they drift.
 */

/** A 64-bit seed, written as exactly sixteen lowercase hex characters. */
export const seedSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/, 'a seed is exactly sixteen lowercase hexadecimal characters');

const instantSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
    'an instant is an ISO 8601 UTC timestamp, for example 2019-06-01T00:00:00Z',
  )
  .refine((s) => Number.isFinite(Date.parse(s)), 'the instant is not a real date');

const windowSchema = z
  .object({
    start: instantSchema,
    end: instantSchema,
    /** A multiple of the source product's own three-hourly resolution. */
    strideHours: z.number().int().positive().refine((h) => h % 3 === 0, 'the source is three-hourly'),
    /**
     * The reanalysis has occasional missing snapshots, so a stride of six hours can land on
     * a nine-hour step. The build step records every gap and refuses any that exceeds this
     * figure, naming the instants: a gap is never silently interpolated at build time, and
     * how large a gap is tolerable is declared rather than judged at review (Principle X).
     */
    maxInstantGapHours: z.number().positive().optional(),
  })
  .refine((w) => Date.parse(w.end) > Date.parse(w.start), {
    error: 'a window ends after it starts',
    path: ['end'],
  });

const hoursIn = (window: { start: string; end: string }): number =>
  (Date.parse(window.end) - Date.parse(window.start)) / 3_600_000;

const waypointSchema = z.object({
  lonDeg: z.number().min(-180).max(180),
  latDeg: z.number().min(-90).max(90),
  /** Hours after the run's start instant. */
  offsetHours: z.number().nonnegative(),
});

const instrumentSchema = z.object({
  id: z.string().min(1),
  variable: z.string().min(1),
  /** FR-12: the instrument's own noise, declared rather than assumed. */
  noiseStandardDeviationDegC: z.number().nonnegative(),
  /**
   * What the measurement cannot know: the truth record is 1/12 degree and six-hourly, so a
   * point sample of the real ocean differs from it by more than instrument noise. Declaring
   * this separately from instrument noise is what lets the surface say which is which.
   */
  representativenessStandardDeviationDegC: z.number().nonnegative(),
  /** FR-32: an instrument may be declared broken. Zero unless a reader breaks one. */
  biasDegC: z.number(),
});

const domainSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /** Degrees east, in [-180, 180]. */
    west: z.number().min(-180).max(180),
    east: z.number().min(-180).max(180),
    /** Degrees north. */
    south: z.number().min(-90).max(90),
    north: z.number().min(-90).max(90),
    /**
     * FR-11: one domain is the eventful default and one is deliberately bland. The
     * character is declared rather than diagnosed, because feature 002's variance-ratio
     * test checks the declaration and would have nothing to check if the code inferred it.
     */
    character: z.enum(['eventful', 'bland']),
    /** Recorded from the first artefact, never inferred (review R-2). */
    nativeResolutionDegrees: z.number().positive(),
    /**
     * How much coarser the truth record is than the model grid. Declared here and checked
     * below against the box and the grid, so that it is a claim the schema can refuse
     * rather than a number nobody rereads.
     */
    truthToModelResolutionRatio: z.number().positive(),
  })
  .refine((d) => d.east > d.west, { error: 'east must be greater than west' })
  .refine((d) => d.north > d.south, { error: 'north must be greater than south' });

/** The declared widths the workspace's three columns of panes are built out of. */
export interface PaneWidths {
  /**
   * What the workspace costs beyond its panes: the horizons pane's own padding, and the
   * chrome the layout manager puts between columns that is not a sash. Beat 013 called this
   * the page gutter, when the surface was a page with a margin; the workspace is full bleed,
   * and the figure is now what the panes do not get rather than what the window keeps clear.
   */
  readonly pageGutterPx: number;
  readonly controlsWidthPx: number;
  readonly detailWidthPx: number;
  readonly panelGapPx: number;
  readonly minimumPanelWidthPx: number;
  readonly workspace: {
    readonly sashWidthPx: number;
    readonly paneMinimumWidthPx: number;
  };
}

/**
 * The window width the workspace needs to hold every declared horizon at the declared minimum
 * panel width: the two flanking panes **at their minimum**, the sashes between them, whatever
 * the horizons pane costs beyond its panels, and the panels with their own gaps between them.
 *
 * **At their minimum, and this is the correction beat 018 makes.** Beat 013 built this sum out
 * of `controlsWidthPx` and `detailWidthPx`, because in a grid of fixed tracks those were what
 * the flanking columns were, always. The floor that came out was 2 038 px, and an ordinary
 * 2 000 px monitor therefore got the below-the-floor answer -- with 828 px of that floor being
 * chrome that had been declared unshrinkable rather than measured. In a workspace the panes
 * flex: a control surface reads at `workspace.paneMinimumWidthPx`, and the reader who wants it
 * wider drags the sash. So the floor is what the panes cannot go below, and the declared widths
 * are what they open at.
 *
 * One function rather than the sum written out wherever it is wanted. Two copies of an
 * arithmetic can each agree with configuration and still disagree with each other, which is
 * how a declared figure quietly stops describing the layout it names.
 */
export function workspaceWidthPx(widths: PaneWidths, horizonCount: number): number {
  return (
    widths.pageGutterPx +
    2 * widths.workspace.paneMinimumWidthPx +
    2 * widths.workspace.sashWidthPx +
    horizonCount * widths.minimumPanelWidthPx +
    (horizonCount - 1) * widths.panelGapPx
  );
}

export const configurationSchema = z
  .object({
    schemaVersion: z.literal(8),

    run: z.object({
      /**
       * FR-012 and review R-4: the recorded case is this seed. A visit that does not ask
       * for a new run gets this run, so that two readers discussing "the recorded case"
       * are discussing the same fields.
       */
      defaultSeed: seedSchema,
      recordedCaseLabel: z.string().min(1),
    }),

    clock: z.object({
      /** The instant step zero is valid for. Simulation time starts here and nowhere else. */
      epoch: instantSchema,
      /** FR-05: the stated timestep. */
      timestepSeconds: z.number().int().positive(),
      /**
       * FR-05: the stated stability criterion. Beat 001 records it; beat 003's kernel is
       * the first thing that has to satisfy it, and its plan checks the arithmetic.
       */
      stabilityCriterionCfl: z.number().positive().max(1),
    }),

    grid: z.object({
      /**
       * FR-06: configurable, and starts at 100 x 100. There is no declared cell size: a
       * five-degree box is not square in kilometres at Gulf Stream latitudes, so the model
       * computes dx and dy from the domain box and this grid and reports them as computed
       * figures. Declaring one number for both would be declaring something untrue.
       */
      nx: z.number().int().min(2).max(4096),
      ny: z.number().int().min(2).max(4096),
    }),

    horizons: z.object({
      /**
       * FR-13: every horizon declared here is rendered and no panel is drawn for one that
       * is not. Gate G-05 checks that against the running shell in beat 007.
       */
      leadHours: z.array(z.number().nonnegative()).min(1),
    }),

    budget: z.object({
      /** NFR-04: a number in configuration, not a judgement made at review time. */
      frameBudgetMs: z.number().positive(),
    }),

    /**
     * Beat 007. The row is the primary surface, and "all six visible at once" is a claim
     * about geometry, so the geometry is declared rather than left to a stylesheet. The
     * stylesheet reads these as custom properties; nothing about the row's width is a
     * literal in CSS (Principle X).
     */
    presentation: z.object({
      /**
       * The window width at which FR-13's "all visible at once" is a promise. Narrower than
       * this, the row's own container scrolls and the page still does not.
       */
      referenceViewportWidthPx: z.number().int().positive(),
      /**
       * Beat 018, FR-011. The window the workspace is designed for and photographed at, on
       * both axes now rather than on width alone: the author's stated floor is "at least 2k
       * wide", and a reference width with no height beside it cannot say whether the panes
       * fill the screen. Measured from the built workspace by
       * `tests/shell/viewport-floor.spec.ts`, which also measures the dead space at it.
       */
      referenceViewportHeightPx: z.number().int().positive(),
      /** Below this a panel stops being legible, so the row stops shrinking panels. */
      minimumPanelWidthPx: z.number().int().positive(),
      /**
       * Beat 013, FR-009 and FR-010. The smallest viewport the workspace holds, in CSS pixels,
       * **measured from the built layout** by `tests/shell/viewport-floor.spec.ts` rather than
       * chosen here.
       *
       * The two axes answer different questions, which beat 018's second pass had to separate
       * (spec 018 FR-012, FR-013).
       *
       * The **width** is what the row needs: every declared horizon at
       * `minimumPanelWidthPx`, plus what the flanking panes cost at the width below which they
       * cannot be read. Below it the surface says the width it needs and the centre carries one
       * horizon with the strip carrying the rest (FR-049); it does not shrink six panels past
       * legibility and it does not scroll the row. It is a media query on this figure alone.
       *
       * The **height** is what a floor otherwise is: below it a pane clips. It decides nothing
       * about what is drawn, and the first pass of beat 018 made it decide, which is how the
       * defect happened -- 960 was declared, no browser window is 960 px tall, and so every
       * reader fell below the floor and met the answer meant for a small window. It must stay
       * below the shortest viewport in `tests/shell/declared-geometry.ts`'s matrix, and
       * `viewport-matrix.spec.ts` asserts that as arithmetic.
       *
       * CSS pixels, so a nominally adequate window at 200 per cent zoom is below the floor
       * and gets the same answer. That is the correct behaviour and not a bug: the reader at
       * 200 per cent has as few pixels to read six panels in as the reader with a small
       * window.
       */
      minimumViewportWidthPx: z.number().int().positive(),
      minimumViewportHeightPx: z.number().int().positive(),
      /**
       * Beat 013. The width of the controls column, which is fixed because FR-047 says
       * selecting something may not move any other region by a pixel, and a column that
       * sizes itself to its contents moves whenever its contents change.
       *
       * It is 390 px because that is two panels and the gap between them. The detail region
       * has to draw FR-028's profile editor whole and a column one panel wide clips it,
       * which would leave a reader dragging a point they cannot see the end of; the controls
       * column takes the same width because a narrower one turns every button's label into
       * one word per line. The number is here rather than derived in code so that a reader
       * asking how wide the column is finds the answer in the file that declares the
       * geometry (Principle X) -- and so that changing it is a change to a declared figure
       * rather than to an expression.
       */
      controlsWidthPx: z.number().int().positive(),
      /** The detail column's width. 390 px, for the reason above. */
      detailWidthPx: z.number().int().positive(),
      panelGapPx: z.number().int().nonnegative(),
      /**
       * What the workspace costs beyond its panes, across the window: the horizons pane's own
       * padding and any chrome between columns that is not a sash. Zero page margin, because
       * beat 018's surface is full bleed -- an instrument does not keep a margin clear.
       */
      pageGutterPx: z.number().int().nonnegative(),
      /**
       * Beat 018, ADR-0014. The workspace's declared geometry: what the panes are laid out to
       * before a reader moves anything, and where their arrangement is kept.
       *
       * Every figure here is furniture. None of it is a forecast input, which is the whole of
       * why the arrangement may persist at all (constitution Principle IX, amendment of
       * 8 September 2026): a persisted run would be a second way to bring a forecast back with
       * none of the manifest's checks, and a persisted pane width is a preference.
       */
      workspace: z.object({
        /** The status strip, which is not a pane: it never tabs and never closes (FR-58). */
        statusHeightPx: z.number().int().positive(),
        /** How much of the selection column the provenance tabs take by default. */
        provenanceFraction: z.number().gt(0).lt(1),
        /**
         * The most of the horizons pane's height the skill curve may take (SRD-v2 FR-45).
         *
         * FR-45 makes the row the payload and gives it the dominant space, and the curve is
         * an aid to reading the figures the panels already carry. Left to fill what the row
         * does not use it took **694 px of a 1 359 px pane** at the reference viewport --
         * more than the row itself, for six points -- so the share it may take is declared
         * rather than left to be whatever is going spare. A chart takes what it needs; the
         * payload takes the room.
         */
        skillCurveFraction: z.number().gt(0).lt(1),
        /** Below this a pane cannot be read, so the layout manager stops shrinking it. */
        paneMinimumWidthPx: z.number().int().positive(),
        paneMinimumHeightPx: z.number().int().positive(),
        /** The draggable divider between two panes, as the layout manager draws it. */
        sashWidthPx: z.number().int().nonnegative(),
        /*
         * The mask and the card placed against it (spec 018 FR-014, FR-016, Principle X).
         *
         * The mask is geometry and ink, so its figures are declared here beside the other
         * furniture rather than written into the stylesheet. Nothing here is computed and
         * nothing here is a forecast quantity: what a step lights is measured from the pane at
         * the moment it is shown, and these say only how dark the rest is and where the card
         * goes beside it.
         */
        /**
         * How far the surface dims what a reader is being asked to look away from.
         *
         * One figure and not two. The walkthrough's scrim dims everything a step is not about,
         * and the over-budget decision dims the whole workspace behind it; those are the same
         * claim about the same ink, and beat 015's lesson is that two rules written for one
         * claim are two rules that drift. It was `walkthroughMaskOpacity` while the walkthrough
         * was the only thing that dimmed anything.
         *
         * A share of the ink and not a colour of its own, so the dim is luminance: the claim
         * is that a monochrome print still says what is lit, and a scrim declared as a hue
         * would be the second palette this surface has refused twice.
         */
        maskOpacity: z.number().gt(0).lt(1),
        /** The card's own width, which is also what its placement is worked out from. */
        walkthroughCardWidthPx: z.number().int().positive(),
        /** The least room a card is placed in. Below this a card is a scrollbar with a sentence in it. */
        walkthroughCardMinimumHeightPx: z.number().int().positive(),
        /** Between the lit pane's edge and the card, so the card is beside it and not on it. */
        walkthroughCardGapPx: z.number().int().nonnegative(),
        /**
         * The widest a modal decision may be drawn (FR-016).
         *
         * A cap and not a width: the dialog is as wide as its own figures need and no wider,
         * up to this. It is declared because it is the one dimension that decides whether a
         * figure wraps, and the requirement on this dialog is that neither figure is ever
         * truncated. What it is emphatically not is a **pane's** width -- the notice it
         * replaced was laid out in the controls pane, and at a large declared font its
         * `Integrate anyway` was painted below the foot of the pane with no way to reach it.
         */
        modalWidthPx: z.number().int().positive(),
        /** Where the arrangement is kept. Geometry and pane identity only; see workspace.ts. */
        storageKey: z.string().min(1),
        /**
         * The shape of what is stored. A stored arrangement written against another version
         * is not applied: it is reported and the default is restored (FR-005), because a
         * layout that half-applies is worse than one that did not.
         */
        layoutVersion: z.number().int().positive(),
      }),
      /**
       * Beat 015, FR-049. The strip's geometry, declared beside the row's.
       *
       * The strip is the row surviving an enlargement: every declared horizon, the enlarged
       * one marked, each with a thumbnail of its own field and its own skill figures. Its
       * height is declared rather than fitted because the centre's height is declared, and a
       * strip that sized itself to its contents would move the panel beneath it whenever a
       * horizon went from unscored to scored.
       */
      strip: z.object({
        heightPx: z.number().int().positive(),
        /**
         * How wide a thumbnail is drawn. It is a *display* size: the canvas is the grid's own
         * size and the browser scales it, because averaging cells into a smaller array would
         * be a quantity computed for a picture (FR-040).
         */
        thumbnailWidthPx: z.number().int().positive(),
      }),
      /**
       * Beat 015. What the centre costs beyond one panel's field, in CSS pixels.
       *
       * The centre's height is declared rather than fitted, and it is what makes FR-049's
       * "replace the contents of the centre region only" true of the geometry rather than of
       * the intention: a centre that sized itself to its contents would be a different height
       * with an enlarged panel in it than with the row, and the scores region beneath would
       * move on a click.
       *
       * It is expressed against the field because that is what the height is mostly made of:
       * a row panel's field is a square at the track width, so the centre is one track wide
       * plus this -- the panel's header and labels, the legend beneath the row, and the strip
       * an enlargement puts above it. Measured from the built layout, as beat 013 measured the
       * floor, and held by `tests/shell/enlargement.spec.ts`, which requires the centre's
       * rectangle to be identical with the row and with an enlarged panel in it, and requires
       * the row to fit it with nothing to spare.
       */
      centreChromeHeightPx: z.number().int().positive(),
      /**
       * Beat 018, fifth pass. The room a field's own label and colour scale take beneath the
       * picture, **in the reader's own text size**.
       *
       * The pre-row centre draws a square picture in a box whose height and width are both
       * decided by the pane, and the square has to be the smaller of the two less whatever the
       * label costs. A container query can ask the box how wide and how tall it is; it cannot
       * ask how tall the words under the picture came out. So the reserve is declared, like
       * every other length in this layout, and the census in `tests/shell/census.ts` is what
       * holds it honest: a reserve too small puts the label over the caption below it and the
       * overlap census fails by name.
       *
       * **Root ems and no longer pixels, which is beat 018's eighth pass.** The thing being
       * reserved for is *text*, and text is the one length on this surface the reader sets:
       * every part of that label -- its font size, its colour scale, the margin above it -- is
       * written in `rem`, so a reserve in pixels is right at exactly one declared font size and
       * short at every larger one. Measured at a 24 px root font it was 7 px short, and the
       * picture spilled its own box by that much at three viewports of six -- which is what the
       * new font axis in `tests/shell/reader-font.spec.ts` was added to find. 4.5 rem is 72 px
       * at the 16 px default, so nothing moves for a reader who has not changed it.
       *
       * Measured from the built surface at that default: the label and its colour scale are
       * 46.4 px tall at every viewport in the declared matrix, and 66.8 px in a column of
       * 230 px or narrower, where the label wraps to a second line. 4.5 rem declares the
       * wrapped case.
       */
      fieldLabelHeightRem: z.number().positive(),
      /**
       * The half-range the panels draw interface-depth anomalies against. Drawn raw, at a
       * limit that showed any structure at all, six panels were a uniform red; the scorer
       * compares anomalies, so the row draws them.
       */
      anomalyLimitMetres: z.number().positive(),
      /** FR-019's second channel: a cell above this weight is hatched, not merely tinted. */
      attributionHatchThreshold: z.number().min(0).max(1),
      /** Beat 008. How the observation footprint is drawn over and beneath a panel. */
      footprint: z.object({
        /**
         * Two profiles within this of each other are the same place as far as the drawing is
         * concerned, and are offset from each other so both are visible.
         */
        colocationToleranceDegrees: z.number().positive(),
        needleOffsetPx: z.number().int().positive(),
        /** The height of the enlarged panel's depth elevation. */
        elevationHeightPx: z.number().int().positive(),
        /**
         * Above this many levels a needle draws its ticks only while hovered. An Argo profile
         * carries five hundred; drawn always, they are a solid bar that says less than the
         * extent line already does.
         */
        levelTickLimit: z.number().int().positive(),
      }),
    }),

    /**
     * Beat 010. The thresholds the counterfactuals are judged against, declared so that
     * "the edit propagated" and "the measurement was worth something" are measurements
     * against a stated bar rather than impressions (AT-03, AT-06).
     */
    counterfactual: z.object({
      /** A difference above this is outlined on the difference field (FR-029). */
      differenceOutlineMetres: z.number().positive(),
      differenceLimitMetres: z.number().positive(),
      at06: z.object({
        nearHorizonHours: z.number().nonnegative(),
        farHorizonHours: z.number().positive(),
        /** The near horizon must move by at least this, or the edit did nothing visible. */
        minimumNearChangeMetres: z.number().positive(),
        /** And the far horizon by at most this fraction of it, or nothing decayed. */
        maximumFarFractionOfNear: z.number().positive().max(1),
      }),
      at03: z.object({
        regionRadiusKm: z.number().positive(),
        minimumInsideSkillDrop: z.number().positive(),
        outsideSkillTolerance: z.number().positive(),
      }),
    }),

    domains: z.object({
      defaultId: z.string().min(1),
      list: z.array(domainSchema).min(1),
    }),

    /**
     * Beat 009 owns issue times; they are declared here because FR-011 asks the schema to
     * enforce that the truth period is long enough to carry them, and it cannot check an
     * arithmetic whose terms live somewhere else.
     */
    forecast: z.object({
      spinUpHours: z.number().nonnegative(),
      issueTimes: z.object({
        firstOffsetHours: z.number().nonnegative(),
        lastOffsetHours: z.number().positive(),
        strideHours: z.number().positive(),
      }),
      /**
       * Beat 009, FR-027 and FR-006. How far past its issue instant a forecast claims to be
       * valid. A panel whose valid instant is beyond it says so and draws nothing: there is no
       * field to give it that would not be an extrapolation, and an extrapolation drawn beside
       * five forecasts would read as one.
       */
      validityWindowHours: z.number().positive(),
      /**
       * The quay-side instant, as an offset from the run's start. The departure brief is the
       * analysis at this instant, held constant and never refreshed (FR-026).
       */
      quaysideOffsetHours: z.number().nonnegative(),
      /** The range and step of the issue-time control (§11): one control, declared bounds. */
      issueTimeControl: z.object({
        earliestOffsetHours: z.number().nonnegative(),
        latestOffsetHours: z.number().positive(),
        resolutionHours: z.number().positive(),
      }),
    }),

    truth: z.object({
      source: z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        /** How the subset is taken. See ADR-0004 for why it is not the DAP protocol. */
        service: z.enum(['ncss', 'dap']),
        baseUrl: z.string().url(),
        nativeResolutionDegrees: z.number().positive(),
      }),
      period: windowSchema,
      /** Exact levels of the source product, so the build step interpolates nothing. */
      depthLevelsMetres: z.array(z.number().nonnegative()).min(2),
      contrast: z.object({
        /** FR-11: the eventful domain must beat the bland one by at least this much. */
        minimumEventfulToBlandVarianceRatio: z.number().positive(),
      }),
    }),

    /** The physics (FR-05, FR-001). Every constant the model uses is one of these. */
    model: z.object({
      kernelId: z.string().min(1),
      precision: z.enum(['float64']),
      /** ADR-0001: the reduced gravity that makes the wave speed slow enough to integrate. */
      reducedGravityMetresPerSecondSquared: z.number().positive(),
      meanUpperLayerThicknessMetres: z.number().positive(),
      /** Outcropping is clamped here, and the clamp is counted and published. */
      minimumLayerThicknessMetres: z.number().positive(),
      lateralViscosityMetresSquaredPerSecond: z.number().nonnegative(),
      bottomDragPerSecond: z.number().nonnegative(),
      /** Leapfrog's computational mode is damped by this. It costs a little energy. */
      robertAsselinCoefficient: z.number().min(0).max(0.5),
      /** FR-012: the open boundary, relaxed toward the initial state over a declared margin. */
      sponge: z.object({
        widthCells: z.number().int().nonnegative(),
        timescaleSeconds: z.number().positive(),
      }),
      /** FR-009: integration is chunked so the interface stays responsive. */
      chunkSteps: z.number().int().positive(),
      /**
       * FR-010 and review R-1: depth is displayed, never integrated. These declare the
       * two-layer thermal structure the profile is diagnosed from, which beat 004 also uses
       * as the observation operator (ADR-0005).
       */
      thermalStructure: z.object({
        upperTemperatureDegC: z.number(),
        deepTemperatureDegC: z.number(),
        transitionThicknessMetres: z.number().positive(),
        displayLevelsMetres: z.array(z.number().nonnegative()).min(3),
      }),
      tolerances: z.object({
        /**
         * FR-006. Two figures, because there are two claims. With the sponge off the
         * scheme's continuity equation conserves volume to round-off, and that is what the
         * closed-boundary tolerance holds it to. With the sponge on -- the configuration
         * that ships -- the open boundary exchanges mass with the state it relaxes toward
         * and the outcrop clamp adds a little, so the drift is bounded rather than absent.
         * Reporting one number for both would hide which of them was being tested.
         */
        volumeRelativeDrift: z.number().positive(),
        closedBoundaryVolumeRelativeDrift: z.number().positive(),
        energyRelativeDrift: z.number().positive(),
        varianceBandOfInitial: z.tuple([z.number().positive(), z.number().positive()]),
        /** ADR-0002: what a second kernel is accepted against the reference to. */
        kernelAcceptanceRelative: z.number().positive(),
      }),
    }),

    /** The instruments, and the checks their observations pass through (FR-12, FR-24, FR-32). */
    instruments: z.object({
      qualityControl: z.object({
        /** FR-007's "quality control off" toggle, which beat 010 wires to a control. */
        enabled: z.boolean(),
        grossRange: z.object({ minimumDegC: z.number(), maximumDegC: z.number() }),
        climatologyDepartureStandardDeviations: z.number().positive(),
        verticalInversionToleranceDegC: z.number().nonnegative(),
        /**
         * Beat 010. A profile this fraction of whose levels failed a declared check is not
         * trusted at any depth, and the interface depth derived from it is flagged so the
         * analysis excludes it. Without this the flags stopped at the levels and the
         * observation the analysis actually consumes never learned it was suspect.
         */
        profileRejectionFraction: z.number().positive().max(1),
      }),
      argo: z.object({
        /** ADR-0007, review R-3. The author's to set false; no code changes if they do. */
        assimilate: z.boolean(),
        note: z.string().min(1),
      }),
      surface: instrumentSchema,
      xbt: instrumentSchema.extend({
        depthsMetres: z.array(z.number().nonnegative()).min(2),
        /** An XBT's depth is inferred from fall rate, so it is wrong by a fraction of itself. */
        depthErrorFraction: z.number().nonnegative(),
      }),
      track: z.object({
        sampleIntervalHours: z.number().positive(),
        /**
         * Beat 010, FR-009. A redrawn track has to be sailable: legs are checked against
         * this and, by the declared rule, the instants are stretched rather than the edit
         * refused -- an edit a reader cannot make is worse than one the surface explains.
         */
        vesselSpeedKnots: z.number().positive(),
        waypoints: z.array(waypointSchema).min(2),
      }),
      drops: z.array(waypointSchema).min(1),
    }),

    /** The analysis (FR-16, FR-17, review R-7, ADR-0006). */
    analysis: z.object({
      /** ADR-0006: the analysis works in interface depth, which is the model's own variable. */
      stateVariable: z.literal('interface_depth'),
      /** How wrong the background is expected to be, in metres of interface depth. */
      backgroundErrorStandardDeviationMetres: z.number().positive(),
      /**
       * What a point measurement of the thermocline cannot know about a *cell's* interface
       * depth, in metres. This is not the instrument's error and it is much larger: the
       * observation operator's formal error is under a metre, and a 4.5 km cell's mean
       * interface differs from a point sounding by tens of metres of mesoscale variability.
       *
       * Declaring it separately is not tidiness. Without it the analysis believes an
       * interface observation fifty times more than the background, two Argo profiles twenty
       * kilometres apart become nearly collinear, and the gain produces per-observation
       * shares above 200 per cent against shares below zero -- which is what happened.
       */
      interfaceRepresentativenessMetres: z.number().positive(),
      /**
       * Review R-7's warning made concrete: the influence radius a reader sees is a property
       * of *this number*, not of the ocean. The surface labels it declared, never computed.
       */
      correlationLengthScaleKilometres: z.number().positive(),
      /** The prior blend. With no observations the weights are exactly (this, 1 - this, 0). */
      priorBackgroundWeight: z.number().min(0).max(1),
      /** Where an observation's influence stops being worth drawing (AT-03). */
      influenceThreshold: z.number().positive().max(1),
      weightSumTolerance: z.number().positive(),
      /** FR-010: a declared bound, not a judgement made at review time. */
      timeBudgetMs: z.number().positive(),
      /** A one-sided bound is admitted with its error inflated by this much. */
      boundErrorInflationFactor: z.number().min(1),
    }),

    climatology: z.object({ window: windowSchema }),

    observations: z.object({
      source: z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        indexUrl: z.string().url(),
        profileBaseUrl: z.string().url(),
      }),
    }),
  })
  .refine((c) => c.domains.list.some((d) => d.id === c.domains.defaultId), {
    error: 'domains.defaultId must name one of domains.list',
    path: ['domains', 'defaultId'],
  })
  .refine((c) => new Set(c.domains.list.map((d) => d.id)).size === c.domains.list.length, {
    error: 'domain ids must be unique',
    path: ['domains', 'list'],
  })
  .refine(
    (c) => c.horizons.leadHours.every((h, i, all) => i === 0 || h > (all[i - 1] as number)),
    { error: 'horizons.leadHours must be strictly increasing', path: ['horizons', 'leadHours'] },
  )
  /**
   * FR-13 says every declared horizon is visible at once at the declared reference width.
   * That is arithmetic, so it is checked here rather than discovered in a screenshot: a
   * seventh horizon declared without widening the reference width is refused, instead of
   * quietly becoming a row that scrolls.
   */
  /**
   * Beat 009. The default issue time must be one the control can reach and the validity
   * window must cover the declared horizons from it, or the recorded case would open with a
   * panel refusing itself.
   */
  .refine(
    (c) =>
      c.forecast.issueTimeControl.earliestOffsetHours <= c.forecast.spinUpHours &&
      c.forecast.spinUpHours <= c.forecast.issueTimeControl.latestOffsetHours,
    {
      error: 'forecast.spinUpHours (the default issue time) is outside forecast.issueTimeControl',
      path: ['forecast', 'issueTimeControl'],
    },
  )
  .refine((c) => c.forecast.validityWindowHours >= Math.max(...c.horizons.leadHours), {
    error: 'forecast.validityWindowHours is shorter than the longest declared horizon',
    path: ['forecast', 'validityWindowHours'],
  })
  .refine(
    (c) =>
      c.horizons.leadHours.includes(c.counterfactual.at06.nearHorizonHours) &&
      c.horizons.leadHours.includes(c.counterfactual.at06.farHorizonHours),
    {
      error: 'counterfactual.at06 names horizons that are not declared',
      path: ['counterfactual', 'at06'],
    },
  )
  .refine((c) => c.forecast.quaysideOffsetHours <= c.forecast.spinUpHours, {
    error: 'forecast.quaysideOffsetHours must not be after the default issue time',
    path: ['forecast', 'quaysideOffsetHours'],
  })
  .refine(
    (c) =>
      c.presentation.referenceViewportWidthPx - c.presentation.pageGutterPx >=
      c.horizons.leadHours.length * c.presentation.minimumPanelWidthPx +
        (c.horizons.leadHours.length - 1) * c.presentation.panelGapPx,
    {
      error:
        'presentation.referenceViewportWidthPx is too narrow to show every declared horizon at presentation.minimumPanelWidthPx',
      path: ['presentation', 'referenceViewportWidthPx'],
    },
  )
  /**
   * Beat 013, FR-009 and FR-010. The declared floor has to be a floor for *this*
   * configuration. A seventh horizon costs a panel and a gap, and a floor that no longer
   * holds the horizons beside it is the fault beat 007 found coming back: a declared number
   * that has quietly stopped describing the layout it names. So the arithmetic is done here,
   * and the refusal prints it rather than asserting a verdict.
   */
  .superRefine((c, ctx) => {
    const p = c.presentation;
    const n = c.horizons.leadHours.length;
    const needed = workspaceWidthPx(p, n);
    if (p.minimumViewportWidthPx >= needed) return;
    ctx.addIssue({
      code: 'custom',
      message:
        `presentation.minimumViewportWidthPx (${String(p.minimumViewportWidthPx)}) cannot hold ` +
        `${String(n)} declared horizons at presentation.minimumPanelWidthPx: ` +
        `${String(p.pageGutterPx)} workspace chrome + 2 x ` +
        `${String(p.workspace.paneMinimumWidthPx)} flanking panes at their minimum + 2 x ` +
        `${String(p.workspace.sashWidthPx)} sashes + ` +
        `${String(n)} x ${String(p.minimumPanelWidthPx)} panels + ` +
        `${String(n - 1)} x ${String(p.panelGapPx)} panel gaps = ${String(needed)} px`,
      path: ['presentation', 'minimumViewportWidthPx'],
    });
  })
  /**
   * Beat 018. A pane opens at its declared width and may be dragged down to the declared pane
   * minimum. A default narrower than the minimum is a width the layout manager would correct
   * the moment it laid out, which is a declared figure that does not describe the layout.
   */
  .refine(
    (c) =>
      c.presentation.controlsWidthPx >= c.presentation.workspace.paneMinimumWidthPx &&
      c.presentation.detailWidthPx >= c.presentation.workspace.paneMinimumWidthPx,
    {
      error:
        'presentation.controlsWidthPx or detailWidthPx is below presentation.workspace.paneMinimumWidthPx, ' +
        'so a pane would open narrower than the layout manager will let it be',
      path: ['presentation', 'workspace', 'paneMinimumWidthPx'],
    },
  )
  /**
   * Beat 018, FR-011. The reference viewport is the window the workspace is designed for, so
   * it cannot be smaller than the window the workspace refuses to lay out in. Declaring a
   * reference below the floor would mean every figure in the documentation was taken in a
   * window the workspace does not fit.
   */
  .superRefine((c, ctx) => {
    const p = c.presentation;
    if (
      p.referenceViewportWidthPx >= p.minimumViewportWidthPx &&
      p.referenceViewportHeightPx >= p.minimumViewportHeightPx
    ) {
      return;
    }
    ctx.addIssue({
      code: 'custom',
      message:
        `presentation.referenceViewportWidthPx x referenceViewportHeightPx ` +
        `(${String(p.referenceViewportWidthPx)} x ${String(p.referenceViewportHeightPx)}) is ` +
        `below the declared floor of ${String(p.minimumViewportWidthPx)} x ` +
        `${String(p.minimumViewportHeightPx)}, so the reference window is one the workspace ` +
        'declines to lay out in',
      path: ['presentation', 'referenceViewportHeightPx'],
    });
  })
  /**
   * Beat 015. A thumbnail is a picture of a panel, so it is smaller than one. A strip whose
   * slots were panel-width would be a second row, which is the thing the strip replaces.
   */
  .refine(
    (c) => c.presentation.strip.thumbnailWidthPx < c.presentation.minimumPanelWidthPx,
    {
      error:
        'presentation.strip.thumbnailWidthPx is not smaller than presentation.minimumPanelWidthPx, ' +
        'so the strip is a second row rather than a strip',
      path: ['presentation', 'strip', 'thumbnailWidthPx'],
    },
  )
  /**
   * The reference width is the width the documentation photographs the application at, so it
   * may not be narrower than the width at which the application is whole.
   */
  .refine(
    (c) => c.presentation.referenceViewportWidthPx >= c.presentation.minimumViewportWidthPx,
    {
      error:
        'presentation.referenceViewportWidthPx is below presentation.minimumViewportWidthPx, ' +
        'so the reference is a viewport the application refuses to lay out',
      path: ['presentation', 'referenceViewportWidthPx'],
    },
  )
  .refine(
    (c) =>
      c.model.thermalStructure.displayLevelsMetres.every(
        (d, i, all) => i === 0 || d > (all[i - 1] as number),
      ),
    {
      error: 'model.thermalStructure.displayLevelsMetres must be strictly increasing',
      path: ['model', 'thermalStructure', 'displayLevelsMetres'],
    },
  )
  .refine(
    (c) => c.model.thermalStructure.upperTemperatureDegC > c.model.thermalStructure.deepTemperatureDegC,
    {
      error: 'the upper layer must be warmer than the deep layer, or the profile is upside down',
      path: ['model', 'thermalStructure'],
    },
  )
  .refine(
    (c) => c.model.minimumLayerThicknessMetres < c.model.meanUpperLayerThicknessMetres,
    {
      error: 'the outcrop clamp must be thinner than the mean layer it clamps',
      path: ['model', 'minimumLayerThicknessMetres'],
    },
  )
  .refine(
    (c) => c.model.sponge.widthCells * 4 < Math.min(c.grid.nx, c.grid.ny),
    {
      error: 'the sponge would take more than a quarter of the grid from each side',
      path: ['model', 'sponge', 'widthCells'],
    },
  )
  .refine(
    (c) =>
      c.truth.depthLevelsMetres.every((d, i, all) => i === 0 || d > (all[i - 1] as number)),
    { error: 'truth.depthLevelsMetres must be strictly increasing', path: ['truth', 'depthLevelsMetres'] },
  )
  /**
   * FR-011, and the reason the forecast block is declared this early. The truth period has
   * to carry the whole experiment: spin-up, then issue times, then the longest horizon from
   * the last issue time. Getting this wrong is the kind of mistake that surfaces as an
   * unexplained empty panel three beats later, so the schema does the arithmetic.
   */
  .refine(
    (c) =>
      hoursIn(c.truth.period) >=
      c.forecast.issueTimes.lastOffsetHours +
        Math.max(...c.horizons.leadHours),
    {
      error:
        'truth.period is too short: it must cover the last issue time plus the longest horizon',
      path: ['truth', 'period'],
    },
  )
  .refine(
    (c) =>
      c.instruments.track.waypoints.every(
        (w, i, all) => i === 0 || w.offsetHours > (all[i - 1] as { offsetHours: number }).offsetHours,
      ),
    { error: 'the track must go forwards in time', path: ['instruments', 'track', 'waypoints'] },
  )
  .refine(
    (c) =>
      c.instruments.xbt.depthsMetres.every((d, i, all) => i === 0 || d > (all[i - 1] as number)),
    { error: 'the XBT depths must increase', path: ['instruments', 'xbt', 'depthsMetres'] },
  )
  /**
   * A quality-control threshold below the instrument's own noise flags the instrument rather
   * than the ocean. This was not a hypothetical: the first declared inversion tolerance was
   * 0.05 degC against an XBT whose total error is 0.22 degC, and every real profile tripped
   * it in the weakly stratified deep water. The schema now refuses that configuration.
   */
  .refine(
    (c) =>
      c.instruments.qualityControl.verticalInversionToleranceDegC >
      2 *
        Math.hypot(
          c.instruments.xbt.noiseStandardDeviationDegC,
          c.instruments.xbt.representativenessStandardDeviationDegC,
        ),
    {
      error:
        'the vertical-inversion tolerance is below twice the XBT total error, so the check ' +
        'would flag the instrument rather than the ocean',
      path: ['instruments', 'qualityControl', 'verticalInversionToleranceDegC'],
    },
  )
  /**
   * The spec's second edge case, checked here rather than discovered at run time: a drop or a
   * waypoint outside the domain would sample nothing, and the failure should name it.
   */
  .refine(
    (c) => {
      const domain = c.domains.list.find((d) => d.id === c.domains.defaultId);
      if (domain === undefined) return true;
      const inside = (p: { lonDeg: number; latDeg: number }): boolean =>
        p.lonDeg >= domain.west &&
        p.lonDeg <= domain.east &&
        p.latDeg >= domain.south &&
        p.latDeg <= domain.north;
      return c.instruments.track.waypoints.every(inside) && c.instruments.drops.every(inside);
    },
    {
      error: 'a track waypoint or an XBT drop lies outside the default domain',
      path: ['instruments'],
    },
  )
  .refine(
    (c) =>
      Math.max(
        ...c.instruments.track.waypoints.map((w) => w.offsetHours),
        ...c.instruments.drops.map((d) => d.offsetHours),
      ) <= (Date.parse(c.truth.period.end) - Date.parse(c.truth.period.start)) / 3_600_000,
    {
      error: 'an instrument samples after the truth record ends',
      path: ['instruments'],
    },
  )
  /**
   * The spec's fourth edge case. An analysis in which everything influences everything is
   * not one the attribution can explain, so a length scale at or above the domain's own
   * size is refused rather than merely discouraged.
   */
  .refine(
    (c) => {
      const domain = c.domains.list.find((d) => d.id === c.domains.defaultId);
      if (domain === undefined) return true;
      const widthKm = (domain.east - domain.west) * 111.32 * Math.cos(((domain.south + domain.north) / 2) * (Math.PI / 180));
      const heightKm = (domain.north - domain.south) * 110.574;
      return c.analysis.correlationLengthScaleKilometres < Math.min(widthKm, heightKm) / 2;
    },
    {
      error:
        'the correlation length scale is at least half the domain, so every observation would ' +
        'influence every cell and the attribution could not explain anything',
      path: ['analysis', 'correlationLengthScaleKilometres'],
    },
  )
  .refine((c) => c.forecast.spinUpHours <= c.forecast.issueTimes.firstOffsetHours, {
    error: 'the first issue time must be at or after the end of spin-up',
    path: ['forecast', 'issueTimes', 'firstOffsetHours'],
  })
  .refine(
    (c) => Date.parse(c.clock.epoch) === Date.parse(c.truth.period.start),
    { error: 'the clock epoch must be the instant the truth period starts', path: ['clock', 'epoch'] },
  )
  .refine(
    (c) =>
      c.domains.list.every(
        (d) => Math.abs(d.nativeResolutionDegrees - c.truth.source.nativeResolutionDegrees) < 1e-9,
      ),
    { error: 'a domain records a native resolution the truth source does not have', path: ['domains', 'list'] },
  )
  /**
   * Review R-2 in one line of arithmetic: the declared ratio has to be the ratio the box
   * and the grid actually imply, or it is a number nobody rereads.
   */
  .refine(
    (c) =>
      c.domains.list.every((d) => {
        const modelCellDegrees = (d.east - d.west) / c.grid.nx;
        return Math.abs(d.truthToModelResolutionRatio - d.nativeResolutionDegrees / modelCellDegrees) < 1e-6;
      }),
    {
      error:
        'truthToModelResolutionRatio does not match the box, the grid and the native resolution',
      path: ['domains', 'list'],
    },
  );

export type Configuration = z.infer<typeof configurationSchema>;
export type Domain = Configuration['domains']['list'][number];
