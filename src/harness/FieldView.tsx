import { useEffect, useRef, useState } from 'react';
import { FieldSurface, type Palette } from './field-surface.js';

/**
 * A field, drawn through the one rendering module, with its marks and its scale.
 *
 * Everything about *how* a field is painted lives in `field-surface.ts`; this component is
 * the geometry, the markers, the legend and the click target. Beat 003 had the two mixed
 * together, which was fine for one field and would not have been for twelve.
 */

/**
 * A point to draw over the field, in fractional grid coordinates.
 *
 * Beat 008 made the marks carry what they measured. A drop is never an undifferentiated dot
 * (FR-004): it is a glyph whose length is the depth it actually reached. A surface mark's
 * size and fill carry its value, so the track is readable as a measurement and not only as a
 * path. A mark taken after the forecast was initialised is drawn distinctly, because it did
 * not inform that forecast (FR-002).
 */
export interface Marker {
  /** The observation's id, where the mark is hoverable. */
  readonly id?: string;
  readonly x: number;
  readonly y: number;
  readonly kind: 'track' | 'drop' | 'external';
  readonly flagged: boolean;
  /** 0..1: where this measurement sits in the track's own range. Drives size and fill. */
  readonly intensity?: number;
  /** 0..1: how far into the displayed volume the probe reached. Drives the glyph's length. */
  readonly depthFraction?: number;
  /** FR-002: this measurement post-dates the initialisation instant of the panel. */
  readonly afterInitialisation?: boolean;
  /** The probe went past the floor of the displayed volume. */
  readonly continuesBelow?: boolean;
  /** Withheld from the analysis by the reader, and still drawn (beat 010, FR-006). */
  readonly withheld?: boolean;
}

export interface FieldViewProps {
  readonly values: Float64Array;
  readonly nx: number;
  readonly ny: number;
  readonly limit: number;
  readonly palette?: Palette;
  readonly unit?: string;
  /** The second channel (FR-019). Cells above the threshold are hatched, not merely tinted. */
  readonly hatch?: Float64Array;
  readonly hatchThreshold?: number;
  readonly hatchLabel?: string;
  readonly label: string;
  readonly testId?: string;
  readonly markers?: readonly Marker[];
  /** FR-18: a breakdown is an instrument of a selected cell. Clicking picks the cell. */
  readonly onSelect?: (cellIndex: number) => void;
  /** Beat 008: the id of the mark under the pointer, or null. */
  readonly onHoverMark?: (id: string | null) => void;
  /**
   * Beat 010, FR-008: the track's waypoints in fractional grid coordinates, draggable. Given
   * only where an edit is a deliberate act -- the enlarged panel -- because a row of six small
   * panels is not where a track should be redrawn by accident.
   */
  readonly waypoints?: readonly { readonly x: number; readonly y: number }[];
  readonly onDragWaypoint?: (index: number, x: number, y: number) => void;
  readonly onDropWaypoint?: () => void;
  /** Shown beneath the field. Absent on a panel, where the caption is the panel's own. */
  readonly caption?: boolean;
}

export function FieldView({
  values,
  nx,
  ny,
  limit,
  label,
  testId,
  markers = [],
  onSelect,
  onHoverMark,
  waypoints,
  onDragWaypoint,
  onDropWaypoint,
  palette = 'diverging',
  unit = 'm',
  hatch,
  hatchThreshold = 0.5,
  hatchLabel,
  caption = true,
}: FieldViewProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const overlay = useRef<HTMLCanvasElement | null>(null);
  const surface = useRef<FieldSurface | null>(null);
  const [backend, setBackend] = useState<string>('');

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    if (surface.current === null) {
      surface.current = new FieldSurface(element, nx, ny);
      setBackend(surface.current.backend);
    }
    surface.current.draw({
      values,
      limit,
      palette,
      ...(hatch === undefined ? {} : { hatch, hatchThreshold }),
    });
  }, [values, nx, ny, limit, palette, hatch, hatchThreshold]);

  useEffect(() => {
    const element = overlay.current;
    if (element === null) return;
    const context = element.getContext('2d');
    if (context === null) return;
    const scale = element.width / nx;
    context.clearRect(0, 0, element.width, element.height);

    const at = (marker: Marker): [number, number] => [marker.x * scale, (ny - marker.y) * scale];
    const track = markers.filter((marker) => marker.kind === 'track');

    /*
     * The track, in two styles. Segments up to the initialisation instant are solid: those
     * measurements informed this forecast. Everything after it is dashed, because it did not,
     * and a single line would have credited the forecast with information it never had.
     */
    const stroke = (from: Marker, to: Marker, dashed: boolean): void => {
      context.save();
      context.setLineDash(dashed ? [scale * 1.2, scale * 1.2] : []);
      context.strokeStyle = dashed ? 'rgba(16, 23, 29, 0.45)' : 'rgba(16, 23, 29, 0.85)';
      context.lineWidth = Math.max(1, scale * 0.25);
      context.beginPath();
      const [x0, y0] = at(from);
      const [x1, y1] = at(to);
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
      context.stroke();
      context.restore();
    };
    for (let i = 1; i < track.length; i += 1) {
      const to = track[i] as Marker;
      stroke(track[i - 1] as Marker, to, to.afterInitialisation === true);
    }

    // A surface measurement, encoded on the line: radius and fill both carry the value, so
    // the encoding survives having its colour removed (FR-001's second channel).
    for (const marker of track) {
      const [x, y] = at(marker);
      const intensity = marker.intensity ?? 0.5;
      context.beginPath();
      context.arc(x, y, scale * (0.5 + intensity * 0.7), 0, Math.PI * 2);
      const shade = Math.round(235 - intensity * 200);
      context.fillStyle = marker.flagged ? 'rgba(255, 255, 255, 0.95)' : `rgb(${String(shade)}, ${String(shade)}, ${String(shade)})`;
      context.fill();
      context.strokeStyle = marker.flagged ? 'rgb(138, 31, 31)' : 'rgba(16, 23, 29, 0.8)';
      context.lineWidth = Math.max(1, scale * (marker.flagged ? 0.4 : 0.2));
      context.stroke();
    }

    /*
     * A drop is a glyph whose length is the depth it reached, never a dot (FR-004). At row
     * width that is the whole of the depth information a panel can carry; the enlarged
     * panel's elevation carries the rest.
     */
    for (const marker of markers) {
      if (marker.kind === 'track') continue;
      const [x, y] = at(marker);
      const fraction = Math.min(1, marker.depthFraction ?? 0.5);
      const length = scale * (1.5 + fraction * 6);
      context.save();
      context.setLineDash(marker.afterInitialisation === true ? [scale * 0.9, scale * 0.9] : []);
      context.strokeStyle = marker.flagged
        ? 'rgb(138, 31, 31)'
        : marker.kind === 'drop'
          ? 'rgba(16, 23, 29, 0.95)'
          : 'rgba(107, 90, 46, 0.95)';
      context.lineWidth = Math.max(1, scale * 0.45);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x, y + length);
      context.stroke();
      context.restore();

      // Withheld by the reader: struck through, and still there. What was withheld is part
      // of what the reader did, so it is never omitted from the picture.
      if (marker.withheld === true) {
        context.save();
        context.strokeStyle = 'rgb(138, 31, 31)';
        context.lineWidth = Math.max(1, scale * 0.35);
        context.beginPath();
        context.moveTo(x - scale * 1.4, y - scale * 1.4);
        context.lineTo(x + scale * 1.4, y + scale * 1.4);
        context.stroke();
        context.restore();
      }

      // The head: filled for the ownship, hollow for an external profile, white for flagged.
      context.beginPath();
      context.arc(x, y, scale * (marker.kind === 'drop' ? 0.85 : 0.7), 0, Math.PI * 2);
      context.fillStyle = marker.flagged
        ? 'rgba(255, 255, 255, 0.95)'
        : marker.kind === 'drop'
          ? 'rgba(16, 23, 29, 0.95)'
          : 'rgba(247, 246, 242, 0.95)';
      context.fill();
      context.strokeStyle = marker.flagged ? 'rgb(138, 31, 31)' : 'rgba(16, 23, 29, 0.9)';
      context.lineWidth = Math.max(1, scale * 0.3);
      context.stroke();

      // A probe that went past the floor of the displayed volume says so with a barb.
      if (marker.continuesBelow === true) {
        context.beginPath();
        context.moveTo(x - scale * 0.6, y + length);
        context.lineTo(x, y + length + scale * 0.9);
        context.lineTo(x + scale * 0.6, y + length);
        context.stroke();
      }
    }
    // The track's waypoints, where they are draggable. Squares, so they are not mistaken for
    // a measurement: a waypoint is a decision about where to sail, not a thing that was read.
    for (const waypoint of waypoints ?? []) {
      const wx = waypoint.x * scale;
      const wy = (ny - waypoint.y) * scale;
      context.beginPath();
      context.rect(wx - scale * 1.2, wy - scale * 1.2, scale * 2.4, scale * 2.4);
      context.fillStyle = 'rgba(255, 255, 255, 0.9)';
      context.fill();
      context.strokeStyle = 'rgb(31, 79, 122)';
      context.lineWidth = Math.max(1, scale * 0.35);
      context.stroke();
    }
  }, [markers, nx, ny, waypoints]);

  /** Which waypoint the pointer took hold of, if any. */
  const dragging = useRef<number | null>(null);

  return (
    <figure className="field" data-testid={testId}>
      <div className="field-stack">
        <canvas ref={canvas} width={nx} height={ny} role="img" aria-label={label} data-backend={backend} />
        <canvas
          ref={overlay}
          className="overlay"
          width={nx * 8}
          height={ny * 8}
          aria-hidden="true"
          data-testid={testId === undefined ? undefined : `${testId}-overlay`}
          onClick={
            onSelect === undefined
              ? undefined
              : (event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const ix = Math.min(nx - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * nx));
                  const iy = Math.min(ny - 1, Math.floor((1 - (event.clientY - bounds.top) / bounds.height) * ny));
                  onSelect(iy * nx + ix);
                }
          }
          onMouseMove={
            onHoverMark === undefined
              ? undefined
              : (event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const gx = ((event.clientX - bounds.left) / bounds.width) * nx;
                  const gy = (1 - (event.clientY - bounds.top) / bounds.height) * ny;
                  // Nearest mark within a few cells. A mark's own glyph hangs below it, so
                  // the reach is deliberately generous downward.
                  let best: { id: string; distance: number } | null = null;
                  for (const marker of markers) {
                    if (marker.id === undefined) continue;
                    const distance = Math.hypot(marker.x - gx, marker.y - gy);
                    if (distance < 4 && (best === null || distance < best.distance)) {
                      best = { id: marker.id, distance };
                    }
                  }
                  onHoverMark(best === null ? null : best.id);
                }
          }
          onMouseLeave={onHoverMark === undefined ? undefined : () => { onHoverMark(null); }}
          onPointerDown={
            onDragWaypoint === undefined
              ? undefined
              : (event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const gx = ((event.clientX - bounds.left) / bounds.width) * nx;
                  const gy = (1 - (event.clientY - bounds.top) / bounds.height) * ny;
                  let best: { index: number; distance: number } | null = null;
                  (waypoints ?? []).forEach((waypoint, index) => {
                    const distance = Math.hypot(waypoint.x - gx, waypoint.y - gy);
                    if (distance < 5 && (best === null || distance < best.distance)) {
                      best = { index, distance };
                    }
                  });
                  if (best === null) return;
                  dragging.current = (best as { index: number }).index;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
          }
          onPointerMove={
            onDragWaypoint === undefined
              ? undefined
              : (event) => {
                  if (dragging.current === null) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const gx = ((event.clientX - bounds.left) / bounds.width) * nx;
                  const gy = (1 - (event.clientY - bounds.top) / bounds.height) * ny;
                  onDragWaypoint(dragging.current, gx, gy);
                }
          }
          onPointerUp={
            onDropWaypoint === undefined
              ? undefined
              : () => {
                  if (dragging.current === null) return;
                  dragging.current = null;
                  // Applied on release: every application reruns the analysis and
                  // re-integrates six horizons, which is not a thing to do per mouse-move.
                  onDropWaypoint();
                }
          }
          style={
            onSelect === undefined && onHoverMark === undefined
              ? undefined
              : { cursor: 'crosshair', pointerEvents: 'auto' }
          }
        />
      </div>

      {/*
        A canvas says nothing to a reader who cannot see it, and nothing to a test either. The
        marks are therefore also a list: one entry per observation, carrying what it is, where
        it is and whether it was flagged. It is the accessible equivalent of the overlay and
        the thing the footprint's counts are asserted against.
      */}
      {markers.some((marker) => marker.id !== undefined) && (
        <ul
          className="mark-list"
          data-testid={testId === undefined ? undefined : `${testId}-marks`}
          aria-label="Every observation drawn over this field"
        >
          {markers
            .filter((marker) => marker.id !== undefined)
            .map((marker) => (
              <li
                key={marker.id}
                data-mark-id={marker.id}
                data-kind={marker.kind}
                data-flagged={String(marker.flagged)}
                data-after-initialisation={String(marker.afterInitialisation === true)}
                data-withheld={String(marker.withheld === true)}
                data-x={marker.x.toFixed(3)}
                data-y={marker.y.toFixed(3)}
              >
                {marker.kind === 'track' ? 'surface measurement' : marker.kind === 'drop' ? 'XBT drop' : 'Argo profile'}
                {marker.flagged ? ', flagged' : ''}
                {marker.withheld === true ? ', withheld' : ''}
                {marker.afterInitialisation === true ? ', after initialisation' : ''}
              </li>
            ))}
        </ul>
      )}

      {waypoints !== undefined && waypoints.length > 0 && (
        <ul
          className="mark-list"
          data-testid={testId === undefined ? undefined : `${testId}-waypoints`}
          aria-label="The track's waypoints, draggable"
        >
          {waypoints.map((waypoint, index) => (
            <li
              key={`${String(waypoint.x)},${String(waypoint.y)}`}
              data-waypoint-index={String(index)}
              data-x={waypoint.x.toFixed(3)}
              data-y={waypoint.y.toFixed(3)}
            >
              waypoint {index + 1}
            </li>
          ))}
        </ul>
      )}

      {caption && (
        /* The field's own label and its scale: it names what is drawn and what the colours
           are worth. `figure-label` says so, and is what tests/shell/prose.spec.ts admits as
           labelling a figure rather than explaining one. */
        <figcaption className="figure-label">
          {label}
          <span className="scale">
            {palette === 'sequential' ? (
              <>
                <span className="swatch zero" /> 0
                <span className="swatch ink" /> {limit.toFixed(2)}
                {unit === '' ? '' : ` ${unit}`}
              </>
            ) : (
              <>
                <span className="swatch cool" /> &minus;{limit.toFixed(2)}
                {unit === '' ? '' : ` ${unit}`}
                <span className="swatch zero" /> 0
                <span className="swatch warm" /> +{limit.toFixed(2)}
                {unit === '' ? '' : ` ${unit}`}
              </>
            )}
            {hatchLabel !== undefined && (
              <>
                <span className="swatch hatched" /> {hatchLabel}
              </>
            )}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
