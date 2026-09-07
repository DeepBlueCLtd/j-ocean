import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AnalysisRecord } from '../analysis/optimal-interpolation.js';
import { weightsAt } from '../analysis/attribution.js';
import type { Configuration, Domain } from '../config/schema.js';
import type { Score } from '../scoring/scorer.js';
import type { TruthSource } from '../ports/truth-source.js';
import type { FieldContainer } from '../truth/container.js';
import type { ForecastResult } from '../run/forecast.js';
import { Panel, PanelScore } from './Panel.js';
import { profileFromInterfaceDepth } from '../model/profile.js';
import type { Footprint } from './footprint.js';
import { markersFrom, marksOf, trackValueRange } from './footprint.js';
import { Counterfactuals } from './Counterfactuals.js';
import { ObservationHover } from './ObservationHover.js';
import { scoreEveryHorizon } from './scoring-run.js';
import { SkillInset, type SkillCurve } from './SkillInset.js';
import type { Edit } from '../instruments/edits.js';
import type { DepartureBrief } from '../run/forecast.js';

/**
 * The horizon row (FR-013, FR-014, G-05), now divided between three of the four regions.
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
 *
 * **Two presentations, one set of panels.** `presentation` chooses between the row and the
 * single-panel fallback FR-043 gives below the declared viewport floor: the strip of FR-049
 * and one panel enlarged beneath it. Both draw panels through one `panelFor`, from the same
 * fields and the same scores, so the fallback cannot quietly become a different picture.
 * Which panels are drawn is display; nothing about it recomputes anything.
 *
 * **Why this is a hook and not a component.** Beat 013 divides the surface by what changes
 * when, and the row's parts belong to three different regions: the controls that drive it are
 * causes and go left (FR-044), the panels are the payload and hold the centre alone (FR-045),
 * the skill figures are consequences and go beneath their own panels (FR-046), and what a mark
 * says is the thing being inspected and goes right (FR-047). A component returns one tree, so
 * this returns four. Nothing about the arithmetic moved: `useHorizonRow` is the body of the
 * old component with its `return` split four ways.
 */

export interface HorizonRowInputs {
  /** Null until the configuration has validated: nothing is computed before it has. */
  readonly config: Configuration | null;
  readonly domain: Domain | null;
  /** Null until a reader asks for the row: building it integrates four days (NFR-04). */
  readonly forecast: ForecastResult | null;
  readonly analysis: AnalysisRecord | null;
  readonly truth: TruthSource | null;
  readonly climatology: FieldContainer | null;
  /** Beat 008: the observation footprint, built once for the row and read by every panel. */
  readonly footprint: Footprint | null;
  /** FR-026: the frozen quay-side analysis, the baseline every panel is watched against. */
  readonly brief: DepartureBrief | null;
  /** Beat 009: the issue-time axis. The row is the lead-time axis; these two are all there is. */
  readonly issueInstantMs: number;
  readonly defaultIssueInstantMs: number;
  readonly pendingIssueInstantMs: number;
  readonly onPendingIssueInstantChange: (instantMs: number) => void;
  readonly onReissue: () => void;
  readonly reissuing: boolean;
  /** Beat 010: the reader's edits, the run without them, and how to change them. */
  readonly edits: readonly Edit[];
  readonly baseline: ForecastResult | null;
  readonly onApplyEdits: (edits: readonly Edit[]) => void;
  readonly onSelectCell: (cellIndex: number) => void;
  /** FR-047: which mark the detail region is showing, held by the shell so a cell can take it. */
  readonly shownMark: { readonly id: string; readonly leadHours: number } | null;
  readonly onShowMark: (mark: { readonly id: string; readonly leadHours: number } | null) => void;
  readonly onPinMark: (mark: { readonly id: string; readonly leadHours: number }) => void;
  readonly markPinned: boolean;
  /**
   * FR-043 and FR-049. `'row'` is every declared horizon side by side, which is the design
   * (ADR-0003). `'single-panel'` is the answer below the declared viewport floor: the strip
   * of FR-049 and one panel enlarged beneath it, because six panels shrunk to fit a small
   * window are six panels nobody can read. Nothing is recomputed either way -- the fields,
   * the analysis and the scores are the same objects, and which of them is drawn is display.
   */
  readonly presentation?: 'row' | 'single-panel';
}

/** What the row puts in each region. Null where the row has not been built. */
export interface HorizonRowSlots {
  readonly controls: ReactNode;
  readonly centre: ReactNode;
  readonly scores: ReactNode;
  readonly detail: ReactNode;
}

/** "twelve hours earlier", in the words a reader would use rather than a signed number. */
function describeOffset(deltaMs: number): string {
  const hours = Math.round(Math.abs(deltaMs) / 3_600_000);
  const unit = hours === 1 ? 'hour' : 'hours';
  return `${String(hours)} ${unit} ${deltaMs < 0 ? 'earlier' : 'later'} than the recorded case`;
}

const EMPTY_FIELDS: ReadonlyMap<number, Float64Array> = new Map();

export function useHorizonRow(props: HorizonRowInputs): HorizonRowSlots {
  const { config, domain, forecast, analysis, truth, climatology } = props;
  const horizons = useMemo(
    () => (config === null ? [] : [...config.horizons.leadHours].sort((a, b) => a - b)),
    [config],
  );

  const [enlarged, setEnlarged] = useState<number | null>(null);
  /** FR-043's fallback: one panel where six will not fit, and which one that is. */
  const singlePanel = props.presentation === 'single-panel';
  const shownHorizon = singlePanel ? (enlarged ?? horizons[0] ?? null) : null;
  const [showAttribution, setShowAttribution] = useState(false);
  const [showDifference, setShowDifference] = useState(false);
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
    if (forecast === null) return EMPTY_FIELDS;
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
   * Edited minus recorded, per horizon (FR-005 of this beat, FR-029).
   *
   * Both fields come from runs at the same issue instant, so what the difference shows is the
   * edit and nothing else. With no edits the two runs are the same object and every
   * difference is exactly zero, which is worth being able to see.
   */
  const differences = useMemo(() => {
    if (forecast === null || props.baseline === null) return EMPTY_FIELDS;
    const out = new Map<number, Float64Array>();
    for (const leadHours of horizons) {
      const edited = forecast.byHorizon.get(leadHours)?.field;
      const before = props.baseline.byHorizon.get(leadHours)?.field;
      if (edited == null || before == null) continue;
      const difference = new Float64Array(edited.length);
      for (let i = 0; i < edited.length; i += 1) {
        difference[i] = (edited[i] as number) - (before[i] as number);
      }
      out.set(leadHours, difference);
    }
    return out;
  }, [forecast, props.baseline, horizons]);

  /** The magnitude of that difference, which is what the outline is a threshold on. */
  const differenceMagnitudes = useMemo(() => {
    const out = new Map<number, Float64Array>();
    for (const [leadHours, difference] of differences) {
      const magnitude = new Float64Array(difference.length);
      for (let i = 0; i < difference.length; i += 1) magnitude[i] = Math.abs(difference[i] as number);
      out.set(leadHours, magnitude);
    }
    return out;
  }, [differences]);

  /**
   * Which cells the observations lead in. This is read from the analysis's own attribution
   * and from nowhere else (Principle IV, G-06): the harness may not compute an
   * attribution-like field, and this is a threshold on the one it was given, not a second one.
   */
  const observationsDominant = useMemo(() => {
    if (analysis === null) return new Float64Array(0);
    const flags = new Float64Array(analysis.attribution.observationWeight.length);
    for (let i = 0; i < flags.length; i += 1) {
      const w = weightsAt(analysis.attribution, i);
      flags[i] = w.observations >= w.background && w.observations >= w.climatology ? 1 : 0;
    }
    return flags;
  }, [analysis]);

  /**
   * Score every panel (FR-005, FR-026).
   *
   * The arithmetic is `scoreEveryHorizon` in `scoring-run.ts` and no longer lives here: the
   * gate that holds this beat digests the row's scores, and until T020 it digested a copy of
   * this callback rather than the callback (plan 013, "What the record cannot hold"). What is
   * left here is the state-setting, which is the part that belongs to a component.
   */
  const scoreAll = useCallback(() => {
    if (config === null || domain === null || forecast === null) return;
    if (truth === null || climatology === null || props.brief === null) return;
    const run = scoreEveryHorizon({ config, domain, forecast, truth, climatology, brief: props.brief });
    if (run.refusal !== null) {
      setScores(run.scores);
      setScoringFailure(run.refusal);
      return;
    }
    setScores(run.scores);
    setBriefScores(run.briefScores);
    setCurves((current) =>
      // The inset draws the curves that have actually been computed, labelled by issue
      // instant. It never draws a curve for an issue time nobody has scored.
      [
        ...current.filter((curve) => curve.issueInstantMs !== run.issueInstantMs),
        { issueInstantMs: run.issueInstantMs, points: run.points },
      ].sort((a, b) => a.issueInstantMs - b.issueInstantMs),
    );
    setScoringFailure(null);
  }, [config, domain, forecast, truth, climatology, props.brief]);

  useEffect(() => {
    // The scores belong to the forecast that has just been replaced, so they go. The
    // *enlargement* does not: it is display state, and a recomputation collapsing the panel a
    // reader was looking at is the converse of the mistake FR-014 forbids.
    setScores(null);
    setBriefScores(null);
  }, [forecast]);

  const runStartMs = config === null ? 0 : Date.parse(config.truth.period.start);
  const earliestMs =
    config === null ? 0 : runStartMs + config.forecast.issueTimeControl.earliestOffsetHours * 3_600_000;
  const latestMs =
    config === null ? 0 : runStartMs + config.forecast.issueTimeControl.latestOffsetHours * 3_600_000;
  // One list of marks for this row (T021). The footprint is now a stable prop, so this holds
  // between renders instead of being rebuilt beside every reader of it.
  const marks = useMemo(
    () => (props.footprint === null ? [] : marksOf(props.footprint)),
    [props.footprint],
  );
  const observationInstants = [...new Set(marks.map((mark) => mark.instantMs))]
    .filter((instantMs) => instantMs >= earliestMs && instantMs <= latestMs)
    .sort((a, b) => a - b);

  // One producer of marks for the whole row (FR-001, FR-009). A mark cannot mean one thing on
  // one panel and something else on another, because there is one list.
  const markers = useMemo(
    () => (props.footprint === null ? [] : markersFrom(props.footprint)),
    [props.footprint],
  );

  /**
   * Redrawing the track (FR-008, FR-033).
   *
   * The waypoints are drawn on the enlarged panel and dragged there; the edit is applied on
   * release. What the reader is asking is "would that have been a better place to have
   * sailed", and the answer is the same instruments sampling truth at the new positions --
   * not a different instrument, and not the same measurements moved.
   */
  const [redrawTrack, setRedrawTrack] = useState(false);
  const declaredWaypoints = config?.instruments.track.waypoints ?? [];
  const trackEdit = props.edits.find(
    (edit): edit is Extract<Edit, { kind: 'track' }> => edit.kind === 'track',
  );
  const [draftWaypoints, setDraftWaypoints] = useState<readonly {
    lonDeg: number;
    latDeg: number;
    offsetHours: number;
  }[] | null>(null);
  const currentWaypoints = draftWaypoints ?? trackEdit?.waypoints ?? declaredWaypoints;

  const waypointsOnGrid =
    forecast === null
      ? []
      : currentWaypoints.map((waypoint) => ({
          x:
            ((waypoint.lonDeg - forecast.box.west) / (forecast.box.east - forecast.box.west)) *
            forecast.parameters.grid.nx,
          y:
            ((waypoint.latDeg - forecast.box.south) / (forecast.box.north - forecast.box.south)) *
            forecast.parameters.grid.ny,
        }));

  const dragWaypoint = useCallback(
    (index: number, x: number, y: number) => {
      if (forecast === null) return;
      setDraftWaypoints(
        currentWaypoints.map((waypoint, i) =>
          i === index
            ? {
                ...waypoint,
                lonDeg:
                  forecast.box.west +
                  (x / forecast.parameters.grid.nx) * (forecast.box.east - forecast.box.west),
                latDeg:
                  forecast.box.south +
                  (y / forecast.parameters.grid.ny) * (forecast.box.north - forecast.box.south),
              }
            : waypoint,
        ),
      );
    },
    [currentWaypoints, forecast],
  );

  const dropWaypoint = useCallback(() => {
    if (draftWaypoints === null) return;
    props.onApplyEdits([
      ...props.edits.filter((edit) => edit.kind !== 'track'),
      { kind: 'track', waypoints: draftWaypoints },
    ]);
    setDraftWaypoints(null);
  }, [draftWaypoints, props]);

  /**
   * A mark's own counterfactuals (FR-006, FR-003).
   *
   * The withhold applies to the *interface* observation, which is what the analysis consumes;
   * the profile edit applies to the profile, which is what the operator reads.
   */
  const counterfactualFor = useCallback(
    (markId: string) => {
      if (forecast === null) return null;
      const interfaceId = `${markId}/interface`;
      const withheld = props.edits.some(
        (edit) => edit.kind === 'withhold' && (edit.observationId === interfaceId || edit.observationId === markId),
      );
      const existing = props.edits.find(
        (edit): edit is Extract<Edit, { kind: 'profile' }> =>
          edit.kind === 'profile' && edit.observationId === markId,
      );
      const without = (kind: Edit['kind']) =>
        props.edits.filter(
          (edit) =>
            !(
              edit.kind === kind &&
              ((kind === 'withhold' && 'observationId' in edit && (edit.observationId === interfaceId || edit.observationId === markId)) ||
                (kind === 'profile' && 'observationId' in edit && edit.observationId === markId))
            ),
        );
      return {
        withheld,
        edited: existing !== undefined,
        ghost:
          forecast.ghosts
            .get(markId)
            ?.map((level) => ({ depthMetres: level.depthMetres, value: level.value })) ?? null,
        onWithhold: (next: boolean) => {
          props.onApplyEdits(
            next
              ? [...without('withhold'), { kind: 'withhold', observationId: interfaceId }]
              : without('withhold'),
          );
        },
        onEditProfile: (levels: readonly { depthMetres: number; value: number }[] | null) => {
          props.onApplyEdits(
            levels === null
              ? without('profile')
              : [...without('profile'), { kind: 'profile', observationId: markId, levels }],
          );
        },
      };
    },
    [props, forecast],
  );

  /**
   * The model's diagnosed profile at a position, for *this* horizon's field (FR-005).
   *
   * The model produces it: the harness hands `profileFromInterfaceDepth` the published
   * interface depth at the cell and draws what comes back, kinds and all. A second copy of
   * the tanh in the surface would have been a profile the model never claimed.
   */
  const derivedProfileFor = useCallback(
    (leadHours: number) => (lonDeg: number, latDeg: number) => {
      if (forecast === null) return null;
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

  if (config === null || forecast === null || analysis === null || props.footprint === null) {
    return { controls: null, centre: null, scores: null, detail: null };
  }

  const footprint = props.footprint;
  const issued = new Date(forecast.issueInstantMs).toISOString();
  const trackRange = trackValueRange(footprint);
  const shown = props.shownMark === null ? null : marks.find((mark) => mark.id === props.shownMark?.id) ?? null;

  /*
   * The issue-time axis (FR-025, FR-002, and §11's open question).
   * Exactly one control. Staleness and lead time are conflated everywhere, and only two
   * controls can pull them apart: this one moves the instant the forecast was made, and
   * the row itself is the lead time being asked of it. Moving this leaves every panel's
   * valid instant exactly where it was and makes each of them a longer forecast of the
   * same moment, which is why the whole curve drops bodily rather than shifting sideways.
   */
  const controls = (
    <>
      <div className="control-group">
        <h3>Issue time</h3>
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
      </div>

      {/* FR-031, FR-032 and FR-034: what the reader did, the way back, and the two
          instruments a reader can break. Every one of them drives all six panels, so they are
          causes and belong in this column (FR-044). */}
      <Counterfactuals
        edits={props.edits}
        instrumentIds={[config.instruments.surface.id, config.instruments.xbt.id]}
        qualityControlDefault={config.instruments.qualityControl.enabled}
        busy={props.reissuing}
        onApply={props.onApplyEdits}
      />

      <div className="control-group">
        <h3>Editing what was measured</h3>
        <div className="row-controls">
          <button
            type="button"
            data-testid="toggle-redraw-track"
            aria-pressed={redrawTrack}
            onClick={() => { setRedrawTrack((current) => !current); }}
          >
            {redrawTrack ? 'Stop redrawing the track' : 'Redraw the track'}
          </button>
        </div>
        {/* FR-028's editor has no button of its own, and should not: it edits one measurement,
            so FR-004 puts it at that measurement. How a reader reaches it was an explanation
            rather than a figure, and beat 014 sent it to this control's help entry, which beat
            016 builds (docs/narrative-disposition.json, help:controls/editing-what-was-measured). */}
        {forecast.trackStretch !== null && (
          <p className="banner warn" data-testid="track-stretch">
            {forecast.trackStretch.statement}
          </p>
        )}
      </div>

      {/* The row's own display toggles. They drive all six panels at once, so they are causes
          rather than panel-local controls and FR-044 puts them here rather than at a panel. */}
      <div className="control-group">
        <h3>The row</h3>
        <div className="row-controls">
          <button type="button" onClick={scoreAll} data-testid="score-row" disabled={scores !== null}>
            {scores === null ? 'Score every horizon against truth' : 'Scored'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowDifference((current) => !current);
              setShowAttribution(false);
            }}
            data-testid="toggle-difference"
            aria-pressed={showDifference}
            disabled={props.edits.length === 0}
            title={
              props.edits.length === 0
                ? 'There is nothing to difference until something has been edited'
                : undefined
            }
          >
            {showDifference ? 'Show the forecast field' : 'Show what the edit changed'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAttribution((current) => !current);
              setShowDifference(false);
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
            {footprint.track.length}
          </span>{' '}
          surface measurements,{' '}
          <span className="computed" data-testid="footprint-drop-count">
            {footprint.needles.filter((needle) => needle.kind === 'drop').length}
          </span>{' '}
          XBT drops and{' '}
          <span className="computed" data-testid="footprint-external-count">
            {footprint.needles.filter((needle) => needle.kind === 'external').length}
          </span>{' '}
          Argo profiles, of which{' '}
          <span className="computed" data-testid="footprint-flagged-count">
            {marks.filter((mark) => mark.flagged).length}
          </span>{' '}
          carry a flag &mdash; drawn as flagged, never omitted.{' '}
          {footprint.qualityControlEnabled
            ? 'Quality control was on.'
            : 'Quality control was off for this run.'}
        </p>
      </div>
    </>
  );

  /**
   * One panel. A function rather than two copies of a thirty-property element, because the
   * row and the single-panel fallback have to draw the *same* panel from the same fields --
   * two lists of properties would be two panels that could quietly disagree.
   */
  const panelFor = (leadHours: number, isEnlarged: boolean): ReactNode => (
    <Panel
      key={leadHours}
      leadHours={leadHours}
      validInstant={new Date(
        forecast.byHorizon.get(leadHours)?.validInstantMs ??
          forecast.anchorInstantMs + leadHours * 3_600_000,
      ).toISOString()}
      initialisedFrom={issued}
      field={
        showDifference
          ? (differences.get(leadHours) ?? null)
          : (anomalies.get(leadHours) ?? null)
      }
      showDifference={showDifference}
      differenceOutlineMetres={config.counterfactual.differenceOutlineMetres}
      differenceMagnitude={differenceMagnitudes.get(leadHours) ?? null}
      waypoints={redrawTrack ? waypointsOnGrid : null}
      onDragWaypoint={dragWaypoint}
      onDropWaypoint={dropWaypoint}
      nx={forecast.parameters.grid.nx}
      ny={forecast.parameters.grid.ny}
      limit={
        showDifference
          ? config.counterfactual.differenceLimitMetres
          : config.presentation.anomalyLimitMetres
      }
      observationWeight={analysis.attribution.observationWeight}
      observationsDominant={observationsDominant}
      hatchThreshold={config.presentation.attributionHatchThreshold}
      refusal={forecast.byHorizon.get(leadHours)?.refusal ?? null}
      leadFromIssueHours={forecast.byHorizon.get(leadHours)?.leadFromIssueHours ?? leadHours}
      markers={markers}
      footprint={footprint}
      box={forecast.box}
      elevationHeightPx={config.presentation.footprint.elevationHeightPx}
      needleOffsetPx={config.presentation.footprint.needleOffsetPx}
      levelTickLimit={config.presentation.footprint.levelTickLimit}
      enlarged={isEnlarged}
      showAttribution={showAttribution}
      onEnlarge={() => {
        setEnlarged((current) => (current === leadHours ? null : leadHours));
      }}
      onSelectCell={props.onSelectCell}
      shownMarkId={props.shownMark?.id ?? null}
      onHoverMark={(id) => {
        props.onShowMark(id === null ? null : { id, leadHours });
      }}
      onSelectMark={(id) => { props.onPinMark({ id, leadHours }); }}
    />
  );

  /**
   * FR-049's strip, and FR-050's reason for it: comparison across horizons is the lesson, so
   * a presentation that shows one panel still shows the other five and what each was worth.
   * It scrolls within itself where the window is too narrow for six buttons, and says so.
   */
  const strip = (
    <div className="horizon-strip" data-testid="horizon-strip" data-scrolls="true">
      {horizons.map((leadHours) => {
        const score = scores?.get(leadHours) ?? null;
        return (
          <button
            key={leadHours}
            type="button"
            className={`strip-panel${leadHours === shownHorizon ? ' current' : ''}`}
            data-testid={`strip-${String(leadHours)}`}
            aria-pressed={leadHours === shownHorizon}
            onClick={() => { setEnlarged(leadHours); }}
          >
            <span className="figure declared" title="declared in configuration">
              +{leadHours} h
            </span>
            <span className="strip-score">
              {score === null ? (
                <span className="unmeasured">not scored</span>
              ) : score.skillAgainstPersistence === null ? (
                <span className="unmeasured">undefined</span>
              ) : (
                <>
                  <span className="figure computed" title="computed by the model">
                    {score.skillAgainstPersistence.value.toFixed(3)}
                  </span>{' '}
                  vs persistence
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );

  const centre = (
    <>
      {singlePanel ? (
        <div className="single-panel" data-testid="single-panel">
          {strip}
          {shownHorizon === null ? null : panelFor(shownHorizon, true)}
        </div>
      ) : (
        <div className="horizon-row" data-testid="horizon-row">
          {horizons.map((leadHours) => panelFor(leadHours, enlarged === leadHours))}
        </div>
      )}

      <p className="legend full" data-testid="row-legend">
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
    </>
  );

  const scoredHorizons = singlePanel
    ? shownHorizon === null
      ? []
      : [shownHorizon]
    : horizons;

  const scoresSlot = (
    <>
      {scoredHorizons.map((leadHours) => (
        <PanelScore
          key={leadHours}
          leadHours={leadHours}
          score={scores?.get(leadHours) ?? null}
          briefScore={briefScores?.get(leadHours) ?? null}
          refusal={forecast.byHorizon.get(leadHours)?.refusal ?? null}
        />
      ))}
      {/*
        The curve spans the same tracks as the figures above it, because it is about all of
        them and not about any one column -- but it is behind a disclosure, and that is a
        measured decision rather than a preference. Drawn open across the tracks it is 360 by
        140, and at the width six panels take it would either sit in a corner of a band of
        empty paper or, stretched to the tracks, be six hundred pixels tall. Either way it
        takes the height the figures need, and the figures are the requirement (FR-046) while
        the curve is an aid to reading them.
      */}
      <details className="full skill-disclosure" data-testid="skill-disclosure">
        <summary>Skill against persistence, by lead time</summary>
        <SkillInset
          curves={curves}
          currentIssueInstantMs={forecast.issueInstantMs}
          widthPx={360}
          heightPx={140}
        />
      </details>
    </>
  );

  const detail =
    shown === null || props.shownMark === null ? null : (
      <ObservationHover
        mark={shown}
        pinned={props.markPinned}
        onUnpin={() => { props.onShowMark(null); }}
        derived={
          shown.kind === 'track'
            ? null
            : derivedProfileFor(props.shownMark.leadHours)(shown.lonDeg, shown.latDeg)
        }
        qualityControlEnabled={footprint.qualityControlEnabled}
        {...(() => {
          const counterfactual = counterfactualFor(shown.id);
          return counterfactual === null ? {} : { counterfactual };
        })()}
      />
    );

  return { controls, centre, scores: scoresSlot, detail };
}
