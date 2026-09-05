import { useEffect, useRef, useState } from 'react';
import { FieldSurface, type Palette } from './field-surface.js';

/**
 * A field, drawn through the one rendering module, with its marks and its scale.
 *
 * Everything about *how* a field is painted lives in `field-surface.ts`; this component is
 * the geometry, the markers, the legend and the click target. Beat 003 had the two mixed
 * together, which was fine for one field and would not have been for twelve.
 */

/** A point to draw over the field, in fractional grid coordinates. */
export interface Marker {
  readonly x: number;
  readonly y: number;
  readonly kind: 'track' | 'drop' | 'external';
  readonly flagged: boolean;
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

    context.strokeStyle = 'rgba(16, 23, 29, 0.85)';
    context.lineWidth = Math.max(1, scale * 0.25);
    context.beginPath();
    markers
      .filter((marker) => marker.kind === 'track')
      .forEach((marker, index) => {
        const [x, y] = at(marker);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
    context.stroke();

    for (const marker of markers) {
      if (marker.kind === 'track') continue;
      const [x, y] = at(marker);
      context.beginPath();
      context.arc(x, y, scale * (marker.kind === 'drop' ? 0.9 : 0.7), 0, Math.PI * 2);
      // A flagged observation is drawn as flagged, never omitted (FR-24).
      context.fillStyle = marker.flagged
        ? 'rgba(255, 255, 255, 0.9)'
        : marker.kind === 'drop'
          ? 'rgba(16, 23, 29, 0.95)'
          : 'rgba(107, 90, 46, 0.95)';
      context.fill();
      context.strokeStyle = marker.flagged ? 'rgb(138, 31, 31)' : 'rgba(16, 23, 29, 0.9)';
      context.lineWidth = Math.max(1, scale * 0.3);
      context.stroke();
    }
  }, [markers, nx, ny]);

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
          style={onSelect === undefined ? undefined : { cursor: 'crosshair', pointerEvents: 'auto' }}
        />
      </div>
      {caption && (
        <figcaption>
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
