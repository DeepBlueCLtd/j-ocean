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

export const configurationSchema = z
  .object({
    schemaVersion: z.literal(3),

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
      /** Below this a panel stops being legible, so the row stops shrinking panels. */
      minimumPanelWidthPx: z.number().int().positive(),
      panelGapPx: z.number().int().nonnegative(),
      /** What the page keeps clear of the window edge, on both sides together. */
      pageGutterPx: z.number().int().nonnegative(),
      /**
       * The half-range the panels draw interface-depth anomalies against. Drawn raw, at a
       * limit that showed any structure at all, six panels were a uniform red; the scorer
       * compares anomalies, so the row draws them.
       */
      anomalyLimitMetres: z.number().positive(),
      /** FR-019's second channel: a cell above this weight is hatched, not merely tinted. */
      attributionHatchThreshold: z.number().min(0).max(1),
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
