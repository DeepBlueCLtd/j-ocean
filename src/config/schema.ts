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
    schemaVersion: z.literal(2),

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
      /** FR-06: configurable, and starts at 100 x 100. */
      nx: z.number().int().min(2).max(4096),
      ny: z.number().int().min(2).max(4096),
      cellSizeMetres: z.number().positive(),
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
