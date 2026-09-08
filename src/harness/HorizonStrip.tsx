import { useEffect, useRef, useState } from 'react';
import { FieldSurface } from './field-surface.js';
import { holdsField } from './field-identity.js';
import type { Score } from '../scoring/scorer.js';

/**
 * The strip: the row, surviving an enlargement (SRD-v2 FR-049, FR-050; spec 015 FR-002,
 * FR-003, FR-007, FR-008).
 *
 * There is exactly one of these. Beat 013 built a strip for the answer below the viewport
 * floor, because a no-scroll requirement without a smallest-case answer is an unfinished one;
 * this beat makes that strip **the one way the centre holds a single panel**, at any viewport,
 * and the answer below the width the row needs an instance of it rather than a parallel
 * arrangement. Two things that draw a strip are two things that drift.
 *
 * **Why the figures are here.** A strip of thumbnails alone reduces the comparison to a
 * picture. FR-050 says comparison across horizons is the lesson -- it is why the row was
 * chosen over a slider (ADR-0003) -- so each slot carries the same skill figures the scores
 * region draws beneath the row, in the same words. A horizon nobody has scored says so, and a
 * horizon with no forecast says that: a blank slot would be the surface declining to say what
 * it does not know (Principle VI).
 *
 * **The thumbnails are the same arrays.** Each slot draws the field object its panel draws,
 * through the same rendering module, into a canvas of the grid's own size shown small by CSS.
 * Nothing is resampled, reduced or recomputed for the strip: a reduction computed for a
 * thumbnail would be display causing computation, which is the entanglement FR-040 exists to
 * catch.
 */

export interface StripSlot {
  readonly leadHours: number;
  /** The panel's own field object, drawn small. Null where the panel has no forecast. */
  readonly field: Float64Array | null;
  /** Present exactly when there is no field: FR-027's refusal, in the forecast's own words. */
  readonly refusal: string | null;
  readonly score: Score | null;
}

export interface HorizonStripProps {
  readonly slots: readonly StripSlot[];
  /** The horizon the centre is showing. Marked, and the slot the keyboard starts on. */
  readonly enlargedLeadHours: number;
  readonly onSelect: (leadHours: number) => void;
  readonly nx: number;
  readonly ny: number;
  readonly limit: number;
  /** The scorer's own refusal, where scoring was asked for and declined. */
  readonly scoringRefusal: string | null;
}

/**
 * One slot's field, at thumbnail size.
 *
 * The canvas is the grid's own size in device pixels and small in CSS pixels, so the array is
 * drawn whole and the browser scales the picture. The alternative -- averaging cells into a
 * smaller array -- would be a quantity this harness computed for a picture, which is the one
 * thing FR-040 forbids the surface to do.
 */
function Thumbnail({
  values,
  nx,
  ny,
  limit,
  label,
}: {
  readonly values: Float64Array;
  readonly nx: number;
  readonly ny: number;
  readonly limit: number;
  readonly label: string;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const surface = useRef<FieldSurface | null>(null);

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    surface.current ??= new FieldSurface(element, nx, ny);
    surface.current.draw({ values, limit, palette: 'diverging' });
    holdsField(element, values);
  }, [values, nx, ny, limit]);

  return (
    <canvas
      ref={canvas}
      className="strip-thumbnail"
      width={nx}
      height={ny}
      role="img"
      aria-label={label}
    />
  );
}

/** The two skill figures, in the words `PanelScore` uses beneath the row. */
function slotScore(slot: StripSlot, scoringRefusal: string | null) {
  if (slot.refusal !== null) {
    return (
      <span className="unmeasured" title={slot.refusal}>
        no score: this panel has no forecast
      </span>
    );
  }
  if (slot.score === null) {
    return scoringRefusal === null ? (
      <span className="unmeasured">not scored yet</span>
    ) : (
      <span className="unmeasured" title={scoringRefusal}>
        scoring refused
      </span>
    );
  }
  const figure = (value: { value: number } | null): React.ReactNode =>
    value === null ? (
      <span className="unmeasured">undefined</span>
    ) : (
      <span className="figure computed" title="computed by the model">
        {value.value.toFixed(3)}
      </span>
    );
  return (
    <>
      <span className="strip-skill">{figure(slot.score.skillAgainstPersistence)} vs persistence</span>
      <span className="strip-skill">{figure(slot.score.skillAgainstClimatology)} vs climatology</span>
    </>
  );
}

export function HorizonStrip(props: HorizonStripProps) {
  const { slots, enlargedLeadHours, onSelect } = props;
  const container = useRef<HTMLDivElement | null>(null);
  /**
   * The roving tabindex (FR-057). One slot is in the tab order and the arrow keys move along
   * the strip inside it, which is what a reader comparing horizons without a mouse needs: a
   * strip of six tab stops would put five keystrokes between the surface and the next region.
   * The commit is the button's own -- Enter or Space -- so focus stays where it was.
   */
  const [roving, setRoving] = useState<number>(enlargedLeadHours);
  const current = slots.some((slot) => slot.leadHours === roving) ? roving : enlargedLeadHours;

  const move = (delta: number): void => {
    const index = slots.findIndex((slot) => slot.leadHours === current);
    if (index < 0) return;
    const next = slots[Math.min(slots.length - 1, Math.max(0, index + delta))];
    if (next === undefined) return;
    setRoving(next.leadHours);
    container.current
      ?.querySelector<HTMLButtonElement>(`[data-lead-hours="${String(next.leadHours)}"]`)
      ?.focus();
  };

  const jump = (leadHours: number | undefined): void => {
    if (leadHours === undefined) return;
    setRoving(leadHours);
    container.current
      ?.querySelector<HTMLButtonElement>(`[data-lead-hours="${String(leadHours)}"]`)
      ?.focus();
  };

  return (
    <div
      ref={container}
      className="horizon-strip"
      data-testid="horizon-strip"
      data-scrolls="list"
      data-list="every declared horizon, as controls"
      role="toolbar"
      aria-label="Every declared horizon, and what each was worth"
      aria-orientation="horizontal"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(1);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(-1);
        else if (event.key === 'Home') jump(slots[0]?.leadHours);
        else if (event.key === 'End') jump(slots[slots.length - 1]?.leadHours);
        else return;
        event.preventDefault();
      }}
    >
      {slots.map((slot) => {
        const marked = slot.leadHours === enlargedLeadHours;
        return (
          <button
            key={slot.leadHours}
            type="button"
            className={`strip-slot${marked ? ' current' : ''}`}
            data-testid={`strip-${String(slot.leadHours)}`}
            data-lead-hours={String(slot.leadHours)}
            data-marked={String(marked)}
            aria-pressed={marked}
            tabIndex={slot.leadHours === current ? 0 : -1}
            onFocus={() => { setRoving(slot.leadHours); }}
            onClick={() => { onSelect(slot.leadHours); }}
          >
            {slot.field === null ? (
              <span className="strip-thumbnail unmeasured" title={slot.refusal ?? undefined}>
                no field
              </span>
            ) : (
              <Thumbnail
                values={slot.field}
                nx={props.nx}
                ny={props.ny}
                limit={props.limit}
                label={`Interface depth anomaly at +${String(slot.leadHours)} h`}
              />
            )}
            <span className="strip-label">
              <span className="strip-head">
                <span className="figure declared" title="declared in configuration">
                  +{slot.leadHours} h
                </span>
                {/* The marking is a border weight and this word, not a colour: FR-057 asks the
                    surface to be legible in greyscale, and a strip marked by hue alone is a
                    strip a monochrome print cannot be read from. It shares the lead time's
                    line, because the strip's height is declared and a marking that added a
                    line would move the panel beneath it. */}
                {marked && <span className="strip-mark">enlarged</span>}
              </span>
              {slotScore(slot, props.scoringRefusal)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

