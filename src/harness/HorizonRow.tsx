import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AnalysisRecord } from '../analysis/optimal-interpolation.js';
import { weightsAt } from '../analysis/attribution.js';
import type { Configuration, Domain } from '../config/schema.js';
import type { Score } from '../scoring/scorer.js';
import type { TruthSource } from '../ports/truth-source.js';
import type { FieldContainer } from '../truth/container.js';
import type { ForecastResult } from '../run/forecast.js';
import { Panel } from './Panel.js';
import { HorizonStrip, type StripSlot } from './HorizonStrip.js';
import { CentreLedger, resolveCentreContent, THE_ROW, type CentreContent } from './CentreContent.js';
import { profileFromInterfaceDepth } from '../model/profile.js';
import type { Footprint } from './footprint.js';
import { markersFrom, marksOf, trackValueRange } from './footprint.js';
import { Counterfactuals } from './Counterfactuals.js';
import { PanelHead } from './Help.js';
import { ObservationHover } from './ObservationHover.js';
import { scoreEveryHorizon } from './scoring-run.js';
import type { LongOperation } from './working.js';
import { SkillPane, type SkillCurve } from './SkillInset.js';
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
 * and held; enlarging chooses which of them the centre draws. FR-014 says an act of display
 * changes what is shown and never what is computed, and the assertion is by identity: the same
 * `Float64Array` object backs the panel before and after, and across a swap in the strip. The
 * array is left on the canvas that drew it so a browser test can compare `===` rather than
 * deep equality -- see `field-identity.ts`.
 *
 * **What the centre holds is a discriminated union.** `CentreContent` is the row, or exactly
 * one enlarged horizon, and it is the only thing that decides -- so the spec's *never both,
 * never neither* is a property of the type rather than a rule somebody has to remember. The
 * answer below the declared viewport floor (FR-043) is not a second arrangement: it is this
 * union forced to `enlarged`, so the strip, the marking, the keyboard behaviour and the
 * figures have one implementation at any viewport. Which panels are drawn is display; nothing
 * about it recomputes anything.
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
  /**
   * Release what is pinned, and empty the detail region.
   *
   * Separate from `onShowMark(null)`, which beat 017 found could not do it: a hover may not
   * take a pinned selection away -- that is the whole of pinning -- so the guard that protects
   * a pinned mark from the pointer leaving also swallowed the Release control's own click, and
   * the control had been inert since beat 008. Clearing a selection is its own act, and it
   * returns the address to its unselected form (spec 017 T032).
   */
  readonly onClearMark: () => void;
  readonly markPinned: boolean;
  /**
   * FR-043. Where the window has the width six legible panels need, the centre may hold the
   * row; where it has not, the centre is forced to an enlargement -- the same enlargement a
   * reader chooses at any width, not a presentation of its own. Nothing is recomputed either
   * way: the fields, the analysis and the scores are the same objects.
   */
  readonly roomForTheRow: boolean;
  /**
   * What the centre has been asked to hold (FR-049), and how to ask for something else.
   *
   * Beat 015 held this here. Beat 017 lifted it to the shell, because an enlargement is one of
   * the three things an address names (FR-056) and the shell is where the address is written:
   * a piece of state the address carries cannot live in a hook the address cannot see. Nothing
   * about the union or its resolution moved -- `resolveCentreContent` is still the only thing
   * that decides what the centre holds.
   */
  readonly requested: CentreContent;
  readonly onRequest: (next: CentreContent) => void;
  /**
   * How the row asks for something long to be run (NFR-04).
   *
   * Scoring six horizons against the truth record blocks the main thread for seconds, exactly
   * as an advance and a row build do, and until this prop it was the one of the three that
   * said nothing while it ran. The shell holds the notion -- `working.ts` -- so that the
   * busy cursor has one flag behind it rather than three that drift.
   */
  readonly beginLongOperation: (what: LongOperation, work: () => void) => void;
}

/**
 * What the row puts in each pane. Null where the row has not been built.
 *
 * Beat 013 had a `scores` slot, because the scores were a region of their own aligned to the
 * centre's tracks by CSS `subgrid`. Beat 018 puts each panel's figures **inside its own
 * panel**, which is what FR-046 asked for and is not achievable across independent panes -- so
 * the slot is gone and `skill` takes its place: the curve over lead time, which is about all
 * six panels and belongs to none of them.
 */
export interface HorizonRowSlots {
  readonly controls: ReactNode;
  readonly centre: ReactNode;
  /** The skill curve, beneath the row in the horizons pane. Null until something is scored. */
  readonly skill: ReactNode;
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

  /**
   * What the centre holds (FR-049). One union, and the only decider: an enlargement is a
   * selection like any other and changes nothing else on the surface. The request comes from
   * the shell, which is where a selection is written to the address (FR-056).
   */
  const requested = props.requested;
  const { content, undeclared } = resolveCentreContent(requested, horizons, !props.roomForTheRow);
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
    const brief = props.brief;
    props.beginLongOperation('scoring every horizon', () => {
      const run = scoreEveryHorizon({ config, domain, forecast, truth, climatology, brief });
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
    });
  }, [config, domain, forecast, truth, climatology, props.brief, props.beginLongOperation]);

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
    return { controls: null, centre: null, skill: null, detail: null };
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
        <PanelHead panel="controls/issue-time" />
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

        {/*
          Beat 018. This was a sentence -- "The analysis at this issue instant saw 2
          observations; 29 had not happened yet" -- which is a readout wearing a sentence's
          clothes, and it moved the reader's eye across a line of prose to find two numbers.
          It is now the two numbers with their labels. What the pair *means*, and why moving
          the issue time earlier is the clearest way to watch skill change, is this panel's own
          help (docs/narrative-disposition.json records the move).
        */}
        <dl className="readout" data-testid="issue-observations">
          <dt>Seen</dt>
          <dd>
            <span className="figure computed" data-testid="observations-available">
              {forecast.observationsAvailable}
            </span>
          </dd>
          <dt>Not yet</dt>
          <dd>
            <span className="figure computed" data-testid="observations-withheld">
              {forecast.observationsWithheld}
            </span>
          </dd>
        </dl>
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
        <PanelHead panel="controls/editing-what-was-measured" />
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
        <PanelHead panel="controls/row-display" />
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

      </div>

      {/* What was measured, counted. The flagged count is on the surface because FR-24 says
          what was rejected is part of what the harness did, not a footnote in a log. Beat 016
          gives it a head of its own: it is a consequence of the toggles above rather than one
          of them, and §7 owes the observation footprint a named explanation. */}
      <div className="control-group" data-testid="footprint-panel">
        <PanelHead panel="controls/observation-footprint" />
        {/*
          Beat 018. Five figures that had been joined into a sentence, drawn as five figures.
          FR-24's point -- that a flagged observation is drawn as flagged and never omitted --
          is a property of the surface rather than a caption on it, and the sentence saying so
          is now this panel's own help.
        */}
        <dl className="readout" data-testid="footprint-summary">
          <dt>Surface</dt>
          <dd>
            <span className="figure computed" data-testid="footprint-track-count">
              {footprint.track.length}
            </span>
          </dd>
          <dt>XBT drops</dt>
          <dd>
            <span className="figure computed" data-testid="footprint-drop-count">
              {footprint.needles.filter((needle) => needle.kind === 'drop').length}
            </span>
          </dd>
          <dt>Argo</dt>
          <dd>
            <span className="figure computed" data-testid="footprint-external-count">
              {footprint.needles.filter((needle) => needle.kind === 'external').length}
            </span>
          </dd>
          <dt>Flagged</dt>
          <dd>
            <span className="figure computed" data-testid="footprint-flagged-count">
              {marks.filter((mark) => mark.flagged).length}
            </span>
          </dd>
          <dt>Quality control</dt>
          <dd data-testid="footprint-quality-control">
            <span className="figure declared">
              {footprint.qualityControlEnabled ? 'on' : 'off'}
            </span>
          </dd>
        </dl>
      </div>
    </>
  );

  /**
   * One panel. A function rather than two copies of a thirty-property element, because the
   * row and the single-panel fallback have to draw the *same* panel from the same fields --
   * two lists of properties would be two panels that could quietly disagree.
   */
  const panelFor = (leadHours: number, isEnlarged: boolean, legend?: ReactNode): ReactNode => (
    <Panel
      key={leadHours}
      {...(legend === undefined ? {} : { legend })}
      /* FR-046, realised. The panel's skill figures are drawn inside the panel, beneath its
         own picture, so a score is read as one object with the thing it scores without two
         containers having to agree about geometry. Beat 013 aligned them with CSS `subgrid`
         across two regions; independent panes cannot share tracks, and should not have to. */
      score={scores?.get(leadHours) ?? null}
      briefScore={briefScores?.get(leadHours) ?? null}
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
        props.onRequest(
          requested.kind === 'enlarged' && requested.leadHours === leadHours
            ? THE_ROW
            : { kind: 'enlarged', leadHours },
        );
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
   * FR-049's strip, built once and used at every viewport (spec 015 T020, T022).
   *
   * The slots carry the panels' own field objects, so a thumbnail is the same array drawn
   * small and never a reduction computed for the strip, and each carries the horizon's own
   * score. Below the declared floor this is the same component and the same slots: the
   * fallback selects an enlargement rather than laying out a presentation of its own.
   */
  const stripSlots: readonly StripSlot[] = horizons.map((leadHours) => ({
    leadHours,
    field: showDifference
      ? (differences.get(leadHours) ?? null)
      : (anomalies.get(leadHours) ?? null),
    refusal: forecast.byHorizon.get(leadHours)?.refusal ?? null,
    score: scores?.get(leadHours) ?? null,
  }));

  /*
   * What the drawing means. In the row it is one legend for six panels and it says what the
   * row is *not* showing: FR-051 puts the attribution layer and the marks at their own depths
   * in the enlarged panel, and a row that drew a depth-coded glyph without saying so would be
   * claiming the fidelity it has not got. Enlarged, the same legend belongs to the one panel.
   */
  const legendContent = showAttribution ? (
    <>
      <span>
        <span className="dot ink" /> weight carried by <strong>observations</strong>, dark
        for more
      </span>
      <span>
        <span className="dot hatched" /> hatched where observations lead the{' '}
        <strong>background</strong> and <strong>climatology</strong>
      </span>
      {/* The spec's third acceptance scenario for the breakdown expects attribution to
          differ between horizons. It cannot yet, and the surface says so rather than
          letting six identical fields imply six analyses.

          Beat 018, FR-007: what is left here is the **label** -- what a reader is looking
          at, in six words. Why it is the same field, and what would change it, is the
          attribution panel's own help (`docs/narrative-disposition.json`,
          `attribution-scope`); it was a two-sentence explanation in the legend, which is a
          legend explaining rather than labelling. */}
      <span data-testid="attribution-scope">the same field on every panel</span>
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
        <span className="dot drop" /> XBT drop &mdash; length is the depth reached
      </span>
      <span>
        <span className="dot external" /> Argo (external)
      </span>
      <span data-testid="track-legend">
        <span className="dot track" /> surface measurement, dark for warm:{' '}
        <span className="computed">{trackRange.low.toFixed(1)}</span> to{' '}
        <span className="computed">{trackRange.high.toFixed(1)} &deg;C</span>
      </span>
      <span data-testid="after-initialisation-legend">
        <span className="dot dashed" /> dashed: measured after the forecast was initialised
      </span>
    </>
  );

  const centre = (
    <>
      <CentreLedger content={content} />

      {/* G-05 and the spec's third edge case: a configuration that no longer declares the
          enlarged horizon gets the row back and is told which horizon went, rather than a
          panel drawn for a horizon nothing declares. */}
      {undeclared !== null && (
        <p className="banner warn full" data-testid="undeclared-horizon">
          The enlarged panel was <span className="declared">+{undeclared} h</span>, which this
          configuration no longer declares. The row is back; nothing was drawn for it.
        </p>
      )}

      {content.kind === 'enlarged' ? (
        <div className="enlarged-centre" data-testid="enlarged-centre">
          <HorizonStrip
            slots={stripSlots}
            enlargedLeadHours={content.leadHours}
            onSelect={(leadHours) => { props.onRequest({ kind: 'enlarged', leadHours }); }}
            nx={forecast.parameters.grid.nx}
            ny={forecast.parameters.grid.ny}
            limit={
              showDifference
                ? config.counterfactual.differenceLimitMetres
                : config.presentation.anomalyLimitMetres
            }
            scoringRefusal={scoringFailure}
          />
          {panelFor(
            content.leadHours,
            true,
            <p className="legend" data-testid="panel-legend">
              {legendContent}
            </p>,
          )}
        </div>
      ) : (
        <>
          <div className="horizon-row" data-testid="horizon-row">
            {horizons.map((leadHours) => panelFor(leadHours, false))}
          </div>

          <p className="legend full" data-testid="row-legend">
            {legendContent}
            {/* FR-051 requires the row to state that it is showing the field alone, and spec
                018 FR-007 requires the surface to carry no explanation. Both hold, because
                they ask for different things: this is the **label** FR-051 asks for, in eight
                words, and the account of what the enlarged panel adds and why the row cannot
                draw it is `centre/horizon-row`'s own help
                (`docs/narrative-disposition.json`, `row-fidelity`). */}
            <span data-testid="row-fidelity">
              field only &mdash; depths in the enlarged panel
            </span>
          </p>
        </>
      )}
    </>
  );

  /*
   * The skill curve, beneath the row (FR-046's aid rather than its requirement).
   *
   * Beat 013 put this behind a disclosure and said why: drawn open across the scores region it
   * was 360 by 140 in a band of paper six panels wide, and stretched to those tracks it would
   * have been six hundred pixels tall. Both of those were consequences of the region it was
   * in. In the horizons pane it has the width of the row and the height the row does not use,
   * which is the room the fixed grid was leaving empty -- so it is drawn, not disclosed.
   *
   * It draws only the curves somebody has actually scored, labelled by issue instant. It never
   * draws a curve for an issue time nobody has asked about.
   */
  const skillSlot =
    curves.length === 0 ? null : (
      <div className="skill-curve" data-testid="skill-curve">
        <PanelHead panel="horizons/skill-curve" />
        <SkillPane curves={curves} currentIssueInstantMs={forecast.issueInstantMs} />
      </div>
    );

  const detail =
    shown === null || props.shownMark === null ? null : (
      <ObservationHover
        mark={shown}
        pinned={props.markPinned}
        onUnpin={props.onClearMark}
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

  return { controls, centre, skill: skillSlot, detail };
}
