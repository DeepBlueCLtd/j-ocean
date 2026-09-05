import { useCallback, useEffect, useMemo, useState } from 'react';
import configUrl from '../../config/j-ocean.json?url';
import { ConfigurationError, fetchConfiguration, type LoadedConfiguration } from '../config/load.js';
import { createRun, type Run } from '../run/run.js';
import { serialiseManifest } from '../run/manifest.js';
import { loadClimatology, loadObservations, loadTruth } from './artefacts.js';
import { FieldView, type Marker } from './FieldView.js';
import { HorizonRow } from './HorizonRow.js';
import { runForecast, type ForecastResult } from '../run/forecast.js';
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

/** Where the instruments sampled, in fractional grid coordinates, for the overlay. */
function markersFor(view: RunView): Marker[] {
  const { box } = view;
  const { nx, ny } = view.results.grid;
  const place = (lonDeg: number, latDeg: number) => ({
    x: ((lonDeg - box.west) / (box.east - box.west)) * nx,
    y: ((latDeg - box.south) / (box.north - box.south)) * ny,
  });

  return [
    ...view.surface.map((o) => ({ ...place(o.lonDeg, o.latDeg), kind: 'track' as const, flagged: !isUsable(o) })),
    ...view.drops.map(({ profile }) => ({
      ...place(profile.lonDeg, profile.latDeg),
      kind: 'drop' as const,
      flagged: !isUsable(profile),
    })),
    ...view.argo.map(({ profile }) => ({
      ...place(profile.lonDeg, profile.latDeg),
      kind: 'external' as const,
      flagged: (profile.levels ?? []).some((level) => level.flags.length > 0),
    })),
  ];
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
    (seed: string | undefined, recordedCase: boolean): RunView | null => {
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
      const run = createRun({
        config: loaded.config,
        configDigest: loaded.digest,
        kernel,
        initialState: state,
        domainId: record.domainId,
        recordedCase,
        ...(seed === undefined ? {} : { seed }),
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
          background: (state.fields[THICKNESS] as Float64Array).slice(),
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
  const buildRow = useCallback(() => {
    if (loaded === null || record === null || view === null) return;
    const domain = loaded.config.domains.list.find((d) => d.id === record.domainId);
    if (domain === undefined) return;
    const forecast = runForecast({
      config: loaded.config,
      domain,
      truth: record.truth,
      climatology: record.climatology,
      argo: record.observations,
      issueInstantMs:
        Date.parse(loaded.config.truth.period.start) + loaded.config.forecast.spinUpHours * 3_600_000,
      ...(view.recordedCase ? {} : { seed: view.run.rng.rootSeed }),
    });
    setView({ ...view, forecast });
  }, [loaded, record, view]);

  const newRun = useCallback(() => {
    // Exemption (b): entropy is drawn here, once, before the run exists.
    const built = buildRun(drawRootSeed(), false);
    if (built !== null) {
      setOverBudgetNotice(null);
      setView(built);
    }
  }, [buildRun]);

  const manifest = useMemo(
    () => (view === null ? null : serialiseManifest(view.run.exportManifest())),
    [view],
  );

  return (
    <main>
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
              markers={markersFor(view)}
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
              <button type="button" onClick={buildRow} data-testid="build-row">
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
              markers={markersFor(view)}
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
              markers={markersFor(view).filter((marker) => marker.kind !== 'track')}
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
              re-computation, not the restoration of a snapshot.
            </p>
            <pre data-testid="manifest">{manifest}</pre>
          </section>

          <footer>
            <p className="aside">
              Beat 001 of the development plan: the foundation and the four ports. There is
              no ocean here yet, and the page says so rather than drawing one.
            </p>
          </footer>
        </>
      )}
    </main>
  );
}
