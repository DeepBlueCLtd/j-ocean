import { useCallback, useEffect, useMemo, useState } from 'react';
import configUrl from '../../config/j-ocean.json?url';
import { ConfigurationError, fetchConfiguration, type LoadedConfiguration } from '../config/load.js';
import { createRun, type Run } from '../run/run.js';
import { serialiseManifest } from '../run/manifest.js';
import { loadClimatology, loadObservations, loadTruth } from './artefacts.js';
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

const ADVANCE_STEPS = 100;

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
}

const viewOf = (run: Run, lastStepMs: number | null): RunView => ({
  run,
  recordedCase: run.recordedCase,
  steps: run.steps,
  instant: run.clock.instantIso(),
  lastStepMs,
});

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

  useEffect(() => {
    let live = true;
    fetchConfiguration(configUrl)
      .then((result) => {
        if (!live) return;
        setLoaded(result);
        // Provisioned only once the configuration has validated. A failure below leaves
        // this untouched, which is what "provisions no run" means.
        setView(viewOf(createRun({ config: result.config, configDigest: result.digest }), null));
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

  const advance = useCallback(() => {
    setView((current) => {
      if (current === null) return current;
      const timed = measure(() => {
        current.run.advance(ADVANCE_STEPS);
      });
      void timed.value;
      return viewOf(current.run, timed.elapsedMs / ADVANCE_STEPS);
    });
  }, []);

  const newRun = useCallback(() => {
    if (loaded === null) return;
    // Exemption (b): entropy is drawn here, once, before the run exists.
    const seed = drawRootSeed();
    setView(
      viewOf(
        createRun({
          config: loaded.config,
          configDigest: loaded.digest,
          seed,
          recordedCase: false,
        }),
        null,
      ),
    );
  }, [loaded]);

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

              <dt>Steps taken</dt>
              <dd>
                <Computed>
                  <span data-testid="steps">{view.steps}</span>
                </Computed>
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

            <div className="controls">
              <button type="button" onClick={advance} data-testid="advance">
                Advance {ADVANCE_STEPS} steps
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
                at <Declared>{loaded.config.grid.cellSizeMetres} m</Declared>
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
