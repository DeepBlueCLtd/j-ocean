import type { Configuration, Domain } from '../config/schema.js';
import { analyse, type AnalysisRecord } from '../analysis/optimal-interpolation.js';
import { climatologyReferenceOver } from '../instruments/climatology-reference.js';
import {
  argoObservations,
  sampleXbtDrops,
  type SamplingContext,
} from '../instruments/instruments.js';
import { interfaceFieldFromContainer } from '../instruments/interface-field.js';
import type { Observation } from '../instruments/observation.js';
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
  readonly seed?: string;
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
  /** One field per declared horizon, keyed by lead time in hours. */
  readonly byHorizon: ReadonlyMap<number, Float64Array>;
  readonly issueInstantMs: number;
}

export function runForecast(inputs: ForecastInputs): ForecastResult {
  const { config, domain, truth } = inputs;
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
  const drops = sampleXbtDrops(sampling);
  const argo = argoObservations(inputs.argo, sampling);
  const observations = [...drops, ...argo].map((r) => r.interface);
  const externalObservationIds = argo
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

  // The analysis is the initial condition. Integrating it forward is the forecast.
  const analysed: ModelState = kernel.adopt({
    grid,
    fields: {
      [THICKNESS]: analysis.field.slice(),
      velocityU: (state.fields['velocityU'] as Float64Array).slice(),
      velocityV: (state.fields['velocityV'] as Float64Array).slice(),
    },
  });

  const byHorizon = new Map<number, Float64Array>();
  const horizons = [...config.horizons.leadHours].sort((a, b) => a - b);
  const forecastStream = rng.stream('model/forecast');
  let stepsTaken = 0;
  for (const leadHours of horizons) {
    const target = Math.round((leadHours * 3600) / config.clock.timestepSeconds);
    while (stepsTaken < target) {
      kernel.step(analysed, {
        step: stepsTaken,
        instantMs: inputs.issueInstantMs + stepsTaken * config.clock.timestepSeconds * 1000,
        timestepSeconds: config.clock.timestepSeconds,
        stream: forecastStream,
      });
      stepsTaken += 1;
    }
    byHorizon.set(leadHours, (analysed.fields[THICKNESS] as Float64Array).slice());
  }

  return {
    parameters,
    kernel,
    box: report.box,
    initial: analysis.field.slice(),
    climatologyField,
    analysis,
    observations,
    externalObservationIds,
    byHorizon,
    issueInstantMs: inputs.issueInstantMs,
  };
}
