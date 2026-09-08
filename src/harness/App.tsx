import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { footprintOf, markersFrom, marksOf, type Footprint } from './footprint.js';
import type { Edit } from '../instruments/edits.js';
import { useHorizonRow } from './HorizonRow.js';
import { BelowFloor, Workspace, useAboveFloor, type PaneDefinition, type PanePlacement } from './Workspace.js';
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
import { Computed, Declared, HostTime } from './figures.js';
import { Walkthrough } from './Walkthrough.js';
import { HelpProvider, PanelCorner, PanelHead } from './Help.js';
import { THE_ROW, type CentreContent } from './CentreContent.js';
import {
  addressHref,
  NOTHING_SELECTED,
  parseAddress,
  resolveAddress,
  type Address,
} from './address.js';

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
 * The three kinds are the surface's vocabulary rather than this file's private business, so
 * beat 016 moved them to `figures.tsx`: a module with a figure to draw reaches for those
 * instead of inventing a second set. Panel help reaches for `Declared` and for nothing else
 * there, because FR-055 says help teaches and does not report.
 */
export { Declared } from './figures.js';

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

  /**
   * What the centre has been asked to hold (FR-049), lifted here by beat 017.
   *
   * It was beat 015's state inside `useHorizonRow`. An enlargement is one of the three things
   * an address names, and the address is written here, so a piece of state the address carries
   * cannot live where the address cannot see it.
   */
  const [requestedCentre, setRequestedCentre] = useState<CentreContent>(THE_ROW);

  /**
   * What the workspace could not do with a stored arrangement, and how to put it back
   * (spec 018 FR-005, US2 scenarios 3 and 4).
   *
   * Both live here rather than in `Workspace.tsx` because both belong beside the statement in
   * the status strip: a reader who has been told their arrangement was not usable is owed the
   * control that restores the default in the same place, not two panes away.
   */
  const [workspaceRefusal, setWorkspaceRefusal] = useState<string | null>(null);
  const resetWorkspace = useRef<(() => void) | null>(null);
  const onWorkspaceReady = useCallback((reset: () => void) => {
    resetWorkspace.current = reset;
  }, []);

  /**
   * The address, and the rules it lives by (FR-056, SC-002, SC-003).
   *
   * **It is read once, on the way in, and it is never read again.** `arrived` is the query
   * string as the reader's link had it; the surface resolves it against the run once a run
   * exists, and after that the reader's selections are the only thing that moves.
   *
   * **Mounting does not write.** There is no effect here that reconciles the address with the
   * selection, and that absence is the requirement rather than an oversight: an effect like
   * that would canonicalise a reader's URL on any remount -- reordering it, dropping the key it
   * refused, normalising a value -- and a reordered query string is still a rewritten URL to
   * anyone who copies it. The address is written from the selection handlers below and from
   * nowhere else, so there is no code path from mounting to a write.
   *
   * **Writes replace rather than push.** A reader poking at cells to learn the field would
   * otherwise build a history they have to escape backwards through, which punishes exactly
   * the behaviour the instrument wants. The consequence is stated rather than left emergent:
   * the back button leaves j-ocean for whatever the reader was looking at before it, and no
   * number of selections stands between them and it.
   */
  const arrived = useRef<ReturnType<typeof parseAddress>>(parseAddress(window.location.search));
  /** What is selected now, as an address. Written from here; never read back from the bar. */
  const selection = useRef<Address>(NOTHING_SELECTED);
  const addressApplied = useRef(false);
  /** Everything the link named that this run has not got, each said by name (FR-005). */
  const [addressRefusals, setAddressRefusals] = useState<readonly string[]>([]);

  const writeSelection = useCallback((patch: Partial<Address>) => {
    selection.current = { ...selection.current, ...patch };
    window.history.replaceState(null, '', addressHref(window.location, selection.current));
  }, []);

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
   *
   * This is one of the three places the address is written (FR-056), and it writes the grid the
   * index was written against with it: a cell is an index, and an index into a different grid
   * is a different place.
   */
  const selectCell = useCallback(
    (cellIndex: number) => {
      setMark(null);
      setView((current) => (current === null ? current : { ...current, selectedCell: cellIndex }));
      writeSelection({
        cell:
          loaded === null
            ? null
            : { index: cellIndex, nx: loaded.config.grid.nx, ny: loaded.config.grid.ny },
        observation: null,
      });
    },
    [loaded, writeSelection],
  );

  /**
   * A hover previews; a pinned mark survives the pointer leaving, as it did under the panel.
   *
   * A hover does not write the address, and that is a choice rather than an omission: an
   * address written on every pointer move across a field would be a hundred rewrites of a
   * reader's URL for a selection they never made. What a link names is what somebody chose.
   */
  const showMark = useCallback(
    (next: { readonly id: string; readonly leadHours: number } | null) => {
      setMark((current) =>
        current?.pinned === true ? current : next === null ? null : { ...next, pinned: false },
      );
    },
    [],
  );

  /** Clicking the same mark again releases it, which is what the Release control also does. */
  const pinMark = useCallback(
    (next: { readonly id: string; readonly leadHours: number }) => {
      const releasing = mark !== null && mark.pinned && mark.id === next.id;
      setMark(releasing ? null : { ...next, pinned: true });
      writeSelection({ observation: releasing ? null : next.id, cell: null });
    },
    [mark, writeSelection],
  );

  /**
   * Release what is pinned (spec 017 T032).
   *
   * The Release control had been calling `showMark(null)`, which a pinned mark is guarded
   * against by design -- a hover may not take a pinned selection away -- so the control had
   * done nothing since beat 008. Clearing is its own act, and it returns the address to its
   * unselected form.
   */
  const clearMark = useCallback(() => {
    setMark(null);
    writeSelection({ observation: null });
  }, [writeSelection]);

  /** Enlarging, and returning to the row. The third of the three things an address names. */
  const requestCentre = useCallback(
    (next: CentreContent) => {
      setRequestedCentre(next);
      writeSelection({ panel: next.kind === 'enlarged' ? next.leadHours : null });
    },
    [writeSelection],
  );

  /**
   * The link a reader arrived on, resolved against the run they are in (FR-001, FR-005).
   *
   * It happens **once**, when a run and its observations exist, because that is when the
   * questions the address asks can be answered: whether the horizon is declared, whether the
   * grid is this grid, and whether this run made that observation. Applying it writes nothing:
   * `selection.current` is set to what was actually honoured, so the next thing the reader
   * chooses writes a clean address, and until they choose something the bar keeps the string
   * their link had -- refused key and all.
   *
   * Anything this run has not got is **reported by name** and selects nothing. A near match --
   * the nearest declared horizon, the same index in this grid -- would be the surface
   * pretending the link worked, and a reader would be discussing a different cell from the one
   * they were sent (Principle VI).
   */
  useEffect(() => {
    if (addressApplied.current) return;
    if (loaded === null || view === null || runFootprint === null) return;
    addressApplied.current = true;

    const grid = { nx: loaded.config.grid.nx, ny: loaded.config.grid.ny };
    const resolved = resolveAddress(arrived.current, {
      declaredHorizons: loaded.config.horizons.leadHours,
      grid,
      observationIds: new Set(marksOf(runFootprint).map((one) => one.id)),
    });

    setAddressRefusals(resolved.refusals);
    selection.current = {
      panel: resolved.panel,
      cell: resolved.cell === null ? null : { index: resolved.cell, ...grid },
      observation: resolved.observation,
    };

    if (resolved.panel !== null) {
      setRequestedCentre({ kind: 'enlarged', leadHours: resolved.panel });
    }
    if (resolved.cell !== null) {
      const cell = resolved.cell;
      setView((current) => (current === null ? current : { ...current, selectedCell: cell }));
    }
    if (resolved.observation !== null) {
      /*
       * A profile is drawn beside the model's derived profile at that cell, and which panel's
       * field that comes from is a lead time. The address does not carry one of its own -- a
       * fourth key would be a fourth key -- so it is the panel the link names, or the first
       * declared horizon where the link names none.
       */
      const leadHours = resolved.panel ?? Math.min(...loaded.config.horizons.leadHours);
      setMark({ id: resolved.observation, leadHours, pinned: true });
    }
  }, [loaded, view, runFootprint]);

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
    onClearMark: clearMark,
    markPinned: mark?.pinned ?? false,
    /* FR-056. What the centre holds is one of the three things an address names, so the state
       is the shell's and the row is handed it. */
    requested: requestedCentre,
    onRequest: requestCentre,
    /* FR-043. Below the declared floor the centre is forced to an enlargement -- the strip
       and one panel -- because six panels shrunk past legibility are six panels nobody can
       read. It is the same enlargement a reader chooses above the floor, not a second
       presentation. Which panels are drawn is display; nothing here recomputes. */
    aboveFloor,
  });

  /*
   * FR-02, and it is the first thing in the document rather than a footnote. It has no
   * dismiss control because there is nothing about it that stops being true, and it sits
   * above the controls column's own scroller, so no amount of scrolling takes it off screen.
   */
  /*
   * FR-58, and it is on the surface without interaction rather than a footnote. It has no
   * dismiss control because there is nothing about it that stops being true, and it lives in
   * the status strip, which is not a pane: there is no arrangement a reader can reach in which
   * it has been tabbed behind something, dragged into a corner or closed.
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
        {/*
          Spec 016 US5 scenario 3. The walkthrough carried the legend of the four figure kinds
          in its first step. It explains the whole surface rather than one panel, so it is not
          a panel's help: it is on the site, and this is the way to it.
        */}
        <a href="../data-model.html#the-figure-kinds" data-testid="figure-kinds-link">
          How a figure says where it came from: declared, computed, derived, host time
        </a>
      </nav>
    </>
  );

  /*
   * Before a run exists there is nothing to divide into panes, so the surface is the
   * statement and, where the configuration refused to validate, the refusal. The refusal is
   * bounded and scrolls within itself: a stack trace that lengthened the page would break the
   * one property this beat exists to establish.
   */
  if (loaded === null || view === null) {
    return (
      <>
        <div className="boot-view">
          {statement}
          {failure !== null && (
            <section
              className="failure"
              data-testid="configuration-failure"
              data-scrolls="list"
              data-list="the validator's complaints, one per line"
            >
              <h2>The configuration did not validate, so no run was provisioned.</h2>
              <pre>{failure}</pre>
            </section>
          )}
        </div>
      </>
    );
  }

  const config = loaded.config;

  /*
   * The controls (SRD-v1 FR-11, FR-25, FR-31, FR-32, FR-33; spec 018 US3, FR-006).
   *
   * A control surface, grouped by what each control acts on, and nothing here explains
   * anything: every input carries its accessible name, its unit and the bounds configuration
   * declares for it, and the sentence that used to introduce it is in this panel's own help or
   * in the walkthrough, with a row in docs/narrative-disposition.json saying which.
   *
   * The run's provenance is no longer beneath these controls. It was six stacked disclosures
   * in a column that scrolled 1,344 px in a 1,440 px window, which is the six-screen page of
   * SRD-v2 §1.1 folded sideways; it is now four tabs of a pane of its own.
   */
  const controls = (
    <>
      {/*
        SRD-v1 FR-11. The contrast between the eventful domain and the bland one is called a
        requirement rather than a bonus, and until beat 017 nothing on the surface offered it.
        Choosing a domain loads that domain's three committed artefacts and rebuilds the run
        from the declared seed; the recorded case is the default domain, unmoved.
      */}
      <div className="control-group" data-testid="domain-control">
        <PanelHead panel="controls/domain" />
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
        <PanelHead panel="controls/run" />
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
    </>
  );

  /*
   * The run's provenance, as tabs (spec 018 T012).
   *
   * Beat 014 opened each of these and asked the spec's question of it: does a reader drive
   * this, or read a live figure from it, or is it an explanation? What was left was the
   * figures and their labels -- and, beat 018 found, a good deal of connective prose between
   * them that was doing a label's job in a sentence's clothes. What is left now is a term list:
   * a name, a figure, and its unit. Every sentence that went has a row in
   * docs/narrative-disposition.json saying where, and tests/docs/disposition.test.ts holds it.
   */
  const runProvenance = (
    <section className="provenance-pane" data-testid="run-panel">
      <PanelHead panel="controls/run-provenance" />
      {/* FR-002. A term list of the run's own figures is an enumeration a reader scans, so it
          may scroll where the pane is short, and it says which list it is. What may never
          scroll here is an explanation, and there is none: every line is a label and a
          figure. */}
      <dl data-scrolls="list" data-list="the run's own figures, one to a line">
        <dt>Root seed</dt>
        <dd>
          <Declared>
            <span data-testid="root-seed">{view.run.rng.rootSeed}</span>
          </Declared>
        </dd>

        <dt>Domain</dt>
        <dd>
          <Declared>{view.run.domainId}</Declared>
        </dd>

        <dt>Grid</dt>
        <dd>
          <Declared>
            {config.grid.nx} &times; {config.grid.ny}
          </Declared>{' '}
          cells,{' '}
          <Computed>
            {view.results.grid.cellSizeXMetres.toFixed(0)} &times;{' '}
            {view.results.grid.cellSizeYMetres.toFixed(0)} m
          </Computed>
        </dd>

        <dt>Timestep</dt>
        <dd data-testid="stability">
          <Declared>{view.run.stability.declaredTimestepSeconds} s</Declared>
        </dd>

        <dt>Epoch</dt>
        <dd>
          <Declared>{config.clock.epoch}</Declared>
        </dd>

        <dt>Largest stable step</dt>
        <dd>
          <Computed>{view.run.stability.largestStableTimestepSeconds.toFixed(1)} s</Computed>
        </dd>

        <dt>Linear boundary</dt>
        <dd>
          <Computed>{view.run.stability.linearStabilityBoundarySeconds.toFixed(1)} s</Computed>
        </dd>

        <dt>Gravity-wave speed</dt>
        <dd>
          <Computed>
            {view.run.stability.gravityWaveSpeedMetresPerSecond.toFixed(3)} m/s
          </Computed>
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

        <dt>Initialised from</dt>
        <dd data-testid="initialisation">
          <Computed>{new Date(view.initialisation.instantMs).toISOString()}</Computed>
        </dd>

        <dt>Layer thickness</dt>
        <dd>
          <Computed>
            {view.initialisation.thicknessRangeMetres[0].toFixed(0)}&ndash;
            {view.initialisation.thicknessRangeMetres[1].toFixed(0)} m
          </Computed>{' '}
          about <Declared>{config.model.meanUpperLayerThicknessMetres} m</Declared>
        </dd>

        <dt>Excluded margin</dt>
        <dd>
          <Declared>{view.results.spongeWidthCells} cells</Declared> of sponge, unscored
        </dd>

        <dt>Outcrop clamps</dt>
        <dd data-testid="outcrops">
          <Computed>{view.results.outcrops}</Computed> at{' '}
          <Declared>{config.model.minimumLayerThicknessMetres} m</Declared>
        </dd>
      </dl>
    </section>
  );

  const instruments = (
    <section className="provenance-pane" data-testid="instruments-panel">
      <PanelHead panel="controls/instruments" />
      <dl data-scrolls="list" data-list="what each instrument produced, one to a line">
        <dt>Ownship surface</dt>
        <dd data-testid="surface-count">
          <Computed>{view.surface.length}</Computed> at{' '}
          <Declared>{config.instruments.track.sampleIntervalHours} h</Declared>
        </dd>

        <dt>Surface error</dt>
        <dd>
          <Declared>{config.instruments.surface.noiseStandardDeviationDegC} degC</Declared>{' '}
          instrument,{' '}
          <Declared>
            {config.instruments.surface.representativenessStandardDeviationDegC} degC
          </Declared>{' '}
          representativeness
        </dd>

        <dt>XBT drops</dt>
        <dd data-testid="drop-count">
          <Computed>{view.drops.length}</Computed> &times;{' '}
          <Declared>{config.instruments.xbt.depthsMetres.length}</Declared> levels
        </dd>

        <dt>What a drop told us</dt>
        <dd data-testid="interface-estimates">
          {view.drops.map(({ interface: inferred }) => (
            <span key={inferred.id} className="estimate">
              {isUsable(inferred) ? (
                <>
                  <Computed>{inferred.value.toFixed(0)} m</Computed>
                  {/* The kind is unchanged (NFR-05): beat 008 drew a drop's error in the
                      host-time face and it stays there. What is added is the `figure` class,
                      so that the surface's own vocabulary says this is a figure -- which is
                      what lets tests/shell/prose.spec.ts tell a readout from a sentence. */}
                  <span className="figure host-time">
                    &plusmn;{inferred.error.totalSd.toFixed(0)} m
                  </span>
                </>
              ) : (
                <em>unresolved</em>
              )}
            </span>
          ))}
        </dd>

        <dt>Argo</dt>
        <dd data-testid="argo-state">
          <Computed>{view.argo.length}</Computed>{' '}
          {config.instruments.argo.assimilate ? 'assimilated' : 'drawn, not assimilated'}
        </dd>

        <dt>Flags</dt>
        <dd data-testid="flag-summary">
          {flagSummary(view).length === 0 ? (
            <>
              none fired; control{' '}
              <Declared>{config.instruments.qualityControl.enabled ? 'on' : 'off'}</Declared>
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
    </section>
  );

  const truthRecord =
    record === null ? null : (
      <section className="provenance-pane" data-testid="truth-panel">
        <PanelHead panel="controls/truth" />
        <dl data-scrolls="list" data-list="the truth record's own figures, one to a line">
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
            <Declared>{record.truth.nativeResolutionDegrees}&deg;</Declared>,{' '}
            <Declared>
              {config.domains.list.find((d) => d.id === record.domainId)
                ?.truthToModelResolutionRatio}
              &times;
            </Declared>{' '}
            the model grid
          </dd>

          <dt>Instants</dt>
          <dd data-testid="truth-instants">
            <Computed>{record.truth.instantsMs().length}</Computed>,{' '}
            <Computed>
              {(record.truth.provenance()['instantSpacingHours'] as number[] | undefined)?.join(
                ' and ',
              )}
            </Computed>{' '}
            h apart
          </dd>

          <dt>Depth levels</dt>
          <dd>
            <Declared>{record.truth.depthLevelsMetres().join(', ')} m</Declared>
          </dd>

          <dt>Argo profiles</dt>
          <dd data-testid="observation-count">
            <Computed>{record.observations.profiles.length}</Computed> profiles,{' '}
            <Computed>{levelCount(record.observations)}</Computed> levels,{' '}
            <Computed>{flaggedLevelCount(record.observations)}</Computed> flagged
          </dd>

          <dt>Climatology window</dt>
          <dd data-testid="climatology-overlap">
            <Declared>
              {String(
                (record.climatology.header.provenance['window'] as { start: string })?.start,
              )}
            </Declared>{' '}
            to{' '}
            <Declared>
              {String((record.climatology.header.provenance['window'] as { end: string })?.end)}
            </Declared>
            ; overlap{' '}
            <Computed>
              {String(record.climatology.header.provenance['overlapWithRunPeriodDays'])}
            </Computed>{' '}
            days
          </dd>
        </dl>
      </section>
    );

  /*
   * The manifest tab, and the one pane on this surface that may scroll (spec 018 FR-002).
   *
   * It scrolls a **list**: a manifest is a document a reader copies, line by line, and an
   * enumeration a reader scans is exactly what the list/prose distinction admits. Beat 013's
   * doctrine would have let the controls column scroll six paragraphs on the same declaration,
   * which is why the declaration now names the kind of content rather than only the fact.
   */
  const manifestPane = (
    <section className="provenance-pane" data-testid="manifest-panel">
      <PanelHead panel="controls/manifest" />
      <dl>
        <dt>This build</dt>
        <dd className="computed" data-testid="code-version">{CODE_VERSION}</dd>
        {/* AT-04, as something a reader can check: two visits showing this digest have the
            same fields. */}
        <dt>Fields and analysis</dt>
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

      <pre data-testid="manifest" data-scrolls="list" data-list="the manifest, as a reader copies it">
        {manifest}
      </pre>

      <label htmlFor="manifest-input">Paste a manifest to import</label>
      <textarea
        id="manifest-input"
        data-testid="manifest-input"
        rows={3}
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
          aria-label="Import a manifest from a file"
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
  );

  /*
   * FR-045, as a pane: the row, and nothing else competing with it for the space. Before it is
   * built the row is not there, so FR-048 applies instead -- narrowed by §8.1 to as few words
   * as will say what would appear -- and the pane carries the run's analysed field at the size
   * the pane gives it, which is where a cell is selected while there are no panels to select
   * one on.
   */
  const horizons =
    view.forecast === null ? (
      <div className="row-invitation" data-testid="row-invitation">
        {/* Two panels rather than one heading over both: the picture on the left is the
            analysis's own gain and the column on the right is what the row will show, and each
            is a thing a reader can be confused by on its own (FR-052). */}
        <figure className="analysed-field" data-testid="analysed-field">
          <PanelHead panel="centre/attribution" level={2} />
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
            Weight carried by observations, per cell
          </figcaption>
        </figure>
        <div className="row-invitation-prose">
          <PanelHead panel="centre/horizon-row" level={2} />
          {/*
            FR-048 and spec 017 T023. A link may name a panel, or a measurement drawn on one,
            before the row that holds it has been built. The selection is **held** rather than
            honoured early or thrown away, and the surface says so -- because a reader who
            followed a link to a panel and found the row unbuilt is owed the reason, not a
            blank pane. Nothing has been computed to say it.
          */}
          {(requestedCentre.kind === 'enlarged' || mark !== null) && (
            <p className="banner" data-testid="address-held">
              This link names{' '}
              {requestedCentre.kind === 'enlarged' && (
                <>
                  the <Declared>+{requestedCentre.leadHours} h</Declared> panel
                </>
              )}
              {requestedCentre.kind === 'enlarged' && mark !== null ? ' and ' : ''}
              {mark !== null && <>a measurement drawn on the row</>}. The row has not been built
              yet: building it integrates the analysis forward{' '}
              <Declared>{Math.max(...config.horizons.leadHours)} h</Declared>, which takes a
              couple of seconds, so it happens when you ask. The selection is held and will be
              honoured the moment the row is there.
            </p>
          )}
          <p className="region-empty" data-testid="row-invitation-statement">
            Panels at{' '}
            <Declared>
              <span data-testid="horizons">{config.horizons.leadHours.join(', ')} h</span>
            </Declared>
            , once the row is built.
          </p>
          <dl>
            <dt>Influence radius</dt>
            <dd data-testid="influence-radius">
              <Declared>{config.analysis.correlationLengthScaleKilometres} km</Declared>
            </dd>
            <dt>Observations used</dt>
            <dd data-testid="analysis-counts">
              <Computed>{view.analysis.used.length}</Computed>
            </dd>
            <dt>Excluded, still drawn</dt>
            <dd data-testid="analysis-excluded">
              <Computed>{view.analysis.excluded.length}</Computed>
            </dd>
            <dt>Cells clamped</dt>
            <dd data-testid="analysis-clamped">
              <Computed>{view.analysis.attribution.clampedCells}</Computed>
            </dd>
          </dl>
        </div>
      </div>
    ) : (
      <>
        {row.centre}
        {row.skill}
      </>
    );

  /*
   * FR-047 and FR-048. Whatever was last selected, and -- when nothing has been -- what can
   * appear here, in as few words as will say it.
   */
  const selectionPane = (
    <>
      <PanelHead panel="detail/attribution-breakdown" level={2} />
      {/*
        FR-005 and Principle VI. A link that named something this run has not got says so, by
        name, here -- where the thing it named would have appeared. Each refusal is the whole
        sentence: which horizon, which grid, which observation, and what is there instead. The
        surface then shows its unselected state beneath, because substituting the nearest
        declared horizon or the same index in this grid would be it pretending the link worked.
      */}
      {addressRefusals.length > 0 && (
        <div className="banner warn" data-testid="address-refusals">
          {addressRefusals.map((refusal) => (
            <p key={refusal}>{refusal}</p>
          ))}
        </div>
      )}
      {row.detail !== null ? (
        row.detail
      ) : view.selectedCell !== null ? (
        <div data-testid="cell-breakdown">
          {(() => {
            const breakdown = view.analysis.breakdownAt(view.selectedCell);
            return (
              <>
                <dl className="panel-labels">
                  <dt>Cell</dt>
                  <dd>
                    <Computed>{view.selectedCell}</Computed>
                  </dd>
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
          Nothing selected. Click a cell, or a measurement&rsquo;s mark.
        </p>
      )}
    </>
  );

  /*
   * The status strip (FR-58, SRD-v1 FR-02, FR-34, NFR-04).
   *
   * Not a pane: it cannot be closed, tabbed behind anything or dragged into a corner, because
   * a statement that could be is not one the surface is making. Beside the statement are the
   * three figures a reader wants at a glance and no longer has to open a disclosure for --
   * which run this is, what a step cost against the declared budget, and the digest two visits
   * can be compared on -- each as a figure with its kind on it rather than as a sentence.
   */
  const status = (
    <>
      {/* G-08: the strip is a panel of the surface like any other, and it declares that it has
          nothing to explain rather than being left off the list. The corner draws no control,
          because FR-053 says a panel with nothing to explain shows none. */}
      <PanelCorner panel="status" />
      {statement}
      <dl className="status-figures" data-testid="status-figures">
        <dt>Run</dt>
        <dd data-testid="recorded-case">
          {view.recordedCase ? (
            <Declared>{config.run.recordedCaseLabel}</Declared>
          ) : (
            <>
              <Computed>{view.run.rng.rootSeed}</Computed>{' '}
              <span className="unmeasured">drawn for this visit</span>
            </>
          )}
        </dd>
        <dt>Step</dt>
        <dd data-testid="step-time">
          {view.lastStepMs === null ? (
            <span className="unmeasured">not yet measured</span>
          ) : (
            <>
              <HostTime>{view.lastStepMs.toFixed(3)} ms/step</HostTime>{' '}
              <span
                className={
                  overBudget(view.lastStepMs, config.budget.frameBudgetMs)
                    ? 'over-budget'
                    : 'within-budget'
                }
              >
                {overBudget(view.lastStepMs, config.budget.frameBudgetMs) ? 'over' : 'within'}{' '}
                <Declared>{config.budget.frameBudgetMs} ms</Declared>
              </span>
            </>
          )}
        </dd>
        <dt>Fields and analysis</dt>
        <dd className="computed" data-testid="status-digest">{resultsDigest}</dd>
      </dl>
      <div className="status-actions">
        {/* FR-009 of this beat: offered, and it starts when a reader presses it and at no
            other time. There is no first-visit flag here and nothing that could become one. */}
        <Walkthrough config={config} />
        {/* FR-005: one control puts the arrangement back. */}
        <button
          type="button"
          data-testid="reset-workspace"
          onClick={() => { resetWorkspace.current?.(); }}
        >
          Default arrangement
        </button>
      </div>
      {workspaceRefusal !== null && (
        <p className="banner warn" data-testid="workspace-refusal">
          {workspaceRefusal}
        </p>
      )}
    </>
  );

  /*
   * FR-043, said in one line (spec 018 FR-007).
   *
   * Beat 013 wrote this as two paragraphs: what the row needs and why, and what is being
   * offered instead and why the strip survives. Both were true and both were an explanation on
   * the surface, which is the fault this beat exists to remove -- and they were the first thing
   * a reader at a small window met, which made the fallback read as an apology.
   *
   * So the surface states the size, as the declared figure it is, and says what it is doing.
   * The two paragraphs are in the walkthrough, which is offered here as it is everywhere else,
   * and docs/narrative-disposition.json records where each went.
   *
   * The window's own size is deliberately not printed beside it. It is neither declared nor
   * computed by anything this project runs, and a fourth kind of figure invented for a banner
   * would be worth less than the sentence it saved.
   */
  const floorNotice = (
    <p className="banner floor-notice" data-testid="viewport-floor-notice" role="note">
      Needs{' '}
      <Declared>
        {config.presentation.minimumViewportWidthPx} &times;{' '}
        {config.presentation.minimumViewportHeightPx} px
      </Declared>
      ; showing one horizon at a time.
    </p>
  );

  /*
   * The panes, and where each goes before a reader moves it (FR-001, Principle X).
   *
   * The provenance tabs share a group, which is what makes them tabs; everything else is its
   * own group. The sizes are declared figures, and the horizons pane takes whatever is left --
   * which is the whole point of a layout manager over a grid of fixed tracks.
   */
  const panes: readonly PaneDefinition[] = [
    { id: 'controls', pane: 'controls', title: 'Controls', content: controls },
    { id: 'horizons', pane: 'horizons', title: 'Horizons', content: horizons },
    {
      id: 'selection',
      pane: 'selection',
      title: 'Selection',
      announces: true,
      content: selectionPane,
    },
    { id: 'provenance/run', pane: 'provenance', title: 'The run', content: runProvenance },
    {
      id: 'provenance/instruments',
      pane: 'provenance',
      title: 'Instruments',
      content: instruments,
    },
    { id: 'provenance/truth', pane: 'provenance', title: 'Truth record', content: truthRecord },
    { id: 'provenance/manifest', pane: 'provenance', title: 'Manifest', content: manifestPane },
  ];

  const rowMinimumWidthPx =
    config.horizons.leadHours.length * config.presentation.minimumPanelWidthPx +
    (config.horizons.leadHours.length - 1) * config.presentation.panelGapPx +
    config.presentation.pageGutterPx;

  const placements: readonly PanePlacement[] = [
    {
      id: 'controls',
      initialWidth: config.presentation.controlsWidthPx,
      minimumWidth: config.presentation.workspace.paneMinimumWidthPx,
    },
    {
      id: 'horizons',
      referencePanel: 'controls',
      direction: 'right',
      /* The one pane with no declared width: it takes what the flanking panes leave, and its
         minimum is the row's own -- every declared horizon at the declared minimum panel
         width, plus what the pane costs around them. That figure is the floor. */
      minimumWidth: rowMinimumWidthPx,
    },
    {
      id: 'selection',
      referencePanel: 'horizons',
      direction: 'right',
      initialWidth: config.presentation.detailWidthPx,
      minimumWidth: config.presentation.workspace.paneMinimumWidthPx,
    },
    {
      id: 'provenance/run',
      referencePanel: 'selection',
      direction: 'below',
      heightFraction: config.presentation.workspace.provenanceFraction,
    },
    { id: 'provenance/instruments', referencePanel: 'provenance/run', direction: 'within' },
    { id: 'provenance/truth', referencePanel: 'provenance/run', direction: 'within' },
    { id: 'provenance/manifest', referencePanel: 'provenance/run', direction: 'within' },
  ];

  /*
   * FR-052. Every panel's help is opened from that panel's own control, and one piece of state
   * decides which is open, so opening one closes another and nothing sequences. The provider
   * hands the help entries the validated configuration and nothing else: a number a help entry
   * teaches with is a declared one, read from the file that declares it (Principle X, FR-006).
   */
  return (
    <HelpProvider config={config}>
      {aboveFloor ? (
        <Workspace
          config={config}
          panes={panes}
          placements={placements}
          status={status}
          onRefusal={setWorkspaceRefusal}
          onReady={onWorkspaceReady}
        />
      ) : (
        <BelowFloor
          config={config}
          status={status}
          notice={floorNotice}
          controls={controls}
          horizons={horizons}
          selection={selectionPane}
          provenance={
            <>
              {runProvenance}
              {instruments}
              {truthRecord}
              {manifestPane}
            </>
          }
        />
      )}
    </HelpProvider>
  );
}
