import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { AnalysisRecord } from '../analysis/optimal-interpolation.js';
import { weightsAt } from '../analysis/attribution.js';
import type { Configuration, Domain } from '../config/schema.js';
import { interfaceFieldFromContainer, interfaceFieldFromTruth } from '../instruments/interface-field.js';
import { domainRegion, score, ScoringRefusal, type Score } from '../scoring/scorer.js';
import type { TruthSource } from '../ports/truth-source.js';
import type { FieldContainer } from '../truth/container.js';
import type { ForecastResult } from '../run/forecast.js';
import { Panel } from './Panel.js';
import { profileFromInterfaceDepth } from '../model/profile.js';
import type { Footprint } from './footprint.js';
import { markersFrom, marksOf, trackValueRange } from './footprint.js';
import { SkillInset, type SkillCurve } from './SkillInset.js';
import type { DepartureBrief } from '../run/forecast.js';

/**
 * The horizon row (FR-013, FR-014, G-05).
 *
 * One panel per **declared** horizon, in horizon order, all visible at once. Not a slider and
 * not a grid: ADR-0003 records why, and gate G-05 checks in a running browser that what is
 * rendered is exactly what is declared -- no panel for a horizon that is not declared, and no
 * declared horizon without a panel.
 *
 * **Enlarging recomputes nothing.** The fields, the analysis and the scores are computed once
 * and held; enlargement is a class on an element. FR-014 says an act of display changes what
 * is shown and never what is computed, and the test asserts it by identity: the same
 * `Float64Array` object is in the panel before and after.
 */

export interface HorizonRowProps {
  readonly config: Configuration;
  readonly domain: Domain;
  readonly forecast: ForecastResult;
  readonly analysis: AnalysisRecord;
  readonly truth: TruthSource;
  readonly climatology: FieldContainer;
  /** Beat 008: the observation footprint, built once for the row and read by every panel. */
  readonly footprint: Footprint;
  /** FR-026: the frozen quay-side analysis, the baseline every panel is watched against. */
  readonly brief: DepartureBrief;
  /** Beat 009: the issue-time axis. The row is the lead-time axis; these two are all there is. */
  readonly issueInstantMs: number;
  readonly defaultIssueInstantMs: number;
  readonly pendingIssueInstantMs: number;
  readonly onPendingIssueInstantChange: (instantMs: number) => void;
  readonly onReissue: () => void;
  readonly reissuing: boolean;
  readonly onSelectCell: (cellIndex: number) => void;
}

/** "twelve hours earlier", in the words a reader would use rather than a signed number. */
function describeOffset(deltaMs: number): string {
  const hours = Math.round(Math.abs(deltaMs) / 3_600_000);
  const unit = hours === 1 ? 'hour' : 'hours';
  return `${String(hours)} ${unit} ${deltaMs < 0 ? 'earlier' : 'later'} than the recorded case`;
}

export function HorizonRow(props: HorizonRowProps) {
  const { config, domain, forecast, analysis, truth, climatology } = props;
  const horizons = useMemo(
    () => [...config.horizons.leadHours].sort((a, b) => a - b),
    [config.horizons.leadHours],
  );

  const [enlarged, setEnlarged] = useState<number | null>(null);
  const [showAttribution, setShowAttribution] = useState(false);
  const [scores, setScores] = useState<ReadonlyMap<number, Score | null> | null>(null);
  const [briefScores, setBriefScores] = useState<ReadonlyMap<number, Score | null> | null>(null);
  const [scoringFailure, setScoringFailure] = useState<string | null>(null);
  /** One entry per issue instant somebody has scored. See `scoreAll`. */
  const [curves, setCurves] = useState<readonly SkillCurve[]>([]);

  /**
   * Each panel's field as an **anomaly** about its own regional mean.
   *
   * This is display, not computation: the harness reads published fields and may present
   * them, and presenting them this way is not a choice but a requirement of agreeing with the
   * figures underneath. Scoring compares anomalies, because a reduced-gravity model determines
   * departures from a mean and not the mean itself; a row that drew the raw field beside a
   * score computed on anomalies would be a picture and a number describing different things.
   *
   * Drawn raw, at a limit that shows any structure at all, the panels were a uniform red.
   */
  const anomalies = useMemo(() => {
    const out = new Map<number, Float64Array>();
    for (const leadHours of horizons) {
      const field = forecast.byHorizon.get(leadHours)?.field;
      if (field === undefined || field === null) continue;
      let n = 0;
      let mean = 0;
      for (let i = 0; i < field.length; i += 1) {
        const value = field[i] as number;
        if (!Number.isFinite(value)) continue;
        n += 1;
        mean += (value - mean) / n;
      }
      const anomaly = new Float64Array(field.length);
      for (let i = 0; i < field.length; i += 1) anomaly[i] = (field[i] as number) - mean;
      out.set(leadHours, anomaly);
    }
    return out;
  }, [forecast, horizons]);

  /**
   * Which cells the observations lead in. This is read from the analysis's own attribution
   * and from nowhere else (Principle IV, G-06): the harness may not compute an
   * attribution-like field, and this is a threshold on the one it was given, not a second one.
   */
  const observationsDominant = useMemo(() => {
    const flags = new Float64Array(analysis.attribution.observationWeight.length);
    for (let i = 0; i < flags.length; i += 1) {
      const w = weightsAt(analysis.attribution, i);
      flags[i] = w.observations >= w.background && w.observations >= w.climatology ? 1 : 0;
    }
    return flags;
  }, [analysis]);

  const scoreAll = useCallback(() => {
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
          score({ ...common, forecast: props.brief.field, initial: props.brief.field }),
        );
      }
      setScores(next);
      setBriefScores(briefNext);
      setCurves((current) => {
        const points = horizons.map((leadHours) => ({
          leadHours,
          skill: next.get(leadHours)?.skillAgainstPersistence?.value ?? null,
        }));
        // The inset draws the curves that have actually been computed, labelled by issue
        // instant. It never draws a curve for an issue time nobody has scored.
        return [
          ...current.filter((curve) => curve.issueInstantMs !== forecast.issueInstantMs),
          { issueInstantMs: forecast.issueInstantMs, points },
        ].sort((a, b) => a.issueInstantMs - b.issueInstantMs);
      });
      setScoringFailure(null);
    } catch (error) {
      // The spec's second edge case: a horizon whose valid instant is outside the record.
      // The panel still renders its forecast; the score says there is no truth there.
      setScores(next);
      setScoringFailure(
        error instanceof ScoringRefusal ? error.message : String(error),
      );
    }
  }, [config, domain, forecast, truth, climatology, horizons, props.brief]);

  useEffect(() => {
    setScores(null);
    setBriefScores(null);
    setEnlarged(null);
  }, [forecast]);

  const issued = new Date(forecast.issueInstantMs).toISOString();
  const runStartMs = Date.parse(config.truth.period.start);
  const earliestMs = runStartMs + config.forecast.issueTimeControl.earliestOffsetHours * 3_600_000;
  const latestMs = runStartMs + config.forecast.issueTimeControl.latestOffsetHours * 3_600_000;
  const observationInstants = [
    ...new Set(marksOf(props.footprint).map((mark) => mark.instantMs)),
  ]
    .filter((instantMs) => instantMs >= earliestMs && instantMs <= latestMs)
    .sort((a, b) => a - b);

  // One producer of marks for the whole row (FR-001, FR-009). A mark cannot mean one thing on
  // one panel and something else on another, because there is one list.
  const markers = useMemo(() => markersFrom(props.footprint), [props.footprint]);
  const trackRange = trackValueRange(props.footprint);

  /**
   * The model's diagnosed profile at a position, for *this* horizon's field (FR-005).
   *
   * The model produces it: the harness hands `profileFromInterfaceDepth` the published
   * interface depth at the cell and draws what comes back, kinds and all. A second copy of
   * the tanh in the surface would have been a profile the model never claimed.
   */
  const derivedProfileFor = useCallback(
    (leadHours: number) => (lonDeg: number, latDeg: number) => {
      const field = forecast.byHorizon.get(leadHours)?.field;
      if (field === undefined || field === null) return null;
      const { nx, ny } = forecast.parameters.grid;
      const { west, east, south, north } = forecast.box;
      const lonIndex = Math.min(nx - 1, Math.max(0, Math.floor(((lonDeg - west) / (east - west)) * nx)));
      const latIndex = Math.min(ny - 1, Math.max(0, Math.floor(((latDeg - south) / (north - south)) * ny)));
      const depth = field[latIndex * nx + lonIndex];
      if (depth === undefined || !Number.isFinite(depth)) return null;
      return profileFromInterfaceDepth(
        depth,
        lonIndex,
        latIndex,
        forecast.parameters.thermalStructure,
      );
    },
    [forecast],
  );

  /**
   * The declared geometry, handed to the stylesheet (Principle X). The row has to break out
   * of the page's prose column -- six legible panels do not fit in a measure set for reading
   * -- and how far it may break out is a declared number, not a stylesheet's opinion. The
   * schema refuses a configuration whose reference width cannot hold every declared horizon
   * at the declared minimum panel width, so a seventh horizon is caught at load rather than
   * in a screenshot.
   */
  const geometry = {
    '--row-reference-width': `${String(config.presentation.referenceViewportWidthPx)}px`,
    '--row-page-gutter': `${String(config.presentation.pageGutterPx)}px`,
    '--panel-minimum-width': `${String(config.presentation.minimumPanelWidthPx)}px`,
    '--panel-gap': `${String(config.presentation.panelGapPx)}px`,
  } as CSSProperties;

  return (
    <section data-testid="horizon-row-panel" className="row-section" style={geometry}>
      <h2>The row</h2>
      <p className="aside">
        One panel per declared horizon, in order, all visible at once. Not a slider: what is
        not on screen is what the eye forgets, and the whole point of the row is that a reader
        sees the decay rather than being told about it.
      </p>

      {/*
        The issue-time axis (FR-025, FR-002, and §11's open question).
        Exactly one control. Staleness and lead time are conflated everywhere, and only two
        controls can pull them apart: this one moves the instant the forecast was made, and
        the row itself is the lead time being asked of it. Moving this leaves every panel's
        valid instant exactly where it was and makes each of them a longer forecast of the
        same moment, which is why the whole curve drops bodily rather than shifting sideways.
      */}
      <div className="issue-control" data-testid="issue-control">
        <label htmlFor="issue-time">Issued</label>
        <input
          id="issue-time"
          type="range"
          data-testid="issue-time"
          min={earliestMs}
          max={latestMs}
          step={config.forecast.issueTimeControl.resolutionHours * 3_600_000}
          list="issue-observation-instants"
          value={props.pendingIssueInstantMs}
          onChange={(event) => { props.onPendingIssueInstantChange(Number(event.target.value)); }}
        />
        {/* The instants at which something was actually measured, marked on the axis, so a
            reader can see which moves change what the analysis had to work with. */}
        <datalist id="issue-observation-instants" data-testid="issue-observation-instants">
          {observationInstants.map((instantMs) => (
            <option key={instantMs} value={instantMs} />
          ))}
        </datalist>
        <span className="computed" data-testid="pending-issue-instant">
          {new Date(props.pendingIssueInstantMs).toISOString()}
        </span>
        <span data-testid="issue-offset">
          {props.pendingIssueInstantMs === props.defaultIssueInstantMs
            ? 'the recorded case'
            : `issued ${describeOffset(props.pendingIssueInstantMs - props.defaultIssueInstantMs)}`}
        </span>
        <button
          type="button"
          data-testid="reissue"
          onClick={props.onReissue}
          disabled={props.reissuing || props.pendingIssueInstantMs === props.issueInstantMs}
        >
          {props.reissuing ? 'Re-issuing…' : 'Re-issue'}
        </button>
      </div>

      {/* NFR-04: re-integrating takes seconds, so the row keeps the forecast it has and says
          which one that is, rather than freezing while it makes another. */}
      {props.pendingIssueInstantMs !== props.issueInstantMs && (
        <p className="banner warn" data-testid="issue-stale">
          Showing the forecast issued at{' '}
          <span className="computed">{new Date(props.issueInstantMs).toISOString()}</span>.
          Re-issue to see the one made at{' '}
          <span className="computed">{new Date(props.pendingIssueInstantMs).toISOString()}</span>.
        </p>
      )}

      <p className="aside" data-testid="issue-observations">
        The analysis at this issue instant saw{' '}
        <span className="computed" data-testid="observations-available">
          {forecast.observationsAvailable}
        </span>{' '}
        {forecast.observationsAvailable === 1 ? 'observation' : 'observations'};{' '}
        <span className="computed" data-testid="observations-withheld">
          {forecast.observationsWithheld}
        </span>{' '}
        had not happened yet.
        {forecast.observationsAvailable === 0 && ' No observations at this issue time: the analysis is the background and the climatology.'}
      </p>

      <div className="row-controls">
        <button type="button" onClick={scoreAll} data-testid="score-row" disabled={scores !== null}>
          {scores === null ? 'Score every horizon against truth' : 'Scored'}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowAttribution((current) => !current);
          }}
          data-testid="toggle-attribution"
          aria-pressed={showAttribution}
        >
          {showAttribution ? 'Show the forecast field' : 'Show where the answer came from'}
        </button>
      </div>

      {scoringFailure !== null && (
        <p className="banner warn" data-testid="row-scoring-refusal">
          {scoringFailure}
        </p>
      )}

      {/* What was measured, counted. The flagged count is on the surface because FR-24 says
          what was rejected is part of what the harness did, not a footnote in a log. */}
      <p className="aside" data-testid="footprint-summary">
        Drawn over every panel:{' '}
        <span className="computed" data-testid="footprint-track-count">
          {props.footprint.track.length}
        </span>{' '}
        surface measurements,{' '}
        <span className="computed" data-testid="footprint-drop-count">
          {props.footprint.needles.filter((needle) => needle.kind === 'drop').length}
        </span>{' '}
        XBT drops and{' '}
        <span className="computed" data-testid="footprint-external-count">
          {props.footprint.needles.filter((needle) => needle.kind === 'external').length}
        </span>{' '}
        Argo profiles, of which{' '}
        <span className="computed" data-testid="footprint-flagged-count">
          {marksOf(props.footprint).filter((mark) => mark.flagged).length}
        </span>{' '}
        carry a flag &mdash; drawn as flagged, never omitted.{' '}
        {props.footprint.qualityControlEnabled
          ? 'Quality control was on.'
          : 'Quality control was off for this run.'}
      </p>

      <div className="horizon-row" data-testid="horizon-row">
        {horizons.map((leadHours) => (
          <Panel
            key={leadHours}
            leadHours={leadHours}
            validInstant={new Date(
              forecast.byHorizon.get(leadHours)?.validInstantMs ??
                forecast.anchorInstantMs + leadHours * 3_600_000,
            ).toISOString()}
            initialisedFrom={issued}
            field={anomalies.get(leadHours) ?? null}
            nx={forecast.parameters.grid.nx}
            ny={forecast.parameters.grid.ny}
            limit={config.presentation.anomalyLimitMetres}
            observationWeight={analysis.attribution.observationWeight}
            observationsDominant={observationsDominant}
            hatchThreshold={config.presentation.attributionHatchThreshold}
            score={scores?.get(leadHours) ?? null}
            briefScore={briefScores?.get(leadHours) ?? null}
            refusal={forecast.byHorizon.get(leadHours)?.refusal ?? null}
            leadFromIssueHours={forecast.byHorizon.get(leadHours)?.leadFromIssueHours ?? leadHours}
            markers={markers}
            footprint={props.footprint}
            box={forecast.box}
            elevationHeightPx={config.presentation.footprint.elevationHeightPx}
            needleOffsetPx={config.presentation.footprint.needleOffsetPx}
            levelTickLimit={config.presentation.footprint.levelTickLimit}
            derivedProfileAt={derivedProfileFor(leadHours)}
            enlarged={enlarged === leadHours}
            showAttribution={showAttribution}
            onEnlarge={() => {
              setEnlarged((current) => (current === leadHours ? null : leadHours));
            }}
            onSelectCell={props.onSelectCell}
          />
        ))}
      </div>

      <SkillInset
        curves={curves}
        currentIssueInstantMs={forecast.issueInstantMs}
        widthPx={360}
        heightPx={140}
      />

      <p className="legend" data-testid="row-legend">
        {showAttribution ? (
          <>
            <span>
              <span className="dot ink" /> weight carried by <strong>observations</strong>, dark
              for more
            </span>
            <span>
              <span className="dot hatched" /> hatched where observations lead the{' '}
              <strong>background</strong> and the <strong>climatology</strong> &mdash; a second
              channel, so the field reads without colour
            </span>
            {/* The spec's third acceptance scenario for the breakdown expects attribution to
                differ between horizons. It cannot yet, and the surface says so rather than
                letting six identical fields imply six analyses. The recorded case runs one
                analysis, at the issue instant; beat 009 cycles at each issue time and this
                becomes one field per panel. */}
            <span data-testid="attribution-scope">
              the same field on every panel: this run analyses once, at{' '}
              <span className="computed">{issued}</span>. Attribution becomes per horizon when
              the forecast cycles.
            </span>
          </>
        ) : (
          <>
            <span>
              <span className="dot cool" /> shallower interface
            </span>
            <span>
              <span className="dot warm" /> deeper interface
            </span>
            <span>
              <span className="dot drop" /> XBT drop &mdash; the glyph&rsquo;s length is the
              depth it reached
            </span>
            <span>
              <span className="dot external" /> Argo (external)
            </span>
            <span data-testid="track-legend">
              <span className="dot track" /> surface measurement, dark for warm, over{' '}
              <span className="computed">{trackRange.low.toFixed(1)}</span> to{' '}
              <span className="computed">{trackRange.high.toFixed(1)} &deg;C</span> &mdash; the
              track&rsquo;s own range
            </span>
            <span data-testid="after-initialisation-legend">
              <span className="dot dashed" /> dashed: measured after the forecast was
              initialised, so it did not inform it
            </span>
          </>
        )}
      </p>
    </section>
  );
}
