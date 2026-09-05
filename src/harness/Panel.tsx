import type { Score } from '../scoring/scorer.js';
import { FieldView, type Marker } from './FieldView.js';

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
  readonly field: Float64Array;
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
  readonly markers: readonly Marker[];
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

      <FieldView
        values={showAttribution ? props.observationWeight : props.field}
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
        caption={false}
      />

      <dl className="panel-labels">
        {/* FR-015: absolute instants, not only a lead time. Shown to the minute, with the
            full instant one hover away, because a panel narrow enough for six to fit cannot
            carry a wrapped ISO string and stay readable. */}
        <dt>Valid at</dt>
        <Instant value={validInstant} testId={`panel-valid-${String(leadHours)}`} />
        <dt>Initialised</dt>
        <Instant value={initialisedFrom} testId={`panel-initialised-${String(leadHours)}`} />
      </dl>

      <div className="panel-score" data-testid={`panel-score-${String(leadHours)}`}>
        {score === null ? (
          <span className="unmeasured">not scored yet</span>
        ) : (
          <>
            <p className="statement">{score.statement}</p>
            <dl className="panel-labels">
              <dt>vs persistence</dt>
              <dd className="computed">{skill(score.skillAgainstPersistence)}</dd>
              <dt>vs climatology</dt>
              <dd className="computed">{skill(score.skillAgainstClimatology)}</dd>
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
              {score.provenance.independenceCaveat !== null && (
                <p className="caveat">{score.provenance.independenceCaveat}</p>
              )}
            </details>
          </>
        )}
      </div>
    </article>
  );
}
