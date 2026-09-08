import { describe, expect, it } from 'vitest';
import {
  ADDRESS_KEYS,
  NOTHING_SELECTED,
  parseAddress,
  resolveAddress,
  serialiseAddress,
  type Address,
} from '../../src/harness/address.js';

/**
 * The address grammar, and the line it may not cross (spec 017 T010 to T012, US3, FR-004,
 * SC-003; constitution Principle I).
 *
 * Addressability is one small step from a second persistence mechanism, and this repository
 * already has one. A run is a seed and a manifest, and replay is **re-computation from a
 * manifest** rather than restoration from a link: a URL carrying a seed would bring a run back
 * with none of the manifest's checks -- no code version, no configuration digest, no refusal
 * when the tree has moved. So the grammar is three keys and a test rejects any addition.
 *
 * The rejection is deliberately in two places, because they fail on different mistakes. The
 * **vocabulary** check fails when somebody widens `ADDRESS_KEYS`, which is how a run key would
 * actually arrive: as an obvious convenience, in a small diff. The **round trip** fails when
 * something reachable serialises a key the grammar does not admit, which is how one would
 * arrive by accident.
 *
 * It was watched failing on a planted `seed`, added to `ADDRESS_KEYS` the way somebody would
 * add it. The output is in the beat's note.
 */

/**
 * Words that name a run rather than a selection.
 *
 * Not an exhaustive list of everything forbidden -- the exact-set assertion above it is that
 * -- but the ones somebody would reach for, so the failure says *why* the key is refused
 * rather than only that the set has changed.
 */
const RUN_WORDS = [
  'seed',
  'manifest',
  'run',
  'edit',
  'edits',
  'counterfactual',
  'state',
  'digest',
  'domain',
  'issue',
  'step',
  'steps',
];

const GRID = { nx: 100, ny: 100 };
const DECLARED = [0, 12, 24, 48, 96, 192];
const OBSERVATIONS = new Set(['ownship-thermometer/0003', 'xbt/0001/interface']);
const context = { declaredHorizons: DECLARED, grid: GRID, observationIds: OBSERVATIONS };

describe('the address grammar', () => {
  it('admits exactly panel, cell and observation', () => {
    expect(
      [...ADDRESS_KEYS],
      'the address grammar has changed. It carries selection only: a fourth key is a second ' +
        'persistence mechanism with none of the manifest\'s checks (Principle I).',
    ).toEqual(['panel', 'cell', 'observation']);
  });

  /**
   * The planted case's own assertion. `seed=` is the one that matters, and it is refused with
   * the reason rather than by an equality failure that says only that a list has changed.
   */
  it('admits no key that names a run rather than a selection', () => {
    const offenders = ADDRESS_KEYS.filter((key) =>
      RUN_WORDS.some((word) => key === word || key.includes(word)),
    );
    expect(
      offenders,
      `the address grammar carries ${offenders.join(', ')}, which names the run rather than a ` +
        'selection. A run is a seed and a manifest, and replay is re-computation from the ' +
        'manifest: an address that carried one would be a second way to bring a run back, with ' +
        'no code version, no configuration digest, and no refusal when the tree has moved ' +
        '(constitution Principle I, SRD-v1 "no run in the URL").',
    ).toEqual([]);
  });

  /** Nothing reachable serialises a key outside the grammar, whatever is selected. */
  it('serialises no key outside the grammar, with everything selected', () => {
    const everything: Address = {
      panel: 48,
      cell: { index: 2431, nx: 100, ny: 100 },
      observation: 'ownship-thermometer/0003',
    };
    const written = serialiseAddress(everything);
    const keys = [...new URLSearchParams(written.slice(1)).keys()];
    expect(keys, `the address wrote a key the grammar does not admit: ${written}`).toEqual([
      ...ADDRESS_KEYS,
    ]);
    expect(written).toBe('?panel=48&cell=2431@100x100&observation=ownship-thermometer/0003');
  });

  it('serialises the unselected address to nothing at all', () => {
    expect(serialiseAddress(NOTHING_SELECTED)).toBe('');
  });

  /** Parse and serialise are one fact, so a round trip is the identity on every shape. */
  it('parses back what it serialises, in every shape', () => {
    const shapes: Address[] = [
      NOTHING_SELECTED,
      { panel: 0, cell: null, observation: null },
      { panel: null, cell: { index: 0, nx: 100, ny: 100 }, observation: null },
      { panel: null, cell: null, observation: 'argo/6901234/12/3' },
      {
        panel: 192,
        cell: { index: 9999, nx: 100, ny: 100 },
        observation: 'ownship-thermometer/0003',
      },
    ];
    for (const shape of shapes) {
      expect(parseAddress(serialiseAddress(shape)).address).toEqual(shape);
    }
  });

  /**
   * T012. A key the grammar does not admit is **ignored and reported**. Both halves matter:
   * obeying it would be the second persistence mechanism, and swallowing it would leave a
   * reader believing the link did something it did not.
   */
  it('ignores an unknown key and says the link carried something it does not honour', () => {
    const parsed = parseAddress('?seed=6a09e667f3bcc908&panel=48');
    expect(parsed.address).toEqual({ panel: 48, cell: null, observation: null });
    expect(parsed.unhonoured).toHaveLength(1);
    expect(parsed.unhonoured[0]).toContain('"seed"');
    expect(parsed.unhonoured[0]).toContain('does not honour');
    expect(parsed.unhonoured[0]).toContain('travels as a manifest');
    // And it is a refusal the surface reports, not a note the module keeps to itself.
    expect(resolveAddress(parsed, context).refusals[0]).toBe(parsed.unhonoured[0]);
  });

  it('names a value that is not the shape the grammar admits', () => {
    const parsed = parseAddress('?cell=2431&panel=soon&observation=');
    expect(parsed.address).toEqual(NOTHING_SELECTED);
    expect(parsed.malformed.join(' ')).toContain('2431@100x100');
    expect(parsed.malformed.join(' ')).toContain('"soon"');
    expect(parsed.malformed.join(' ')).toContain('no id');
  });
});

describe('resolving an address against the run a reader is in', () => {
  it('selects what this run has', () => {
    const resolved = resolveAddress(
      parseAddress('?panel=48&cell=2431@100x100&observation=xbt/0001/interface'),
      context,
    );
    expect(resolved).toEqual({
      panel: 48,
      cell: 2431,
      observation: 'xbt/0001/interface',
      refusals: [],
    });
  });

  /**
   * FR-005 and Principle VI, four times over. Each of these is a link that names something
   * plausible, and in each the near match is the tempting answer: the nearest declared horizon,
   * the same index in this grid, an observation with a similar name. Substituting one would be
   * the surface pretending the link worked.
   */
  it('refuses an undeclared horizon by name, and says what is declared', () => {
    const resolved = resolveAddress(parseAddress('?panel=72'), context);
    expect(resolved.panel).toBeNull();
    expect(resolved.refusals[0]).toContain('+72 h');
    expect(resolved.refusals[0]).toContain('does not declare');
    expect(resolved.refusals[0]).toContain('+48 h');
  });

  it('refuses a cell written against a different grid, and says which grid it was', () => {
    const resolved = resolveAddress(parseAddress('?cell=2431@120x120'), context);
    expect(resolved.cell).toBeNull();
    expect(resolved.refusals[0]).toContain('120 × 120');
    expect(resolved.refusals[0]).toContain('100 × 100');
    expect(resolved.refusals[0]).toContain('a different place');
  });

  it('refuses a cell outside the grid, and says how many cells there are', () => {
    const resolved = resolveAddress(parseAddress('?cell=10000@100x100'), context);
    expect(resolved.cell).toBeNull();
    expect(resolved.refusals[0]).toContain('cell 10000');
    expect(resolved.refusals[0]).toContain('10000 cells');
    expect(resolved.refusals[0]).toContain('0 to 9999');
  });

  it('refuses an observation this run has not got, and says why a run has its own', () => {
    const resolved = resolveAddress(parseAddress('?observation=xbt/0099/interface'), context);
    expect(resolved.observation).toBeNull();
    expect(resolved.refusals[0]).toContain('"xbt/0099/interface"');
    expect(resolved.refusals[0]).toContain('this run has not got');
  });

  /** Each part is resolved on its own: one refusal does not take the rest of the link with it. */
  it('honours what it can and refuses the rest, rather than refusing the whole link', () => {
    const resolved = resolveAddress(
      parseAddress('?panel=48&cell=2431@120x120&observation=nobody'),
      context,
    );
    expect(resolved.panel).toBe(48);
    expect(resolved.cell).toBeNull();
    expect(resolved.observation).toBeNull();
    expect(resolved.refusals).toHaveLength(2);
  });
});
