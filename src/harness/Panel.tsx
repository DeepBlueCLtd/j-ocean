import type { ReactNode } from 'react';
import type { Score } from '../scoring/scorer.js';
import { PanelCorner, PanelHelp } from './Help.js';
import { FieldView, type Marker } from './FieldView.js';
import type { Footprint } from './footprint.js';
import { NeedleElevation } from './NeedleElevation.js';

/**
 * One horizon (FR-013, FR-014, FR-015, FR-016, FR-021, FR-022).
 *
 * A curve on a slide asserts that persistence decays; a row a reader can see all at once
 * demonstrates it. So the row is the design and the slider was rejected (ADR-0003): what is
 * not on screen is what the eye forgets.
 *
 * Every panel says four things without being asked. What instant it is **valid for** and what
 * instant it was **initialised from**, both as absolute instants and not only as a lead time,
 * because a lead time alone leaves a reader doing arithmetic to find out whether two panels
 * are comparable. What its skill is against **both** references, in the words the scorer
 * chose. And where its answer came from, as a field.
 *
 * Beat 015 gives the enlarged panel the whole centre and lays it out in two columns: the
 * field on the left at the height the centre has, and beside it the panel's labels, its depth
 * elevation and what the drawing means. That is what enlargement buys -- the attribution layer
 * and the observation marks at full fidelity (FR-051), the depth axis of beat 008 FR-003, and
 * the room to drag a waypoint -- rather than a bigger picture alone. Which of the six is
 * enlarged is a selection made in the strip above it and never a mode: see `HorizonStrip.tsx`.
 *
 * Beat 013 divided the panel between two regions: the picture and its labels in the centre,
 * the skill figures in a scores region beneath, aligned to the panel's column by CSS
 * `subgrid`. Beat 018 puts them back **inside the panel**, and that is a correction rather
 * than a compromise. FR-046 asks that a score be read *as one object with its picture*; a
 * score inside its panel is that, and it does not depend on two containers agreeing about
 * geometry -- which independent panes cannot do anyway. What a mark says is still not drawn
 * under the panel that drew it: it fills the selection pane (FR-047), so that reading a
 * profile never changes the shape of the surface.
 */

export interface PanelProps {
  readonly leadHours: number;
  readonly validInstant: string;
  readonly initialisedFrom: string;
  /** Absent where the panel is outside validity or before its issue instant (FR-005). */
  readonly field: Float64Array | null;
  readonly nx: number;
  readonly ny: number;
  readonly limit: number;
  /** The analysis's own weights. One field per panel, all from the same analysis. */
  readonly observationWeight: Float64Array;
  /** Where observations are the largest of the three: the hatch, and the second channel. */
  readonly observationsDominant: Float64Array;
  /** Declared: above this weight a cell is hatched rather than merely tinted (FR-019). */
  readonly hatchThreshold: number;
  /** Present exactly when there is no field. FR-027: said, never extrapolated. */
  readonly refusal: string | null;
  /** FR-005 of beat 010: the panel is showing edited minus recorded rather than a forecast. */
  readonly showDifference: boolean;
  /** A difference above this is outlined, so "where the edit went" is a region and not a hue. */
  readonly differenceOutlineMetres: number;
  readonly differenceMagnitude: Float64Array | null;
  /** FR-008: the track's waypoints, draggable in the enlarged panel and nowhere else. */
  readonly waypoints: readonly { readonly x: number; readonly y: number }[] | null;
  readonly onDragWaypoint: (index: number, x: number, y: number) => void;
  readonly onDropWaypoint: () => void;
  /** What was actually asked of the model: the valid instant less the issue instant. */
  readonly leadFromIssueHours: number;
  readonly markers: readonly Marker[];
  /** Beat 008: what the vessel measured, as marks. Read, never computed, by the panel. */
  readonly footprint: Footprint;
  readonly box: { readonly west: number; readonly east: number };
  readonly elevationHeightPx: number;
  readonly needleOffsetPx: number;
  readonly levelTickLimit: number;
  readonly enlarged: boolean;
  /**
   * This panel's own skill figures (FR-046), drawn beneath its own picture.
   *
   * Null before anything has been scored, which the panel says rather than leaving blank: a
   * blank space and "nobody has asked yet" are not the same fact (Principle VI).
   */
  readonly score: Score | null;
  /** FR-026: the frozen quay-side brief, scored at the same instant, as the baseline. */
  readonly briefScore: Score | null;
  /**
   * What the drawing means, drawn beside the enlarged panel's field and nowhere else. In the
   * row it is one legend for six panels, under the row; enlarged there is one panel, so it
   * belongs to it (FR-044: a thing that concerns one panel lives at that panel).
   */
  readonly legend?: ReactNode;
  readonly showAttribution: boolean;
  readonly onEnlarge: () => void;
  readonly onSelectCell: (cellIndex: number) => void;
  /** Which mark the detail region is showing, so this panel can draw it as the current one. */
  readonly shownMarkId: string | null;
  readonly onHoverMark: (id: string | null) => void;
  readonly onSelectMark: (id: string) => void;
}

/**
 * `2013-09-02T00:00:00.000Z` becomes a date over a time. Still an absolute instant, and the
 * full one is on the element's title -- a panel narrow enough for six to fit cannot carry an
 * ISO string on one line, and six panels all visible is the requirement (FR-013).
 */
function Instant({ value, testId }: { value: string; testId: string }) {
  return (
    <dd className="computed instant" data-testid={testId} title={value}>
      <span>{value.slice(0, 10)}</span>
      <span>{value.slice(11, 16)}Z</span>
    </dd>
  );
}

export function Panel(props: PanelProps) {
  const { leadHours, validInstant, initialisedFrom, enlarged, showAttribution } = props;

  return (
    <article
      className={`panel${enlarged ? ' enlarged' : ''}`}
      data-testid={`panel-${String(leadHours)}`}
      data-lead-hours={String(leadHours)}
    >
      {/* FR-052: the help control is at the panel's top right, beside the control that
          enlarges it, and it opens this panel's own explanation rather than a tour that begins
          three panels away. It follows the panel into the enlarged centre, because the panel is
          the same panel; choosing another horizon in the strip closes it, because that one is
          not (see Help.tsx). */}
      <header data-panel="centre/horizon-panel">
        <h3>
          <span className="declared" data-testid={`panel-lead-${String(leadHours)}`}>
            +{leadHours} h
          </span>
        </h3>
        <button
          type="button"
          className="enlarge"
          onClick={props.onEnlarge}
          data-testid={`enlarge-${String(leadHours)}`}
          aria-pressed={enlarged}
        >
          {enlarged ? 'Shrink' : 'Enlarge'}
        </button>
        <PanelHelp panel="centre/horizon-panel" instance={String(leadHours)} />
      </header>

      {/* Enlarged, the field and everything that describes it are two columns of one body;
          in the row the panel is one column and this wrapper is the whole of it. */}
      <div className={enlarged ? 'enlarged-body' : 'panel-body'}>
        <div className={enlarged ? 'enlarged-field' : undefined}>
          {/*
            FR-027. A panel outside its forecast's validity, or before it was issued, draws
            nothing and says why. There is no field to give it that would not be an
            extrapolation, and an extrapolation drawn beside five forecasts would read as one.
          */}
          {props.refusal !== null ? (
            <p className="banner warn" data-testid={`panel-refusal-${String(leadHours)}`}>
              {props.refusal}
            </p>
          ) : (
          <FieldView
            values={showAttribution ? props.observationWeight : (props.field as Float64Array)}
            {...(props.showDifference && !showAttribution && props.differenceMagnitude !== null
              ? {
                  // FR-029's second channel. The region where the edit moved the field by more
                  // than the declared magnitude is outlined, so a reader sees an extent rather
                  // than a colour -- and sees it without colour at all.
                  hatch: props.differenceMagnitude as Float64Array,
                  hatchThreshold: props.differenceOutlineMetres,
                  hatchLabel: `moved by more than ${String(props.differenceOutlineMetres)} m`,
                }
              : {})}
            nx={props.nx}
            ny={props.ny}
            limit={showAttribution ? 1 : props.limit}
            palette={showAttribution ? 'sequential' : 'diverging'}
            unit={showAttribution ? '' : 'm'}
            {...(showAttribution
              ? {
                  hatch: props.observationsDominant,
                  hatchThreshold: props.hatchThreshold,
                  hatchLabel: 'observations lead',
                }
              : {})}
            label={
              showAttribution
                ? `Weight carried by observations, valid ${validInstant}`
                : props.showDifference
                  ? `Edited minus recorded interface depth, valid ${validInstant}`
                  : `Interface depth anomaly, valid ${validInstant}`
            }
            testId={`panel-field-${String(leadHours)}`}
            markers={props.markers}
            onSelect={props.onSelectCell}
            onHoverMark={props.onHoverMark}
            {...(enlarged && props.waypoints !== null
              ? {
                  waypoints: props.waypoints,
                  onDragWaypoint: props.onDragWaypoint,
                  onDropWaypoint: props.onDropWaypoint,
                }
              : {})}
            caption={false}
          />
          )}

        </div>

        <div className={enlarged ? 'enlarged-aside' : undefined}>
          {/* FR-003: the depth axis exists only where there is room for it to be read. At row
              width a drop is a depth-coded glyph; enlarged, it is a needle at its own depths. */}
          {enlarged && (
            <NeedleElevation
              footprint={props.footprint}
              west={props.box.west}
              east={props.box.east}
              heightPx={props.elevationHeightPx}
              offsetPx={props.needleOffsetPx}
              levelTickLimit={props.levelTickLimit}
              hoveredId={props.shownMarkId}
              onHoverMark={props.onHoverMark}
              onSelectMark={props.onSelectMark}
            />
          )}

          {/* FR-007: a run with quality control off says so on every panel, not in a footnote. */}
          {!props.footprint.qualityControlEnabled && (
            <p className="banner warn" data-testid={`quality-control-off-${String(leadHours)}`}>
              Quality control was off for this run: no observation carries a check.
            </p>
          )}

          <dl className="panel-labels">
            {/* FR-015: absolute instants, not only a lead time. Shown to the minute, with the
                full instant one hover away, because a panel narrow enough for six to fit cannot
                carry a wrapped ISO string and stay readable. */}
            <dt>Valid at</dt>
            <Instant value={validInstant} testId={`panel-valid-${String(leadHours)}`} />
            <dt>Initialised</dt>
            <Instant value={initialisedFrom} testId={`panel-initialised-${String(leadHours)}`} />
            {/* Beat 009: the declared horizon names the panel and fixes the valid instant; this
                is what was actually asked of the model, and the two differ the moment issue time
                moves. Conflating them is the confusion the second axis exists to remove. */}
            <dt>Lead asked</dt>
            <dd className="computed" data-testid={`panel-actual-lead-${String(leadHours)}`}>
              +{props.leadFromIssueHours.toFixed(0)} h
            </dd>
          </dl>

          {enlarged && props.legend}
        </div>
      </div>

      {/* FR-046: beneath its own picture, in its own panel, and never in a table elsewhere. */}
      <PanelScore
        leadHours={leadHours}
        score={props.score}
        briefScore={props.briefScore}
        refusal={props.refusal}
      />
    </article>
  );
}

export interface PanelScoreProps {
  readonly leadHours: number;
  readonly score: Score | null;
  /** FR-026: the frozen quay-side brief, scored at the same instant, as the baseline. */
  readonly briefScore: Score | null;
  /** Present exactly when the panel above has no forecast to score. */
  readonly refusal: string | null;
}

/**
 * One panel's skill figures, inside that panel (FR-046).
 *
 * Not a table: a table asks a reader to match a row label against a panel heading at every
 * glance, and six figures read left to right draw the decay without a curve being plotted.
 *
 * **The scorer's own words are still here, and are one disclosure away.** FR-021 says a model
 * that is not earning its compute is told so in those words, and the surface does not get to
 * phrase it more kindly; Principle VI says a losing score has to be visible. Both hold, and
 * spec 018 FR-008 and US4 say where each of them holds:
 *
 *  - **the loss is visible as a figure.** `vs persistence` and `vs climatology` are the
 *    readout, and a negative one is printed as it computes -- there is no state of this panel
 *    in which a reader has to open anything to find out that the model lost.
 *  - **the scorer's statement is behind *Where this figure came from*,** first, verbatim and
 *    unsoftened. It was drawn above the figures until beat 018, which put a two-line sentence
 *    -- *better than persistence by 0.0 per cent; worse than climatology by 208.8 per cent* --
 *    over the very figures that say the same thing, and made a reader read a sentence to find
 *    two numbers already beneath it. That is the readout-written-as-prose the author's review
 *    named, and moving it changes nothing about what it says: the string is the scorer's, not
 *    this component's, and it is rendered whole.
 *
 * Fewer sentences on the surface; not less provenance, and not a softer verdict.
 */
export function PanelScore(props: PanelScoreProps) {
  const { leadHours, score } = props;
  const skill = (figure: { value: number } | null | undefined): string =>
    figure === null || figure === undefined ? 'undefined' : figure.value.toFixed(3);

  return (
    <div className="score-cell panel-score" data-testid={`panel-score-${String(leadHours)}`}>
      {/*
        The scores panel has no heading line of its own inside a horizon panel -- the panel's
        own head names the horizon -- so its help control is placed in the corner by the
        stylesheet rather than in the flow (FR-053, and G-08 holds the pairing).
        
        It carries the lead time as its **instance**, for the reason `centre/horizon-panel`
        does: six panels drawing one declaration are six panels, and a key they shared would
        mean pressing one control opened six cards over six panels.
      */}
      <PanelCorner panel="scores" instance={String(leadHours)} />
      {props.refusal !== null ? (
        <span className="unmeasured">no score: this panel has no forecast</span>
      ) : score === null ? (
        <span className="unmeasured">not scored yet</span>
      ) : (
        <>
          <dl className="panel-labels">
            {/* The readout, and where Principle VI is kept: a losing score is a negative
                figure in the panel, printed as it computes, with nothing to open first. */}
            <dt>vs persistence</dt>
            <dd className="computed" data-testid={`panel-skill-persistence-${String(leadHours)}`}>
              {skill(score.skillAgainstPersistence)}
            </dd>
            <dt>vs climatology</dt>
            <dd className="computed" data-testid={`panel-skill-climatology-${String(leadHours)}`}>
              {skill(score.skillAgainstClimatology)}
            </dd>
            {/* FR-026: the departure brief, the baseline everything else is watched
                against. Persistence from the quay side, never refreshed -- correct at
                issue and losing to the world on its own. */}
            <dt>brief error</dt>
            <dd className="computed" data-testid={`panel-brief-${String(leadHours)}`}>
              {props.briefScore === null
                ? '—'
                : `${props.briefScore.forecastError.value.toFixed(1)} m`}
            </dd>
            <dt>this forecast</dt>
            <dd className="computed">{score.forecastError.value.toFixed(1)} m</dd>
          </dl>
          <details className="provenance" data-testid={`panel-provenance-${String(leadHours)}`}>
            <summary>Where this figure came from</summary>
            {/* The scorer's own sentence, first and whole. Byte for byte what the scorer
                produced -- `score.statement` is not reassembled, reworded or truncated here --
                which is what FR-021 and Principle VI ask of the surface that prints it. */}
            <p className="statement">{score.statement}</p>
            <p>
              {score.provenance.metric}, over {score.provenance.regionLabel} (
              <span className="computed">{score.provenance.cellsScored.value}</span> cells),
              from <span className="computed">{score.provenance.fromInstant}</span> to{' '}
              <span className="computed">{score.provenance.validInstant}</span>, against{' '}
              {score.provenance.truthSource}, declining to resolve below{' '}
              <span className="declared">{score.provenance.resolutionFloorDegrees.value}&deg;</span>.
              Means removed: forecast{' '}
              <span className="computed">{score.meanOffsets.forecast.value.toFixed(1)} m</span>,
              truth <span className="computed">{score.meanOffsets.truth.value.toFixed(1)} m</span>.
            </p>
            {/* Review R-3. The caveat when there was something external to caveat, and the
                statement that there was not when there was not -- a reader cannot tell the
                difference between "independent" and "nobody checked" from a blank space. */}
            {score.provenance.independenceCaveat !== null ? (
              <p className="caveat">{score.provenance.independenceCaveat}</p>
            ) : (
              <p className="unmeasured" data-testid={`panel-independence-${String(leadHours)}`}>
                No external observation was assimilated in this window, so this figure carries
                no independence caveat.
              </p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
