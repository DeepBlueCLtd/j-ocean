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
import { useHorizonRow } from './HorizonRow.js';
import { BelowFloor, Regions, useAboveFloor } from './Regions.js';
import { departureBrief, runForecast, type DepartureBrief, type ForecastResult } from '../run/forecast.js';
import { climatologyReferenceOver } from '../instruments/climatology-reference.js';
import { interfaceFieldFromContainer } from '../instruments/interface-field.js';
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

/**
 * Principle V: declared, computed and derived are typographically distinct, always.
 *
 * `Declared` is exported because the three kinds are the surface's vocabulary rather than
 * this file's private business: a module that has a figure from configuration to draw should
 * reach for this one instead of inventing a second. FR-009's required viewport size is such a
 * figure -- it comes from configuration, so it is drawn as configuration.
 */
export function Declared({ children }: { children: React.ReactNode }) {
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
  /**
   * FR-009 and US7 scenario 3. Whether the window is at or above the declared floor, in CSS
   * pixels, answered continuously: crossing the floor swaps the presentation with no reload.
   */
  const aboveFloor = useAboveFloor(loaded?.config ?? null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Beat 011: what the reader pasted, and what happened when it was read. */
  const [pasted, setPasted] = useState('');
  const [importFailure, setImportFailure] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [view, setView] = useState<RunView | null>(null);
  const [record, setRecord] = useState<Record002 | null>(null);
  const [overBudgetNotice, setOverBudgetNotice] = useState<{ projectedMs: number } | null>(null);
  /**
   * SRD-v1 FR-11, built here because it had never been built: the shell read
   * `domains.defaultId` and nothing offered the bland domain the requirement calls a
   * requirement rather than a bonus. Null until the configuration has validated, because
   * which domains exist is a declared value like any other; the recorded case is the default
   * domain and choosing it changes nothing about it.
   */
  const [chosenDomainId, setChosenDomainId] = useState<string | null>(null);
  /**
   * Principle VI: the harness can lose, and it says so where the reader asked.
   *
   * Building the domain choice found that the second domain of FR-11 cannot be run at all --
   * `instruments.track.waypoints` are declared once, in the eventful domain's longitudes, and
   * the bland domain's artefact does not cover them, so the ownship thermometer refuses to
   * sample. That is a finding under FR-40 and not a thing this beat fixes: making the track a
   * per-domain declaration is a configuration change, and this beat changes no declared value.
   * What it must not do is leave a blank page, so the refusal is caught, said in the
   * instrument's own words, and the run the reader had is left standing.
   */
  const [domainFailure, setDomainFailure] = useState<string | null>(null);
  /**
   * FR-047: what the detail region is showing. Held here rather than in the panel that drew
   * the mark, because the region belongs to the surface and a selection made on one panel
   * must survive a reader looking at another.
   */
  const [mark, setMark] = useState<{
    readonly id: string;
    readonly leadHours: number;
    readonly pinned: boolean;
  } | null>(null);

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
    const domainId = chosenDomainId ?? loaded.config.domains.defaultId;
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
  }, [loaded, chosenDomainId]);

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
    try {
      const built = buildRun(undefined, true);
      if (built !== null) setView(built);
    } catch (error) {
      // The chosen domain could not be run. Say which and why, put the choice back to the
      // default, and leave the run on screen alone: a refused choice provisions nothing.
      setDomainFailure(
        `${record?.domainId ?? 'that domain'}: ${error instanceof Error ? error.message : String(error)}`,
      );
      setChosenDomainId(null);
    }
  }, [buildRun, record?.domainId]);

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


  /**
   * FR-047. Selecting a cell fills the detail region, and takes it from whatever mark was
   * there: the region carries *the last selection*, not two of them.
   */
  const selectCell = useCallback((cellIndex: number) => {
    setMark(null);
    setView((current) => (current === null ? current : { ...current, selectedCell: cellIndex }));
  }, []);

  /** A hover previews; a pinned mark survives the pointer leaving, as it did under the panel. */
  const showMark = useCallback(
    (next: { readonly id: string; readonly leadHours: number } | null) => {
      setMark((current) =>
        current?.pinned === true ? current : next === null ? null : { ...next, pinned: false },
      );
    },
    [],
  );

  /** Clicking the same mark again releases it, which is what the Release control also does. */
  const pinMark = useCallback((next: { readonly id: string; readonly leadHours: number }) => {
    setMark((current) =>
      current !== null && current.pinned && current.id === next.id ? null : { ...next, pinned: true },
    );
  }, []);

  const defaultIssueInstantMs =
    loaded === null
      ? 0
      : Date.parse(loaded.config.truth.period.start) +
        loaded.config.forecast.spinUpHours * 3_600_000;

  /**
   * The row, as three regions and a detail (see `HorizonRow.tsx`). It is a hook rather than a
   * component because its parts belong to different regions and a component returns one tree.
   */
  const row = useHorizonRow({
    config: loaded?.config ?? null,
    domain: loaded?.config.domains.list.find((d) => d.id === view?.run.domainId) ?? null,
    forecast: view?.forecast ?? null,
    analysis: view?.forecast?.analysis ?? null,
    truth: record?.truth ?? null,
    climatology: record?.climatology ?? null,
    footprint: rowFootprint,
    brief: view?.brief ?? null,
    issueInstantMs: view?.forecast?.issueInstantMs ?? 0,
    defaultIssueInstantMs,
    pendingIssueInstantMs: view?.pendingIssueInstantMs ?? view?.forecast?.issueInstantMs ?? 0,
    onPendingIssueInstantChange: (instantMs) => {
      setView((current) =>
        current === null ? current : { ...current, pendingIssueInstantMs: instantMs },
      );
    },
    onReissue: () => {
      buildRow(view?.pendingIssueInstantMs ?? view?.forecast?.issueInstantMs);
    },
    reissuing: false,
    edits: view?.edits ?? [],
    baseline: view?.baseline ?? view?.forecast ?? null,
    onApplyEdits: (edits) => {
      buildRow(view?.forecast?.issueInstantMs, edits);
    },
    onSelectCell: selectCell,
    shownMark: mark,
    onShowMark: showMark,
    onPinMark: pinMark,
    markPinned: mark?.pinned ?? false,
    /* FR-043. Below the declared floor the row is one panel and a strip, not six panels
       shrunk past legibility. Which panels are drawn is display; nothing here recomputes. */
    presentation: aboveFloor ? 'row' : 'single-panel',
  });

  /*
   * FR-02, and it is the first thing in the document rather than a footnote. It has no
   * dismiss control because there is nothing about it that stops being true, and it sits
   * above the controls column's own scroller, so no amount of scrolling takes it off screen.
   */
  const statement = (
    <>
      <section className="not-operational" data-testid="not-operational" role="note">
        <h1>j-ocean</h1>
        <p>
          <strong>j-ocean is not an operational forecast system.</strong> Its numerics are real
          but reduced, its domain small, and its claims are about <em>relative</em> skill between
          references it computes itself, scored against a truth record it did not author.
        </p>
      </section>
      {/*
        FR-005 and spec 014 T023, T024. The narrative left this page for the welcome site in
        beat 014, so the page names the site rather than leaving a reader to guess where it
        went -- and names the deferrals page, which is where the panel that used to say what
        this harness does not do now points. The site publishes the application at /app/, so
        the way out is one level up; the href is a literal for the same reason it is a literal
        in scripts/docs/build-site.ts, being the shape of the published tree rather than a
        declared figure of the run.
      */}
      <nav className="site-links" data-testid="site-links" aria-label="The j-ocean site">
        <a href="../index.html" data-testid="site-link">
          The j-ocean site: what this is, how it is built, and the notes
        </a>
        <a href="../deferred.html" data-testid="deferrals-link">
          What this does not do, and what would change that
        </a>
      </nav>
    </>
  );

  /*
   * Before a run exists there is nothing to divide into regions, so the surface is the
   * statement and, where the configuration refused to validate, the refusal. The refusal is
   * bounded and scrolls within itself: a stack trace that lengthens the page would break the
   * one property this beat exists to establish.
   */
  if (loaded === null || view === null) {
    return (
      <>
        <Walkthrough />
        <div className="boot-view">
          {statement}
          {failure !== null && (
            <section className="failure" data-testid="configuration-failure" data-scrolls="true">
              <h2>The configuration did not validate, so no run was provisioned.</h2>
              <pre>{failure}</pre>
            </section>
          )}
        </div>
      </>
    );
  }

  const config = loaded.config;

  const controls = (
    <>
      {/*
        SRD-v1 FR-11. The contrast between the eventful domain and the bland one is called a
        requirement rather than a bonus, and until this beat nothing on the surface offered
        it. Choosing a domain loads that domain's three committed artefacts and rebuilds the
        run from the declared seed; the recorded case is the default domain, unmoved.
      */}
      <div className="control-group" data-testid="domain-control">
        <h3>Domain</h3>
        {config.domains.list.map((domain) => (
          <label key={domain.id} className="choice">
            <input
              type="radio"
              name="domain"
              data-testid={`domain-${domain.id}`}
              checked={(chosenDomainId ?? config.domains.defaultId) === domain.id}
              disabled={view.integrating}
              onChange={() => {
                setDomainFailure(null);
                setChosenDomainId(domain.id);
                setOverBudgetNotice(null);
                setMark(null);
              }}
            />
            <Declared>{domain.label}</Declared> ({domain.character})
          </label>
        ))}
        {domainFailure !== null && (
          <p className="banner warn" data-testid="domain-failure">
            That domain could not be run, so nothing was provisioned and the run you had is
            still on screen. In the instrument&rsquo;s own words: {domainFailure}
          </p>
        )}
      </div>

      {row.controls}

      <div className="control-group" data-testid="run-controls">
        <h3>The run</h3>
        <p data-testid="recorded-case">
          {view.recordedCase ? (
            <>
              This is <Declared>{config.run.recordedCaseLabel}</Declared>: the declared seed,
              unchanged.
            </>
          ) : (
            'This is not the recorded case. A seed was drawn for this visit and nothing about it persists.'
          )}
        </p>
        <div className="row-controls">
          <button
            type="button"
            onClick={() => { integrate(false); }}
            data-testid="advance"
            disabled={view.integrating}
          >
            Integrate {ADVANCE_HOURS} hours
          </button>
          <button type="button" onClick={newRun} data-testid="new-run">
            New run
          </button>
          {view.forecast === null && (
            <button type="button" onClick={() => { buildRow(); }} data-testid="build-row">
              Build the horizon row
            </button>
          )}
        </div>

        <p data-testid="step-time">
          {view.lastStepMs === null ? (
            <span className="unmeasured">not yet measured</span>
          ) : (
            <>
              <HostTime>{view.lastStepMs.toFixed(3)} ms/step</HostTime>{' '}
              {overBudget(view.lastStepMs, config.budget.frameBudgetMs) ? (
                <em>
                  over the declared budget of{' '}
                  <Declared>{config.budget.frameBudgetMs} ms</Declared>, and said so rather
                  than freezing the page
                </em>
              ) : (
                <span className="within-budget">
                  within the declared budget of{' '}
                  <Declared>{config.budget.frameBudgetMs} ms</Declared>
                </span>
              )}
            </>
          )}
        </p>

        {overBudgetNotice !== null && (
          <div className="banner warn" data-testid="over-budget">
            <p>
              The projected time to integrate the longest declared horizon (
              <Declared>{Math.max(...config.horizons.leadHours)} h</Declared>) is{' '}
              <HostTime>{overBudgetNotice.projectedMs.toFixed(0)} ms</HostTime>, which exceeds
              the declared frame budget of{' '}
              <Declared>{config.budget.frameBudgetMs} ms</Declared>. Nothing has been
              integrated beyond the first chunk. The page is saying so rather than freezing.
            </p>
            <button type="button" onClick={() => { integrate(true); }} data-testid="proceed-anyway">
              Integrate anyway
            </button>
          </div>
        )}
      </div>

      {/*
        The run's provenance, behind disclosures (FR-044). Beat 014 opened each of these and
        asked the spec's question of it: does a reader drive this, or read a live figure from
        it, or is it an explanation? What is left is the figures and their labels. Every
        sentence that explained rather than stated has a row in docs/narrative-disposition.json
        saying where it went, and tests/docs/disposition.test.ts holds it there.
      */}
      <div className="disclosures">
        <details data-testid="run-panel">
          <summary>The run</summary>
          <dl>
            <dt>Root seed</dt>
            <dd>
              <Declared>
                <span data-testid="root-seed">{view.run.rng.rootSeed}</span>
              </Declared>
            </dd>

            <dt>Domain</dt>
            <dd>
              <Declared>{view.run.domainId}</Declared>,{' '}
              <Declared>
                {config.grid.nx} &times; {config.grid.ny}
              </Declared>{' '}
              cells laid over{' '}
              <Computed>
                {view.results.grid.cellSizeXMetres.toFixed(0)} &times;{' '}
                {view.results.grid.cellSizeYMetres.toFixed(0)} m
              </Computed>
              .
            </dd>

            <dt>Timestep</dt>
            <dd data-testid="stability">
              <Declared>{view.run.stability.declaredTimestepSeconds} s</Declared> from{' '}
              <Declared>{config.clock.epoch}</Declared>, inside the{' '}
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

            {/* Beat 013: the field panel is gone -- its field is the row's panels and the
                centre's analysed field -- and these are the figures that were beneath it. */}
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
              <Declared>{config.model.meanUpperLayerThicknessMetres} m</Declared>.
            </dd>

            <dt>Excluded margin</dt>
            <dd>
              <Declared>{view.results.spongeWidthCells} cells</Declared> of sponge at each
              edge, relaxed toward the initial state. Scoring will exclude it.
            </dd>

            <dt>Outcrop clamps</dt>
            <dd data-testid="outcrops">
              <Computed>{view.results.outcrops}</Computed>. The layer is clamped at a declared
              minimum of{' '}
              <Declared>{config.model.minimumLayerThicknessMetres} m</Declared> where it would
              otherwise outcrop, and every clamp is counted rather than swallowed.
            </dd>
          </dl>
        </details>

        <details data-testid="instruments-panel">
          <summary>What the instruments measured</summary>
          <dl>
            <dt>Ownship surface</dt>
            <dd data-testid="surface-count">
              <Computed>{view.surface.length}</Computed> measurements along the declared track,
              at <Declared>{config.instruments.track.sampleIntervalHours} h</Declared>{' '}
              intervals. Declared error{' '}
              <Declared>{config.instruments.surface.noiseStandardDeviationDegC} degC</Declared>{' '}
              instrument and{' '}
              <Declared>
                {config.instruments.surface.representativenessStandardDeviationDegC} degC
              </Declared>{' '}
              representativeness.
            </dd>

            <dt>XBT drops</dt>
            <dd data-testid="drop-count">
              <Computed>{view.drops.length}</Computed> drops of{' '}
              <Declared>{config.instruments.xbt.depthsMetres.length}</Declared> levels each.
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
            </dd>

            <dt>Argo</dt>
            <dd data-testid="argo-state">
              {config.instruments.argo.assimilate ? (
                <>
                  <Computed>{view.argo.length}</Computed> profiles admitted, marked{' '}
                  <em>external</em>.
                </>
              ) : (
                <>Drawn, not assimilated. The toggle is off.</>
              )}
            </dd>

            <dt>Flags</dt>
            <dd data-testid="flag-summary">
              {flagSummary(view).length === 0 ? (
                <>
                  No check fired. Quality control is{' '}
                  <Declared>{config.instruments.qualityControl.enabled ? 'on' : 'off'}</Declared>
                  .
                </>
              ) : (
                flagSummary(view).map(([code, count]) => (
                  <span key={code} className="estimate">
                    <Computed>{count}</Computed> {code}
                  </span>
                ))
              )}
            </dd>
          </dl>
        </details>

        {record !== null && (
          <details data-testid="truth-panel">
            <summary>The record this run is scored against</summary>
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
                  {config.domains.list.find((d) => d.id === record.domainId)
                    ?.truthToModelResolutionRatio}
                  &times;
                </Declared>{' '}
                coarser than the model grid.
              </dd>

              <dt>Instants</dt>
              <dd data-testid="truth-instants">
                <Computed>{record.truth.instantsMs().length}</Computed>, spaced{' '}
                <Computed>
                  {(record.truth.provenance()['instantSpacingHours'] as number[] | undefined)?.join(
                    ' and ',
                  )}
                </Computed>{' '}
                hours apart.
              </dd>

              <dt>Depth levels</dt>
              <dd>
                <Declared>{record.truth.depthLevelsMetres().join(', ')} m</Declared>
              </dd>

              <dt>Argo profiles</dt>
              <dd data-testid="observation-count">
                <Computed>{record.observations.profiles.length}</Computed> profiles,{' '}
                <Computed>{levelCount(record.observations)}</Computed> levels, of which{' '}
                <Computed>{flaggedLevelCount(record.observations)}</Computed> carry a flag the
                analysis will not treat as usable.
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
                , which overlaps this run&rsquo;s period by{' '}
                <Computed>
                  {String(record.climatology.header.provenance['overlapWithRunPeriodDays'])}
                </Computed>{' '}
                days.
              </dd>
            </dl>
          </details>
        )}

        <details data-testid="manifest-panel">
          <summary>The manifest this run replays from</summary>

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
        </details>

      </div>
    </>
  );

  /*
   * FR-045: the row, and nothing else competing with it for this region's space. Before it is
   * built the row is not there, so FR-048 applies instead: the region says what the row will
   * show and what building it costs, and carries the run's analysed field at full size --
   * which is where a cell is selected while there are no panels to select one on.
   */
  const centre =
    view.forecast === null ? (
      <div className="full row-invitation" data-testid="row-invitation">
        <h2>The row</h2>
        <figure className="analysed-field" data-testid="analysed-field">
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
            onSelect={selectCell}
          />
          <figcaption className="figure-label">
            The weight observations carried in each cell &mdash; the analysis&rsquo;s own gain,
            drawn as a field.
          </figcaption>
        </figure>
        <div className="row-invitation-prose">
          <p className="region-empty" data-testid="row-invitation-statement">
            Six panels at the declared horizons &mdash;{' '}
            <Declared>
              <span data-testid="horizons">{config.horizons.leadHours.join(', ')} h</span>
            </Declared>{' '}
            &mdash; each stating what it is valid for, what it was initialised from, and what it
            was worth against two references.
          </p>
          <dl>
            <dt>Influence radius</dt>
            <dd data-testid="influence-radius">
              A property of the{' '}
              <Declared>{config.analysis.correlationLengthScaleKilometres} km</Declared> declared
              correlation length scale, not of the ocean.
            </dd>
            <dt>Observations used</dt>
            <dd data-testid="analysis-counts">
              <Computed>{view.analysis.used.length}</Computed> entered the analysis;{' '}
              <Computed>{view.analysis.excluded.length}</Computed> were excluded and are still
              drawn. <Computed>{view.analysis.attribution.clampedCells}</Computed> cells had a
              weight clamped and renormalised.
            </dd>
          </dl>
        </div>
      </div>
    ) : (
      row.centre
    );

  /* FR-046, and FR-048 where there is nothing to report yet. */
  const scores =
    view.forecast === null ? (
      <p className="region-empty full" data-testid="scores-empty">
        Each panel&rsquo;s skill against persistence and against climatology appears here, in
        that panel&rsquo;s own column, once the row has been built and scored.
      </p>
    ) : (
      row.scores
    );

  /*
   * FR-047 and FR-048. Whatever was last selected, and -- when nothing has been -- the two
   * things that can appear here and how to put one of them there.
   */
  const detail = (
    <>
      <h2>What is selected</h2>
      {row.detail !== null ? (
        row.detail
      ) : view.selectedCell !== null ? (
        <div data-testid="cell-breakdown">
          {(() => {
            const breakdown = view.analysis.breakdownAt(view.selectedCell);
            return (
              <>
                <p>
                  Cell <Computed>{view.selectedCell}</Computed>, as the analysis weighted it.
                </p>
                <dl>
                  <dt>observations</dt>
                  <dd>
                    <Computed>{(breakdown.observations * 100).toFixed(1)}%</Computed>
                  </dd>
                  <dt>background</dt>
                  <dd>
                    <Computed>{(breakdown.background * 100).toFixed(1)}%</Computed>
                  </dd>
                  <dt>climatology</dt>
                  <dd>
                    <Computed>{(breakdown.climatology * 100).toFixed(1)}%</Computed>
                  </dd>
                </dl>
                {breakdown.shares.length > 0 && (
                  /* Principle V: each share is a figure the analysis computed, so it is drawn
                     in the computed kind rather than joined into a sentence. Beat 014 found
                     these four figures had been printed as plain text since beat 005. */
                  <p data-testid="cell-shares">
                    of which{' '}
                    {breakdown.shares.slice(0, 3).map((share, at) => (
                      <span key={share.id} className="estimate">
                        {at === 0 ? '' : ', '}
                        {share.id} <Computed>{(share.share * 100).toFixed(1)}%</Computed>
                      </span>
                    ))}
                  </p>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        <p className="region-empty" data-testid="detail-empty">
          Nothing is selected. Two things can appear here: a cell&rsquo;s attribution
          breakdown, from clicking a cell on any field; and a measurement&rsquo;s own profile
          beside the model&rsquo;s derived one, with the measured levels kept as a ghost, from
          hovering or clicking its mark.
        </p>
      )}
    </>
  );

  /*
   * FR-009 and FR-043. The size the application needs, said as what it is: a declared figure,
   * in the kind every declared figure on this surface is drawn in. It is not an apology and
   * it is not a deferral -- the window is told what it is short of, and offered the
   * presentation that fits it.
   *
   * The window's own size is deliberately not printed beside it. It is neither declared nor
   * computed by anything this project runs, and a fourth kind of figure invented for a
   * banner would be worth less than the sentence it saved.
   */
  const floorNotice = (
    <section className="banner floor-notice" data-testid="viewport-floor-notice" role="note">
      <h2>This window is smaller than j-ocean&rsquo;s horizon row needs.</h2>
      <p>
        All{' '}
        <Declared>{config.horizons.leadHours.length}</Declared> declared horizons side by
        side, each at the declared minimum of{' '}
        <Declared>{config.presentation.minimumPanelWidthPx} px</Declared>, want a viewport of
        at least{' '}
        <Declared>
          {config.presentation.minimumViewportWidthPx} &times;{' '}
          {config.presentation.minimumViewportHeightPx} px
        </Declared>{' '}
        once the controls column (<Declared>{config.presentation.controlsWidthPx} px</Declared>
        ), the detail column (<Declared>{config.presentation.detailWidthPx} px</Declared>) and
        the page gutter (<Declared>{config.presentation.pageGutterPx} px</Declared>) have
        taken theirs. That figure was measured from the built layout, not chosen.
      </p>
      <p>
        So this is one horizon at a time instead. The strip carries all{' '}
        <Declared>{config.horizons.leadHours.length}</Declared> and what each was worth,
        because comparison across horizons is the lesson; choosing one in the strip swaps the
        panel beneath it. Widen the window past the figure above and the full row returns
        without a reload.
      </p>
    </section>
  );

  return (
    <>
      {/* The walkthrough sits outside every region because it is about all of them, and
          before them in the document so that a reader tabbing in reaches the explanation of
          the surface before the surface itself. */}
      <Walkthrough />
      {aboveFloor ? (
        <Regions
          config={config}
          statement={statement}
          controls={controls}
          centre={centre}
          scores={scores}
          detail={detail}
        />
      ) : (
        <BelowFloor
          config={config}
          statement={statement}
          notice={floorNotice}
          controls={controls}
          centre={centre}
          scores={scores}
          detail={detail}
        />
      )}
    </>
  );
}
