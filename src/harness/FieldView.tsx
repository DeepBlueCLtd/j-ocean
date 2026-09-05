import { useEffect, useRef } from 'react';

/**
 * A field, drawn.
 *
 * Beat 003 draws one field so that the reader can see there is an ocean. Beat 007 draws six
 * of them in a row, and the constitution names a WebGL surface for that; this is a 2-D
 * canvas, and the deviation is recorded in the beat 003 plan. The reason is that a single
 * 100 x 100 field costs a tenth of a millisecond to paint through `ImageData`, and taking on
 * a GL context, a shader pipeline and a headless-Chromium software rasteriser to save that
 * tenth of a millisecond would be paying for beat 007's problem three beats early.
 *
 * The palette is diverging about zero, because a sea-surface height anomaly is a departure
 * from a mean and the sign is the meaning. It is legible in greyscale: lightness carries the
 * magnitude, so a printed panel still shows the front (Principle V, and FR-17's requirement
 * that the attribution field be greyscale-legible, inherited here so beat 007 does not have
 * to invent it).
 */

export interface FieldViewProps {
  readonly values: Float64Array;
  readonly nx: number;
  readonly ny: number;
  /** Symmetric about zero. Declared by the caller so two panels can share a scale. */
  readonly limit: number;
  readonly label: string;
  readonly testId?: string;
}

/** Diverging blue-white-red, with lightness monotone in |value| so greyscale still reads. */
function colourOf(normalised: number): [number, number, number] {
  const t = Math.max(-1, Math.min(1, normalised));
  const magnitude = Math.abs(t);
  // Lightness falls from white at zero to about a third at the extremes.
  const lightness = 1 - 0.68 * magnitude;
  const warm: [number, number, number] = [0.78, 0.13, 0.09];
  const cool: [number, number, number] = [0.11, 0.28, 0.6];
  const hue = t >= 0 ? warm : cool;
  return [
    Math.round(255 * (lightness + (hue[0] - lightness) * magnitude)),
    Math.round(255 * (lightness + (hue[1] - lightness) * magnitude)),
    Math.round(255 * (lightness + (hue[2] - lightness) * magnitude)),
  ];
}

export function FieldView({ values, nx, ny, limit, label, testId }: FieldViewProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    const context = element.getContext('2d');
    if (context === null) return;

    const image = context.createImageData(nx, ny);
    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        // North is up: the field's first row is the southernmost, and a canvas's is the top.
        const source = (ny - 1 - iy) * nx + ix;
        const target = (iy * nx + ix) * 4;
        const value = values[source] as number;
        if (!Number.isFinite(value)) {
          image.data[target] = 210;
          image.data[target + 1] = 208;
          image.data[target + 2] = 202;
          image.data[target + 3] = 255;
          continue;
        }
        const [r, g, b] = colourOf(value / limit);
        image.data[target] = r;
        image.data[target + 1] = g;
        image.data[target + 2] = b;
        image.data[target + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }, [values, nx, ny, limit]);

  return (
    <figure className="field" data-testid={testId}>
      <canvas ref={canvas} width={nx} height={ny} role="img" aria-label={label} />
      <figcaption>
        {label}
        <span className="scale">
          <span className="swatch cool" /> &minus;{limit.toFixed(2)} m
          <span className="swatch zero" /> 0
          <span className="swatch warm" /> +{limit.toFixed(2)} m
        </span>
      </figcaption>
    </figure>
  );
}
