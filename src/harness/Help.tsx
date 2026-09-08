import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Configuration } from '../config/schema.js';
import { helpFor } from './help/index.js';
import { hasHelp, panelDeclaration } from './panels.js';

/**
 * Help, where the reader asks for it (SRD-v2 FR-52, FR-53, FR-57; spec 016 FR-001 to FR-003,
 * FR-008).
 *
 * A control at the panel's top right, opening in place and closing again. **It does not
 * sequence**: no next, no previous, no step count, and nothing that starts anywhere but where
 * the reader already is. That is the whole difference between this and the walkthrough it
 * replaces, which answered "why is this panel next to that one" in a fixed order beginning
 * wherever it began.
 *
 * Three decisions here are load-bearing.
 *
 * **A panel with nothing to explain renders no control at all.** Not a disabled one and not a
 * placeholder: `PanelHelp` returns `null`, and `panels.json` says why the panel has nothing
 * (FR-053). A stub teaches a reader that the control is not worth pressing, which is worse
 * than its absence.
 *
 * **The explanation is placed rather than laid out.** It is `position: fixed`, anchored to the
 * control that opened it, so opening help cannot change any region's bounding rectangle
 * (SC-005) and cannot grow the page (FR-041). It is capped to the room there is and scrolls
 * within itself, declared with `data-scrolls` like every other scroller on this surface. A
 * disclosure that pushed its panel's neighbours down would be the reshaping FR-047 forbids,
 * arriving through the one control that exists to reassure a confused reader.
 *
 * **Open help belongs to a panel *instance*, and dies with it.** The horizon panels are the
 * case: enlarging a panel unmounts it from the row and mounts it in the enlarged centre, and
 * the help should follow it, while choosing a different horizon in the strip should close it
 * rather than leave an explanation standing over a panel that is no longer there (spec 016
 * US1 scenario 3). So each open-able panel registers its key while it is mounted, and the
 * provider closes any help whose key is no longer registered. Enlarging re-registers the same
 * key in the same commit and the help survives; a strip swap does not, and it does not.
 */

interface HelpState {
  readonly config: Configuration;
  readonly open: string | null;
  readonly toggle: (key: string) => void;
  readonly close: () => void;
  readonly register: (key: string) => () => void;
}

const HelpContext = createContext<HelpState | null>(null);

/** How far the card is kept from the control and from the window's edges. */
const MARGIN_PX = 8;
const CARD_WIDTH_PX = 360;
/** Below this a gap is not worth putting the card in: it would be mostly scrollbar. */
const MIN_CARD_SPACE_PX = 160;

export function HelpProvider({
  config,
  children,
}: {
  readonly config: Configuration;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  /** The panels that are on the surface right now. A ref, so registering renders nothing. */
  const live = useRef<Map<string, number>>(new Map());

  const register = useCallback((key: string) => {
    live.current.set(key, (live.current.get(key) ?? 0) + 1);
    return () => {
      const count = (live.current.get(key) ?? 0) - 1;
      if (count <= 0) live.current.delete(key);
      else live.current.set(key, count);
    };
  }, []);

  /*
   * Deliberately without a dependency list: it has to run after every commit, because what it
   * checks is whether the panel whose help is open is still on the surface. Parent effects run
   * after their children's, so by the time this runs the registrations of a swap have settled
   * -- the old panel's cleanup and the new panel's effect have both happened.
   */
  useEffect(() => {
    if (open !== null && !live.current.has(open)) setOpen(null);
  });

  const value = useMemo<HelpState>(
    () => ({
      config,
      open,
      toggle: (key) => { setOpen((current) => (current === key ? null : key)); },
      close: () => { setOpen(null); },
      register,
    }),
    [config, open, register],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

function useHelp(): HelpState | null {
  return useContext(HelpContext);
}

interface Placement {
  readonly style: CSSProperties;
}

/**
 * Where the card goes: below the control if there is room, else above it, else along the
 * bottom of the window with the room there is.
 *
 * The choice is made from the **space** around the control and the card is then given a
 * matching `max-height`, rather than from the card's own height. Space is known before the
 * card is rendered; the card's height is not, and placing from last render's height leaves it
 * hanging off the window for a frame.
 */
function place(rect: DOMRect): Placement {
  const width = Math.min(CARD_WIDTH_PX, window.innerWidth - 2 * MARGIN_PX);
  const left = Math.max(
    MARGIN_PX,
    Math.min(rect.right - width, window.innerWidth - width - MARGIN_PX),
  );
  const anchored = { left: `${String(left)}px`, width: `${String(width)}px` };

  const below = window.innerHeight - rect.bottom - 2 * MARGIN_PX;
  if (below >= MIN_CARD_SPACE_PX) {
    return {
      style: { ...anchored, top: `${String(rect.bottom + MARGIN_PX)}px`, maxHeight: `${String(below)}px` },
    };
  }
  const above = rect.top - 2 * MARGIN_PX;
  if (above >= MIN_CARD_SPACE_PX) {
    return {
      style: {
        ...anchored,
        bottom: `${String(window.innerHeight - rect.top + MARGIN_PX)}px`,
        maxHeight: `${String(above)}px`,
      },
    };
  }
  return {
    style: {
      ...anchored,
      bottom: `${String(MARGIN_PX)}px`,
      maxHeight: `${String(window.innerHeight - 2 * MARGIN_PX)}px`,
    },
  };
}

export interface PanelHelpProps {
  /** The panel's id in `panels.json`. */
  readonly panel: string;
  /**
   * Which of several panels drawn from one declaration this is -- a horizon panel's lead time.
   * Absent where the panel is drawn once.
   */
  readonly instance?: string;
}

/**
 * The control, and the explanation it opens. Nothing at all where the panel declares nothing.
 */
export function PanelHelp({ panel, instance }: PanelHelpProps) {
  const declaration = panelDeclaration(panel);
  const state = useHelp();
  const key = instance === undefined ? panel : `${panel}#${instance}`;
  const control = useRef<HTMLButtonElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const register = state?.register;
  const isOpen = state?.open === key;
  const shows = hasHelp(declaration) && state !== null;

  useEffect(() => {
    if (!shows || register === undefined) return;
    return register(key);
  }, [shows, register, key]);

  const measure = useCallback(() => {
    const element = control.current;
    if (element === null) return;
    setPlacement(place(element.getBoundingClientRect()));
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPlacement(null);
      return;
    }
    measure();
    const onChange = (): void => { measure(); };
    // Captured, not bubbled: since beat 013 every scroll on this surface is a region's own,
    // and a scroll event fired on a region does not reach the window.
    const options = { capture: true, passive: true } as const;
    window.addEventListener('scroll', onChange, options);
    window.addEventListener('resize', onChange);
    return () => {
      window.removeEventListener('scroll', onChange, options);
      window.removeEventListener('resize', onChange);
    };
  }, [isOpen, measure]);

  // FR-057: the explanation takes focus when it opens, so a reader who asked for it with the
  // keyboard is reading it, and Escape is answered wherever they then are.
  useEffect(() => {
    if (isOpen) card.current?.focus();
  }, [isOpen]);

  const close = state?.close;
  useEffect(() => {
    if (!isOpen || close === undefined) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      close();
      control.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [isOpen, close]);

  if (!shows || state === null) return null;

  const cardId = `help-${key.replace(/[^a-z0-9]+/gi, '-')}`;

  return (
    <>
      <button
        type="button"
        ref={control}
        className="help-control"
        data-testid={`help-control-${key}`}
        aria-expanded={isOpen}
        aria-controls={cardId}
        aria-label={`What ${declaration.heading} is`}
        title={`What ${declaration.heading} is`}
        onClick={(event) => {
          // A control inside a disclosure's summary would otherwise toggle the disclosure as
          // well: opening help is not a request to open the panel it is about.
          event.preventDefault();
          const wasOpen = isOpen;
          state.toggle(key);
          if (wasOpen) control.current?.focus();
        }}
      >
        ?
      </button>

      {isOpen && placement !== null && (
        <div
          id={cardId}
          ref={card}
          className="panel-help"
          data-help={panel}
          data-testid={`help-${key}`}
          data-scrolls="true"
          role="region"
          aria-label={`What ${declaration.heading} is`}
          tabIndex={-1}
          style={placement.style}
        >
          <h4>{declaration.heading}</h4>
          {helpFor(panel).map((explanation) => (
            <section key={explanation.feature} data-feature={explanation.feature}>
              <h5>{explanation.feature}</h5>
              {explanation.body(state.config)}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export interface PanelHeadProps {
  readonly panel: string;
  readonly instance?: string;
  /** `2` for a region's own heading, `3` for a box inside one. Default `3`. */
  readonly level?: 2 | 3;
  /** The heading as drawn, where it is not simply the declared words -- a panel's lead time. */
  readonly children?: ReactNode;
}

/**
 * A panel's head: its heading, and the help control at its top right.
 *
 * The heading text comes from the declaration, so a panel and its entry in the list cannot
 * come to disagree about what the panel is called.
 */
export function PanelHead({ panel, instance, level = 3, children }: PanelHeadProps) {
  const declaration = panelDeclaration(panel);
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className="panel-head" data-panel={panel}>
      <Heading>{children ?? declaration.heading}</Heading>
      <PanelHelp panel={panel} {...(instance === undefined ? {} : { instance })} />
    </div>
  );
}

/** The same, for a panel whose head is a disclosure's summary. */
export function PanelSummary({ panel }: { readonly panel: string }) {
  const declaration = panelDeclaration(panel);
  return (
    <summary data-panel={panel}>
      {declaration.heading}
      <PanelHelp panel={panel} />
    </summary>
  );
}

/**
 * The control alone, for a panel that is a whole region and has no heading line to hang it on.
 *
 * It is placed in the region's top-right corner by the stylesheet rather than in the flow, so
 * that a region which had no head before this beat does not acquire one and change its height
 * -- which would move the regions beneath it, which is what FR-049 forbids.
 */
export function PanelCorner({ panel }: { readonly panel: string }) {
  return (
    <div className="panel-corner" data-panel={panel}>
      <PanelHelp panel={panel} />
    </div>
  );
}
