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

const PAD = { left: 34, right: 8, top: 10, bottom: 20 };

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

  return (
    <figure className="skill-inset" data-testid="skill-inset">
      <svg width={widthPx} height={heightPx} role="img" aria-label="Skill against persistence by lead time, one line per issue instant">
        <line x1={PAD.left} x2={widthPx - PAD.right} y1={yOf(0)} y2={yOf(0)} stroke="var(--rule)" />
        <text x={2} y={yOf(0) + 4} fontSize={10} fill="var(--host)">
          0.00
        </text>
        <text x={2} y={PAD.top + 4} fontSize={10} fill="var(--host)">
          {high.toFixed(2)}
        </text>
        <text x={widthPx - PAD.right - 22} y={heightPx - 6} fontSize={10} fill="var(--host)">
          +{maxLead} h
        </text>

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
      <figcaption>
        Skill against persistence by lead time.{' '}
        {curves.map((curve, index) => (
          <span key={curve.issueInstantMs}>
            {index > 0 ? '; ' : ''}
            issued{' '}
            <span className="computed">{new Date(curve.issueInstantMs).toISOString()}</span>
            {curve.issueInstantMs === currentIssueInstantMs ? ' (the row above)' : ''}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
