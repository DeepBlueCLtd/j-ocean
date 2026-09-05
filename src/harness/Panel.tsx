import { useState } from 'react';
import type { DiagnosedProfile } from '../model/profile.js';
import type { Score } from '../scoring/scorer.js';
import { FieldView, type Marker } from './FieldView.js';
import type { Footprint } from './footprint.js';
import { marksOf } from './footprint.js';
import { NeedleElevation } from './NeedleElevation.js';
import { ObservationHover } from './ObservationHover.js';

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
  readonly score: Score | null;
  /** FR-026: the frozen quay-side brief, scored at the same instant, as the baseline. */
  readonly briefScore: Score | null;
  /** Present exactly when there is no field. FR-027: said, never extrapolated. */
  readonly refusal: string | null;
  /** What was actually asked of the model: the valid instant less the issue instant. */
  readonly leadFromIssueHours: number;
  readonly markers: readonly Marker[];
  /** Beat 008: what the vessel measured, as marks. Read, never computed, by the panel. */
  readonly footprint: Footprint;
  readonly box: { readonly west: number; readonly east: number };
  readonly elevationHeightPx: number;
  readonly needleOffsetPx: number;
  readonly levelTickLimit: number;
  /** The model's diagnosed profile at a cell, for the measured-beside-derived comparison. */
  readonly derivedProfileAt: (lonDeg: number, latDeg: number) => DiagnosedProfile | null;
  readonly enlarged: boolean;
  readonly showAttribution: boolean;
  readonly onEnlarge: () => void;
  readonly onSelectCell: (cellIndex: number) => void;
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
  const {
    leadHours,
    validInstant,
    initialisedFrom,
    score,
    enlarged,
    showAttribution,
  } = props;

  const skill = (figure: { value: number } | null | undefined): string =>
    figure === null || figure === undefined ? 'undefined' : figure.value.toFixed(3);

  /*
   * Hover previews; a click pins. The pinned mark survives the pointer leaving, for the same
   * reason beat 007's cell breakdown does: a reader who wants to read a profile has to be
   * able to look away from the thing they are reading it from.
   */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const shownId = pinnedId ?? hoveredId;
  const hovered = marksOf(props.footprint).find((mark) => mark.id === shownId) ?? null;

  return (
    <article
      className={`panel${enlarged ? ' enlarged' : ''}`}
      data-testid={`panel-${String(leadHours)}`}
      data-lead-hours={String(leadHours)}
    >
      <header>
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
      </header>

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
            : `Interface depth anomaly, valid ${validInstant}`
        }
        testId={`panel-field-${String(leadHours)}`}
        markers={props.markers}
        onSelect={props.onSelectCell}
        onHoverMark={setHoveredId}
        caption={false}
      />
      )}

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
          hoveredId={shownId}
          onHoverMark={setHoveredId}
          onSelectMark={(id) => { setPinnedId((current) => (current === id ? null : id)); }}
        />
      )}

      {hovered !== null && (
        <ObservationHover
          mark={hovered}
          pinned={pinnedId !== null}
          onUnpin={() => { setPinnedId(null); }}
          derived={
            hovered.kind === 'track'
              ? null
              : props.derivedProfileAt(hovered.lonDeg, hovered.latDeg)
          }
          qualityControlEnabled={props.footprint.qualityControlEnabled}
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

      <div className="panel-score" data-testid={`panel-score-${String(leadHours)}`}>
        {props.refusal !== null ? (
          <span className="unmeasured">no score: this panel has no forecast</span>
        ) : score === null ? (
          <span className="unmeasured">not scored yet</span>
        ) : (
          <>
            <p className="statement">{score.statement}</p>
            <dl className="panel-labels">
              <dt>vs persistence</dt>
              <dd className="computed">{skill(score.skillAgainstPersistence)}</dd>
              <dt>vs climatology</dt>
              <dd className="computed">{skill(score.skillAgainstClimatology)}</dd>
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
            <details data-testid={`panel-provenance-${String(leadHours)}`}>
              <summary>Where this figure came from</summary>
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
    </article>
  );
}
