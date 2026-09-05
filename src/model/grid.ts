import type { GridSpec, ModelState } from '../ports/kernel.js';

/**
 * Grid arithmetic for the model ring.
 *
 * The grid comes from configuration (Principle X: no component holds a literal grid size)
 * and the fields are typed arrays (constitution, Technology: never arrays of objects).
 * Nothing here imports anything above the ports.
 */

export function cellCount(grid: GridSpec): number {
  return grid.nx * grid.ny;
}

export function createField(grid: GridSpec): Float64Array {
  return new Float64Array(cellCount(grid));
}

/** Column-major would be as good; what matters is that one convention is written down. */
export function indexOf(grid: GridSpec, ix: number, iy: number): number {
  return iy * grid.nx + ix;
}

/**
 * Periodic wrapping. Beat 001's kernel is a placeholder and a periodic domain is the
 * boundary condition with the fewest arbitrary choices in it; beat 003 replaces this
 * kernel, and its plan decides the boundaries the reduced-gravity model actually needs.
 */
export function wrap(index: number, extent: number): number {
  const wrapped = index % extent;
  return wrapped < 0 ? wrapped + extent : wrapped;
}

/** A byte-level view of every field, in field-name order: the unit the replay test compares. */
export function stateBytes(state: ModelState): Uint8Array {
  const names = Object.keys(state.fields).sort();
  const total = names.reduce((sum, name) => sum + (state.fields[name] as Float64Array).byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const name of names) {
    const field = state.fields[name] as Float64Array;
    out.set(new Uint8Array(field.buffer, field.byteOffset, field.byteLength), offset);
    offset += field.byteLength;
  }
  return out;
}
