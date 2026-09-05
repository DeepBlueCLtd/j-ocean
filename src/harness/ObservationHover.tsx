import type { DiagnosedProfile } from '../model/profile.js';
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
