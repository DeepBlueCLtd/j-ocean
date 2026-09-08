import { inflateSync } from 'node:zlib';

/**
 * Reading rendered pixels out of a screenshot, so a greyscale claim is measured.
 *
 * Beat 007 held the attribution layer to a luminance margin by reading the canvas it had
 * drawn: `readPixels` on the WebGL surface, converted to luminance, and a declared margin
 * asserted. Beat 015's marking is not on a canvas -- it is a border weight and a label on a
 * control -- so there is nothing to read pixels *from* except the rendering itself. Playwright
 * hands that over as a PNG, and this turns a PNG back into pixels.
 *
 * The alternative would be to read `getComputedStyle().borderColor` and convert that, which is
 * a measurement of the stylesheet rather than of what the browser painted. The whole point of
 * the claim is that a monochrome print of the strip still says which horizon is enlarged, and
 * a print is made of pixels.
 *
 * Deliberately small: it handles the one shape Playwright emits -- eight-bit, non-interlaced,
 * truecolour with or without alpha -- and throws by name on anything else rather than
 * guessing.
 *
 * **Beat 017 added `channelsAt` and nothing else.** That beat renders the whole page through a
 * saturation filter and measures what survives, and it has to be able to check that the filter
 * actually applied: a "greyscale" measurement taken on a photograph that is still in colour
 * would pass while measuring nothing. Reading the three channels is how that is checked, and
 * it is the same decoder rather than a second one.
 */

export interface Pixels {
  readonly width: number;
  readonly height: number;
  /** Rec. 709 relative luminance, 0 to 255, at (x, y) from the top left. */
  luminanceAt(x: number, y: number): number;
  /** The three channels as they were painted, so a claim about colour can be checked. */
  channelsAt(x: number, y: number): readonly [number, number, number];
}

export function decodePng(png: Buffer): Pixels {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('that is not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const kind = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const bitDepth = body.readUInt8(8);
      const colourType = body.readUInt8(9);
      const interlace = body.readUInt8(12);
      if (bitDepth !== 8 || interlace !== 0 || (colourType !== 2 && colourType !== 6)) {
        throw new Error(
          `this PNG is bit depth ${String(bitDepth)}, colour type ${String(colourType)}, ` +
            `interlace ${String(interlace)}, which this reader does not handle`,
        );
      }
      channels = colourType === 6 ? 4 : 3;
    } else if (kind === 'IDAT') {
      data.push(body);
    } else if (kind === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  // Un-filtering, per PNG's five filter types. Each scanline says how it was encoded against
  // the pixel to its left and the scanline above it.
  for (let y = 0; y < height; y += 1) {
    const filter = raw.readUInt8(y * (stride + 1));
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i += 1) {
      const x = line[i] as number;
      const a = i >= channels ? (pixels[y * stride + i - channels] as number) : 0;
      const b = y > 0 ? (pixels[(y - 1) * stride + i] as number) : 0;
      const c = i >= channels && y > 0 ? (pixels[(y - 1) * stride + i - channels] as number) : 0;
      let value: number;
      switch (filter) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + Math.floor((a + b) / 2); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown PNG filter ${String(filter)} on scanline ${String(y)}`);
      }
      pixels[y * stride + i] = value & 0xff;
    }
  }

  const at = (x: number, y: number): number =>
    Math.min(height - 1, Math.max(0, Math.round(y))) * stride +
    Math.min(width - 1, Math.max(0, Math.round(x))) * channels;

  return {
    width,
    height,
    luminanceAt(x, y) {
      const i = at(x, y);
      return (
        0.2126 * (pixels[i] ?? 0) + 0.7152 * (pixels[i + 1] ?? 0) + 0.0722 * (pixels[i + 2] ?? 0)
      );
    },
    channelsAt(x, y) {
      const i = at(x, y);
      return [pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0] as const;
    },
  };
}
