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
  })
  .refine((d) => d.east > d.west, { error: 'east must be greater than west' })
  .refine((d) => d.north > d.south, { error: 'north must be greater than south' });

export const configurationSchema = z
  .object({
    schemaVersion: z.literal(1),

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
  );

export type Configuration = z.infer<typeof configurationSchema>;
export type Domain = Configuration['domains']['list'][number];
