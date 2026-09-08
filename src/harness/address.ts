/**
 * The address (SRD-v2 FR-56; spec 017 FR-001 to FR-005; constitution Principle I).
 *
 * The selected panel, the selected cell and the selected observation are addressable, so two
 * people can point at the same thing. This module is **both directions of that**: it parses an
 * address and it serialises one, so the grammar is one fact rather than two that agree today.
 *
 * **The line this module may not cross.** A run is a seed and a manifest, and replay is
 * re-computation from a manifest rather than restoration from a link (Principle I, AT-04). A
 * URL carrying a seed would be a second way to bring a run back with none of the manifest's
 * checks -- no code version, no configuration digest, no refusal when the tree has moved. So
 * the grammar is `ADDRESS_KEYS` and nothing else, `tests/harness/address.test.ts` rejects any
 * addition, and a link that carries one anyway is told it carried something not honoured. A
 * link therefore means *"look at cell 2431 of the +48 h panel"*, and what a reader sees there
 * depends on the run they are in. That is the honest meaning of it.
 *
 * **The cell key carries the grid it was written against.** A cell is an index, and an index
 * into a different grid is a different place. Without the dimensions an old link would select
 * a cell that merely shares a number -- the silent near match FR-005 forbids -- so the value
 * is `2431@100x100` and a run on another grid says the link was written for a different one.
 *
 * **Nothing here writes.** `serialiseAddress` returns a string; `addressHref` builds the whole
 * URL. Who calls `history.replaceState`, and when, is the shell's business, and it is called
 * from the selection handlers alone: mounting must not write the address (FR-002), and the way
 * to guarantee that is for no mount-time code path to have a write in it.
 */

/**
 * The whole grammar. Three keys, in the order an address is written in, and no others.
 *
 * The order is fixed so that serialising is a function of the selection and not of the order
 * things happened in: "the address is byte-identical" (SC-002) is a claim about a string, and
 * a string whose key order drifted would fail it while selecting nothing new.
 */
export const ADDRESS_KEYS = ['panel', 'cell', 'observation'] as const;

export type AddressKey = (typeof ADDRESS_KEYS)[number];

/** A cell index and the grid it was written against. Both, always: see the module note. */
export interface CellAddress {
  readonly index: number;
  readonly nx: number;
  readonly ny: number;
}

/** What a link names. Every field null is the unselected address, which serialises to ''. */
export interface Address {
  /** A declared horizon's lead time in hours. */
  readonly panel: number | null;
  readonly cell: CellAddress | null;
  /** An observation's own id, as the instruments minted it. */
  readonly observation: string | null;
}

export const NOTHING_SELECTED: Address = { panel: null, cell: null, observation: null };

export interface ParsedAddress {
  readonly address: Address;
  /**
   * Keys the link carried that this surface does not honour, said in full.
   *
   * They are ignored rather than obeyed, and reported rather than swallowed: a reader who was
   * sent a link with a seed in it should be told the seed did nothing, because otherwise they
   * will believe they are looking at the run the sender was looking at.
   */
  readonly unhonoured: readonly string[];
  /** Values of the three keys that are not the shape the grammar admits, named. */
  readonly malformed: readonly string[];
}

/**
 * `/` and `@` are left as themselves.
 *
 * Both are legal in a query value, and both appear in one: an observation id is
 * `ownship-thermometer/0003` and a cell is `2431@100x100`. Percent-encoding them would make an
 * address nobody could read aloud, which is most of what an address is for here.
 */
const encode = (value: string): string =>
  encodeURIComponent(value).replace(/%2F/g, '/').replace(/%40/g, '@');

const CELL = /^(\d+)@(\d+)x(\d+)$/;
const PANEL = /^\d+$/;

/**
 * An address, from a query string. Reads; never writes.
 *
 * Anything the grammar does not admit is reported and dropped. Nothing is guessed at: a cell
 * value without its grid is malformed rather than assumed to mean this grid, because assuming
 * is exactly the near match the spec forbids.
 */
export function parseAddress(search: string): ParsedAddress {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const unhonoured: string[] = [];
  const malformed: string[] = [];
  let panel: number | null = null;
  let cell: CellAddress | null = null;
  let observation: string | null = null;

  for (const [key, value] of query.entries()) {
    if (!(ADDRESS_KEYS as readonly string[]).includes(key)) {
      unhonoured.push(
        `The link carried the key "${key}", which this surface does not honour: an address ` +
          `carries selection only — ${ADDRESS_KEYS.join(', ')} — and never the run. A run ` +
          'travels as a manifest, and replay is re-computation from it rather than restoration ' +
          'from a link.',
      );
      continue;
    }
    if (key === 'panel') {
      if (!PANEL.test(value)) {
        malformed.push(
          `The link's panel value "${value}" is not a lead time in whole hours, which is what ` +
            'a panel address is.',
        );
        continue;
      }
      panel = Number(value);
    } else if (key === 'cell') {
      const match = CELL.exec(value);
      if (match === null) {
        malformed.push(
          `The link's cell value "${value}" is not an index and the grid it was written ` +
            'against, which is what a cell address is: it should read like 2431@100x100.',
        );
        continue;
      }
      cell = {
        index: Number(match[1]),
        nx: Number(match[2]),
        ny: Number(match[3]),
      };
    } else {
      if (value === '') {
        malformed.push('The link names an observation with no id.');
        continue;
      }
      observation = value;
    }
  }

  return { address: { panel, cell, observation }, unhonoured, malformed };
}

/**
 * The query string for a selection: `''` when nothing is selected, `?panel=48&cell=…` when
 * something is. The keys come out in `ADDRESS_KEYS` order, always.
 */
export function serialiseAddress(address: Address): string {
  const parts: string[] = [];
  for (const key of ADDRESS_KEYS) {
    if (key === 'panel' && address.panel !== null) parts.push(`panel=${String(address.panel)}`);
    if (key === 'cell' && address.cell !== null) {
      const { index, nx, ny } = address.cell;
      parts.push(`cell=${String(index)}@${String(nx)}x${String(ny)}`);
    }
    if (key === 'observation' && address.observation !== null) {
      parts.push(`observation=${encode(address.observation)}`);
    }
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/** What this run has, for an address to be resolved against. Read from the run, never assumed. */
export interface AddressContext {
  /** Every horizon configuration declares. A panel address naming another is refused (G-05). */
  readonly declaredHorizons: readonly number[];
  readonly grid: { readonly nx: number; readonly ny: number };
  /** Every observation this run produced, by id. A fresh seed produces different ones. */
  readonly observationIds: ReadonlySet<string>;
}

export interface ResolvedAddress {
  readonly panel: number | null;
  readonly cell: number | null;
  readonly observation: string | null;
  /**
   * Everything the link named that this run has not got, each said **by name**.
   *
   * Principle VI: the harness can lose, and it says so. A near match -- the nearest declared
   * horizon, the same index in this grid, the observation with a similar id -- would be the
   * surface pretending the link worked, which is worse than the link not working.
   */
  readonly refusals: readonly string[];
}

const hoursList = (hours: readonly number[]): string =>
  `${[...hours].sort((a, b) => a - b).map((hour) => `+${String(hour)} h`).join(', ')}`;

/**
 * What a link selects in *this* run, and what it named that this run has not got.
 *
 * Every refusal names the thing and says what is there instead of substituting it. The
 * unhonoured keys and the malformed values come through as refusals too, so the surface has
 * one list to report rather than three.
 */
export function resolveAddress(parsed: ParsedAddress, context: AddressContext): ResolvedAddress {
  const refusals: string[] = [...parsed.unhonoured, ...parsed.malformed];
  const { panel, cell, observation } = parsed.address;

  let resolvedPanel: number | null = null;
  if (panel !== null) {
    if (context.declaredHorizons.includes(panel)) resolvedPanel = panel;
    else {
      refusals.push(
        `The link names the horizon +${String(panel)} h, which this configuration does not ` +
          `declare. The declared horizons are ${hoursList(context.declaredHorizons)}.`,
      );
    }
  }

  let resolvedCell: number | null = null;
  if (cell !== null) {
    const cells = context.grid.nx * context.grid.ny;
    if (cell.nx !== context.grid.nx || cell.ny !== context.grid.ny) {
      refusals.push(
        `The link names cell ${String(cell.index)} of a ${String(cell.nx)} × ${String(cell.ny)} ` +
          `grid, and this run's grid is ${String(context.grid.nx)} × ${String(context.grid.ny)}. ` +
          'An index into a different grid is a different place, so nothing is selected.',
      );
    } else if (cell.index >= cells) {
      refusals.push(
        `The link names cell ${String(cell.index)}, and this run's ${String(context.grid.nx)} × ` +
          `${String(context.grid.ny)} grid has ${String(cells)} cells, numbered 0 to ` +
          `${String(cells - 1)}.`,
      );
    } else {
      resolvedCell = cell.index;
    }
  }

  let resolvedObservation: string | null = null;
  if (observation !== null) {
    if (context.observationIds.has(observation)) resolvedObservation = observation;
    else {
      refusals.push(
        `The link names the observation "${observation}", which this run has not got. A run is ` +
          'a seed and a manifest: a different seed measures the ocean in different places, so ' +
          'an observation is only ever a name in the run that made it.',
      );
    }
  }

  return {
    panel: resolvedPanel,
    cell: resolvedCell,
    observation: resolvedObservation,
    refusals,
  };
}

/** The whole address, as a string a reader could copy. The path and hash are left alone. */
export function addressHref(location: { pathname: string; hash: string }, address: Address): string {
  return `${location.pathname}${serialiseAddress(address)}${location.hash}`;
}
