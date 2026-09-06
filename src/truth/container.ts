/**
 * The committed field container (FR-009).
 *
 * Deliberately small enough to read with nothing but `DataView`, `TextDecoder` and a typed
 * array. There is no parsing library here and there is not meant to be one: an artefact
 * format that needs a parser is an artefact format a reader cannot check by hand.
 *
 *     bytes 0..7      magic, ASCII "JOCEAN01"
 *     bytes 8..11     uint32 little-endian: the header length in bytes
 *     bytes 12..      the header, UTF-8 JSON, exactly that many bytes
 *                     zero padding to the next multiple of 4
 *     then            the payload: each variable at the byte offset the header declares
 *
 * The payload is `int16` with a declared scale and offset, which is how the source product
 * stores these fields. Widening to `float32` at build time would double the artefact in
 * order to invent precision the source does not have. Land carries a declared fill value,
 * and this reader turns it into `NaN` rather than into a plausible number.
 */

const MAGIC = 'JOCEAN01';
const HEADER_OFFSET = 12;

export interface ContainerVariable {
  readonly name: string;
  readonly units: string;
  readonly dims: readonly string[];
  readonly shape: readonly number[];
  readonly dtype: 'int16';
  readonly byteOrder: 'little';
  readonly scaleFactor: number;
  readonly addOffset: number;
  readonly fillValue: number;
  readonly byteOffset: number;
  readonly byteLength: number;
}

export interface ContainerHeader {
  readonly format: 'j-ocean/field';
  readonly version: number;
  /** `truth` or `climatology`. */
  readonly kind: string;
  readonly domain: string;
  /** The source's own resolution, recorded from the artefact and never inferred (review R-2). */
  readonly nativeResolutionDegrees: number;
  readonly coordinates: Readonly<Record<string, readonly number[]>>;
  readonly variables: readonly ContainerVariable[];
  readonly provenance: Readonly<Record<string, unknown>>;
}

export class ContainerError extends Error {
  override readonly name = 'ContainerError';
}

/**
 * A field artefact, held as it was committed. Values are decoded on access rather than
 * eagerly: a truth field is a few megabytes of `int16` and the harness samples points from
 * it, so decoding the whole thing into doubles would triple the memory for no gain.
 */
export class FieldContainer {
  readonly header: ContainerHeader;
  readonly #payloads = new Map<string, Int16Array>();
  readonly #byName = new Map<string, ContainerVariable>();

  constructor(bytes: ArrayBuffer) {
    const view = new DataView(bytes);
    const magic = new TextDecoder().decode(new Uint8Array(bytes, 0, 8));
    if (magic !== MAGIC) {
      throw new ContainerError(`not a j-ocean container: the magic reads ${JSON.stringify(magic)}`);
    }
    const headerLength = view.getUint32(8, true);
    const headerText = new TextDecoder().decode(new Uint8Array(bytes, HEADER_OFFSET, headerLength));
    this.header = JSON.parse(headerText) as ContainerHeader;
    if (this.header.format !== 'j-ocean/field') {
      throw new ContainerError(`unexpected container format ${String(this.header.format)}`);
    }

    let payloadStart = HEADER_OFFSET + headerLength;
    payloadStart += (4 - (payloadStart % 4)) % 4;

    for (const variable of this.header.variables) {
      const expected = variable.shape.reduce((product, extent) => product * extent, 1) * 2;
      if (expected !== variable.byteLength) {
        throw new ContainerError(
          `${variable.name}: the header declares a shape of ${variable.byteLength} bytes but ` +
            `${variable.shape.join(' x ')} at int16 is ${expected}`,
        );
      }
      this.#byName.set(variable.name, variable);
      this.#payloads.set(
        variable.name,
        new Int16Array(bytes.slice(payloadStart + variable.byteOffset, payloadStart + variable.byteOffset + variable.byteLength)),
      );
    }
  }

  variable(name: string): ContainerVariable {
    const variable = this.#byName.get(name);
    if (variable === undefined) {
      throw new ContainerError(
        `this artefact has no variable ${name}; it has ${[...this.#byName.keys()].join(', ')}`,
      );
    }
    return variable;
  }

  coordinate(name: string): readonly number[] {
    const values = this.header.coordinates[name];
    if (values === undefined) {
      throw new ContainerError(
        `this artefact has no coordinate ${name}; it has ${Object.keys(this.header.coordinates).join(', ')}`,
      );
    }
    return values;
  }

  /** The raw quantised payload. Present for the drift tests; sampling goes through `at`. */
  raw(name: string): Int16Array {
    return this.#payloads.get(name) as Int16Array;
  }

  /** One value by flat index, decoded. `NaN` where the artefact records no ocean. */
  at(name: string, index: number): number {
    const variable = this.variable(name);
    const quantised = (this.#payloads.get(name) as Int16Array)[index];
    if (quantised === undefined) {
      throw new ContainerError(`${name}: index ${String(index)} is outside the payload`);
    }
    if (quantised === variable.fillValue) return Number.NaN;
    return quantised * variable.scaleFactor + variable.addOffset;
  }

  /** Every value of a variable, decoded. For whole-field work such as the variance test. */
  decode(name: string): Float64Array {
    const variable = this.variable(name);
    const quantised = this.#payloads.get(name) as Int16Array;
    const out = new Float64Array(quantised.length);
    for (let i = 0; i < quantised.length; i += 1) {
      const value = quantised[i] as number;
      out[i] = value === variable.fillValue ? Number.NaN : value * variable.scaleFactor + variable.addOffset;
    }
    return out;
  }
}
