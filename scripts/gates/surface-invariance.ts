import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyse } from '../../src/analysis/optimal-interpolation.js';
import { weightsAt } from '../../src/analysis/attribution.js';
import { sha256Bytes } from '../../src/config/digest.js';
import { loadConfiguration, type LoadedConfiguration } from '../../src/config/load.js';
import type { Configuration } from '../../src/config/schema.js';
import { beginAdvance, stepsPerAdvance } from '../../src/harness/advance.js';
import { footprintOf, type Footprint } from '../../src/harness/footprint.js';
import { scoreEveryHorizon } from '../../src/harness/scoring-run.js';
import { climatologyReferenceOver } from '../../src/instruments/climatology-reference.js';
import {
  interfaceFieldFromContainer,
  interfaceFieldFromTruth,
} from '../../src/instruments/interface-field.js';
import {
  argoObservations,
  sampleSurface,
  sampleXbtDrops,
  type SamplingContext,
} from '../../src/instruments/instruments.js';
import { stateBytes } from '../../src/model/grid.js';
import { parametersFor } from '../../src/model/parameters.js';
import { createReducedGravityKernel, THICKNESS } from '../../src/model/reduced-gravity.js';
import { publishResults } from '../../src/model/results.js';
import { departureBrief, runForecast } from '../../src/run/forecast.js';
import { initialiseFromTruth } from '../../src/run/initialise-from-truth.js';
import { createRun } from '../../src/run/run.js';
import { domainRegion, score } from '../../src/scoring/scorer.js';
import { ArtefactTruthSource } from '../../src/truth/artefact-truth-source.js';
import { FieldContainer } from '../../src/truth/container.js';
import { parseObservationRecord, type ObservationRecord } from '../../src/truth/observations.js';
import { REPO_ROOT } from './gate-lib.js';

/**
 * The producer behind gate G-07: everything the recorded case computes, one digest at a time
 * (spec 013 FR-001, SRD-v2 FR-40, AT-10).
 *
 * Beat 013 moves a 1,301-line component whose presentation and computation have never been
 * separated, and claims it moves no number. Without a committed record of what the code
 * computes today, that claim would be an assertion by the person who did the refactoring,
 * which is the one witness this project never accepts. So this module walks the recorded case
 * from the declared seed through every module that computes anything, and hands back one
 * named digest per quantity with the sentence naming what produced it (Principle V: no figure
 * without its provenance, and a digest is a figure).
 *
 * **The walk mirrors `src/harness/App.tsx`.** `buildRun`, `scoreRun` and `buildRow` are
 * reproduced here in their own order, with their own inputs, because the point of the record
 * is that it is a record of what the shell computes and not of what a headless script found
 * convenient. Where the shell reaches for a literal rather than a declared value, this file
 * says so at the point it copies it.
 *
 * **A mirror is not the thing, and the advance is where that cost something.** This file
 * reproduced the shell's twelve-hour advance as a loop of its own, so the digest below was of
 * a path no reader can take: the shell drove the model chunked and behind a measuring probe,
 * and that path was never walked here. A probe that advanced the run and then left its chunk
 * out of the count went four beats undetected because of it. The advance is now
 * `src/harness/advance.ts` and both callers ask that module, as `scoreEveryHorizon` did for
 * the row's scores in beat 013. Any block below that can be lifted the same way should be.
 *
 * **What `--root` means here.** It is the root the *declared configuration* is read from, so
 * that a fixture can plant one changed coefficient and be watched moving the figures. The
 * data artefacts are always read from the repository, never from `--root`: G-01 already holds
 * those bytes against their conversion, and a second copy of ten megabytes under a fixture
 * would be a fixture of a fixture. A root with no `config/j-ocean.json` — the `clean/`
 * fixture, which holds one source file and nothing else — falls back to the repository's
 * configuration, so that "clean passes every gate" stays a statement about the tree.
 *
 * **The encoding, and why it is not `JSON.stringify`.** Digesting a float through its decimal
 * spelling makes the record hostage to a formatting rule nobody declared. Every number here
 * is digested as its IEEE-754 bytes, written big-endian through a `DataView`, so the encoding
 * does not depend on the host's byte order either. The full grammar, one tag byte then the
 * value:
 *
 *   0 null · 1 false · 2 true · 3 number (8 bytes) · 4 NaN (no payload, so that the several
 *   bit patterns a NaN may carry cannot move a digest) · 5 string (a big-endian `uint32` byte
 *   count, then UTF-8) · 6 array (count, then elements) · 7 object (count, then key/value
 *   pairs with keys sorted in code-unit order and `undefined` members dropped, as
 *   `canonicalise` drops them) · 8 `Float64Array` (count, then each element as a number) ·
 *   9 `Uint8Array` (count, then the bytes).
 *
 * A function or a symbol is refused rather than skipped: a result carrying one is shaped
 * explicitly below, so that a field added to it moves the digest instead of vanishing.
 *
 * The one exception to the big-endian rule is `stateBytes`, which is digested as the bytes
 * that module produces. It is the unit the replay test already compares, and re-encoding it
 * here would digest something no other test digests.
 *
 * **Determinism.** No clock is read and no entropy is drawn (Principle I). The seed is
 * `config.run.defaultSeed`, which is what `createRun` defaults to and what makes this the
 * recorded case.
 */

export interface Quantity {
  readonly name: string;
  readonly digest: string;
  /** One short sentence naming the module and function that computed it. */
  readonly producer: string;
}

/**
 * The lead time `App.tsx` scores the run itself at. Also a literal there: `RunView` is built
 * with `scoringLeadHours: 24` and nothing in configuration says so.
 */
const RUN_SCORING_LEAD_HOURS = 24;

/** Where the configuration is read from, and whether the fallback was taken. */
export interface ConfigurationSource {
  readonly loaded: LoadedConfiguration;
  readonly path: string;
  readonly fellBackToRepository: boolean;
}

/**
 * The declared configuration, through the one loader (Principle X). `tests/support/config.ts`
 * does the same for the suite; the shared half lives here rather than there because
 * `scripts/` may not import from `tests/`.
 */
export function configurationAt(root: string): ConfigurationSource {
  const wanted = join(root, 'config/j-ocean.json');
  const fellBackToRepository = !existsSync(wanted);
  const path = fellBackToRepository ? join(REPO_ROOT, 'config/j-ocean.json') : wanted;
  return { loaded: loadConfiguration(readFileSync(path, 'utf8'), path), path, fellBackToRepository };
}

export interface Artefacts {
  readonly truth: ArtefactTruthSource;
  readonly climatology: FieldContainer;
  readonly observations: ObservationRecord;
}

const bytesOf = (relative: string): ArrayBuffer => {
  const buffer = readFileSync(join(REPO_ROOT, 'data', relative));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

/** The committed artefacts, always from the repository. See the header for why. */
export function artefactsFor(domainId: string): Artefacts {
  return {
    truth: new ArtefactTruthSource(new FieldContainer(bytesOf(`truth/${domainId}.jocean`))),
    climatology: new FieldContainer(bytesOf(`clim/${domainId}.jocean`)),
    observations: parseObservationRecord(readFileSync(join(REPO_ROOT, 'data/obs', `${domainId}.json`), 'utf8')),
  };
}

const TAG = {
  null: 0,
  false: 1,
  true: 2,
  number: 3,
  nan: 4,
  string: 5,
  array: 6,
  object: 7,
  float64: 8,
  bytes: 9,
} as const;

/** A growable byte buffer. Everything multi-byte is written big-endian; see the header. */
class ByteSink {
  #buffer = new Uint8Array(1 << 16);
  #length = 0;

  #reserve(count: number): void {
    if (this.#length + count <= this.#buffer.length) return;
    let size = this.#buffer.length;
    while (size < this.#length + count) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.#buffer.subarray(0, this.#length));
    this.#buffer = grown;
  }

  byte(value: number): void {
    this.#reserve(1);
    this.#buffer[this.#length] = value;
    this.#length += 1;
  }

  uint32(value: number): void {
    this.#reserve(4);
    new DataView(this.#buffer.buffer).setUint32(this.#length, value, false);
    this.#length += 4;
  }

  float64(value: number): void {
    this.#reserve(8);
    new DataView(this.#buffer.buffer).setFloat64(this.#length, value, false);
    this.#length += 8;
  }

  raw(value: Uint8Array): void {
    this.#reserve(value.length);
    this.#buffer.set(value, this.#length);
    this.#length += value.length;
  }

  bytes(): Uint8Array {
    return this.#buffer.subarray(0, this.#length);
  }
}

const UTF8 = new TextEncoder();

function encode(sink: ByteSink, value: unknown): void {
  if (value === null) {
    sink.byte(TAG.null);
    return;
  }
  if (typeof value === 'boolean') {
    sink.byte(value ? TAG.true : TAG.false);
    return;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      sink.byte(TAG.nan);
      return;
    }
    sink.byte(TAG.number);
    sink.float64(value);
    return;
  }
  if (typeof value === 'string') {
    const bytes = UTF8.encode(value);
    sink.byte(TAG.string);
    sink.uint32(bytes.length);
    sink.raw(bytes);
    return;
  }
  if (value instanceof Float64Array) {
    sink.byte(TAG.float64);
    sink.uint32(value.length);
    for (let i = 0; i < value.length; i += 1) encode(sink, value[i] as number);
    return;
  }
  if (value instanceof Uint8Array) {
    sink.byte(TAG.bytes);
    sink.uint32(value.length);
    sink.raw(value);
    return;
  }
  if (Array.isArray(value)) {
    sink.byte(TAG.array);
    sink.uint32(value.length);
    for (const element of value as readonly unknown[]) encode(sink, element);
    return;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    sink.byte(TAG.object);
    sink.uint32(entries.length);
    for (const [key, member] of entries) {
      encode(sink, key);
      encode(sink, member);
    }
    return;
  }
  throw new TypeError(
    `a value of type ${typeof value} cannot be digested: shape it explicitly so that a change to it moves the record`,
  );
}

/** The digest of a value under the encoding this file documents. */
export function digestOfValue(value: unknown): string {
  const sink = new ByteSink();
  encode(sink, value);
  return sha256Bytes(sink.bytes());
}

/** A lead time as it appears in a quantity's name. Stable, and readable in a diff. */
const leadName = (leadHours: number): string => `lead-${String(leadHours)}h`;

/**
 * Walk the recorded case and digest everything it computes.
 *
 * The order below is `App.tsx`'s order, and the comments name the function each block is
 * copied from. Anywhere the shell would have had a choice, the choice made here is stated:
 * the record is only worth what its reproducibility is worth.
 */
export function quantitiesOfRecordedCase(root: string): readonly Quantity[] {
  const quantities: Quantity[] = [];
  const add = (name: string, producer: string, value: unknown): void => {
    quantities.push({ name, digest: digestOfValue(value), producer });
  };

  // ---- the declared configuration ------------------------------------------------------
  const { loaded } = configurationAt(root);
  const config: Configuration = loaded.config;
  quantities.push({
    name: 'configuration',
    digest: loaded.digest,
    producer: 'digestOf in src/config/digest.ts, over the configuration loadConfiguration validated.',
  });

  const domainId = config.domains.defaultId;
  const { truth, climatology, observations } = artefactsFor(domainId);
  const domain = config.domains.list.find((candidate) => candidate.id === domainId);
  if (domain === undefined) throw new RangeError(`no declared domain ${domainId}`);
  const startMs = Date.parse(config.truth.period.start);

  // ---- App.tsx buildRun ----------------------------------------------------------------
  const parameters = parametersFor(config, domain);
  const kernel = createReducedGravityKernel(parameters);
  const { state, report } = initialiseFromTruth(
    kernel,
    parameters,
    truth,
    domain,
    startMs,
    'surface_elevation',
  );
  add(
    'initialisation.report',
    'initialiseFromTruth in src/run/initialise-from-truth.ts reports the box it laid the grid over, the mean it removed and what it clamped.',
    report,
  );

  // The analysis is the analysis at the run's *initial* instant, so the background is taken
  // before anything advances the state. Beat 011 found this the hard way.
  const background = (state.fields[THICKNESS] as Float64Array).slice();

  const run = createRun({
    config,
    configDigest: loaded.digest,
    kernel,
    initialState: state,
    domainId,
    recordedCase: true,
  });
  add(
    'state.step0.bytes',
    'stateBytes in src/model/grid.ts, over the state createRun adopted from initialiseFromTruth before any step.',
    stateBytes(run.state),
  );

  // The instruments sample truth through the port, in the one module allowed to (Principle II).
  const sampling: SamplingContext = {
    config,
    truth,
    rng: run.rng,
    climatology: climatologyReferenceOver(climatology),
    structure: parameters.thermalStructure,
    startMs,
  };
  const surface = sampleSurface(sampling);
  const drops = sampleXbtDrops(sampling);
  const argo = argoObservations(observations, sampling);
  add('instruments.surface', 'sampleSurface in src/instruments/instruments.ts, the ownship thermometer along the declared track.', surface);
  add('instruments.xbtDrops', 'sampleXbtDrops in src/instruments/instruments.ts, each drop as the profile measured and the interface depth it implies.', drops);
  add('instruments.argo', 'argoObservations in src/instruments/instruments.ts, the committed Argo profiles with their flags carried through.', argo);

  const climatologyThickness = interfaceFieldFromContainer(
    climatology,
    parameters.thermalStructure,
    report.box,
    parameters.grid,
  );
  const analysis = analyse(
    {
      config,
      grid: parameters.grid,
      background,
      climatology: climatologyThickness,
      observations: [...drops, ...argo].map((r) => r.interface),
    },
    report.box,
  );
  add('analysis.field', 'analyse in src/analysis/optimal-interpolation.ts, the analysed interface depth at the run\'s initial instant.', analysis.field);
  // Read cell by cell through `weightsAt`, which is how the surface reads them, so the record
  // is of the accessor the breakdown uses and not of the arrays behind it (Principle IV).
  const cells = analysis.grid.nx * analysis.grid.ny;
  const weights: unknown[] = [];
  for (let index = 0; index < cells; index += 1) weights.push(weightsAt(analysis.attribution, index));
  add(
    'analysis.attributionWeights',
    'weightsAt in src/analysis/attribution.ts, over the attribution analyse exported from its own gain.',
    { clampedCells: analysis.attribution.clampedCells, lengthScaleKilometres: analysis.lengthScaleKilometres, weights },
  );
  add('analysis.usedObservations', 'analyse in src/analysis/optimal-interpolation.ts records which observations it admitted, where each landed and with what error.', analysis.used);
  add('analysis.excludedObservations', 'analyse in src/analysis/optimal-interpolation.ts records every observation it refused and the flag that refused it.', analysis.excluded);

  // `publishResults` reads the live state, so this is the published record at step 0 — what
  // the shell draws before a reader asks it to integrate.
  const results = publishResults(state, parameters, run.stability);
  const publishedBy =
    'publishResults in src/model/results.ts, at step 0, which is what the shell publishes before a reader asks it to integrate.';
  add('results.seaSurfaceHeightMetres', publishedBy, results.seaSurfaceHeightMetres());
  add('results.thicknessMetres', publishedBy, results.thicknessMetres());
  add('results.velocityU', publishedBy, results.velocityU());
  add('results.velocityV', publishedBy, results.velocityV());
  add('results.spongeWeight', publishedBy, results.spongeWeight());
  add('results.invariants', 'invariantsOf, through publishResults in src/model/results.ts: volume and energy at step 0.', results.invariants());
  add('results.diagnostics', publishedBy, {
    grid: results.grid,
    spongeWidthCells: results.spongeWidthCells,
    outcrops: results.outcrops,
    clampedVolumeCubicMetres: results.clampedVolumeCubicMetres,
    referenceLatitudeDegrees: results.referenceLatitudeDegrees,
    stability: results.stability,
  });

  // ---- App.tsx integrate ---------------------------------------------------------------
  // Through `beginAdvance`, which is the shell's own advance rather than a copy of it.
  //
  // Until beat 018's operational pass this block was a transcription -- `Run.advance` in a
  // loop, written here beside the shell's loop and asserted against nothing -- and that is
  // exactly how a control that advanced sixteen hours and forty-eight minutes under a
  // twelve-hour label passed this gate. The chunking is there so the page answers a reader
  // mid-integration (NFR-04); it must not change a single step, and driving it from the
  // module the shell drives is what makes this the place that would show.
  const advanceSteps = stepsPerAdvance(config);
  beginAdvance({
    run,
    chunkSteps: config.model.chunkSteps,
    targetStep: run.steps + advanceSteps,
  }).runToTarget();
  add(
    'state.afterDeclaredAdvance.bytes',
    `stateBytes in src/model/grid.ts, after beginAdvance in src/harness/advance.ts drove the run the ${String(advanceSteps)} steps of the shell's twelve-hour advance, in chunks of ${String(config.model.chunkSteps)}.`,
    stateBytes(run.state),
  );

  // ---- App.tsx scoreRun ----------------------------------------------------------------
  // The shell offers this alongside the advance, so which of the two a reader clicks first
  // decides what is scored. The recorded case advances and then scores, and says so here.
  const runGrid = results.grid;
  const runRegion = domainRegion(config, runGrid.nx, runGrid.ny);
  const structure = config.model.thermalStructure;
  const runValidInstantMs = startMs + RUN_SCORING_LEAD_HOURS * 3_600_000;
  const runScore = score({
    config,
    domain,
    truth,
    forecast: (run.state.fields[THICKNESS] as Float64Array).slice(),
    initial: analysis.field.slice(),
    climatology: interfaceFieldFromContainer(climatology, structure, report.box, runGrid),
    truthAtValidInstant: interfaceFieldFromTruth(truth, structure, report.box, runGrid, runValidInstantMs),
    region: runRegion,
    fromInstantMs: startMs,
    validInstantMs: runValidInstantMs,
    externalObservationIds: argo
      .map((r) => r.interface)
      .filter((o) => o.flags.every((flag) => flag.usable))
      .map((o) => o.id),
  });
  add(
    `runScore.${leadName(RUN_SCORING_LEAD_HOURS)}`,
    'score in src/scoring/scorer.ts, over domainRegion and interfaceFieldFromTruth: the run itself scored where App.tsx scoreRun scores it.',
    runScore,
  );

  // ---- App.tsx buildRow ----------------------------------------------------------------
  const defaultIssueInstantMs = startMs + config.forecast.spinUpHours * 3_600_000;
  const inputs = {
    config,
    domain,
    truth,
    climatology,
    argo: observations,
    issueInstantMs: defaultIssueInstantMs,
    // The declared horizons are measured from the *default* issue instant, so moving the
    // control leaves every panel valid at the same moment it was.
    anchorInstantMs: defaultIssueInstantMs,
  };
  // The recorded case has no edits, so the shell's baseline is this same object and every
  // difference field is exactly zero. Nothing is digested twice to say so.
  const forecast = runForecast({ ...inputs, counterfactual: [] });
  add('forecast.issue', 'runForecast in src/run/forecast.ts: the analysis at the issue instant that every panel in the row starts from, and what it was allowed to see.', {
    initial: forecast.initial,
    climatologyField: forecast.climatologyField,
    issueInstantMs: forecast.issueInstantMs,
    anchorInstantMs: forecast.anchorInstantMs,
    observationsAvailable: forecast.observationsAvailable,
    observationsWithheld: forecast.observationsWithheld,
    externalObservationIds: [...forecast.externalObservationIds],
    withheldIds: [...forecast.withheldIds],
  });

  const horizons = [...config.horizons.leadHours];
  for (const leadHours of horizons) {
    const panel = forecast.byHorizon.get(leadHours);
    // A panel outside its validity has no field and a sentence saying why. Both are digested,
    // because a refusal turning into a field is exactly the kind of move this gate exists for.
    add(
      `forecast.${leadName(leadHours)}.field`,
      'runForecast in src/run/forecast.ts, integrating the issue analysis forward to this declared horizon.',
      panel === undefined
        ? null
        : { field: panel.field, refusal: panel.refusal ?? null, validInstantMs: panel.validInstantMs, leadFromIssueHours: panel.leadFromIssueHours },
    );
  }

  const brief = departureBrief(inputs);
  add('brief', 'departureBrief in src/run/forecast.ts: the frozen quay-side analysis, computed once and never refreshed.', brief);

  // ---- HorizonRow's scoring, through the producer the row itself calls -----------------
  // Until T020 this block was a transcription of `HorizonRow.scoreAll`, because the scores
  // lived inside a React callback and there was nothing headless to call. `scoreEveryHorizon`
  // is now that callback's arithmetic, and the row calls the same function, so these entries
  // digest the shell's own code rather than a copy of it (plan 013, "What the record cannot
  // hold"). The digests did not move when it was lifted, which is what says the lift was one.
  const scoring = scoreEveryHorizon({ config, domain, forecast, truth, climatology, brief });
  for (const leadHours of horizons) {
    const panelScore = scoring.scores.get(leadHours) ?? null;
    if (panelScore === null) {
      add(`score.${leadName(leadHours)}`, 'score in src/scoring/scorer.ts: a panel with no field has nothing to score, and says so.', null);
      add(`briefScore.${leadName(leadHours)}`, 'score in src/scoring/scorer.ts, against the departure brief: nothing to score at this horizon.', null);
      continue;
    }
    add(
      `score.${leadName(leadHours)}`,
      'score in src/scoring/scorer.ts, over domainRegion and interfaceFieldFromTruth: both skills and all three errors for this declared horizon.',
      panelScore,
    );
    add(
      `briefScore.${leadName(leadHours)}`,
      'score in src/scoring/scorer.ts, the departure brief held and scored at the same instant so the two figures are comparable.',
      scoring.briefScores.get(leadHours) ?? null,
    );
  }

  // ---- App.tsx footprintFor ------------------------------------------------------------
  // Called once here per footprint the surface draws, which is now also once per footprint in
  // `App.tsx`: T021 put each behind a `useMemo` keyed on what a footprint is made of, where
  // before they were built three times per render inline in JSX. The digests below did not
  // move, which is the whole of the claim. (`HorizonRow` builds none of its own; it is handed
  // the row's and reads the derivations.)
  const levels = config.model.thermalStructure.displayLevelsMetres;
  const footprint = (
    initialisedFromMs: number,
    fromForecast: boolean,
  ): Footprint =>
    footprintOf({
      surface: fromForecast ? forecast.surface : surface,
      drops: fromForecast ? forecast.profiles : drops.map(({ profile }) => profile),
      argo: fromForecast ? forecast.argoProfiles : argo.map(({ profile }) => profile),
      box: report.box,
      grid: results.grid,
      initialisedFromMs,
      spongeWidthCells: config.model.sponge.widthCells,
      volumeFloorMetres: levels[levels.length - 1] as number,
      colocationToleranceDegrees: config.presentation.footprint.colocationToleranceDegrees,
      qualityControlEnabled: fromForecast
        ? forecast.edits.reduce<boolean>(
            (current, edit) => (edit.kind === 'quality-control' ? edit.enabled : current),
            config.instruments.qualityControl.enabled,
          )
        : config.instruments.qualityControl.enabled,
      assimilateArgo: config.instruments.argo.assimilate,
      withheldIds: fromForecast ? forecast.withheldIds : [],
    });
  add(
    'footprint.run',
    'footprintOf in src/harness/footprint.ts, as markersFor builds it: the run as it stands, initialised at the declared epoch.',
    footprint(Date.parse(config.clock.epoch), false),
  );
  add(
    'footprint.row',
    "footprintOf in src/harness/footprint.ts, as the row reads it: the forecast's own observations, initialised at the issue instant.",
    footprint(forecast.issueInstantMs, true),
  );

  return quantities;
}
