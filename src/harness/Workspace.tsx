import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { createDockview, type DockviewApi, type IContentRenderer } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import type { Configuration } from '../config/schema.js';
import { REGIONS, type RegionId } from './panels.js';
import {
  readWorkspace,
  restorable,
  writeWorkspace,
  type StoredWorkspace,
} from './workspace-state.js';
import type { LongOperation } from './working.js';

/**
 * The workspace (SRD-v2 §8.1, FR-41, FR-44 to FR-48; spec 018 FR-001 to FR-005; ADR-0014).
 *
 * Beats 013 to 017 divided the surface by **what changes when** and realised the division as a
 * CSS grid of four fixed tracks. The division was right and the realisation was not: measured
 * at 2560 x 1440 the controls track was a 1,344 px scroller in a 1,440 px window, about two
 * fifths of the surface was empty, and the horizon panels were 200 px wide while the space
 * they wanted stood beside them. Fixed tracks do not take the room they are given; panes do.
 *
 * So this is the same division in a docking layout manager. Four things about it are
 * load-bearing rather than decorative.
 *
 * **The panes take the space.** There is no track width in this module and none in the
 * stylesheet: the layout manager divides the window between the panes, and a horizon panel is
 * whatever a sixth of the horizons pane is. That is what makes `SC-002` measurable -- a panel
 * is wider at the reference viewport than at the declared minimum, rather than leaving the
 * difference empty.
 *
 * **The status strip is not a pane.** FR-58 says the statement that j-ocean is not an
 * operational forecast system is visible without interaction and is not the thing moved behind
 * a control. A dockview panel can be tabbed behind another, dragged into a corner or closed,
 * and any of those would make the statement conditional. So it is a strip outside the dock,
 * and there is no arrangement a reader can reach in which it is not on screen.
 *
 * **What is stored is furniture.** `workspace-state.ts` is the grammar and the reason; this
 * module is the two places it is used. The arrangement is written on every layout change and
 * read once on mount, and a stored arrangement this build cannot apply is reported rather than
 * half-applied.
 *
 * **Below the declared floor the workspace is still the workspace.** Beat 018's first pass
 * had a second arrangement here -- every pane stacked in one column with a scrollbar down the
 * side -- and it was the page this whole beat exists to kill: 6,584 px of it in a 560 px box
 * on an ordinary 1920 x 900 window. What a small window is short of is **width**, because six
 * panels at their declared minimum need width, so what gives way below the floor is the row
 * and not the layout: the same panes, and the centre forced to one horizon with the strip
 * carrying the other five. `resolveCentreContent` does the forcing and this module does not
 * know it happened.
 */

/** One pane the workspace draws: what it is called, where it belongs, and what is in it. */
export interface PaneDefinition {
  /** The id the layout manager knows it by, and the id a stored arrangement may name. */
  readonly id: string;
  /** Which pane of `REGIONS` this is part of. A tabbed group shares one. */
  readonly pane: RegionId;
  /** The words on the tab. */
  readonly title: string;
  /**
   * Whether filling this pane is announced (FR-057, fourth clause).
   *
   * The selection pane is the one pane that fills as a *consequence* of something the reader
   * did somewhere else, and a reader working by keyboard has no way to know it filled: their
   * focus is still on the cell cursor or the elevation they chose from. So it is announced,
   * politely -- after whatever they are in the middle of hearing -- and nothing takes their
   * focus. Moving focus into the pane would be the surface deciding where the reader should be
   * looking, which is exactly what giving it a pane of its own avoids.
   */
  readonly announces?: boolean;
  readonly content: ReactNode;
}

/**
 * Where a pane goes before a reader moves it (FR-001, Principle X).
 *
 * Expressed as the layout manager's own placement -- beside, below, within -- rather than as
 * coordinates, because coordinates would be a second geometry to keep in step with the first.
 * The sizes come from configuration.
 */
export interface PanePlacement {
  readonly id: string;
  readonly direction?: 'right' | 'below' | 'within';
  readonly referencePanel?: string;
  /**
   * The width this pane opens at, where it is one of the flanking columns.
   *
   * A width the window can afford, not a width it is given whatever the window is. Beat 013's
   * flanking columns were 390 px in every window, which is why its floor was 2 038 px and an
   * ordinary 2 000 px monitor got the fallback. Here the declared widths are shared down
   * proportionally when the window cannot afford them, and never below `minimumWidth`.
   */
  readonly initialWidth?: number;
  /**
   * The share of the workspace's height this pane opens at, where it is stacked under another.
   *
   * A fraction and not a figure in pixels: a declared height would be the same number in a
   * 1 440 px window and an 820 px one, which is the fixed track this beat is replacing turned
   * on its side.
   */
  readonly heightFraction?: number;
  /** What this pane cannot be read below. The layout manager will not shrink it past this. */
  readonly minimumWidth?: number;
}

export interface WorkspaceProps {
  readonly config: Configuration;
  readonly panes: readonly PaneDefinition[];
  readonly placements: readonly PanePlacement[];
  /** The strip along the foot: FR-58's statement and the run's live figures. Never a pane. */
  readonly status: ReactNode;
  /**
   * Which long operation is running, or null (NFR-04).
   *
   * Stamped on the workspace's own element rather than handed to each pane, because the answer
   * is about the surface and not about a pane: an advance, a row being built and a scoring run
   * all block the same main thread, so the pointer says so wherever it is. `working.ts` is the
   * one place that decides; this is the one place it is written down, and it writes the
   * operation's name rather than a flag so that a failing measurement says which.
   */
  readonly working: LongOperation | null;
  /**
   * What to say when a stored arrangement could not be applied (FR-005). The workspace hands
   * the sentence up rather than drawing it, because it belongs beside the control that puts
   * the arrangement back, and that control is in the status strip.
   */
  readonly onRefusal: (refusal: string | null) => void;
  /** Handed the api so the shell can offer "the default arrangement, back" (FR-005). */
  readonly onReady: (reset: () => void) => void;
}

/** The declared geometry, handed to the stylesheet (Principle X). */
export function workspaceGeometry(config: Configuration): CSSProperties {
  const { presentation, horizons } = config;
  return {
    '--horizon-count': String(horizons.leadHours.length),
    '--controls-width': `${String(presentation.controlsWidthPx)}px`,
    '--detail-width': `${String(presentation.detailWidthPx)}px`,
    '--panel-minimum-width': `${String(presentation.minimumPanelWidthPx)}px`,
    '--panel-gap': `${String(presentation.panelGapPx)}px`,
    '--page-gutter': `${String(presentation.pageGutterPx)}px`,
    '--status-height': `${String(presentation.workspace.statusHeightPx)}px`,
    '--sash-width': `${String(presentation.workspace.sashWidthPx)}px`,
    '--pane-minimum-width': `${String(presentation.workspace.paneMinimumWidthPx)}px`,
    '--skill-curve-fraction': String(presentation.workspace.skillCurveFraction),
    /* The walkthrough's mask (spec 018 FR-014). Declared figures, handed to the stylesheet like
       every other dimension of the layout: the dim is a share of the ink and the card's width
       is what its placement is worked out from, so the arithmetic and the rule agree by
       construction rather than by inspection. */
    '--walkthrough-mask-opacity': String(presentation.workspace.walkthroughMaskOpacity),
    '--walkthrough-card-width': `${String(presentation.workspace.walkthroughCardWidthPx)}px`,
    '--walkthrough-card-gap': `${String(presentation.workspace.walkthroughCardGapPx)}px`,
    '--strip-height': `${String(presentation.strip.heightPx)}px`,
    '--strip-thumbnail-width': `${String(presentation.strip.thumbnailWidthPx)}px`,
    '--centre-chrome-height': `${String(presentation.centreChromeHeightPx)}px`,
    '--field-label-height': `${String(presentation.fieldLabelHeightPx)}px`,
  } as CSSProperties;
}

/** Every pane the layout draws, in the order it draws them. Read by tests and by G-08. */
export { REGIONS };

/**
 * Whether this window has the **width** the row needs (FR-043; spec 018 FR-013, US6).
 *
 * A width and not a size, which is the correction beat 018's second pass made. The query asked
 * both axes and the declared height was 960 px -- taller than any browser viewport a reader
 * has -- so 1920 x 900, 1536 x 864 and 2560 x 900 all answered no and got a presentation
 * meant for a small window. What six panels at `minimumPanelWidthPx` are short of in a small
 * window is width; a short window is short of height, and height is not what makes a row of
 * six panels unreadable. It was also measured to be the wrong medicine: forced to an
 * enlargement at 1 658 x 735 the horizons pane overflowed by 970 px, where the row it replaced
 * fitted with the controls pane five pixels over.
 *
 * `presentation.minimumViewportHeightPx` is still declared and still measured -- it is the
 * height below which a pane clips, which is what a floor is -- and it no longer decides what
 * the centre holds.
 *
 * A media query rather than a resize listener, for two reasons. It is answered in **CSS
 * pixels**, so a reader at 200 per cent zoom on a nominally adequate window is below the floor
 * and gets the floor's answer -- which is correct, because they have as few pixels to read six
 * panels in as the reader with a small window. And it fires on the crossing rather than on
 * every pixel of a drag, so crossing the floor swaps the centre without a reload.
 */
export function useRoomForTheRow(config: Configuration | null): boolean {
  const query =
    config === null
      ? null
      : `(min-width: ${String(config.presentation.minimumViewportWidthPx)}px)`;
  const [wide, setWide] = useState(true);

  useLayoutEffect(() => {
    if (query === null) return;
    const media = window.matchMedia(query);
    setWide(media.matches);
    const onChange = (event: MediaQueryListEvent): void => { setWide(event.matches); };
    media.addEventListener('change', onChange);
    return () => { media.removeEventListener('change', onChange); };
  }, [query]);

  return wide;
}

/**
 * The layout manager's theme, expressed in this surface's own custom properties.
 *
 * Declared here rather than by adding one of dockview's shipped theme classes, because those
 * carry a palette of their own and this surface already has one -- and a second palette is a
 * second answer to "what colour is a rule", which is how a figure kind eventually acquires a
 * colour nobody chose.
 */
const THEME = {
  name: 'j-ocean',
  className: 'dockview-theme-j-ocean',
  colorScheme: 'light',
} as const;

/**
 * How many frames the default arrangement will wait for the grid to learn its own width.
 *
 * Bounded rather than open, because a container that never gets a width is a workspace nobody
 * is looking at, and a hidden tab that spins on `requestAnimationFrame` forever is a bug that
 * only shows up on somebody's battery.
 */
const SIZING_FRAME_BUDGET = 120;

/** Everything a reader is offered by way of rearranging, and nothing they are not. */
const OPTIONS = {
  /* A floating or popped-out pane is a second window, and a second window is a second place
     FR-58's statement is not. The workspace docks, and that is all it does. */
  disableFloatingGroups: true,
  hideBorders: false,
  noPanelsOverlay: 'emptyGroup',
} as const;

/**
 * The declared widths, shared down to what this window can afford (Principle X, FR-003).
 *
 * The flanking panes open at their declared widths where there is room for them and at their
 * declared minimums where there is not, in proportion in between. The pane with no declared
 * width -- the horizons pane -- is the one that takes what is left, which is what makes a
 * horizon panel measurably wider at the reference viewport than at the floor.
 *
 * Every pane is also given its minimum as a constraint, so a reader dragging a sash meets the
 * same figure the floor was measured from rather than a different one.
 */
function applySizes(dock: DockviewApi, placements: readonly PanePlacement[]): void {
  const flanking = placements.filter((placement) => placement.initialWidth !== undefined);
  const declaredTotal = flanking.reduce((total, one) => total + (one.initialWidth ?? 0), 0);
  const minimumTotal = flanking.reduce((total, one) => total + (one.minimumWidth ?? 0), 0);
  const reserved = placements
    .filter((placement) => placement.initialWidth === undefined)
    .reduce((total, one) => total + (one.minimumWidth ?? 0), 0);
  const spare = Math.max(minimumTotal, dock.width - reserved);
  const scale = declaredTotal === 0 ? 1 : Math.min(1, spare / declaredTotal);

  for (const placement of placements) {
    const group = dock.getPanel(placement.id)?.api.group;
    if (group === undefined) continue;
    if (placement.minimumWidth !== undefined) {
      group.api.setConstraints({ minimumWidth: placement.minimumWidth });
    }
    if (placement.initialWidth !== undefined) {
      group.api.setSize({
        width: Math.max(
          placement.minimumWidth ?? 0,
          Math.floor(placement.initialWidth * scale),
        ),
      });
    }
    if (placement.heightFraction !== undefined) {
      group.api.setSize({ height: Math.round(dock.height * placement.heightFraction) });
    }
  }
}

export function Workspace(props: WorkspaceProps) {
  const { config, panes, placements } = props;
  const host = useRef<HTMLDivElement | null>(null);
  const api = useRef<DockviewApi | null>(null);
  /** Where each pane's content is mounted: one element per pane, made by the layout manager. */
  const [mounts, setMounts] = useState<ReadonlyMap<string, HTMLElement>>(new Map());
  /**
   * Which panes are open right now (spec 018, second edge case).
   *
   * A reader may close a pane, and nothing computed is lost by closing one -- the run is where
   * it was and the pane is furniture. What the surface owes them is the pane back **by name**,
   * so a closed pane becomes a control in the status strip rather than a rectangle they have to
   * know the incantation to restore.
   */
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const storageKey = config.presentation.workspace.storageKey;
  const layoutVersion = config.presentation.workspace.layoutVersion;

  /** The panes this build has, which is what a stored arrangement is checked against. */
  const paneIds = new Set(panes.map((pane) => pane.id));
  const paneIdsRef = useRef(paneIds);
  paneIdsRef.current = paneIds;
  const placementsRef = useRef(placements);
  placementsRef.current = placements;
  const titles = new Map(panes.map((pane) => [pane.id, pane.title]));
  const titlesRef = useRef(titles);
  titlesRef.current = titles;
  /**
   * Which pane of `REGIONS` each panel belongs to, so the element the layout manager makes
   * carries the same class the below-the-floor presentation gives it.
   *
   * One stylesheet for both presentations, and that is the requirement rather than a tidiness:
   * a rule written for `.selection` that applied below the floor and not in the workspace is
   * two surfaces, and the one nobody looks at is the one that breaks.
   */
  const kinds = new Map(panes.map((pane) => [pane.id, pane.pane]));
  const kindsRef = useRef(kinds);
  kindsRef.current = kinds;
  const announced = new Set(panes.filter((pane) => pane.announces === true).map((pane) => pane.id));
  const announcedRef = useRef(announced);
  announcedRef.current = announced;

  /** Animation frames the default arrangement asked for, cancelled with the workspace. */
  const frames = useRef<Set<number>>(new Set()).current;


  /** The default arrangement, built from the declared placements and nothing else. */
  const applyDefault = useCallback((dock: DockviewApi, container: HTMLElement): void => {
    dock.clear();
    for (const placement of placementsRef.current) {
      dock.addPanel({
        id: placement.id,
        component: placement.id,
        title: titlesRef.current.get(placement.id) ?? placement.id,
        ...(placement.initialWidth === undefined ? {} : { initialWidth: placement.initialWidth }),
        ...(placement.referencePanel === undefined
          ? {}
          : {
              position: {
                referencePanel: placement.referencePanel,
                direction: placement.direction ?? 'right',
              },
            }),
      });
    }
    /* The first tab of a tabbed group, so a reader meets the run rather than whichever panel
       happened to be added last: a panel is added active, so activating the first again after
       the rest have arrived is what puts the group back on its first tab. */
    for (const placement of placementsRef.current) {
      if (placement.direction === 'within') continue;
      dock.getPanel(placement.id)?.api.setActive();
    }

    /*
     * The declared sizes, applied once the grid knows how wide it is (Principle X).
     *
     * Two things had to be worked around, and both are worth writing down because both look
     * like the code working. `addPanel`'s own `initialWidth` is a hint: three panes added in a
     * row came out as equal thirds whatever it said, which is a geometry nothing declared and
     * which left the horizons pane a third of the window with the controls pane holding the
     * rest empty. And the layout manager measures its container asynchronously, so a size set
     * in the same frame as the panes is set against a container it believes is 100 px wide,
     * and is then thrown away by the first real layout.
     *
     * So the sizes are applied on the first frame at which the grid's own width is the
     * window's. The wait is bounded: a container that never gets a width is a workspace that
     * was never displayed, and spinning on it forever would be a busy loop in a hidden tab.
     */
    let attempts = 0;
    const arm = (): void => {
      /* "Has the grid measured its container yet" asked exactly: the layout manager reports
         100 px until its observer has run, and the host element's own width is the answer it
         will eventually reach. */
      if (dock.width > 0 && dock.width >= container.clientWidth - 1) {
        applySizes(dock, placementsRef.current);
        return;
      }
      attempts += 1;
      if (attempts > SIZING_FRAME_BUDGET) return;
      frames.add(requestAnimationFrame(arm));
    };
    frames.add(requestAnimationFrame(arm));
  }, [frames]);

  /*
   * The two callbacks the shell hands down, held in refs.
   *
   * Not in the effect's dependency list, and that is the requirement rather than a
   * convenience: the shell rebuilds these on every render, so an effect that depended on them
   * would tear the workspace down and build it again on every keystroke -- and a reader's
   * arrangement is exactly what that would throw away.
   */
  const onRefusalRef = useRef(props.onRefusal);
  onRefusalRef.current = props.onRefusal;
  const onReadyRef = useRef(props.onReady);
  onReadyRef.current = props.onReady;

  const reset = useCallback((): void => {
    const dock = api.current;
    const container = host.current;
    if (dock === null || container === null) return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* A browser that refuses storage refuses it in both directions; the arrangement is
         still put back, which is what the reader asked for. */
    }
    applyDefault(dock, container);
    onRefusalRef.current(null);
  }, [applyDefault, storageKey]);

  useEffect(() => {
    const element = host.current;
    if (element === null) return;

    const live = new Map<string, HTMLElement>();
    const dock = createDockview(element, {
      ...OPTIONS,
      theme: { ...THEME },
      createComponent: (options): IContentRenderer => {
        const content = document.createElement('div');
        content.className = `pane-content ${kindsRef.current.get(options.id) ?? ''}`.trim();
        content.dataset['testid'] = `pane-${options.id}`;
        content.dataset['paneId'] = options.id;
        if (announcedRef.current.has(options.id)) {
          content.setAttribute('aria-live', 'polite');
          content.setAttribute('aria-atomic', 'false');
        }
        live.set(options.id, content);
        // Committed in an effect of its own below rather than during this call: the layout
        // manager builds every pane in one pass, and one commit per pane would mount the
        // React trees into elements the manager is still arranging.
        queueMicrotask(() => { setMounts(new Map(live)); });
        return {
          element: content,
          init: () => undefined,
          dispose: () => {
            live.delete(options.id);
            queueMicrotask(() => { setMounts(new Map(live)); });
          },
        };
      },
    });
    api.current = dock;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    const read = readWorkspace(stored, { paneIds: paneIdsRef.current, layoutVersion });
    let applied = false;
    if (read.workspace !== null) {
      try {
        dock.fromJSON(restorable(read.workspace) as never);
        applied = true;
      } catch (error) {
        onRefusalRef.current(
          'The stored workspace could not be applied, so the default arrangement is back. In ' +
            `the layout manager's own words: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else if (read.refusal !== null) {
      onRefusalRef.current(read.refusal);
    }
    if (read.unhonoured.length > 0) onRefusalRef.current(read.unhonoured.join(' '));
    if (!applied) applyDefault(dock, element);

    /* Written on every layout change: a reader who dragged a sash and closed the tab has
       arranged their workspace, and asking them to press something to keep it would be a
       preference they had to remember to save. */
    const track = (): void => {
      setOpen(new Set(dock.panels.map((panel) => panel.id)));
    };
    track();
    const added = dock.onDidAddPanel(track);
    const removed = dock.onDidRemovePanel(track);

    const write = dock.onDidLayoutChange(() => {
      try {
        const record: StoredWorkspace = writeWorkspace(
          dock.toJSON() as unknown as Record<string, unknown>,
          layoutVersion,
        );
        window.localStorage.setItem(storageKey, JSON.stringify(record));
      } catch {
        /* A browser with storage refused arranges its workspace for this visit alone, which
           is the behaviour every visit had before this beat. */
      }
    });

    onReadyRef.current(reset);

    return () => {
      for (const frame of frames) cancelAnimationFrame(frame);
      frames.clear();
      added.dispose();
      removed.dispose();
      write.dispose();
      dock.dispose();
      api.current = null;
      setMounts(new Map());
    };
    /*
     * Built once, and the dependency list says so on purpose. The panes' *contents* are React
     * children rendered through portals, so a change to what a pane holds does not rebuild the
     * workspace -- which is what makes a reader's arrangement survive the run being rebuilt
     * underneath it. Everything this effect reads that can change is read through a ref.
     */
  }, [storageKey, layoutVersion, applyDefault, reset, frames]);

  return (
    <main
      className="one-view workspace"
      data-testid="one-view"
      data-presentation="workspace"
      data-working={props.working ?? 'false'}
      style={workspaceGeometry(config)}
    >
      <div className="workspace-dock" data-testid="workspace-dock" ref={host} />
      {panes.map((pane) => {
        const mount = mounts.get(pane.id);
        return mount === undefined ? null : createPortal(pane.content, mount, pane.id);
      })}
      <section className="pane status" data-testid="pane-status" data-pane-id="status">
        {props.status}
        {/* A pane a reader closed, offered back by name. Nothing computed went with it. */}
        {panes.some((pane) => !open.has(pane.id)) && (
          <div className="pane-offers" data-testid="pane-offers">
            {panes
              .filter((pane) => !open.has(pane.id))
              .map((pane) => (
                <button
                  key={pane.id}
                  type="button"
                  data-testid={`open-pane-${pane.id}`}
                  onClick={() => {
                    api.current?.addPanel({ id: pane.id, component: pane.id, title: pane.title });
                  }}
                >
                  Open {pane.title}
                </button>
              ))}
          </div>
        )}
      </section>
    </main>
  );
}
