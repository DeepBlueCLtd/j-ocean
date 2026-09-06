import type { Configuration, Domain } from '../config/schema.js';
import { analyse, type AnalysisRecord } from '../analysis/optimal-interpolation.js';
import { climatologyReferenceOver } from '../instruments/climatology-reference.js';
import {
  argoObservations,
  sampleSurface,
  sampleXbtDrops,
  type SamplingContext,
} from '../instruments/instruments.js';
import {
  applyObservationEdits,
  configurationWith,
  isWithheld,
  type Edit,
  type TrackStretch,
} from '../instruments/edits.js';
import { interfaceFieldFromContainer } from '../instruments/interface-field.js';
import type { Observation, ObservationLevel } from '../instruments/observation.js';
import { gridFor, parametersFor, type ReducedGravityParameters } from '../model/parameters.js';
import { createReducedGravityKernel, THICKNESS } from '../model/reduced-gravity.js';
import type { ModelKernel, ModelState } from '../ports/kernel.js';
import type { TruthSource } from '../ports/truth-source.js';
import type { FieldContainer } from '../truth/container.js';
import type { ObservationRecord } from '../truth/observations.js';
import { initialiseFromTruth } from './initialise-from-truth.js';
import { SeededRng } from './rng.js';

/**
 * One forecast experiment, end to end (FR-008, AT-02).
 *
 * Initialise from the truth record, sample it with the declared instruments, analyse, and
 * integrate the analysis forward to each declared horizon. What comes back is what beat 006
 * scores: a forecast per horizon, the field it started from (which held is the persistence
 * reference), and the climatology.
 *
 * It lives in `src/run/` because it wires rings together and belongs to none of them.
 */

export interface ForecastInputs {
  readonly config: Configuration;
  readonly domain: Domain;
  readonly truth: TruthSource;
  readonly climatology: FieldContainer;
  readonly argo: ObservationRecord;
  /** The instant the forecast is issued. Defaults to the run's start plus spin-up. */
  readonly issueInstantMs: number;
  /**
   * The instant the *declared horizons* are measured from, which fixes the six valid instants
   * the row shows (beat 009, FR-002). Moving the issue time earlier does not move the panels:
   * it makes each of them a longer forecast of the same moment, which is the whole point of
   * having two axes. Defaults to the issue instant, so a caller that has only one axis gets
   * the behaviour it had before.
   */
  readonly anchorInstantMs?: number;
  /**
   * Beat 010. The reader's edits, in order. An edit is a value applied to a fresh run, so
   * reverting is removing it and "byte-identical to the recorded case" is a property of the
   * design rather than a promise about undo.
   */
  readonly counterfactual?: readonly Edit[];
  readonly seed?: string;
}

/** One panel's forecast: a field, or a statement of why there is not one (FR-005). */
export interface HorizonForecast {
  /** The declared horizon. It names the panel and fixes the valid instant. */
  readonly leadHours: number;
  readonly validInstantMs: number;
  /** What was actually asked of the model: valid instant less issue instant. */
  readonly leadFromIssueHours: number;
  readonly field: Float64Array | null;
  /** Present exactly when the field is absent. FR-027: said, never extrapolated. */
  readonly refusal: string | null;
}

export interface ForecastResult {
  readonly parameters: ReducedGravityParameters;
  readonly kernel: ModelKernel;
  readonly box: { west: number; east: number; south: number; north: number };
  /** The analysed field at the issue instant: what every forecast in the row started from. */
  readonly initial: Float64Array;
  readonly climatologyField: Float64Array;
  readonly analysis: AnalysisRecord;
  readonly observations: readonly Observation[];
  readonly externalObservationIds: readonly string[];
  /** One entry per declared horizon, keyed by the declared lead time in hours. */
  readonly byHorizon: ReadonlyMap<number, HorizonForecast>;
  readonly issueInstantMs: number;
  readonly anchorInstantMs: number;
  /**
   * How many observations existed in the run and how many the analysis was allowed to see.
   * They differ whenever the issue instant is not the end of the sampling period, and the
   * difference is what beat 009 exists to make visible.
   */
  readonly observationsAvailable: number;
  readonly observationsWithheld: number;
  /** Beat 010: the edits, what they withheld, the ghosts, and the track's speed statement. */
  readonly edits: readonly Edit[];
  readonly withheldIds: readonly string[];
  readonly ghosts: ReadonlyMap<string, readonly ObservationLevel[]>;
  readonly trackStretch: TrackStretch | null;
  readonly profiles: readonly Observation[];
  readonly argoProfiles: readonly Observation[];
  readonly surface: readonly Observation[];
}

/**
 * The analysis at an issue instant, with nothing integrated forward from it.
 *
 * `runForecast` is this plus the integration; the departure brief is this and nothing else
 * (FR-026), which is why it is a function rather than a stage inside one.
 */
export interface IssueAnalysis {
  readonly parameters: ReducedGravityParameters;
  /** The concrete kernel, because the forecast adopts a state into it. */
  readonly kernel: ReturnType<typeof createReducedGravityKernel>;
  readonly grid: ReturnType<typeof gridFor>;
  readonly box: { west: number; east: number; south: number; north: number };
  readonly background: ModelState;
  readonly analysis: AnalysisRecord;
  readonly climatologyField: Float64Array;
  readonly observations: readonly Observation[];
  readonly externalObservationIds: readonly string[];
  readonly observationsAvailable: number;
  readonly observationsWithheld: number;
  readonly issueInstantMs: number;
  /** The edits this run was made with, in order, and what they did (beat 010). */
  readonly edits: readonly Edit[];
  readonly withheldIds: readonly string[];
  readonly ghosts: ReadonlyMap<string, readonly ObservationLevel[]>;
  readonly trackStretch: TrackStretch | null;
  /** The profiles as sampled and edited, for the footprint to draw. */
  readonly profiles: readonly Observation[];
  readonly argoProfiles: readonly Observation[];
  readonly surface: readonly Observation[];
}

export function analyseAtIssue(inputs: ForecastInputs): IssueAnalysis {
  const { domain, truth } = inputs;
  const edits = inputs.counterfactual ?? [];
  // Three of the five edits are edits to the declared configuration, applied before anything
  // is sampled so the instruments do exactly what they always do with what they are told.
  const { config, stretch } = configurationWith(inputs.config, edits);
  const parameters = parametersFor(config, domain);
  const grid = gridFor(config, domain);
  const kernel = createReducedGravityKernel(parameters);
  const rng = new SeededRng(inputs.seed ?? config.run.defaultSeed);

  // Spin the model up from the truth record at the start of the period, then run it to the
  // issue instant. The forecast starts from a model state that has been integrating, not from
  // truth: a forecast initialised from truth at its own issue time would be scoring the truth
  // record against itself.
  const startMs = Date.parse(config.truth.period.start);
  const { state, report } = initialiseFromTruth(kernel, parameters, truth, domain, startMs, 'surface_elevation');
  const spinUpSteps = Math.round(
    (inputs.issueInstantMs - startMs) / 1000 / config.clock.timestepSeconds,
  );
  const stream = rng.stream('model/kernel');
  for (let step = 0; step < spinUpSteps; step += 1) {
    kernel.step(state, {
      step,
      instantMs: startMs + step * config.clock.timestepSeconds * 1000,
      timestepSeconds: config.clock.timestepSeconds,
      stream,
    });
  }

  const sampling: SamplingContext = {
    config,
    truth,
    rng,
    climatology: climatologyReferenceOver(inputs.climatology),
    structure: parameters.thermalStructure,
    startMs,
  };
  const sampledDrops = sampleXbtDrops(sampling);
  const sampledArgo = argoObservations(inputs.argo, sampling);
  const surface = sampleSurface(sampling);

  // And two are edits to what was measured, applied after.
  const editedDrops = applyObservationEdits(sampledDrops, edits, sampling);
  const editedArgo = applyObservationEdits(sampledArgo, edits, sampling);
  const drops = editedDrops.results;
  const argo = editedArgo.results;
  const ghosts = new Map([...editedDrops.ghosts, ...editedArgo.ghosts]);

  /*
   * Only what had happened by the issue instant (FR-001).
   *
   * The instruments are sampled in full first and filtered afterwards, so that every draw
   * from every named stream happens whichever issue instant is asked for. Filtering earlier
   * would make the noise on an observation depend on when somebody chose to issue a forecast,
   * and two runs at different issue times would no longer be the same run seen twice.
   */
  const sampled = [...drops, ...argo].map((r) => r.interface);
  const observations = sampled
    .filter((o) => o.instantMs <= inputs.issueInstantMs)
    // A withheld observation is excluded from the analysis and kept in the record: the
    // footprint still draws it, in a withheld style, because what a reader withheld is part
    // of what the reader did (FR-006).
    .filter((o) => !isWithheld(edits, o.id));
  const externalObservationIds = argo
    .filter((r) => r.interface.instantMs <= inputs.issueInstantMs)
    .map((r) => r.interface)
    .filter((o) => o.flags.every((flag) => flag.usable))
    .map((o) => o.id);

  const climatologyField = interfaceFieldFromContainer(
    inputs.climatology,
    parameters.thermalStructure,
    report.box,
    grid,
  );

  const analysis = analyse(
    {
      config,
      grid,
      background: (state.fields[THICKNESS] as Float64Array).slice(),
      climatology: climatologyField,
      observations,
    },
    report.box,
  );

  return {
    parameters,
    kernel,
    grid,
    box: report.box,
    background: state,
    analysis,
    climatologyField,
    observations,
    externalObservationIds,
    observationsAvailable: observations.length,
    observationsWithheld: sampled.length - observations.length,
    issueInstantMs: inputs.issueInstantMs,
    edits,
    withheldIds: [...editedDrops.withheldIds, ...editedArgo.withheldIds],
    ghosts,
    trackStretch: stretch,
    profiles: drops.map((r) => r.profile),
    argoProfiles: argo.map((r) => r.profile),
    surface,
  };
}

/**
 * The departure brief (FR-026): the analysis at the declared quay-side instant, held
 * constant and never refreshed.
 *
 * It is correct at issue and loses to the world on its own, which is exactly what a baseline
 * is for. At the quay-side instant of the recorded case no instrument has reported yet, so
 * the brief is the background blended with climatology and nothing else -- a generous
 * baseline rather than a weak one, and the surface says which.
 */
export interface DepartureBrief {
  readonly field: Float64Array;
  readonly instantMs: number;
  readonly observationsUsed: number;
}

export function departureBrief(inputs: ForecastInputs): DepartureBrief {
  const quaysideMs =
    Date.parse(inputs.config.truth.period.start) +
    inputs.config.forecast.quaysideOffsetHours * 3_600_000;
  const at = analyseAtIssue({ ...inputs, issueInstantMs: quaysideMs });
  return {
    field: at.analysis.field.slice(),
    instantMs: quaysideMs,
    observationsUsed: at.observationsAvailable,
  };
}

export function runForecast(inputs: ForecastInputs): ForecastResult {
  const at = analyseAtIssue(inputs);
  const { config } = inputs;
  const { parameters, kernel, grid, analysis } = at;
  const state = at.background;
  // The forecast's own stream, derived by name: it is the same stream whether or not
  // anything else drew from the generator first, so the integration does not depend on how
  // many observations the issue instant happened to admit.
  const forecastStream = new SeededRng(inputs.seed ?? config.run.defaultSeed).stream('model/forecast');

  // The analysis is the initial condition. Integrating it forward is the forecast.
  const analysed: ModelState = kernel.adopt({
    grid,
    fields: {
      [THICKNESS]: analysis.field.slice(),
      velocityU: (state.fields['velocityU'] as Float64Array).slice(),
      velocityV: (state.fields['velocityV'] as Float64Array).slice(),
    },
  });

  const anchorInstantMs = inputs.anchorInstantMs ?? inputs.issueInstantMs;
  const validityMs = config.forecast.validityWindowHours * 3_600_000;
  const byHorizon = new Map<number, HorizonForecast>();
  const horizons = [...config.horizons.leadHours].sort((a, b) => a - b);
  let stepsTaken = 0;
  for (const leadHours of horizons) {
    const validInstantMs = anchorInstantMs + leadHours * 3_600_000;
    const leadMs = validInstantMs - inputs.issueInstantMs;
    const common = {
      leadHours,
      validInstantMs,
      leadFromIssueHours: leadMs / 3_600_000,
    };

    // FR-005 and FR-027: a panel outside the forecast's validity, or before it was issued,
    // says so and gets no field. There is no field to give it that would not be an
    // extrapolation, and an extrapolation drawn beside five forecasts would read as one.
    if (leadMs < 0) {
      byHorizon.set(leadHours, {
        ...common,
        field: null,
        refusal:
          `valid at ${new Date(validInstantMs).toISOString()}, which is before this forecast ` +
          `was issued at ${new Date(inputs.issueInstantMs).toISOString()}`,
      });
      continue;
    }
    if (leadMs > validityMs) {
      byHorizon.set(leadHours, {
        ...common,
        field: null,
        refusal:
          `outside validity: issued ${new Date(inputs.issueInstantMs).toISOString()}, valid to ` +
          `${new Date(inputs.issueInstantMs + validityMs).toISOString()}, and this panel is ` +
          `valid at ${new Date(validInstantMs).toISOString()}`,
      });
      continue;
    }

    const target = Math.round(leadMs / 1000 / config.clock.timestepSeconds);
    while (stepsTaken < target) {
      kernel.step(analysed, {
        step: stepsTaken,
        instantMs: inputs.issueInstantMs + stepsTaken * config.clock.timestepSeconds * 1000,
        timestepSeconds: config.clock.timestepSeconds,
        stream: forecastStream,
      });
      stepsTaken += 1;
    }
    byHorizon.set(leadHours, {
      ...common,
      field: (analysed.fields[THICKNESS] as Float64Array).slice(),
      refusal: null,
    });
  }

  return {
    parameters,
    kernel,
    box: at.box,
    initial: analysis.field.slice(),
    climatologyField: at.climatologyField,
    analysis,
    observations: at.observations,
    externalObservationIds: at.externalObservationIds,
    byHorizon,
    issueInstantMs: inputs.issueInstantMs,
    anchorInstantMs,
    observationsAvailable: at.observationsAvailable,
    observationsWithheld: at.observationsWithheld,
    edits: at.edits,
    withheldIds: at.withheldIds,
    ghosts: at.ghosts,
    trackStretch: at.trackStretch,
    profiles: at.profiles,
    argoProfiles: at.argoProfiles,
    surface: at.surface,
  };
}
