import { describe, expect, it } from 'vitest';
import {
  namesARun,
  PANE_KEYS,
  readWorkspace,
  restorable,
  RUN_WORDS,
  WORKSPACE_KEYS,
  writeWorkspace,
} from '../../src/harness/workspace-state.js';
import { REGIONS } from '../../src/harness/panels.js';

/**
 * What the workspace may remember (spec 018 FR-004, FR-005, SC-003; ADR-0014; constitution
 * Principle IX, amendment of 8 September 2026).
 *
 * **This file is deliberately the shape of `tests/harness/address.test.ts`.** Feature 017 found
 * that addressability was one small step from a second persistence mechanism and guarded it
 * with a key set, a vocabulary check and a round trip. Beat 018 opens the second door — a
 * workspace that remembers how a reader arranged it — and it is guarded the same way, because
 * the two are the same risk wearing different clothes: a run that leaves the session with none
 * of the manifest's checks.
 *
 * The rejection is in three places, because they fail on three different mistakes.
 *
 * The **vocabulary** check fails when somebody widens `WORKSPACE_KEYS` or `PANE_KEYS`, which is
 * how a run key would actually arrive: as an obvious convenience, in a small diff.
 *
 * The **read** check fails when something outside this repository puts a run key in storage —
 * an older build, another tab, a reader with a console — and it is refused **by name** rather
 * than carried along because nothing happened to look at it.
 *
 * The **write** check fails when the layout manager's own serialisation grows a field that
 * would carry state: what is written is *rebuilt* from a fixed set of keys, so a new field
 * upstream cannot arrive in storage by default.
 *
 * It was watched failing on a planted `seed`, in each of the three places, in the way somebody
 * would actually add one. The output is in the beat's note.
 */

const PANES = new Set(['controls', 'horizons', 'selection', 'provenance/run']);
const context = { paneIds: PANES, layoutVersion: 1 };

/** A stored arrangement this build would accept: geometry and pane identity, and nothing else. */
const good = {
  version: 1,
  grid: { root: { type: 'branch', data: [] }, width: 2560, height: 1385, orientation: 'HORIZONTAL' },
  panels: {
    controls: { id: 'controls', component: 'controls', title: 'Controls' },
    horizons: { id: 'horizons', component: 'horizons', title: 'Horizons' },
  },
  activeGroup: '1',
};

describe('the workspace grammar', () => {
  it('admits exactly version, grid, panels and activeGroup', () => {
    expect(
      [...WORKSPACE_KEYS],
      'the workspace grammar has changed. It carries furniture only: a fourth kind of key is ' +
        "a second persistence mechanism with none of the manifest's checks (Principle IX).",
    ).toEqual(['version', 'grid', 'panels', 'activeGroup']);
  });

  it('admits exactly id, component and title on a pane', () => {
    expect(
      [...PANE_KEYS],
      "a pane's entry has grown a key. The layout manager offers `params` as a place to hang " +
        'arbitrary state on a panel, and that is exactly the door a seed would come through.',
    ).toEqual(['id', 'component', 'title']);
  });

  /**
   * The planted case's own assertion. `seed` is the one that matters, and it is refused with
   * the reason rather than by an equality failure that says only that a list has changed.
   */
  it('admits no key that names a run rather than a piece of furniture', () => {
    const offenders = [...WORKSPACE_KEYS, ...PANE_KEYS].filter((key) => namesARun(key));
    expect(
      offenders,
      `the workspace grammar carries ${offenders.join(', ')}, which names the run rather than ` +
        'the furniture. A run is a seed and a manifest, and replay is re-computation from the ' +
        'manifest: a stored run would be a second way to bring a forecast back, with no code ' +
        'version, no configuration digest, and no refusal when the tree has moved ' +
        '(constitution Principle IX).',
    ).toEqual([]);
  });

  it('names the words it refuses, so a refusal says why and not only that', () => {
    for (const word of ['seed', 'manifest', 'edits', 'observation']) {
      expect(RUN_WORDS, `${word} is not among the words a refusal recognises`).toContain(word);
    }
    expect(namesARun('rootSeed')).toBe(true);
    expect(namesARun('grid')).toBe(false);
    expect(namesARun('activeGroup')).toBe(false);
  });
});

describe('reading a stored workspace', () => {
  it('restores geometry and pane identity', () => {
    const read = readWorkspace(JSON.stringify(good), context);
    expect(read.refusal).toBeNull();
    expect(read.unhonoured).toEqual([]);
    expect(read.workspace?.panels['controls']).toEqual({
      id: 'controls',
      component: 'controls',
      title: 'Controls',
    });
    expect(read.workspace?.activeGroup).toBe('1');
  });

  /** SC-003, the planted case: a `seed` at the head of the record, refused by name. */
  it('refuses a planted seed by name, and carries nothing of it', () => {
    const planted = { ...good, seed: '6a09e667f3bcc908' };
    const read = readWorkspace(JSON.stringify(planted), context);
    expect(read.unhonoured).toHaveLength(1);
    expect(read.unhonoured[0]).toContain('"seed"');
    expect(read.unhonoured[0]).toContain('Principle IX');
    expect(JSON.stringify(read.workspace)).not.toContain('6a09e667f3bcc908');
  });

  /** The same key one level down, where somebody would put it: beside the pane showing it. */
  it('refuses a planted seed on a pane by name, and carries nothing of it', () => {
    const planted = {
      ...good,
      panels: {
        ...good.panels,
        horizons: { ...good.panels.horizons, params: { seed: '6a09e667f3bcc908' } },
      },
    };
    const read = readWorkspace(JSON.stringify(planted), context);
    expect(read.unhonoured).toHaveLength(1);
    expect(read.unhonoured[0]).toContain('"params"');
    expect(read.unhonoured[0]).toContain('the pane "horizons"');
    expect(JSON.stringify(read.workspace)).not.toContain('6a09e667f3bcc908');
  });

  /** FR-005, scenario 3: a stored layout naming a pane this build has not got. */
  it('refuses a layout naming a pane this build has not got, and says which', () => {
    const stale = { ...good, panels: { ...good.panels, sidebar: { id: 'sidebar' } } };
    const read = readWorkspace(JSON.stringify(stale), context);
    expect(read.workspace).toBeNull();
    expect(read.refusal).toContain('"sidebar"');
    expect(read.refusal).toContain('default arrangement is back');
  });

  it('refuses a layout written against another version, and says both', () => {
    const older = { ...good, version: 0 };
    const read = readWorkspace(JSON.stringify(older), { ...context, layoutVersion: 2 });
    expect(read.workspace).toBeNull();
    expect(read.refusal).toContain('layout version was 0');
    expect(read.refusal).toContain('2');
  });

  it('refuses something that is not an arrangement at all', () => {
    expect(readWorkspace('not json', context).refusal).toContain('not readable as JSON');
    expect(readWorkspace('[]', context).refusal).toContain('not an arrangement');
    expect(readWorkspace(JSON.stringify({ version: 1, panels: {} }), context).refusal).toContain(
      'no geometry',
    );
  });

  it('is silent when there is nothing stored, which is a first visit', () => {
    expect(readWorkspace(null, context)).toEqual({ workspace: null, refusal: null, unhonoured: [] });
    expect(readWorkspace('', context)).toEqual({ workspace: null, refusal: null, unhonoured: [] });
  });
});

describe('writing a workspace', () => {
  /**
   * The write is a **rebuild**, not a filter. A filter has to be told about every key that must
   * not go through, and the key that matters is the one nobody thought of.
   */
  it('carries geometry and pane identity out of a serialisation that carries more', () => {
    const written = writeWorkspace(
      {
        grid: { root: {}, width: 2560 },
        panels: {
          controls: {
            id: 'controls',
            contentComponent: 'controls',
            title: 'Controls',
            // Everything below is what a layout manager may hang on a panel, and what a
            // future version of one might add without asking.
            params: { seed: '6a09e667f3bcc908', edits: [{ kind: 'withhold' }] },
            renderer: 'always',
            minimumWidth: 220,
          },
        },
        activeGroup: '1',
        // A field this repository has never heard of, arriving from upstream.
        someFutureField: { manifest: 'everything about the run' },
      } as never,
      1,
    );
    const serialised = JSON.stringify(written);
    expect(Object.keys(written).sort()).toEqual([...WORKSPACE_KEYS].sort());
    expect(Object.keys(written.panels['controls'] ?? {}).sort()).toEqual([...PANE_KEYS].sort());
    expect(serialised).not.toContain('6a09e667f3bcc908');
    expect(serialised).not.toContain('withhold');
    expect(serialised).not.toContain('someFutureField');
    expect(serialised).not.toContain('manifest');
  });

  it('round-trips through the layout manager\'s own shape without gaining a key', () => {
    const written = writeWorkspace(
      {
        grid: good.grid,
        panels: {
          controls: { id: 'controls', contentComponent: 'controls', title: 'Controls' },
        },
        activeGroup: '1',
      },
      1,
    );
    const back = readWorkspace(JSON.stringify(written), context);
    expect(back.refusal).toBeNull();
    expect(back.unhonoured).toEqual([]);
    const restored = restorable(back.workspace as never);
    expect(Object.keys(restored.panels['controls'] ?? {}).sort()).toEqual([
      'contentComponent',
      'id',
      'title',
    ]);
  });
});

describe('the panes it may name', () => {
  /**
   * One list of panes, not two. `REGIONS` is what the layout draws from and what every panel
   * declaration names; a stored arrangement is checked against the ids the shell actually
   * gave the layout manager, which begin with one of these.
   */
  it('is the panes the layout draws', () => {
    expect([...REGIONS]).toEqual(['controls', 'horizons', 'selection', 'provenance', 'status']);
  });
});
