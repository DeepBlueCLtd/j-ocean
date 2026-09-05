/**
 * The one rendering module (FR-010, NFR-03, review R-8).
 *
 * Every field the harness draws goes through here, so that the renderer choice is confined to
 * one file and is cheap to revisit. Beat 003 drew a single field on a 2-D canvas and recorded
 * the deviation; this is the WebGL surface it promised, arriving with the row, where six
 * panels of two layers each make it worth having.
 *
 * **The 2-D path is not a fallback for tidiness.** A browser without WebGL 2 -- or a canvas
 * that has lost its context -- still has to draw the field, because a harness that showed
 * nothing would be a harness that could not report anything. Which path was used is exposed
 * as `backend`, and the surface says so on screen rather than pretending.
 *
 * **Colour is never the only channel.** FR-019 requires the attribution layer to be legible in
 * greyscale, so the palettes are monotone in lightness and the optional hatch is a second
 * channel that survives a monochrome print entirely.
 */

export type Palette = 'diverging' | 'sequential';

export interface DrawOptions {
  readonly values: Float64Array;
  /** Symmetric about zero for `diverging`; the top of the range for `sequential`. */
  readonly limit: number;
  readonly palette: Palette;
  /**
   * The second channel. Cells where this exceeds `hatchThreshold` are struck through with
   * diagonal lines, which is what makes the attribution field readable without colour.
   */
  readonly hatch?: Float64Array;
  readonly hatchThreshold?: number;
}

const VERTEX = `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
  // North is up: the field's first row is the southernmost and a texture's is the bottom,
  // so the vertical coordinate is flipped once, here, rather than in every caller.
  uv = vec2((position.x + 1.0) * 0.5, (position.y + 1.0) * 0.5);
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 colour;

uniform sampler2D field;
uniform sampler2D hatchField;
uniform float limit;
uniform int paletteKind;
uniform int hasHatch;
uniform float hatchThreshold;

vec3 diverging(float t) {
  float magnitude = abs(clamp(t, -1.0, 1.0));
  float lightness = 1.0 - 0.68 * magnitude;
  vec3 hue = t >= 0.0 ? vec3(0.78, 0.13, 0.09) : vec3(0.11, 0.28, 0.6);
  return mix(vec3(lightness), hue, magnitude);
}

vec3 sequential(float t) {
  float v = clamp(t, 0.0, 1.0);
  float lightness = 1.0 - 0.82 * v;
  return mix(vec3(lightness), vec3(0.12, 0.2, 0.28), v);
}

void main() {
  float value = texture(field, uv).r;
  if (isnan(value)) {
    colour = vec4(0.824, 0.816, 0.792, 1.0);
    return;
  }
  vec3 rgb = paletteKind == 1 ? sequential(value / limit) : diverging(value / limit);

  if (hasHatch == 1 && texture(hatchField, uv).r > hatchThreshold) {
    // Diagonal stripes in device pixels: a second channel that survives a monochrome print.
    float stripe = fract((gl_FragCoord.x + gl_FragCoord.y) / 9.0);
    if (stripe < 0.34) rgb = mix(rgb, vec3(1.0), 0.55);
  }
  colour = vec4(rgb, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (shader === null) throw new Error('could not create a shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    throw new Error(`shader did not compile: ${gl.getShaderInfoLog(shader) ?? ''}`);
  }
  return shader;
}

/** Diverging blue-white-red, lightness monotone in |value| so greyscale still reads. */
function divergingColour(t: number): [number, number, number] {
  const clamped = Math.max(-1, Math.min(1, t));
  const magnitude = Math.abs(clamped);
  const lightness = 1 - 0.68 * magnitude;
  const hue: [number, number, number] = clamped >= 0 ? [0.78, 0.13, 0.09] : [0.11, 0.28, 0.6];
  return [
    Math.round(255 * (lightness + (hue[0] - lightness) * magnitude)),
    Math.round(255 * (lightness + (hue[1] - lightness) * magnitude)),
    Math.round(255 * (lightness + (hue[2] - lightness) * magnitude)),
  ];
}

function sequentialColour(t: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, t));
  const lightness = 1 - 0.82 * v;
  const tint: [number, number, number] = [0.12, 0.2, 0.28];
  return [
    Math.round(255 * (lightness + (tint[0] - lightness) * v)),
    Math.round(255 * (lightness + (tint[1] - lightness) * v)),
    Math.round(255 * (lightness + (tint[2] - lightness) * v)),
  ];
}

export class FieldSurface {
  readonly backend: 'webgl2' | 'canvas2d';
  readonly #canvas: HTMLCanvasElement;
  readonly #nx: number;
  readonly #ny: number;
  #gl: WebGL2RenderingContext | null = null;
  #program: WebGLProgram | null = null;
  #fieldTexture: WebGLTexture | null = null;
  #hatchTexture: WebGLTexture | null = null;

  constructor(canvas: HTMLCanvasElement, nx: number, ny: number) {
    this.#canvas = canvas;
    this.#nx = nx;
    this.#ny = ny;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (gl === null) {
      this.backend = 'canvas2d';
      return;
    }
    try {
      this.#setUpWebgl(gl);
      this.backend = 'webgl2';
    } catch {
      // A context that exists but will not compile is worse than no context, because it
      // fails later. Fall back now, once, and say which path is in use.
      this.#gl = null;
      this.backend = 'canvas2d';
    }
  }

  #setUpWebgl(gl: WebGL2RenderingContext): void {
    const program = gl.createProgram();
    if (program === null) throw new Error('could not create a program');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
      throw new Error(`program did not link: ${gl.getProgramInfoLog(program) ?? ''}`);
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const makeTexture = (unit: number): WebGLTexture => {
      const texture = gl.createTexture();
      if (texture === null) throw new Error('could not create a texture');
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    };
    this.#fieldTexture = makeTexture(0);
    this.#hatchTexture = makeTexture(1);
    gl.uniform1i(gl.getUniformLocation(program, 'field'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'hatchField'), 1);

    this.#gl = gl;
    this.#program = program;
  }

  draw(options: DrawOptions): void {
    if (this.#gl !== null && this.#program !== null) this.#drawWebgl(this.#gl, this.#program, options);
    else this.#drawCanvas(options);
  }

  #drawWebgl(gl: WebGL2RenderingContext, program: WebGLProgram, options: DrawOptions): void {
    const upload = (texture: WebGLTexture | null, unit: number, values: Float64Array): void => {
      const float32 = new Float32Array(values.length);
      for (let i = 0; i < values.length; i += 1) float32[i] = values[i] as number;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.#nx, this.#ny, 0, gl.RED, gl.FLOAT, float32);
    };
    upload(this.#fieldTexture, 0, options.values);
    upload(this.#hatchTexture, 1, options.hatch ?? new Float64Array(options.values.length));

    gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
    gl.uniform1f(gl.getUniformLocation(program, 'limit'), options.limit);
    gl.uniform1i(gl.getUniformLocation(program, 'paletteKind'), options.palette === 'sequential' ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, 'hasHatch'), options.hatch === undefined ? 0 : 1);
    gl.uniform1f(gl.getUniformLocation(program, 'hatchThreshold'), options.hatchThreshold ?? 0.5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  #drawCanvas(options: DrawOptions): void {
    const context = this.#canvas.getContext('2d');
    if (context === null) return;
    const image = context.createImageData(this.#nx, this.#ny);
    for (let iy = 0; iy < this.#ny; iy += 1) {
      for (let ix = 0; ix < this.#nx; ix += 1) {
        const source = (this.#ny - 1 - iy) * this.#nx + ix;
        const target = (iy * this.#nx + ix) * 4;
        const value = options.values[source] as number;
        let rgb: [number, number, number];
        if (!Number.isFinite(value)) {
          rgb = [210, 208, 202];
        } else {
          rgb =
            options.palette === 'sequential'
              ? sequentialColour(value / options.limit)
              : divergingColour(value / options.limit);
          const hatch = options.hatch?.[source];
          if (hatch !== undefined && hatch > (options.hatchThreshold ?? 0.5) && (ix + iy) % 3 === 0) {
            rgb = [
              Math.round(rgb[0] + (255 - rgb[0]) * 0.55),
              Math.round(rgb[1] + (255 - rgb[1]) * 0.55),
              Math.round(rgb[2] + (255 - rgb[2]) * 0.55),
            ];
          }
        }
        image.data[target] = rgb[0];
        image.data[target + 1] = rgb[1];
        image.data[target + 2] = rgb[2];
        image.data[target + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }
}
