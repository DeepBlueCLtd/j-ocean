import { useEffect, useRef, useState } from 'react';

/**
 * Skill against persistence versus lead time, one line per issue instant (FR-008, §11).
 *
 * The row is already the lead-time axis and the scrubber above it is the issue-time axis, so
 * §11's two-dimensional control is not needed. What the row cannot show is the *shape* of the
 * two curves side by side, which is what this is for: moving issue time earlier drops the
 * whole curve bodily, and a reader should be able to see that it moved rather than compare six
 * pairs of numbers.
 *
 * It draws only the curves somebody has actually scored. A curve for an issue time nobody has
 * asked about would be a figure without a computation behind it.
 */

export interface SkillCurve {
  readonly issueInstantMs: number;
  readonly points: readonly { readonly leadHours: number; readonly skill: number | null }[];
}

export interface SkillInsetProps {
  readonly curves: readonly SkillCurve[];
  readonly currentIssueInstantMs: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

const PAD = { left: 46, right: 12, top: 12, bottom: 24 };

/**
 * How many gridlines the value axis carries.
 *
 * Beat 018 gives this figure the width of the horizons pane and the height the row does not
 * use, which is a great deal more paper than beat 013's 360 by 140 inset had. A line drawn
 * across that with two labels on it is a line, not an instrument: a reader cannot read a value
 * off it. So the axis is ruled, and the ruling is what earns the space.
 */
const TICKS = 5;

/**
 * How much height one of those labels needs to be read: the 10 px tick text and its leading.
 *
 * The ruling earns the space it is given, and where it is given none it has to say so by
 * drawing fewer lines. In the band the row leaves at the declared floor this figure is 66 px
 * tall, six labels down it are 6 px apart, and 6 px apart at 10 px is one number painted over
 * the next -- which the overlap census in `tests/shell/census.ts` reports by name and which
 * nothing had asked before beat 018's fifth pass. A literal here for the reason `PAD` is one:
 * a chart's tick text is not the layout's business.
 */
const TICK_LABEL_HEIGHT_PX = 14;

export function SkillInset({ curves, currentIssueInstantMs, widthPx, heightPx }: SkillInsetProps) {
  const leads = [...new Set(curves.flatMap((c) => c.points.map((p) => p.leadHours)))].sort(
    (a, b) => a - b,
  );
  const values = curves.flatMap((c) => c.points.map((p) => p.skill)).filter((v): v is number => v !== null);
  if (leads.length === 0 || values.length === 0) return null;

  const maxLead = Math.max(...leads);
  const low = Math.min(0, ...values);
  const high = Math.max(0.001, ...values);
  const xOf = (lead: number): number =>
    PAD.left + (lead / maxLead) * (widthPx - PAD.left - PAD.right);
  const yOf = (skill: number): number =>
    PAD.top + (1 - (skill - low) / (high - low)) * (heightPx - PAD.top - PAD.bottom);
  /** As many gridlines as can be read in the band there is, and never more than `TICKS`. */
  const ticks = Math.max(
    1,
    Math.min(TICKS, Math.floor((heightPx - PAD.top - PAD.bottom) / TICK_LABEL_HEIGHT_PX)),
  );

  return (
      <svg width={widthPx} height={heightPx} role="img" aria-label="Skill against persistence by lead time, one line per issue instant">
        {Array.from({ length: ticks + 1 }, (_ignored, at) => low + ((high - low) * at) / ticks).map(
          (value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={widthPx - PAD.right}
                y1={yOf(value)}
                y2={yOf(value)}
                stroke="var(--rule)"
                strokeDasharray={Math.abs(value) < 1e-9 ? undefined : '2 4'}
              />
              <text x={2} y={yOf(value) + 4} fontSize={10} fill="var(--host)">
                {value.toFixed(2)}
              </text>
            </g>
          ),
        )}
        {/* Zero is the reference, so it is the one solid rule: FR-021's convention is that zero
            means no better than persistence and negative means worse, and a reader has to be
            able to see which side of it a point is on without reading a label. */}
        <line
          x1={PAD.left}
          x2={widthPx - PAD.right}
          y1={yOf(0)}
          y2={yOf(0)}
          stroke="var(--ink)"
        />
        {/* One tick per declared horizon, so the axis is the row above it rather than a scale
            somebody would have to map onto the row themselves. */}
        {leads.map((lead) => (
          <g key={lead}>
            <line
              x1={xOf(lead)}
              x2={xOf(lead)}
              y1={PAD.top}
              y2={heightPx - PAD.bottom}
              stroke="var(--rule)"
              strokeDasharray="2 4"
            />
            <text
              x={xOf(lead)}
              y={heightPx - 8}
              fontSize={10}
              fill="var(--host)"
              textAnchor="middle"
            >
              +{lead} h
            </text>
          </g>
        ))}

        {curves.map((curve) => {
          const current = curve.issueInstantMs === currentIssueInstantMs;
          const drawn = curve.points.filter((p) => p.skill !== null);
          return (
            <g
              key={curve.issueInstantMs}
              data-testid={`skill-curve-${String(curve.issueInstantMs)}`}
              data-issue-instant={new Date(curve.issueInstantMs).toISOString()}
              data-current={String(current)}
            >
              <polyline
                points={drawn
                  .map((p) => `${String(xOf(p.leadHours))},${String(yOf(p.skill as number))}`)
                  .join(' ')}
                fill="none"
                stroke={current ? 'var(--ink)' : 'var(--host)'}
                strokeWidth={current ? 2 : 1}
                strokeDasharray={current ? undefined : '4 3'}
              />
              {drawn.map((p) => (
                <circle
                  key={p.leadHours}
                  cx={xOf(p.leadHours)}
                  cy={yOf(p.skill as number)}
                  r={current ? 2.6 : 2}
                  fill={current ? 'var(--ink)' : 'var(--host)'}
                />
              ))}
            </g>
          );
        })}
      </svg>
  );
}

/**
 * The curve at the size the pane gives it (spec 018 FR-003).
 *
 * `SkillInset` draws in pixels, because a chart's padding, its tick text and its point radii
 * are pixel quantities and scaling an SVG would scale those with it. So the pixels are
 * **measured** from the box the layout manager handed the pane, rather than declared: the
 * pane's width is whatever the reader left the sash at, and a figure declared at 360 by 140
 * inside it is the fixed track this beat is replacing, one level down.
 *
 * Before the first measurement there is nothing to draw. That is a frame, not a state.
 */
export function SkillPane({
  curves,
  currentIssueInstantMs,
}: {
  readonly curves: readonly SkillCurve[];
  readonly currentIssueInstantMs: number;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => {
      setSize({
        width: Math.max(0, Math.floor(element.clientWidth)),
        height: Math.max(0, Math.floor(element.clientHeight)),
      });
    });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);

  return (
    <figure className="skill-inset" data-testid="skill-inset">
      <div className="skill-inset-plot" ref={box} data-testid="skill-inset-box">
        {size !== null && size.width > 0 && size.height > 0 && (
          <SkillInset
            curves={curves}
            currentIssueInstantMs={currentIssueInstantMs}
            widthPx={size.width}
            heightPx={size.height}
          />
        )}
      </div>
      <figcaption className="figure-label">
        {curves.map((curve, index) => (
          <span key={curve.issueInstantMs}>
            {index > 0 ? '; ' : ''}
            issued{' '}
            <span className="computed">{new Date(curve.issueInstantMs).toISOString()}</span>
            {curve.issueInstantMs === currentIssueInstantMs ? ' (drawn)' : ''}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
