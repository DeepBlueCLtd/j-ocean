import { useState } from 'react';
import type { Footprint, Needle } from './footprint.js';

/**
 * The depth axis of an enlarged panel (FR-003, FR-23).
 *
 * A drop flattened to the surface discards the dimension it exists for, so the enlarged panel
 * gains an **elevation**: the field's own longitude as the horizontal axis, depth downward,
 * and one vertical needle per profile extending exactly to the depth that probe actually
 * reached, with a tick at every level it sampled.
 *
 * **Beat 015 moved it from beneath the field to beside it, and that is a real concession.**
 * The centre keeps one box whatever it holds (FR-049, AT-13), and stacked -- a field worth
 * enlarging with a 170 px elevation beneath it -- the two do not fit that box at the declared
 * floor. Beside it they do, and the longitude range is the same range, so the axis is shared
 * in scale if no longer in position. The caption says which axis is which for that reason.
 *
 * **The projection loses latitude, and says so.** This is a side elevation, not a scene: a
 * needle sits at its longitude, and two profiles at the same longitude and different
 * latitudes appear side by side only because co-located needles are offset by a declared
 * amount. The plan view above the elevation is where position is read; the elevation is where
 * depth is read. Drawing a perspective volume instead would have implied a viewpoint, and
 * with it a set of distances the harness does not have.
 *
 * **Beat 017 made it operable without a mouse (FR-057).** A needle was an SVG group with a
 * click handler and nothing else, so selecting a profile -- one of the two things the detail
 * region draws -- could only be done by pointing at it. It is now a **roving focus** like the
 * strip's: the elevation is one tab stop, the arrow keys move along the needles in longitude
 * order, and Enter or Space pins the one the reader is on. One tab stop rather than a stop per
 * needle, because an Argo-heavy run would otherwise put thirty keystrokes between this panel
 * and the next region.
 */

export interface NeedleElevationProps {
  readonly footprint: Footprint;
  readonly west: number;
  readonly east: number;
  readonly heightPx: number;
  readonly offsetPx: number;
  /** Above this many levels a needle shows ticks only while hovered. */
  readonly levelTickLimit: number;
  readonly hoveredId: string | null;
  readonly onHoverMark: (id: string | null) => void;
  /** Clicking pins a needle, so what it says survives the pointer leaving. */
  readonly onSelectMark: (id: string) => void;
}

const TOP_PAD = 14;
const BOTTOM_PAD = 16;

export function NeedleElevation(props: NeedleElevationProps) {
  const { footprint, west, east, heightPx } = props;
  const floor = footprint.volumeFloorMetres;
  const usable = heightPx - TOP_PAD - BOTTOM_PAD;
  const yOf = (depthMetres: number): number =>
    TOP_PAD + (Math.min(depthMetres, floor) / floor) * usable;
  const xOf = (needle: Needle): number =>
    ((needle.lonDeg - west) / (east - west)) * 100;

  const gridDepths = [0, floor / 4, floor / 2, (3 * floor) / 4, floor];

  /**
   * Where the keyboard is along the elevation, and whether it is here at all.
   *
   * Held locally rather than lifted, because it is not a selection: moving along the needles
   * previews each one in the detail region exactly as a pointer moving across them does, and
   * the commit is Enter. `hoveredId` is what the pointer and the keyboard agree on, so the
   * marking is one thing; `at` exists only so the keyboard knows where it is when the reader
   * has pinned something else.
   */
  const needles = footprint.needles;
  const [at, setAt] = useState(0);
  const [holdsFocus, setHoldsFocus] = useState(false);
  const current = Math.min(at, Math.max(0, needles.length - 1));

  const move = (delta: number): void => {
    if (needles.length === 0) return;
    const next = Math.min(needles.length - 1, Math.max(0, current + delta));
    setAt(next);
    props.onHoverMark(needles[next]?.id ?? null);
  };

  return (
    <figure className="elevation" data-testid="needle-elevation">
      <div
        className="elevation-stack"
        data-testid="needle-elevation-needles"
        tabIndex={0}
        role="group"
        aria-label={
          `Every profile this panel drew, at the depth it reached: ${String(needles.length)} ` +
          'of them. The arrow keys move along them and Enter selects one.'
        }
        onFocus={() => {
          setHoldsFocus(true);
          props.onHoverMark(needles[current]?.id ?? null);
        }}
        onBlur={() => { setHoldsFocus(false); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(1);
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(-1);
          else if (event.key === 'Home') { setAt(0); props.onHoverMark(needles[0]?.id ?? null); }
          else if (event.key === 'End') {
            setAt(needles.length - 1);
            props.onHoverMark(needles[needles.length - 1]?.id ?? null);
          } else if (event.key === 'Enter' || event.key === ' ') {
            const id = needles[current]?.id;
            if (id !== undefined) props.onSelectMark(id);
          } else return;
          event.preventDefault();
        }}
      >
        {/* The depth labels are HTML, not SVG text: the drawing stretches its horizontal axis
            to the panel's width, which would stretch lettering with it. */}
        <div className="elevation-axis" aria-hidden="true">
          {gridDepths.map((depth) => (
            <span key={depth} style={{ top: `${String(yOf(depth))}px` }}>
              {depth.toFixed(0)}
            </span>
          ))}
        </div>
      <svg
        viewBox={`0 0 100 ${String(heightPx)}`}
        preserveAspectRatio="none"
        height={heightPx}
        role="img"
        aria-label="Depth elevation: one needle per profile, extending to the depth it sampled"
      >
        {gridDepths.map((depth) => (
          <g key={depth}>
            <line
              x1={0}
              x2={100}
              y1={yOf(depth)}
              y2={yOf(depth)}
              stroke="var(--rule)"
              strokeWidth={0.4}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}

        {needles.map((needle, index) => {
          const x = xOf(needle) + (needle.offsetIndex * props.offsetPx) / 8;
          const hovered = props.hoveredId === needle.id || (holdsFocus && index === current);
          const colour = needle.flagged
            ? 'rgb(138, 31, 31)'
            : needle.kind === 'drop'
              ? 'rgb(16, 23, 29)'
              : 'rgb(107, 90, 46)';
          return (
            <g
              key={needle.id}
              data-testid={`needle-${needle.id}`}
              data-kind={needle.kind}
              data-flagged={String(needle.flagged)}
              data-deepest-metres={needle.deepestMetres.toFixed(1)}
              data-continues-below={String(needle.continuesBelow)}
              data-measured-nothing={String(needle.measuredNothing)}
              onMouseEnter={() => { props.onHoverMark(needle.id); }}
              onMouseLeave={() => { props.onHoverMark(null); }}
              onClick={() => { props.onSelectMark(needle.id); }}
              style={{ cursor: 'pointer' }}
            >
              {/* A profile that measured nothing is a cross at the surface, not a needle of
                  zero length: the second would read as a probe that reached the surface. */}
              {needle.measuredNothing ? (
                <g stroke="rgb(138, 31, 31)" strokeWidth={1.4} vectorEffect="non-scaling-stroke">
                  <line x1={x - 1.2} x2={x + 1.2} y1={TOP_PAD - 3} y2={TOP_PAD + 3} />
                  <line x1={x - 1.2} x2={x + 1.2} y1={TOP_PAD + 3} y2={TOP_PAD - 3} />
                </g>
              ) : (
                <>
                  {/* The extent is the depth actually reached, and nothing else (SC-002). */}
                  <line
                    x1={x}
                    x2={x}
                    y1={yOf(needle.shallowestMetres)}
                    y2={yOf(needle.deepestMetres)}
                    stroke={colour}
                    strokeWidth={hovered ? 2.4 : 1.2}
                    strokeDasharray={needle.afterInitialisation ? '3 2' : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Level ticks, for a profile sparse enough that ticks mean something, or
                      for the one being hovered. An Argo profile carries five hundred levels;
                      drawing them all on every needle would be a solid bar, which says less
                      than the extent line already does. */}
                  {(hovered || needle.levels.length <= props.levelTickLimit) &&
                    needle.levels.map((level) => (
                      <line
                        key={level.depthMetres}
                        x1={x - 0.8}
                        x2={x + 0.8}
                        y1={yOf(level.depthMetres)}
                        y2={yOf(level.depthMetres)}
                        stroke={level.flagged ? 'rgb(138, 31, 31)' : colour}
                        strokeWidth={level.hasValue ? 1.6 : 0.8}
                        strokeDasharray={level.hasValue ? undefined : '2 2'}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                </>
              )}
              {needle.continuesBelow && (
                // The probe went past the floor of the displayed volume; the needle says so
                // rather than stopping as though the profile had.
                <polyline
                  points={`${String(x - 1.2)},${String(yOf(floor) + 3)} ${String(x)},${String(yOf(floor) + 8)} ${String(x + 1.2)},${String(yOf(floor) + 3)}`}
                  fill="none"
                  stroke={colour}
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}
      </svg>
      </div>
      {/* A label, not an explanation (spec 018 FR-007). What a side elevation is -- that
          longitude is the horizontal axis, that latitude is not shown, and that position is
          therefore read from the field beside it -- is this panel's own help, under
          *enlarging a panel*, and docs/narrative-disposition.json records the move. */}
      <figcaption className="figure-label">
        Depth to <span className="figure declared">{floor.toFixed(0)} m</span>, at the depths
        reached
      </figcaption>
    </figure>
  );
}
