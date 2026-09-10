import type { Configuration, Domain } from '../config/schema.js';
import {
  interfaceFieldFromContainer,
  interfaceFieldFromTruth,
} from '../instruments/interface-field.js';
import type { TruthSource } from '../ports/truth-source.js';
import type { FieldContainer } from '../truth/container.js';
import type { DepartureBrief, ForecastResult } from '../run/forecast.js';
import { domainRegion, score, ScoringRefusal, type Score } from '../scoring/scorer.js';

/**
 * Scoring the whole row, headlessly (spec 013 T020, FR-011).
 *
 * This was `HorizonRow.scoreAll`, a `useCallback` that computed every panel's `Score` and put
 * it straight into component state. That made the row's figures obtainable only by rendering
 * the row: gate G-07 had to *copy* the callback's body in order to digest what the surface
 * shows, and plan 013 says what that costs — "a divergence between what the gate digests and
 * what the row draws would be invisible to the gate rather than caught by it". Both callers
 * now call this function, so the gate digests the shell's own arithmetic.
 *
 * Nothing here is new. The order of operations is the callback's order, including the parts
 * that look accidental, because G-07 holds seventeen digests against it and a tidier order
 * would have to prove itself against them first.
 */

/** One horizon's skill against persistence, as the inset plots it. Null where undefined. */
export interface SkillPoint {
  readonly leadHours: number;
  readonly skill: number | null;
}

export interface ScoringRunInputs {
  readonly config: Configuration;
  readonly domain: Domain;
  /** The row's own forecast: its analysis, its grid and its panel per declared horizon. */
  readonly forecast: ForecastResult;
  readonly truth: TruthSource;
  readonly climatology: FieldContainer;
  /** FR-026: the frozen quay-side analysis, scored at each horizon as the baseline. */
  readonly brief: DepartureBrief;
}

export interface ScoringRun {
  /** The issue instant these figures belong to. The inset labels its curve by it. */
  readonly issueInstantMs: number;
  /** One entry per declared horizon; null where the panel had no field to score. */
  readonly scores: ReadonlyMap<number, Score | null>;
  readonly briefScores: ReadonlyMap<number, Score | null>;
  /** In horizon order. Empty when scoring refused, because the callback drew no curve then. */
  readonly points: readonly SkillPoint[];
  /**
   * The refusal, in the scorer's own words, or null. A horizon whose valid instant is outside
   * the record stops the walk: the maps hold what was scored before it, which is what the
   * callback kept and what the row still shows.
   */
  readonly refusal: string | null;
}

/**
 * How many chunks `scoreHorizonByHorizon` yields for this configuration: one per declared
 * horizon. Asked before the work starts, so a control that says *3 of 6* has its total up front.
 */
export function scoringChunkCount(config: Configuration): number {
  return config.horizons.leadHours.length;
}

/**
 * Scoring the row, one horizon at a time (the author's report, beat 018's ninth pass).
 *
 * The count a control shows while it works has to be a real position in the work, and this
 * function already walked the horizons in order. So it yields between them, and the six the
 * loop was always made of are the six the control counts. Nothing else changes: the order of
 * operations is the order the callback had, the `try` still wraps the whole walk so that a
 * horizon outside the record stops it with what was scored before it, and the `yield`s sit
 * between statements. G-07 digests every one of these scores.
 */
export function* scoreHorizonByHorizon(
  inputs: ScoringRunInputs,
): Generator<void, ScoringRun, void> {
  const { config, domain, forecast, truth, climatology, brief } = inputs;
  const horizons = [...config.horizons.leadHours].sort((a, b) => a - b);

  // Both outside the try, as they were: a failure to build the region or the climatology
  // interface is not a scoring refusal and was never reported as one.
  const region = domainRegion(config, forecast.parameters.grid.nx, forecast.parameters.grid.ny);
  const climatologyField = interfaceFieldFromContainer(
    climatology,
    forecast.parameters.thermalStructure,
    forecast.box,
    forecast.parameters.grid,
  );

  const next = new Map<number, Score | null>();
  const briefNext = new Map<number, Score | null>();
  try {
    for (const leadHours of horizons) {
      const panel = forecast.byHorizon.get(leadHours);
      // FR-005: a panel with no field has nothing to score, and says why instead.
      if (panel === undefined || panel.field === null) {
        next.set(leadHours, null);
        briefNext.set(leadHours, null);
        yield;
        continue;
      }
      const validInstantMs = panel.validInstantMs;
      const truthAtValidInstant = interfaceFieldFromTruth(
        truth,
        forecast.parameters.thermalStructure,
        forecast.box,
        forecast.parameters.grid,
        validInstantMs,
      );
      const common = {
        config,
        domain,
        truth,
        initial: forecast.initial,
        climatology: climatologyField,
        truthAtValidInstant,
        region,
        fromInstantMs: forecast.issueInstantMs,
        validInstantMs,
        externalObservationIds: forecast.externalObservationIds,
      };
      next.set(leadHours, score({ ...common, forecast: panel.field }));
      // FR-026: the baseline everything else is watched against, scored the same way at the
      // same instant so the two figures are comparable rather than merely adjacent.
      briefNext.set(
        leadHours,
        score({ ...common, forecast: brief.field, initial: brief.field }),
      );
      // One chunk per declared horizon, including the ones with nothing to score: what the
      // control counts is horizons walked, and a horizon that refused was still walked.
      yield;
    }
  } catch (error) {
    // The spec's second edge case: a horizon whose valid instant is outside the record. The
    // panel still renders its forecast; the score says there is no truth there. The brief
    // scores and the curve are not reported at all in that case, which is what the callback
    // did -- it called `setScores` and neither `setBriefScores` nor `setCurves`.
    return {
      issueInstantMs: forecast.issueInstantMs,
      scores: next,
      briefScores: briefNext,
      points: [],
      refusal: error instanceof ScoringRefusal ? error.message : String(error),
    };
  }

  const points = horizons.map((leadHours) => ({
    leadHours,
    skill: next.get(leadHours)?.skillAgainstPersistence?.value ?? null,
  }));
  return {
    issueInstantMs: forecast.issueInstantMs,
    scores: next,
    briefScores: briefNext,
    points,
    refusal: null,
  };
}

/**
 * Every horizon scored, with nothing between them.
 *
 * The driver over the chunks, and what every caller that is not watching it happen asks: gate
 * G-07 among them, which is the whole reason this function was lifted out of the component in
 * beat 013. One path, whether or not somebody is counting it.
 */
export function scoreEveryHorizon(inputs: ScoringRunInputs): ScoringRun {
  const chunks = scoreHorizonByHorizon(inputs);
  let chunk = chunks.next();
  while (!chunk.done) chunk = chunks.next();
  return chunk.value;
}
