import { useState } from 'react';
import type { DiagnosedProfile } from '../model/profile.js';
import type { EditedLevel } from '../instruments/edits.js';
import type { FootprintMark, Needle, TrackMark } from './footprint.js';

/**
 * What a mark says when it is hovered (FR-001, FR-005, FR-006, FR-008).
 *
 * For a surface measurement: value, instant, instrument, and the flag if it carries one. For a
 * profile: the measured levels beside the model's **derived** profile at that cell, with every
 * level's kind on it — `computed` for the model's own two layer values, `derived` for every
 * level interpolated between them.
 *
 * That comparison is FR-07's, and SRD §10 makes it the trigger for dynamic depth levels: a
 * reader who sees the derived profile disagree with the XBT beside it has found something,
 * not a defect, *because the surface said the levels were derived*. Which is why the label is
 * on every one of them rather than in a caption.
 */

export interface ObservationHoverProps {
  readonly mark: FootprintMark;
  readonly derived: DiagnosedProfile | null;
  readonly qualityControlEnabled: boolean;
  readonly pinned: boolean;
  readonly onUnpin: () => void;
  /** Beat 010. Absent where a mark cannot be edited -- the row at panel width. */
  readonly counterfactual?: {
    readonly withheld: boolean;
    readonly edited: boolean;
    /** The measured levels, drawn as a ghost behind an edited profile (FR-003). */
    readonly ghost: readonly { readonly depthMetres: number; readonly value: number }[] | null;
    readonly onWithhold: (withheld: boolean) => void;
    readonly onEditProfile: (levels: readonly EditedLevel[] | null) => void;
  };
}

const isNeedle = (mark: FootprintMark): mark is Needle => mark.kind !== 'track';

/**
 * The measured level closest to a display level, or none if the closest is nearer to a
 * different display level. Depths, not positions in a list.
 */
function nearestLevel(
  needle: Needle,
  depthMetres: number,
  displayLevels: readonly { readonly depthMetres: number }[],
): Needle['levels'][number] | undefined {
  let best: { level: Needle['levels'][number]; distance: number } | undefined;
  for (const level of needle.levels) {
    const distance = Math.abs(level.depthMetres - depthMetres);
    if (best === undefined || distance < best.distance) best = { level, distance };
  }
  if (best === undefined) return undefined;
  const nearestDisplay = displayLevels.reduce((closest, candidate) =>
    Math.abs(candidate.depthMetres - best.level.depthMetres) <
    Math.abs(closest.depthMetres - best.level.depthMetres)
      ? candidate
      : closest,
  );
  return nearestDisplay.depthMetres === depthMetres ? best.level : undefined;
}
const isTrack = (mark: FootprintMark): mark is TrackMark => mark.kind === 'track';

export function ObservationHover({
  mark,
  derived,
  qualityControlEnabled,
  pinned,
  onUnpin,
  counterfactual,
}: ObservationHoverProps) {
  return (
    <div className="observation-hover" data-testid="observation-hover" data-mark-id={mark.id}>
      {pinned && (
        <button type="button" className="enlarge" onClick={onUnpin} data-testid="unpin-mark">
          Release
        </button>
      )}
      <dl>
        <dt>Instrument</dt>
        <dd data-testid="hover-instrument">{mark.instrumentId}</dd>
        <dt>Instant</dt>
        <dd className="computed">{new Date(mark.instantMs).toISOString()}</dd>
        <dt>Position</dt>
        <dd className="computed">
          {mark.lonDeg.toFixed(2)}&deg;, {mark.latDeg.toFixed(2)}&deg;
        </dd>
        {isTrack(mark) && (
          <>
            <dt>Measured</dt>
            <dd className="computed" data-testid="hover-value">
              {mark.value.toFixed(2)} {mark.unit}
            </dd>
          </>
        )}
        {isNeedle(mark) && (
          <>
            <dt>Reached</dt>
            <dd className="computed" data-testid="hover-depth">
              {mark.measuredNothing
                ? 'nothing: this profile reports no value at any level'
                : `${mark.deepestMetres.toFixed(1)} m${mark.continuesBelow ? ', and continues below the displayed volume' : ''}`}
            </dd>
            <dt>Assimilated</dt>
            <dd data-testid="hover-assimilated">
              {mark.assimilated ? 'yes' : 'drawn, not assimilated'}
            </dd>
          </>
        )}
      </dl>

      {/* FR-024: what was rejected is part of what the harness did. The check is named. */}
      {mark.flagged ? (
        <p className="caveat" data-testid="hover-flags">
          {[
            ...mark.flags.map((flag) => flag.code),
            ...(isNeedle(mark)
              ? [...new Set(mark.levels.filter((level) => level.flagged).map(() => 'level flagged'))]
              : []),
          ].join(', ')}{' '}
          &mdash; kept and drawn, never omitted.
        </p>
      ) : (
        <p className="unmeasured" data-testid="hover-flags">
          {qualityControlEnabled ? 'passed every declared check' : 'quality control was off for this run'}
        </p>
      )}

      {mark.insideMargin && (
        <p className="caveat" data-testid="hover-margin">
          inside the sponge margin: the analysis used it, scoring excludes the region.
        </p>
      )}

      {mark.afterInitialisation && (
        <p className="caveat" data-testid="hover-after">
          taken after this forecast was initialised, so it did not inform it.
        </p>
      )}

      {/* FR-006 and FR-003: withholding a measurement, and dragging one. Both are edits to
          the record rather than to a forecast, which is why they live on the observation. */}
      {counterfactual !== undefined && (
        <p className="row-controls">
          <button
            type="button"
            data-testid="withhold-mark"
            onClick={() => { counterfactual.onWithhold(!counterfactual.withheld); }}
          >
            {counterfactual.withheld ? 'Restore this measurement' : 'Withhold this measurement'}
          </button>
          {isNeedle(mark) && counterfactual.edited && (
            <button
              type="button"
              data-testid="restore-profile"
              onClick={() => { counterfactual.onEditProfile(null); }}
            >
              Restore the measured profile
            </button>
          )}
        </p>
      )}

      {counterfactual?.withheld === true && (
        <p className="caveat" data-testid="hover-withheld">
          withheld from the analysis by you, and still drawn: what you withheld is part of what
          you did.
        </p>
      )}

      {isNeedle(mark) && counterfactual !== undefined && (
        <ProfileEditor
          mark={mark}
          ghost={counterfactual.ghost}
          onEdit={counterfactual.onEditProfile}
        />
      )}

      {isNeedle(mark) && derived !== null && (
        <table className="profile-comparison" data-testid="profile-comparison">
          <caption>
            Measured against the model&rsquo;s diagnosed profile at this cell. {derived.note}
          </caption>
          <thead>
            <tr>
              <th scope="col">Depth</th>
              <th scope="col">Measured</th>
              <th scope="col">Model</th>
            </tr>
          </thead>
          <tbody>
            {derived.levels.map((level) => {
              // Matched by depth, not by index. An XBT's depths and the model's display
              // levels are two declared lists that happen to be nearly the same; an Argo
              // profile's are neither, and lining them up by position would have invented a
              // correspondence. A measured level counts as being at this display level only
              // if it is nearer to it than to any other.
              const measured = nearestLevel(mark, level.depthMetres, derived.levels);
              return (
                <tr key={level.depthMetres}>
                  <td className="declared">{level.depthMetres.toFixed(0)} m</td>
                  <td className="computed">
                    {measured === undefined || !measured.hasValue
                      ? '—'
                      : `${measured.value.toFixed(2)} °C at ${measured.depthMetres.toFixed(0)} m`}
                  </td>
                  <td className={level.kind} data-kind={level.kind}>
                    {level.temperatureDegC.toFixed(2)} °C
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Dragging a measured profile (FR-028, FR-003).
 *
 * Temperature runs left to right, depth downward, and a point is dragged sideways. The
 * measured profile stays drawn behind the edit as a **ghost** -- the reader is stating what
 * the instrument would have read, not erasing what it did read, and a picture that forgot the
 * measurement would make the difference field meaningless.
 *
 * The drag is constrained to keep the profile monotone in depth, because the operator inverts
 * a monotone relation and a profile that doubled back would be one the analysis could not
 * read. The constraint is visible: the point stops.
 */
function ProfileEditor({
  mark,
  ghost,
  onEdit,
}: {
  readonly mark: Needle;
  readonly ghost: readonly { readonly depthMetres: number; readonly value: number }[] | null;
  readonly onEdit: (levels: readonly EditedLevel[] | null) => void;
}) {
  const measured = ghost ?? mark.levels.map((level) => ({ depthMetres: level.depthMetres, value: level.value }));
  const [draft, setDraft] = useState<readonly EditedLevel[] | null>(null);
  const shown = draft ?? mark.levels.map((level) => ({ depthMetres: level.depthMetres, value: level.value }));

  const usable = shown.filter((level) => Number.isFinite(level.value));
  if (usable.length < 2) return null;

  const deepest = Math.max(...shown.map((level) => level.depthMetres));
  const low = Math.min(...measured.filter((l) => Number.isFinite(l.value)).map((l) => l.value)) - 6;
  const high = Math.max(...measured.filter((l) => Number.isFinite(l.value)).map((l) => l.value)) + 6;
  const width = 240;
  const height = 150;
  const xOf = (value: number): number => 8 + ((value - low) / (high - low)) * (width - 16);
  const yOf = (depth: number): number => 8 + (depth / deepest) * (height - 16);
  const valueAt = (x: number): number => low + ((x - 8) / (width - 16)) * (high - low);

  const move = (index: number, x: number): void => {
    const next = shown.map((level, i) => {
      if (i !== index) return level;
      // Monotone in depth: a level may not be warmer than the one above it or colder than the
      // one below. The drag stops rather than reordering the profile.
      const above = shown[i - 1]?.value ?? Number.POSITIVE_INFINITY;
      const below = shown[i + 1]?.value ?? Number.NEGATIVE_INFINITY;
      const clamped = Math.min(above, Math.max(below, valueAt(x)));
      return { depthMetres: level.depthMetres, value: clamped };
    });
    setDraft(next);
  };

  /*
   * The edit is applied when the pointer is released, not while it moves. Every application
   * reruns the analysis and re-integrates six horizons, which is a second and a half; doing
   * that per mouse-move would make the drag the slowest thing in the harness and would break
   * NFR-04 in the most literal way available.
   */
  const commit = (): void => {
    if (draft !== null) onEdit(draft);
  };

  return (
    <figure className="profile-editor" data-testid="profile-editor">
      <svg width={width} height={height} role="img" aria-label="Drag a point to say what the instrument would have read">
        {/* The measurement, kept. */}
        <polyline
          data-testid="profile-ghost"
          points={measured
            .filter((level) => Number.isFinite(level.value))
            .map((level) => `${String(xOf(level.value))},${String(yOf(level.depthMetres))}`)
            .join(' ')}
          fill="none"
          stroke="var(--host)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <polyline
          points={shown
            .filter((level) => Number.isFinite(level.value))
            .map((level) => `${String(xOf(level.value))},${String(yOf(level.depthMetres))}`)
            .join(' ')}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.6}
        />
        {shown.map((level, index) =>
          Number.isFinite(level.value) ? (
            <circle
              key={level.depthMetres}
              data-testid={`profile-point-${String(index)}`}
              cx={xOf(level.value)}
              cy={yOf(level.depthMetres)}
              r={4}
              fill="#fff"
              stroke="var(--ink)"
              style={{ cursor: 'ew-resize' }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (event.buttons === 0) return;
                const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                if (box === undefined) return;
                move(index, ((event.clientX - box.left) / box.width) * width);
              }}
              onPointerUp={commit}
              onPointerCancel={commit}
            />
          ) : null,
        )}
      </svg>
      <figcaption>
        Drag a point: temperature across, depth down. The measured profile stays as a dashed
        ghost, and the drag stops where the profile would stop being monotone.
      </figcaption>
    </figure>
  );
}
