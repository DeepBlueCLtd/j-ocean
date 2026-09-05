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
  readonly onSelectCell: (cellIndex: number) => void;
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
  const [scoringFailure, setScoringFailure] = useState<string | null>(null);

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
      const field = forecast.byHorizon.get(leadHours);
      if (field === undefined) continue;
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
    try {
      for (const leadHours of horizons) {
        const validInstantMs = forecast.issueInstantMs + leadHours * 3_600_000;
        next.set(
          leadHours,
          score({
            config,
            domain,
            truth,
            forecast: forecast.byHorizon.get(leadHours) as Float64Array,
            initial: forecast.initial,
            climatology: climatologyField,
            truthAtValidInstant: interfaceFieldFromTruth(
              truth,
              forecast.parameters.thermalStructure,
              forecast.box,
              forecast.parameters.grid,
              validInstantMs,
            ),
            region,
            fromInstantMs: forecast.issueInstantMs,
            validInstantMs,
            externalObservationIds: forecast.externalObservationIds,
          }),
        );
      }
      setScores(next);
      setScoringFailure(null);
    } catch (error) {
      // The spec's second edge case: a horizon whose valid instant is outside the record.
      // The panel still renders its forecast; the score says there is no truth there.
      setScores(next);
      setScoringFailure(
        error instanceof ScoringRefusal ? error.message : String(error),
      );
    }
  }, [config, domain, forecast, truth, climatology, horizons]);

  useEffect(() => {
    setScores(null);
    setEnlarged(null);
  }, [forecast]);

  const issued = new Date(forecast.issueInstantMs).toISOString();

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
      const field = forecast.byHorizon.get(leadHours);
      if (field === undefined) return null;
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
            validInstant={new Date(forecast.issueInstantMs + leadHours * 3_600_000).toISOString()}
            initialisedFrom={issued}
            field={anomalies.get(leadHours) as Float64Array}
            nx={forecast.parameters.grid.nx}
            ny={forecast.parameters.grid.ny}
            limit={config.presentation.anomalyLimitMetres}
            observationWeight={analysis.attribution.observationWeight}
            observationsDominant={observationsDominant}
            hatchThreshold={config.presentation.attributionHatchThreshold}
            score={scores?.get(leadHours) ?? null}
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
