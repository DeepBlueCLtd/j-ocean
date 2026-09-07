import { useCallback, useEffect, useMemo, useState } from 'react';
import configUrl from '../../config/j-ocean.json?url';
import { ConfigurationError, fetchConfiguration, type LoadedConfiguration } from '../config/load.js';
import type { Configuration } from '../config/schema.js';
import { createRun, createRunFromManifest, type Run } from '../run/run.js';
import {
  codeVersionWarning,
  ManifestError,
  parseManifest,
  serialiseManifest,
  type RunManifest,
} from '../run/manifest.js';
import { CODE_VERSION } from '../run/code-version.js';
import { sha256Bytes } from '../config/digest.js';
import { stateBytes } from '../model/grid.js';
import { loadClimatology, loadObservations, loadTruth } from './artefacts.js';
import { FieldView, type Marker } from './FieldView.js';
import { footprintOf, markersFrom, type Footprint } from './footprint.js';
import type { Edit } from '../instruments/edits.js';
import { HorizonRow } from './HorizonRow.js';
import { departureBrief, runForecast, type DepartureBrief, type ForecastResult } from '../run/forecast.js';
import { climatologyReferenceOver } from '../instruments/climatology-reference.js';
import { interfaceFieldFromContainer, interfaceFieldFromTruth } from '../instruments/interface-field.js';
import {
  argoObservations,
  sampleSurface,
  sampleXbtDrops,
  type SamplingContext,
  type XbtResult,
} from '../instruments/instruments.js';
import { isUsable, type Observation } from '../instruments/observation.js';
import { analyse, type AnalysisRecord } from '../analysis/optimal-interpolation.js';
import { THICKNESS } from '../model/reduced-gravity.js';
import { initialiseFromTruth, type InitialisationReport } from '../run/initialise-from-truth.js';
import { parametersFor } from '../model/parameters.js';
import { createReducedGravityKernel } from '../model/reduced-gravity.js';
import { publishResults, type ModelResults } from '../model/results.js';
import { flaggedLevelCount, levelCount, type ObservationRecord } from '../truth/observations.js';
import type { ArtefactTruthSource } from '../truth/artefact-truth-source.js';
import type { FieldContainer } from '../truth/container.js';
import { domainRegion, score, type Score } from '../scoring/scorer.js';
import { drawRootSeed } from './seed-provisioning.js';
import { measure, overBudget } from './timing.js';
import { Walkthrough } from './Walkthrough.js';

/**
 * The shell (FR-002, FR-013, NFR-02, constitution Principle V and VI).
 *
 * Beat 001 draws no ocean. What it draws is the frame every later beat hangs a figure in:
 * the statement of what j-ocean is not, the run a reader is looking at, and the three
 * typographic kinds a figure can be. Getting the kinds in now means beat 007 inherits them
 * rather than inventing them, which is what NFR-05 means by "shall not change kind between
 * states".
 *
 * There is no demo mode and no fixture path here (Principle VI): every figure on this page
 * came from a run that exists, or from configuration that was validated before it did.
 */

/** How far the shell integrates when a reader asks. Twelve hours, in declared timesteps. */
const ADVANCE_HOURS = 12;

/** Principle V: declared, computed and derived are typographically distinct, always. */
function Declared({ children }: { children: React.ReactNode }) {
  return <span className="figure declared" title="declared in configuration">{children}</span>;
}

function Computed({ children }: { children: React.ReactNode }) {
  return <span className="figure computed" title="computed by the model">{children}</span>;
}

function HostTime({ children }: { children: React.ReactNode }) {
  return (
    <span className="figure host-time" title="host time: how long the machinery took, not simulation time">
      {children}
    </span>
  );
}

interface RunView {
  readonly run: Run;
  readonly recordedCase: boolean;
  readonly steps: number;
  readonly instant: string;
  readonly lastStepMs: number | null;
  readonly results: ModelResults;
  readonly initialisation: InitialisationReport;
  readonly integrating: boolean;
  readonly surface: readonly Observation[];
  readonly drops: readonly XbtResult[];
  readonly argo: readonly XbtResult[];
  readonly analysis: AnalysisRecord;
  /** Computed on demand: scoring the row costs a second, and NFR-04 says not to freeze. */
  readonly score: Score | null;
  readonly scoringLeadHours: number;
  /** The row's forecasts. Computed on demand: it costs a couple of seconds (NFR-04). */
  readonly forecast: ForecastResult | null;
  /** FR-026: the frozen quay-side analysis. Computed once and never refreshed. */
  readonly brief: DepartureBrief | null;
  /** Where the issue-time control is, which is not where the shown forecast was issued. */
  readonly pendingIssueInstantMs: number | null;
  /** FR-034: the reader's edits, in order. Empty means this is the recorded case. */
  readonly edits: readonly Edit[];
  /** The same run without the edits, at the same issue instant: what a difference is from. */
  readonly baseline: ForecastResult | null;
  /** FR-18: the breakdown is an instrument of a *selected* cell, never a per-panel summary. */
  readonly selectedCell: number | null;
  readonly box: { readonly west: number; readonly east: number; readonly south: number; readonly north: number };
}

interface Record002 {
  readonly domainId: string;
  readonly truth: ArtefactTruthSource;
  readonly climatology: FieldContainer;
  readonly observations: ObservationRecord;
}

/**
 * What the instruments measured, as the footprint (beat 008). One producer for every panel:
 * the marks the field overlay draws come from here and from nowhere else, so a drop cannot be
 * a needle on one panel and an undifferentiated dot on another.
 */
function footprintFor(config: Configuration, view: RunView, initialisedFromMs: number): Footprint {
  const levels = config.model.thermalStructure.displayLevelsMetres;
  return footprintOf({
    // The edited run's own observations where there is one, so an edited profile's needle is
    // the edited profile and a withheld mark is the mark that was withheld.
    surface: view.forecast?.surface ?? view.surface,
    drops: view.forecast?.profiles ?? view.drops.map(({ profile }) => profile),
    argo: view.forecast?.argoProfiles ?? view.argo.map(({ profile }) => profile),
    box: view.box,
    grid: view.results.grid,
    initialisedFromMs,
    spongeWidthCells: config.model.sponge.widthCells,
    volumeFloorMetres: levels[levels.length - 1] as number,
    colocationToleranceDegrees: config.presentation.footprint.colocationToleranceDegrees,
    qualityControlEnabled:
      view.forecast?.edits.reduce<boolean>(
        (current, edit) => (edit.kind === 'quality-control' ? edit.enabled : current),
        config.instruments.qualityControl.enabled,
      ) ?? config.instruments.qualityControl.enabled,
    assimilateArgo: config.instruments.argo.assimilate,
    withheldIds: view.forecast?.withheldIds ?? [],
  });
}

/** How many of each check fired, across everything the instruments produced. */
function flagSummary(view: RunView): [string, number][] {
  const counts = new Map<string, number>();
  const add = (observation: Observation): void => {
    for (const flag of observation.flags) counts.set(flag.code, (counts.get(flag.code) ?? 0) + 1);
    for (const level of observation.levels ?? []) {
      for (const flag of level.flags) counts.set(flag.code, (counts.get(flag.code) ?? 0) + 1);
    }
  };
  for (const observation of view.surface) add(observation);
  for (const { profile, interface: inferred } of [...view.drops, ...view.argo]) {
    add(profile);
    add(inferred);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function App() {
  const [loaded, setLoaded] = useState<LoadedConfiguration | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Beat 011: what the reader pasted, and what happened when it was read. */
  const [pasted, setPasted] = useState('');
  const [importFailure, setImportFailure] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [view, setView] = useState<RunView | null>(null);
  const [record, setRecord] = useState<Record002 | null>(null);
  const [overBudgetNotice, setOverBudgetNotice] = useState<{ projectedMs: number } | null>(null);

  useEffect(() => {
    let live = true;
    fetchConfiguration(configUrl)
      .then((result) => {
        if (!live) return;
        // Provisioned only once the configuration has validated. A failure below leaves the
        // run untouched, which is what "provisions no run" means.
        setLoaded(result);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setFailure(
          error instanceof ConfigurationError || error instanceof Error
            ? error.message
            : String(error),
        );
      });
    return () => {
      live = false;
    };
  }, []);

  // The committed record for the default domain. It is loaded after the configuration has
  // validated, because which artefact to load is a declared value like any other.
  useEffect(() => {
    if (loaded === null) return () => undefined;
    let live = true;
    const domainId = loaded.config.domains.defaultId;
    Promise.all([loadTruth(domainId), loadClimatology(domainId), loadObservations(domainId)])
      .then(([truth, climatology, observations]) => {
        if (live) setRecord({ domainId, truth, climatology, observations });
      })
      .catch((error: unknown) => {
        if (live) setFailure(error instanceof Error ? error.message : String(error));
      });
    return () => {
      live = false;
    };
  }, [loaded]);

  const buildRun = useCallback(
    (
      seed: string | undefined,
      recordedCase: boolean,
      manifest?: RunManifest,
    ): RunView | null => {
      if (loaded === null || record === null) return null;
      const domain = loaded.config.domains.list.find((d) => d.id === record.domainId);
      if (domain === undefined) return null;
      const parameters = parametersFor(loaded.config, domain);
      const kernel = createReducedGravityKernel(parameters);
      const { state, report } = initialiseFromTruth(
        kernel,
        parameters,
        record.truth,
        domain,
        Date.parse(loaded.config.truth.period.start),
        'surface_elevation',
      );
      /*
       * The analysis is the analysis **at the run's initial instant** (beat 005), so the
       * background is taken here, before anything advances the state.
       *
       * Beat 011's replay found this: a replayed run is rebuilt by advancing it to the step
       * the manifest records, and this function then computed the analysis from whatever the
       * state was at that moment -- so the same run, replayed, produced a different analysis
       * from the one it had exported. The analysis is a property of the run's start, not of
       * when somebody happened to ask for it.
       */
      const background = (state.fields[THICKNESS] as Float64Array).slice();

      /*
       * Beat 011. A replayed run is *rebuilt* from the manifest: same seed, same derived
       * streams, same edits, advanced to the same step. It is not a restored snapshot, which
       * is the whole reason the byte-identity test means anything -- a snapshot compared with
       * itself proves nothing.
       */
      const run =
        manifest === undefined
          ? createRun({
              config: loaded.config,
              configDigest: loaded.digest,
              kernel,
              initialState: state,
              domainId: record.domainId,
              recordedCase,
              ...(seed === undefined ? {} : { seed }),
            })
          : createRunFromManifest(manifest, {
              config: loaded.config,
              configDigest: loaded.digest,
              kernel,
              initialState: state,
            });
      // The instruments sample the truth record through the port, in the one module allowed
      // to do so. Nothing here touches truth itself.
      const sampling: SamplingContext = {
        config: loaded.config,
        truth: record.truth,
        rng: run.rng,
        climatology: climatologyReferenceOver(record.climatology),
        structure: parameters.thermalStructure,
        startMs: Date.parse(loaded.config.truth.period.start),
      };
      const surface = sampleSurface(sampling);
      const drops = sampleXbtDrops(sampling);
      const argo = argoObservations(record.observations, sampling);

      // The analysis. It consumes observations, a background and a climatology, and nothing
      // else: it never sees the truth source, and gate G-02 holds that both by reading the
      // imports and, since beat 005, by running with the errors turned up.
      const climatologyThickness = interfaceFieldFromContainer(
        record.climatology,
        parameters.thermalStructure,
        report.box,
        parameters.grid,
      );
      const analysis = analyse(
        {
          config: loaded.config,
          grid: parameters.grid,
          background,
          climatology: climatologyThickness,
          observations: [...drops, ...argo].map((r) => r.interface),
        },
        report.box,
      );

      return {
        run,
        recordedCase: run.recordedCase,
        steps: run.steps,
        instant: run.clock.instantIso(),
        lastStepMs: null,
        results: publishResults(state, parameters, run.stability),
        initialisation: report,
        integrating: false,
        surface,
        drops,
        argo,
        analysis,
        score: null,
        scoringLeadHours: 24,
        forecast: null,
        brief: null,
        pendingIssueInstantMs: null,
        edits: manifest?.counterfactual ?? [],
        baseline: null,
        selectedCell: null,
        box: report.box,
      };
    },
    [loaded, record],
  );

  useEffect(() => {
    const built = buildRun(undefined, true);
    if (built !== null) setView(built);
  }, [buildRun]);

  const stepsPerAdvance =
    loaded === null ? 0 : Math.round((ADVANCE_HOURS * 3600) / loaded.config.clock.timestepSeconds);

  /**
   * FR-009 and NFR-04: integration is chunked to the declared chunk size and yields between
   * chunks, so the page answers a reader who clicks something while it runs. A single
   * synchronous loop over 1 280 steps would freeze the tab, which NFR-04 exists to forbid.
   */
  const integrate = useCallback(
    (force: boolean) => {
      if (loaded === null || view === null || view.integrating) return;

      const chunk = loaded.config.model.chunkSteps;
      const measured = measure(() => {
        view.run.advance(Math.min(chunk, stepsPerAdvance));
      });
      const perStep = measured.elapsedMs / Math.min(chunk, stepsPerAdvance);
      const longestHorizonHours = Math.max(...loaded.config.horizons.leadHours);
      const projectedMs =
        perStep * ((longestHorizonHours * 3600) / loaded.config.clock.timestepSeconds);

      // FR-008: a run whose projected time for the longest declared horizon exceeds the
      // declared budget says so with both figures and does not integrate until told to.
      if (!force && overBudget(projectedMs, loaded.config.budget.frameBudgetMs)) {
        setOverBudgetNotice({ projectedMs });
        setView({ ...view, steps: view.run.steps, instant: view.run.clock.instantIso(), lastStepMs: perStep });
        return;
      }
      setOverBudgetNotice(null);

      let done = Math.min(chunk, stepsPerAdvance);
      setView({ ...view, integrating: true, lastStepMs: perStep });
      const continueRun = (): void => {
        const remaining = stepsPerAdvance - done;
        if (remaining <= 0) {
          setView((current) =>
            current === null
              ? current
              : {
                  ...current,
                  integrating: false,
                  steps: current.run.steps,
                  instant: current.run.clock.instantIso(),
                },
          );
          return;
        }
        view.run.advance(Math.min(chunk, remaining));
        done += Math.min(chunk, remaining);
        setView((current) =>
          current === null
            ? current
            : { ...current, steps: current.run.steps, instant: current.run.clock.instantIso() },
        );
        // Yielding to the event loop is what keeps the page responsive.
        setTimeout(continueRun, 0);
      };
      setTimeout(continueRun, 0);
    },
    [loaded, view, stepsPerAdvance, overBudget],
  );

  /**
   * Score this run at one horizon (FR-020 to FR-022).
   *
   * It integrates the analysis forward, samples the truth record at the valid instant through
   * the port, and scores against both references. It happens on demand rather than on load,
   * because it costs about a second and NFR-04 says the interface does not freeze.
   */
  const scoreRun = useCallback(() => {
    if (loaded === null || record === null || view === null) return;
    const leadHours = view.scoringLeadHours;
    const parameters = view.results.grid;
    const region = domainRegion(loaded.config, parameters.nx, parameters.ny);
    const validInstantMs = Date.parse(loaded.config.truth.period.start) + leadHours * 3_600_000;

    const forecastField = view.run.state.fields[THICKNESS] as Float64Array;
    const structure = loaded.config.model.thermalStructure;
    const truthField = interfaceFieldFromTruth(record.truth, structure, view.box, parameters, validInstantMs);

    const computedScore = score({
      config: loaded.config,
      domain: loaded.config.domains.list.find((d) => d.id === record.domainId) as never,
      truth: record.truth,
      forecast: forecastField.slice(),
      initial: view.analysis.field.slice(),
      climatology: interfaceFieldFromContainer(record.climatology, structure, view.box, parameters),
      truthAtValidInstant: truthField,
      region,
      fromInstantMs: Date.parse(loaded.config.truth.period.start),
      validInstantMs,
      externalObservationIds: view.argo
        .map((r) => r.interface)
        .filter((o) => o.flags.every((flag) => flag.usable))
        .map((o) => o.id),
    });
    setView({ ...view, score: computedScore });
  }, [loaded, record, view]);

  /**
   * The row's forecasts. Integrating six horizons costs a couple of seconds, so it happens
   * when a reader asks rather than on load -- NFR-04 says the integration does not block the
   * interface, and the honest way to obey that is not to start it unbidden.
   */
  const buildRow = useCallback(
    (issueInstantMs?: number, edits?: readonly Edit[]) => {
      if (loaded === null || record === null || view === null) return;
      const domain = loaded.config.domains.list.find((d) => d.id === record.domainId);
      if (domain === undefined) return;
      const startMs = Date.parse(loaded.config.truth.period.start);
      const defaultIssueInstantMs = startMs + loaded.config.forecast.spinUpHours * 3_600_000;
      const counterfactual = edits ?? view.edits;
      const inputs = {
        config: loaded.config,
        domain,
        truth: record.truth,
        climatology: record.climatology,
        argo: record.observations,
        issueInstantMs: issueInstantMs ?? view.forecast?.issueInstantMs ?? defaultIssueInstantMs,
        // The declared horizons are measured from the *default* issue instant, so moving the
        // control leaves every panel valid at the same moment it was (FR-002).
        anchorInstantMs: defaultIssueInstantMs,
        ...(view.recordedCase ? {} : { seed: view.run.rng.rootSeed }),
      };
      const forecast = runForecast({ ...inputs, counterfactual });
      // The same run without the edits, so a difference field is a difference from something
      // that came from the same issue time (FR-005). With no edits it *is* the run.
      const baseline =
        counterfactual.length === 0 ? forecast : runForecast({ ...inputs, counterfactual: [] });
      // FR-009 and FR-002: the manifest records the issue time and the edits.
      view.run.reissue(forecast.issueInstantMs);
      view.run.setCounterfactual(counterfactual);
      // FR-026: computed once and held. It is never refreshed, and the identity assertion in
      // the test is on this object.
      const brief = view.brief ?? departureBrief(inputs);
      setView({
        ...view,
        forecast,
        baseline,
        brief,
        edits: counterfactual,
        pendingIssueInstantMs: forecast.issueInstantMs,
      });
    },
    [loaded, record, view],
  );

  /**
   * Import a manifest (FR-003, FR-005).
   *
   * The order is the spec's and it matters: the schema, then the version, then the digest,
   * then the domain -- all before anything is provisioned, so a refused import leaves no run
   * behind. A code-version difference is a *warning*; a digest difference is a refusal,
   * because the declared values differ and a run made against other values is a different run.
   */
  const importManifest = useCallback(
    (text: string) => {
      setImportFailure(null);
      setImportWarning(null);
      try {
        const manifest = parseManifest(text);
        if (view !== null && view.edits.length > 0) {
          // The one confirmation dialogue this harness has. Export is beside it, so the
          // reader is not asked to choose between their edits and a dialogue.
          const proceed = window.confirm(
            'This visit has edits that are not in an exported manifest. Importing will discard ' +
              'them. Continue?',
          );
          if (!proceed) return;
        }
        const built = buildRun(undefined, manifest.recordedCase, manifest);
        if (built === null) {
          setImportFailure('the run could not be provisioned from this manifest');
          return;
        }
        setImportWarning(codeVersionWarning(manifest, { codeVersion: CODE_VERSION }));
        setView(built);
      } catch (error) {
        setImportFailure(
          error instanceof ManifestError ? error.message : `the manifest could not be read: ${String(error)}`,
        );
      }
    },
    [buildRun, view],
  );

  const newRun = useCallback(() => {
    // Exemption (b): entropy is drawn here, once, before the run exists.
    const built = buildRun(drawRootSeed(), false);
    if (built !== null) {
      setOverBudgetNotice(null);
      setView(built);
    }
  }, [buildRun]);

  /**
   * A digest of what this run computed (beat 011, AT-04).
   *
   * It is over the model state and the analysed field: the two things a replay has to
   * reproduce. Two visits showing the same digest have the same fields, which is what
   * "byte-identical" means and is a claim a reader can check by looking at two tabs.
   */
  const resultsDigest = useMemo(() => {
    if (view === null) return null;
    const state = stateBytes(view.run.state);
    const analysis = new Uint8Array(view.analysis.field.buffer.slice(0));
    const both = new Uint8Array(state.length + analysis.length);
    both.set(state, 0);
    both.set(analysis, state.length);
    return sha256Bytes(both);
  }, [view]);

  const manifest = useMemo(
    () => (view === null ? null : serialiseManifest(view.run.exportManifest())),
    [view],
  );

  /**
   * The two footprints this page reads, each built once (T021, spec 013 finding 2).
   *
   * There are genuinely two: the panels outside the row show the run as it stands, initialised
   * at the run's own start, and the row shows the forecast's own observations, initialised at
   * the issue instant. Neither is new here. What is new is that each is built once per change
   * to what determines it, rather than three times per render inline in JSX -- and that the
   * row is handed the same object each time, so its own `useMemo` around `markersFrom` can
   * hit. Nothing about `footprintOf` or its inputs is touched: FR-011 says this beat moves no
   * number, and G-07 digests both footprints.
   *
   * The dependencies are what a footprint is made of -- the configuration and the run's
   * observations, box and grid -- and not `view` itself, which changes identity when a reader
   * selects a cell or moves the issue-time control.
   */
  const runFootprint = useMemo(
    () =>
      loaded === null || view === null
        ? null
        : footprintFor(loaded.config, view, Date.parse(loaded.config.clock.epoch)),
    [loaded?.config, view?.forecast, view?.surface, view?.drops, view?.argo, view?.box, view?.results],
  );
  const rowFootprint = useMemo(
    () =>
      loaded === null || view === null || view.forecast === null
        ? null
        : footprintFor(loaded.config, view, view.forecast.issueInstantMs),
    [loaded?.config, view?.forecast, view?.surface, view?.drops, view?.argo, view?.box, view?.results],
  );
  /** One producer of marks for everything outside the row, as the footprint is one producer. */
  const runMarkers = useMemo<Marker[]>(
    () => (runFootprint === null ? [] : markersFrom(runFootprint)),
    [runFootprint],
  );
  /** The attribution field draws the same marks without the track, which is a filter, not a build. */
  const attributionMarkers = useMemo(
    () => runMarkers.filter((marker) => marker.kind !== 'track'),
    [runMarkers],
  );

  return (
    <main>
      {/* The walkthrough sits outside every panel because it is about all of them, and
          before them in the document so that a reader tabbing in reaches the explanation
          of the page before the page itself. */}
      <Walkthrough />

      {/* FR-02, and it is the first thing in the document rather than a footnote. It has
          no dismiss control because there is nothing about it that stops being true. */}
      <section className="not-operational" data-testid="not-operational" role="note">
        <h1>j-ocean</h1>
        <p>
          <strong>j-ocean is not an operational forecast system.</strong> Its numerics are
          real but reduced, its domain small, and its claims are about <em>relative</em>{' '}
          skill between references it computes itself, scored against a truth record it did
          not author.
        </p>
      </section>

      {failure !== null && (
        <section className="failure" data-testid="configuration-failure">
          <h2>The configuration did not validate, so no run was provisioned.</h2>
          <pre>{failure}</pre>
        </section>
      )}

      {loaded !== null && view !== null && (
        <>
          <section data-testid="run-panel">
            <h2>The run</h2>
            <dl>
              <dt>Root seed</dt>
              <dd>
                <Declared>
                  <span data-testid="root-seed">{view.run.rng.rootSeed}</span>
                </Declared>
              </dd>

              <dt>Which run this is</dt>
              <dd data-testid="recorded-case">
                {view.recordedCase
                  ? `This is ${loaded.config.run.recordedCaseLabel}: the declared seed, unchanged.`
                  : 'This is not the recorded case. A seed was drawn for this visit and nothing about it persists.'}
              </dd>

              <dt>Domain</dt>
              <dd>
                <Declared>{view.run.domainId}</Declared>, cells laid over{' '}
                <Computed>
                  {view.results.grid.cellSizeXMetres.toFixed(0)} &times;{' '}
                  {view.results.grid.cellSizeYMetres.toFixed(0)} m
                </Computed>{' '}
                &mdash; a five-degree box is not square in kilometres.
              </dd>

              <dt>Timestep</dt>
              <dd data-testid="stability">
                <Declared>{view.run.stability.declaredTimestepSeconds} s</Declared>, inside the{' '}
                <Computed>{view.run.stability.largestStableTimestepSeconds.toFixed(1)} s</Computed>{' '}
                the declared criterion admits (the scheme&rsquo;s linear boundary is{' '}
                <Computed>{view.run.stability.linearStabilityBoundarySeconds.toFixed(1)} s</Computed>
                ). Gravity-wave speed{' '}
                <Computed>
                  {view.run.stability.gravityWaveSpeedMetresPerSecond.toFixed(3)} m/s
                </Computed>
                .
              </dd>

              <dt>Steps taken</dt>
              <dd>
                <Computed>
                  <span data-testid="steps">{view.steps}</span>
                </Computed>{' '}
                {view.integrating && <span className="unmeasured">integrating&hellip;</span>}
              </dd>

              <dt>Valid at</dt>
              <dd>
                <Computed>
                  <span data-testid="instant">{view.instant}</span>
                </Computed>
              </dd>

              <dt>Step time</dt>
              <dd data-testid="step-time">
                {view.lastStepMs === null ? (
                  <span className="unmeasured">not yet measured</span>
                ) : (
                  <>
                    <HostTime>{view.lastStepMs.toFixed(3)} ms/step</HostTime>{' '}
                    {overBudget(view.lastStepMs, loaded.config.budget.frameBudgetMs) ? (
                      <em>
                        over the declared budget of{' '}
                        <Declared>{loaded.config.budget.frameBudgetMs} ms</Declared>, and said
                        so rather than freezing the page
                      </em>
                    ) : (
                      <span className="within-budget">
                        within the declared budget of{' '}
                        <Declared>{loaded.config.budget.frameBudgetMs} ms</Declared>
                      </span>
                    )}
                  </>
                )}
              </dd>
            </dl>

              <dt>Outcrop clamps</dt>
              <dd data-testid="outcrops">
                <Computed>{view.results.outcrops}</Computed>. The layer is clamped at a
                declared minimum of{' '}
                <Declared>{loaded.config.model.minimumLayerThicknessMetres} m</Declared> where
                it would otherwise outcrop, and every clamp is counted rather than swallowed.
              </dd>
            {overBudgetNotice !== null && (
              <div className="banner warn" data-testid="over-budget">
                <p>
                  The projected time to integrate the longest declared horizon (
                  <Declared>{Math.max(...loaded.config.horizons.leadHours)} h</Declared>) is{' '}
                  <HostTime>{overBudgetNotice.projectedMs.toFixed(0)} ms</HostTime>, which
                  exceeds the declared frame budget of{' '}
                  <Declared>{loaded.config.budget.frameBudgetMs} ms</Declared>. Nothing has
                  been integrated beyond the first chunk. The page is saying so rather than
                  freezing.
                </p>
                <button type="button" onClick={() => integrate(true)} data-testid="proceed-anyway">
                  Integrate anyway
                </button>
              </div>
            )}

            <div className="controls">
              <button
                type="button"
                onClick={() => integrate(false)}
                data-testid="advance"
                disabled={view.integrating}
              >
                Integrate {ADVANCE_HOURS} hours
              </button>
              <button type="button" onClick={newRun} data-testid="new-run">
                New run
              </button>
            </div>
          </section>

          <section data-testid="declared-panel">
            <h2>What has been declared</h2>
            <p className="aside">
              Every figure here is a value in configuration, validated before anything was
              computed. No component in the tree holds a literal for any of them.
            </p>
            <dl>
              <dt>Grid</dt>
              <dd>
                <Declared>
                  {loaded.config.grid.nx} &times; {loaded.config.grid.ny}
                </Declared>{' '}
                cells
              </dd>
              <dt>Timestep</dt>
              <dd>
                <Declared>{loaded.config.clock.timestepSeconds} s</Declared>, from{' '}
                <Declared>{loaded.config.clock.epoch}</Declared>
              </dd>
              <dt>Horizons</dt>
              <dd data-testid="horizons">
                <Declared>{loaded.config.horizons.leadHours.join(', ')} h</Declared>
              </dd>
              <dt>Domains</dt>
              <dd>
                {loaded.config.domains.list.map((domain) => (
                  <span key={domain.id} className="domain">
                    <Declared>{domain.label}</Declared> ({domain.character})
                  </span>
                ))}
              </dd>
            </dl>
          </section>

          <section data-testid="field-panel">
            <h2>The ocean, as the model has it</h2>
            <p className="aside">
              Sea-surface height, computed from the layer thickness by the reduced-gravity
              relation. Initialised from the truth record at{' '}
              <Declared>{loaded.config.truth.period.start}</Declared> and integrated from
              there. There is no fixture behind this: it is the field the model holds.
            </p>
            <FieldView
              values={view.results.seaSurfaceHeightMetres()}
              nx={view.results.grid.nx}
              ny={view.results.grid.ny}
              limit={0.8}
              label={`Sea-surface height anomaly over ${view.run.domainId}, valid at ${view.instant}`}
              testId="field-view"
              markers={runMarkers}
            />
            <p className="legend">
              <span>
                <span className="dot drop" />
                XBT drop
              </span>
              <span>
                <span className="dot external" />
                Argo profile (external)
              </span>
              <span>
                <span className="dot flagged" />
                flagged &mdash; drawn, never omitted
              </span>
            </p>
            <dl>
              <dt>Valid at</dt>
              <dd>
                <Computed>{view.instant}</Computed>
              </dd>
              <dt>Initialised from</dt>
              <dd data-testid="initialisation">
                the truth record at{' '}
                <Computed>{new Date(view.initialisation.instantMs).toISOString()}</Computed>;
                layer thickness{' '}
                <Computed>
                  {view.initialisation.thicknessRangeMetres[0].toFixed(0)}&ndash;
                  {view.initialisation.thicknessRangeMetres[1].toFixed(0)} m
                </Computed>{' '}
                about a declared mean of{' '}
                <Declared>{loaded.config.model.meanUpperLayerThicknessMetres} m</Declared>.
                Velocity is put in geostrophic balance with that thickness rather than taken
                from the truth, which carries motions this model has no layer for.
              </dd>
              <dt>Excluded margin</dt>
              <dd>
                <Declared>{view.results.spongeWidthCells} cells</Declared> of sponge at each
                edge, relaxed toward the initial state. Scoring will exclude it.
              </dd>
            </dl>
          </section>

          {view.forecast === null ? (
            <section data-testid="row-invitation">
              <h2>The row</h2>
              <p className="aside">
                Six panels at the declared horizons, each stating what it is valid for, what it
                was initialised from, and what it was worth against two references. Building
                them means integrating the analysis forward four days, which takes a couple of
                seconds &mdash; so it happens when you ask.
              </p>
              <button type="button" onClick={() => { buildRow(); }} data-testid="build-row">
                Build the horizon row
              </button>
            </section>
          ) : (
            <HorizonRow
              config={loaded.config}
              domain={
                loaded.config.domains.list.find((d) => d.id === view.run.domainId) as never
              }
              forecast={view.forecast}
              analysis={view.forecast.analysis}
              truth={record?.truth as never}
              climatology={record?.climatology as never}
              footprint={rowFootprint as Footprint}
              brief={view.brief as DepartureBrief}
              issueInstantMs={view.forecast.issueInstantMs}
              defaultIssueInstantMs={
                Date.parse(loaded.config.truth.period.start) +
                loaded.config.forecast.spinUpHours * 3_600_000
              }
              pendingIssueInstantMs={view.pendingIssueInstantMs ?? view.forecast.issueInstantMs}
              onPendingIssueInstantChange={(instantMs) => {
                setView((current) =>
                  current === null ? current : { ...current, pendingIssueInstantMs: instantMs },
                );
              }}
              onReissue={() => {
                buildRow(view.pendingIssueInstantMs ?? view.forecast?.issueInstantMs);
              }}
              reissuing={false}
              edits={view.edits}
              baseline={view.baseline ?? view.forecast}
              onApplyEdits={(edits) => {
                buildRow(view.forecast?.issueInstantMs, edits);
              }}
              onSelectCell={(cellIndex) => {
                setView((current) => (current === null ? current : { ...current, selectedCell: cellIndex }));
              }}
            />
          )}

          <section data-testid="score-panel">
            <h2>What the forecast was worth</h2>
            <p className="aside">
              A raw error figure means nothing on its own, so there is never one here without
              two references the harness computes itself. Zero means <em>no better than the
              reference</em> and negative means <em>worse</em>.
            </p>
            {view.score === null ? (
              <p>
                <button type="button" onClick={scoreRun} data-testid="score-run">
                  Score this run against truth
                </button>{' '}
                <span className="unmeasured">
                  Not scored yet. It takes about a second, so it happens when you ask.
                </span>
              </p>
            ) : (
              <>
                <p className="statement" data-testid="score-statement">
                  {view.score.statement}
                </p>
                <dl>
                  <dt>Errors</dt>
                  <dd data-testid="score-errors">
                    forecast <Computed>{view.score.forecastError.value.toFixed(1)} m</Computed>,
                    persistence <Computed>{view.score.persistenceError.value.toFixed(1)} m</Computed>,
                    climatology <Computed>{view.score.climatologyError.value.toFixed(1)} m</Computed>
                  </dd>
                  <dt>Skill</dt>
                  <dd data-testid="score-skill">
                    against persistence{' '}
                    <Computed>
                      {(view.score.skillAgainstPersistence?.value ?? Number.NaN).toFixed(3)}
                    </Computed>
                    , against climatology{' '}
                    <Computed>
                      {(view.score.skillAgainstClimatology?.value ?? Number.NaN).toFixed(3)}
                    </Computed>
                  </dd>
                  <dt>Computed against</dt>
                  <dd data-testid="score-provenance">
                    {view.score.provenance.metric}, over {view.score.provenance.regionLabel} (
                    <Computed>{view.score.provenance.cellsScored.value}</Computed> cells), from{' '}
                    <Computed>{view.score.provenance.fromInstant}</Computed> to{' '}
                    <Computed>{view.score.provenance.validInstant}</Computed>, against{' '}
                    {view.score.provenance.truthSource}. It declines to resolve below the truth
                    record&rsquo;s own{' '}
                    <Declared>{view.score.provenance.resolutionFloorDegrees.value}&deg;</Declared>.
                  </dd>
                  <dt>Means removed</dt>
                  <dd data-testid="score-offsets">
                    forecast <Computed>{view.score.meanOffsets.forecast.value.toFixed(1)} m</Computed>,
                    truth <Computed>{view.score.meanOffsets.truth.value.toFixed(1)} m</Computed>,
                    climatology{' '}
                    <Computed>{view.score.meanOffsets.climatology.value.toFixed(1)} m</Computed>.
                    A reduced-gravity model determines departures from a mean and not the mean
                    itself, so every field is compared as an anomaly about its own. The offsets
                    are published rather than absorbed.
                  </dd>
                  {view.score.provenance.independenceCaveat !== null && (
                    <>
                      <dt>Caveat</dt>
                      <dd data-testid="score-caveat">
                        {view.score.provenance.independenceCaveat}
                      </dd>
                    </>
                  )}
                </dl>
              </>
            )}
          </section>

          <section data-testid="attribution-panel">
            <h2>Where the answer came from</h2>
            <p className="aside">
              The weight observations carried in each cell &mdash; the analysis&rsquo;s own
              gain, drawn as a field. This is not a picture computed to illustrate the
              answer; it is the same arithmetic that produced it, exported beside it, which
              is why it cannot disagree with it.
            </p>
            <FieldView
              values={view.analysis.attribution.observationWeight}
              nx={view.results.grid.nx}
              ny={view.results.grid.ny}
              limit={1}
              palette="sequential"
              unit=""
              label="Weight carried by observations in each cell"
              testId="attribution-view"
              markers={attributionMarkers}
              onSelect={(cellIndex) => {
                setView((current) => (current === null ? current : { ...current, selectedCell: cellIndex }));
              }}
            />
            <dl>
              <dt>Influence radius</dt>
              <dd data-testid="influence-radius">
                A property of the <Declared>
                  {loaded.config.analysis.correlationLengthScaleKilometres} km
                </Declared>{' '}
                declared correlation length scale, not of the ocean. An observation across a
                front influences the far side exactly as much as its own, which the flow
                would not. Beat 012&rsquo;s ensemble spread is the flow-dependent answer.
              </dd>

              <dt>Observations used</dt>
              <dd data-testid="analysis-counts">
                <Computed>{view.analysis.used.length}</Computed> entered the analysis;{' '}
                <Computed>{view.analysis.excluded.length}</Computed> were excluded and are
                still drawn. <Computed>{view.analysis.attribution.clampedCells}</Computed>{' '}
                cells had a weight clamped and renormalised.
              </dd>

              <dt>A cell&rsquo;s breakdown</dt>
              <dd data-testid="cell-breakdown">
                {view.selectedCell === null ? (
                  <span className="unmeasured">
                    Click the field above. A breakdown is an instrument of a selected cell,
                    never a per-panel summary &mdash; that was specified first and was wrong.
                  </span>
                ) : (
                  (() => {
                    const breakdown = view.analysis.breakdownAt(view.selectedCell);
                    return (
                      <>
                        observations <Computed>{(breakdown.observations * 100).toFixed(1)}%</Computed>,
                        background <Computed>{(breakdown.background * 100).toFixed(1)}%</Computed>,
                        climatology <Computed>{(breakdown.climatology * 100).toFixed(1)}%</Computed>
                        {breakdown.shares.length > 0 && (
                          <>
                            {' '}&mdash; of which{' '}
                            {breakdown.shares
                              .slice(0, 3)
                              .map((share) => `${share.id} ${(share.share * 100).toFixed(1)}%`)
                              .join(', ')}
                          </>
                        )}
                      </>
                    );
                  })()
                )}
              </dd>
            </dl>
          </section>

          <section data-testid="instruments-panel">
            <h2>What the instruments measured</h2>
            <p className="aside">
              Truth becomes an observation in exactly one module, and this is everything that
              module produced. Every figure below is what a measurement was priced at, not
              what it turned out to be worth &mdash; that is the analysis&rsquo;s question.
            </p>
            <dl>
              <dt>Ownship surface</dt>
              <dd data-testid="surface-count">
                <Computed>{view.surface.length}</Computed> measurements along the declared
                track, at <Declared>{loaded.config.instruments.track.sampleIntervalHours} h</Declared>{' '}
                intervals. Declared error{' '}
                <Declared>
                  {loaded.config.instruments.surface.noiseStandardDeviationDegC} degC
                </Declared>{' '}
                instrument and{' '}
                <Declared>
                  {loaded.config.instruments.surface.representativenessStandardDeviationDegC} degC
                </Declared>{' '}
                representativeness.
              </dd>

              <dt>XBT drops</dt>
              <dd data-testid="drop-count">
                <Computed>{view.drops.length}</Computed> drops of{' '}
                <Declared>{loaded.config.instruments.xbt.depthsMetres.length}</Declared> levels
                each. An XBT infers its depth from a fall rate, so each level records the depth
                it <em>reached</em>, not the depth it was asked for.
              </dd>

              <dt>What a drop told us</dt>
              <dd data-testid="interface-estimates">
                {view.drops.map(({ interface: inferred }) => (
                  <span key={inferred.id} className="estimate">
                    {isUsable(inferred) ? (
                      <>
                        <Computed>{inferred.value.toFixed(0)} m</Computed>
                        <span className="host-time"> &plusmn;{inferred.error.totalSd.toFixed(0)} m</span>
                      </>
                    ) : (
                      <em>unresolved</em>
                    )}
                  </span>
                ))}
                <br />
                The observed quantity is the interface depth, inverted from the same two-layer
                relation the profile above is drawn from. A level far from the thermocline
                acquires an enormous depth error and weighs almost nothing, through the
                arithmetic rather than through a rule.
              </dd>

              <dt>Argo</dt>
              <dd data-testid="argo-state">
                {loaded.config.instruments.argo.assimilate ? (
                  <>
                    <Computed>{view.argo.length}</Computed> profiles admitted, marked{' '}
                    <em>external</em>. The truth record assimilated these profiles, so skill
                    measured against it while assimilating them is not independent evidence,
                    and every score will say so.
                  </>
                ) : (
                  <>Drawn, not assimilated. The toggle is off.</>
                )}
              </dd>

              <dt>Flags</dt>
              <dd data-testid="flag-summary">
                {flagSummary(view).length === 0 ? (
                  <>No check fired. Quality control is{' '}
                    <Declared>
                      {loaded.config.instruments.qualityControl.enabled ? 'on' : 'off'}
                    </Declared>
                    .
                  </>
                ) : (
                  flagSummary(view).map(([code, count]) => (
                    <span key={code} className="estimate">
                      <Computed>{count}</Computed> {code}
                    </span>
                  ))
                )}
                <br />
                A flagged observation keeps its value and is drawn as flagged. Nothing is
                dropped, because what the analysis chose to ignore is as interesting as what
                it used.
              </dd>
            </dl>
          </section>

          {record !== null && (
            <section data-testid="truth-panel">
              <h2>The record this run is scored against</h2>
              <p className="aside">
                Two derived artefacts, regenerated from a digest-verified raw subset by
                gate G-01. Nothing here was edited by hand; a file that had been would fail
                the build.
              </p>
              <dl>
                <dt>Domain</dt>
                <dd data-testid="truth-domain">
                  <Declared>{record.domainId}</Declared>
                </dd>

                <dt>Truth source</dt>
                <dd data-testid="truth-source">
                  {String((record.truth.provenance()['sourceLabel'] as string | undefined) ?? '')}
                </dd>

                <dt>Native resolution</dt>
                <dd>
                  <Declared>{record.truth.nativeResolutionDegrees}&deg;</Declared>, which is{' '}
                  <Declared>
                    {loaded.config.domains.list.find((d) => d.id === record.domainId)
                      ?.truthToModelResolutionRatio}
                    &times;
                  </Declared>{' '}
                  coarser than the model grid. Scoring will decline to resolve below it.
                </dd>

                <dt>Instants</dt>
                <dd data-testid="truth-instants">
                  <Computed>{record.truth.instantsMs().length}</Computed>, spaced{' '}
                  <Computed>
                    {(record.truth.provenance()['instantSpacingHours'] as number[] | undefined)?.join(
                      ' and ',
                    )}
                  </Computed>{' '}
                  hours apart. The source is missing occasional snapshots; the record carries
                  its instants as they are and interpolates nothing at build time.
                </dd>

                <dt>Depth levels</dt>
                <dd>
                  <Declared>{record.truth.depthLevelsMetres().join(', ')} m</Declared> &mdash;
                  exact levels of the source, so no build-time vertical interpolation.
                </dd>

                <dt>Argo profiles</dt>
                <dd data-testid="observation-count">
                  <Computed>{record.observations.profiles.length}</Computed> profiles,{' '}
                  <Computed>{levelCount(record.observations)}</Computed> levels, of which{' '}
                  <Computed>{flaggedLevelCount(record.observations)}</Computed> carry a flag
                  the analysis will not treat as usable. Flagged levels are kept and will be
                  drawn as flagged, never omitted.
                </dd>

                <dt>Climatology</dt>
                <dd data-testid="climatology-overlap">
                  Averaged over{' '}
                  <Declared>
                    {String(
                      (record.climatology.header.provenance['window'] as { start: string })?.start,
                    )}
                  </Declared>{' '}
                  to{' '}
                  <Declared>
                    {String((record.climatology.header.provenance['window'] as { end: string })?.end)}
                  </Declared>
                  , which overlaps this run's period by{' '}
                  <Computed>
                    {String(record.climatology.header.provenance['overlapWithRunPeriodDays'])}
                  </Computed>{' '}
                  days. Skill against this reference is therefore not a fully independent
                  measure, and the surface will say so beside every such score.
                </dd>
              </dl>
            </section>
          )}

          <section data-testid="manifest-panel">
            <h2>The manifest this run replays from</h2>
            <p className="aside">
              Everything needed to rebuild this run, and none of its state: replay is
              re-computation, not the restoration of a snapshot. Nothing persists between
              visits &mdash; no storage, no cookie, no run in the URL &mdash; so this file is
              the only thing that leaves and the only thing that comes back.
            </p>

            <dl>
              <dt>This build</dt>
              <dd className="computed" data-testid="code-version">{CODE_VERSION}</dd>
              <dt>Fields and analysis</dt>
              {/* AT-04, as something a reader can check: two visits showing this digest have
                  the same fields. */}
              <dd className="computed" data-testid="results-digest">{resultsDigest}</dd>
            </dl>

            <div className="row-controls">
              <button
                type="button"
                data-testid="download-manifest"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([manifest ?? ''], { type: 'application/json' }),
                  );
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = `j-ocean-${view.run.rng.rootSeed}.json`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download this manifest
              </button>
            </div>

            <pre data-testid="manifest">{manifest}</pre>

            <h3>Import a manifest</h3>
            <p className="aside">
              Paste one and this visit becomes that run &mdash; rebuilt from its seed and its
              edits, not restored. The schema, the format version, the configuration digest and
              the domain are all checked before anything is provisioned, so a refused import
              leaves the run you have alone.
            </p>
            <textarea
              data-testid="manifest-input"
              rows={4}
              value={pasted}
              onChange={(event) => { setPasted(event.target.value); }}
              placeholder="Paste a manifest"
            />
            <div className="row-controls">
              <button
                type="button"
                data-testid="import-manifest"
                onClick={() => { importManifest(pasted); }}
                disabled={pasted.trim() === ''}
              >
                Import this manifest
              </button>
              <input
                type="file"
                accept="application/json,.json"
                data-testid="manifest-file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file === undefined) return;
                  void file.text().then((text) => {
                    setPasted(text);
                    importManifest(text);
                  });
                }}
              />
            </div>

            {importFailure !== null && (
              <p className="banner warn" data-testid="import-failure">
                {importFailure}
              </p>
            )}
            {importWarning !== null && (
              <p className="banner warn" data-testid="import-warning">
                {importWarning}
              </p>
            )}
          </section>

          {/*
            What this harness does not do, and what would have to be true before it did.
            §10's deferrals are assessed, not vague: each has a trigger somebody wrote down,
            and one of them is measured on every test run. Leaving them off the surface would
            make the harness look more capable than it is, which is the failure mode this
            project spends most of its effort avoiding.
          */}
          <section data-testid="deferrals-panel">
            <h2>What this does not do, and what would change that</h2>
            <p className="aside">
              Four capabilities are assessed, deferred and cheap to adopt. Each has a trigger,
              and the triggers are written down rather than remembered.
            </p>
            <dl>
              <dt>Adaptive sampling</dt>
              <dd data-testid="deferral-adaptive">
                An ensemble, its spread, and a vessel steered by it against a lawnmower track.
                Deferred until scoring is trusted &mdash; which means AT-02, AT-03 and AT-06
                have passed. <strong>AT-03 has; AT-02 and AT-06 have not</strong>, and both
                fail because two declared numbers disagree about amplitude. A test measures the
                trigger on every run, so this statement is never out of date.
              </dd>
              <dt>Dynamic depth levels</dt>
              <dd data-testid="deferral-depth">
                Vertical structure that is advected rather than diagnosed. The trigger is a
                question about vertical structure evolving in time. The disagreement a reader
                can see between an XBT and the model&rsquo;s derived profile is <em>not that trigger</em>: it is a static offset, and advected structure would not move it.
              </dd>
              <dt>A GPU kernel</dt>
              <dd data-testid="deferral-gpu">
                The trigger is the declared frame budget binding at a grid somebody wants. At
                100 &times; 100 it does not.
              </dd>
              <dt>Observation latency</dt>
              <dd data-testid="deferral-latency">
                Observations arriving late rather than not at all. Withholding is its special
                case, and beat 010 built that.
              </dd>
            </dl>
          </section>

          <footer>
            <p className="aside">
              j-ocean is a teaching harness: a real but reduced ocean model, its measurements,
              and what each of them was worth. It is not an operational forecast system, and
              every figure on this page says where it came from.
            </p>
          </footer>
        </>
      )}
    </main>
  );
}
