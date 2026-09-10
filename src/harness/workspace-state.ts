import { REGIONS } from './panels.js';

/**
 * What the workspace remembers between visits (SRD-v2 §8.1; spec 018 FR-004, FR-005, SC-003;
 * ADR-0014; constitution Principle IX, amendment of 8 September 2026).
 *
 * **The line this module may not cross.** Principle IX forbids a forecast input or output
 * persisting between visits: no seed, no manifest, no edit, no observation, no computed
 * quantity, in storage, in a cookie or in the URL. A run is a seed and a manifest, and replay
 * is re-computation from a manifest, never restoration from a snapshot -- a stored run would
 * be a second way to bring a forecast back with none of the manifest's checks, no code
 * version, no configuration digest, no refusal when the tree has moved.
 *
 * A stored pane width is not that. It is a preference about furniture, and the constitution
 * now says so in as many words rather than leaving it to be inferred -- because a reader of
 * Principle IX could reasonably have inferred the opposite, and one did.
 *
 * **So the grammar is a key set, and nothing else gets in.** `WORKSPACE_KEYS` is the whole of
 * what a stored workspace may carry, `PANE_KEYS` is the whole of what one pane's entry may
 * carry, and `readWorkspace` **rebuilds** what it reads rather than passing it through: an
 * unknown key is dropped and named, never carried along because nothing happened to look at
 * it. This is deliberately the shape of `address.ts`: the two mechanisms that could smuggle a
 * run out of a session are guarded the same way, and `tests/harness/workspace-state.test.ts`
 * plants a `seed` in each of the three places one could arrive and watches it refused by name.
 *
 * **A stored arrangement is applied whole or not at all.** A layout naming a pane this build
 * has not got, or written against another `layoutVersion`, is reported and the default is
 * restored (FR-005). A layout that half-applies leaves a reader with a blank rectangle and no
 * account of why, which is worse than the arrangement they lost.
 */

/**
 * The whole grammar of a stored workspace. Three keys, and no others.
 *
 * `grid` is the layout manager's own geometry -- the tree of splits and their sizes. `panels`
 * is pane identity: which pane is where, by the id this build gave it. `activeGroup` is which
 * group had the focus, which is a fact about furniture like the rest.
 */
export const WORKSPACE_KEYS = ['version', 'grid', 'panels', 'activeGroup'] as const;

export type WorkspaceKey = (typeof WORKSPACE_KEYS)[number];

/**
 * The whole grammar of one pane's entry.
 *
 * `params` is deliberately absent. The layout manager offers it as a place to hang arbitrary
 * state on a panel, and it is exactly the door a seed would come through: somebody stores the
 * run beside the pane that is showing it, and the store is a run again. Panes here carry no
 * parameters, so an entry that has some is one this surface did not write.
 */
export const PANE_KEYS = ['id', 'component', 'title'] as const;

export type PaneKey = (typeof PANE_KEYS)[number];

/**
 * Words that name a forecast rather than a piece of furniture.
 *
 * Not an exhaustive list of everything forbidden -- the exact-set assertions are that -- but
 * the ones somebody would reach for, so that a refusal says *why* a key is refused rather than
 * only that a set has changed.
 */
export const RUN_WORDS: readonly string[] = [
  'seed',
  'manifest',
  'run',
  'edit',
  'edits',
  'counterfactual',
  'observation',
  'state',
  'digest',
  'field',
  'score',
  'analysis',
  'issue',
  'step',
  'steps',
];

/** One pane, as it is stored: which pane it is and what it is called. Never what it holds. */
export interface StoredPane {
  readonly id: string;
  readonly component: string;
  readonly title: string;
}

/** A stored arrangement: geometry and pane identity, and nothing else. */
export interface StoredWorkspace {
  readonly version: number;
  /** The layout manager's own tree of splits and sizes. Opaque here, and checked below. */
  readonly grid: unknown;
  readonly panels: Readonly<Record<string, StoredPane>>;
  readonly activeGroup?: string;
}

export interface ReadWorkspace {
  /** The arrangement, or null where there was none or it could not be applied. */
  readonly workspace: StoredWorkspace | null;
  /**
   * Why it could not be applied, said in full, or null. The surface prints this: FR-005 says
   * an unusable stored layout is **reported** and the default restored, because a workspace
   * that silently reverted would teach a reader that arranging it is not worth doing.
   */
  readonly refusal: string | null;
  /**
   * Every key the stored object carried that this grammar does not admit, each said by name.
   *
   * They are dropped rather than obeyed, and named rather than swallowed. A stored `seed`
   * would be Principle IX's prohibition arriving through the one door this beat opened, and
   * the honest response to finding one is to say so.
   */
  readonly unhonoured: readonly string[];
}

/** Whether a key names a run rather than furniture, for the reason given in a refusal. */
export function namesARun(key: string): boolean {
  const lower = key.toLowerCase();
  return RUN_WORDS.some((word) => lower === word || lower.includes(word));
}

const refusalFor = (key: string, where: string): string =>
  `The stored workspace carried "${key}" ${where}, which is not part of a workspace: an ` +
  `arrangement is geometry and pane identity — ${WORKSPACE_KEYS.join(', ')} — and never the ` +
  'run. A run travels as a manifest, and replay is re-computation from it rather than ' +
  'restoration from storage (constitution Principle IX).';

/**
 * The panes this build has. A stored arrangement naming another is not applied.
 *
 * Taken as an argument rather than read from a list here, because what panes exist is the
 * layout's business and a second list would be the first thing to drift.
 */
export interface WorkspaceContext {
  readonly paneIds: ReadonlySet<string>;
  readonly layoutVersion: number;
}

/**
 * A stored workspace, read from whatever was in storage. Reads; never writes.
 *
 * Everything the grammar does not admit is dropped and named. Nothing is guessed at: a layout
 * naming a pane this build has not got is refused whole rather than applied with a hole in it,
 * because a blank rectangle where a pane should be is the surface pretending the arrangement
 * worked.
 */
export function readWorkspace(raw: string | null, context: WorkspaceContext): ReadWorkspace {
  if (raw === null || raw.trim() === '') {
    return { workspace: null, refusal: null, unhonoured: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      workspace: null,
      refusal:
        'The stored workspace was not readable as JSON, so the default arrangement is back. ' +
        'Nothing about the run was stored there or is affected by it.',
      unhonoured: [],
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      workspace: null,
      refusal: 'The stored workspace was not an arrangement, so the default arrangement is back.',
      unhonoured: [],
    };
  }

  const source = parsed as Record<string, unknown>;
  const unhonoured: string[] = [];
  for (const key of Object.keys(source)) {
    if (!(WORKSPACE_KEYS as readonly string[]).includes(key)) unhonoured.push(refusalFor(key, 'at its head'));
  }

  const version = source['version'];
  if (typeof version !== 'number' || version !== context.layoutVersion) {
    return {
      workspace: null,
      refusal:
        `The stored workspace was arranged by a build whose layout version was ` +
        `${String(version ?? 'not recorded')}, and this build's is ` +
        `${String(context.layoutVersion)}. It was not applied and the default arrangement is ` +
        'back: an arrangement that half-applies leaves a reader with a rectangle and no ' +
        'account of why.',
      unhonoured,
    };
  }

  const grid = source['grid'];
  if (typeof grid !== 'object' || grid === null) {
    return {
      workspace: null,
      refusal: 'The stored workspace carried no geometry, so the default arrangement is back.',
      unhonoured,
    };
  }

  const storedPanels = source['panels'];
  if (typeof storedPanels !== 'object' || storedPanels === null || Array.isArray(storedPanels)) {
    return {
      workspace: null,
      refusal: 'The stored workspace named no panes, so the default arrangement is back.',
      unhonoured,
    };
  }

  const panels: Record<string, StoredPane> = {};
  for (const [id, value] of Object.entries(storedPanels as Record<string, unknown>)) {
    if (!context.paneIds.has(id)) {
      return {
        workspace: null,
        refusal:
          `The stored workspace names the pane "${id}", which this build has not got. It was ` +
          'not applied and the default arrangement is back — a pane drawn for something ' +
          'nothing renders would be a blank rectangle with no account of itself.',
        unhonoured,
      };
    }
    if (typeof value !== 'object' || value === null) {
      return {
        workspace: null,
        refusal: `The stored workspace's entry for "${id}" was not a pane, so the default arrangement is back.`,
        unhonoured,
      };
    }
    const entry = value as Record<string, unknown>;
    for (const key of Object.keys(entry)) {
      if (!(PANE_KEYS as readonly string[]).includes(key)) {
        unhonoured.push(refusalFor(key, `on the pane "${id}"`));
      }
    }
    panels[id] = {
      id,
      component: typeof entry['component'] === 'string' ? (entry['component'] as string) : id,
      title: typeof entry['title'] === 'string' ? (entry['title'] as string) : id,
    };
  }

  if (Object.keys(panels).length === 0) {
    return {
      workspace: null,
      refusal: 'The stored workspace named no panes, so the default arrangement is back.',
      unhonoured,
    };
  }

  const active = source['activeGroup'];
  return {
    workspace: {
      version: context.layoutVersion,
      grid,
      panels,
      ...(typeof active === 'string' ? { activeGroup: active } : {}),
    },
    refusal: null,
    unhonoured,
  };
}

/**
 * What is written, built from what the layout manager reports.
 *
 * It **rebuilds** rather than filtering. A filter has to be told about every key that must not
 * go through, and the key that matters is the one nobody thought of; a rebuild carries only
 * what it was written to carry, so a new field in the layout manager's own serialisation
 * cannot arrive in storage by default.
 */
export function writeWorkspace(
  serialised: { readonly grid?: unknown; readonly panels?: unknown; readonly activeGroup?: unknown },
  layoutVersion: number,
): StoredWorkspace {
  const panels: Record<string, StoredPane> = {};
  const source = (serialised.panels ?? {}) as Record<string, unknown>;
  for (const [id, value] of Object.entries(source)) {
    const entry = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
    panels[id] = {
      id,
      component: typeof entry['contentComponent'] === 'string' ? (entry['contentComponent'] as string) : id,
      title: typeof entry['title'] === 'string' ? (entry['title'] as string) : id,
    };
  }
  return {
    version: layoutVersion,
    grid: serialised.grid ?? {},
    panels,
    ...(typeof serialised.activeGroup === 'string' ? { activeGroup: serialised.activeGroup } : {}),
  };
}

/**
 * The shape the layout manager is handed back: the stored panes, with the component name it
 * needs to render each. Nothing is invented here that was not stored.
 */
export function restorable(workspace: StoredWorkspace): {
  grid: unknown;
  panels: Record<string, { id: string; contentComponent: string; title: string }>;
  activeGroup?: string;
} {
  const panels: Record<string, { id: string; contentComponent: string; title: string }> = {};
  for (const pane of Object.values(workspace.panels)) {
    panels[pane.id] = { id: pane.id, contentComponent: pane.component, title: pane.title };
  }
  return {
    grid: workspace.grid,
    panels,
    ...(workspace.activeGroup === undefined ? {} : { activeGroup: workspace.activeGroup }),
  };
}

/** The panes of the workspace, as the surface names them. Read by the tests and by G-08. */
export { REGIONS };
