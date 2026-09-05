import { useCallback, useEffect, useMemo, useState } from 'react';
import configUrl from '../../config/j-ocean.json?url';
import { ConfigurationError, fetchConfiguration, type LoadedConfiguration } from '../config/load.js';
import { createRun, type Run } from '../run/run.js';
import { serialiseManifest } from '../run/manifest.js';
import { loadClimatology, loadObservations, loadTruth } from './artefacts.js';
import { FieldView } from './FieldView.js';
import { initialiseFromTruth, type InitialisationReport } from '../model/initialise.js';
import { parametersFor } from '../model/parameters.js';
import { createReducedGravityKernel } from '../model/reduced-gravity.js';
import { publishResults, type ModelResults } from '../model/results.js';
import { flaggedLevelCount, levelCount, type ObservationRecord } from '../truth/observations.js';
import type { ArtefactTruthSource } from '../truth/artefact-truth-source.js';
import type { FieldContainer } from '../truth/container.js';
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
}

interface Record002 {
  readonly domainId: string;
  readonly truth: ArtefactTruthSource;
  readonly climatology: FieldContainer;
  readonly observations: ObservationRecord;
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
      return {
        run,
        recordedCase: run.recordedCase,
        steps: run.steps,
        instant: run.clock.instantIso(),
        lastStepMs: null,
        results: publishResults(state, parameters, run.stability),
        initialisation: report,
        integrating: false,
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
            />
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
