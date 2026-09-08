import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Configuration } from '../config/schema.js';
import { REGIONS, type RegionId } from './panels.js';

/**
 * The four regions (SRD-v2 FR-41, FR-44 to FR-48; ADR-0012).
 *
 * One viewport, divided by **what changes when**: the causes on the left, the payload in the
 * centre, the consequences directly beneath their own panels, and the thing being inspected on
 * the right. Not divided by subject, which is what produced six vertical screens and the
 * clumsiness this beat exists to remove.
 *
 * Two properties of this module are load-bearing rather than decorative.
 *
 * **The centre's column count is the declared horizon count.** It is handed to the stylesheet
 * as `--horizon-count`, so a configuration with five or seven horizons lays out with no change
 * here (FR-012, Principle X). The scores region is a `subgrid` of the same tracks, so a score
 * is in its panel's column *structurally* -- there is no arrangement to drift.
 *
 * **The page does not scroll; a region may scroll within itself, and says so.** A region that
 * can outgrow its box carries `data-scrolls="true"`, and `tests/shell/one-view.spec.ts` fails
 * by name on any element that scrolls without declaring it. An accidental scrollbar is the
 * failure this beat exists to prevent, so it is not left to inspection.
 *
 * Every width below arrives from `presentation` in configuration as a custom property. Nothing
 * about the geometry is a literal here or in `index.css`; the fallbacks in the stylesheet exist
 * only so it reads on its own.
 *
 * **The four regions are named in one place.** Beat 016 moved the list to `panels.ts`, because
 * every panel declares which region it is in and a second list of regions would be the first
 * thing to drift. `RegionSection` takes a `RegionId`, so a section for a region nothing
 * declares does not compile, and the class and the test id are derived from the name rather
 * than written beside it.
 */

/**
 * One of the four regions. There is no way to draw a fifth: the type admits only the names in
 * `REGIONS`, and both presentations below build their sections from it.
 */
function RegionSection({
  id,
  scrolls,
  children,
}: {
  readonly id: RegionId;
  readonly scrolls?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section
      className={`region ${id}`}
      data-testid={`region-${id}`}
      {...(scrolls === true ? { 'data-scrolls': 'true' } : {})}
    >
      {children}
    </section>
  );
}

/** Every region the layout draws, in the order it draws them. Read by tests and by G-08. */
export { REGIONS };

export interface RegionsProps {
  readonly config: Configuration;
  /**
   * FR-02, carried: what j-ocean is not. It is the first thing in the controls column and it
   * is outside the column's scroller, so it is on screen without a reader doing anything --
   * "always visible" is a claim about geometry, and a statement that can be scrolled away is
   * not one.
   */
  readonly statement: ReactNode;
  /** Every control that drives the whole system, and the run's provenance behind it (FR-44). */
  readonly controls: ReactNode;
  /** The horizon row, or -- before it is built -- what it will show and what it costs (FR-45). */
  readonly centre: ReactNode;
  /** Each panel's skill figures, in that panel's own column (FR-46). */
  readonly scores: ReactNode;
  /** Whatever was last selected (FR-47). */
  readonly detail: ReactNode;
}

/** The declared geometry, handed to the stylesheet (Principle X). */
export function regionGeometry(config: Configuration): CSSProperties {
  const { presentation, horizons } = config;
  return {
    '--horizon-count': String(horizons.leadHours.length),
    '--controls-width': `${String(presentation.controlsWidthPx)}px`,
    '--detail-width': `${String(presentation.detailWidthPx)}px`,
    '--panel-minimum-width': `${String(presentation.minimumPanelWidthPx)}px`,
    '--panel-gap': `${String(presentation.panelGapPx)}px`,
    '--page-gutter': `${String(presentation.pageGutterPx)}px`,
    /* Beat 015. The strip's geometry, and what the centre costs beyond a panel's field: the
       stylesheet works the centre's height out from these and from the track count, so that
       enlarging cannot change the box the scores sit under (FR-049, AT-13). */
    '--strip-height': `${String(presentation.strip.heightPx)}px`,
    '--strip-thumbnail-width': `${String(presentation.strip.thumbnailWidthPx)}px`,
    '--centre-chrome-height': `${String(presentation.centreChromeHeightPx)}px`,
  } as CSSProperties;
}

/**
 * Whether this window is at or above the declared floor (FR-009, FR-043, US7 scenario 3).
 *
 * A media query rather than a resize listener, for two reasons. It is answered in **CSS
 * pixels**, so a reader at 200 per cent zoom on a nominally adequate window is below the
 * floor and gets the floor's answer -- which is correct, because they have as few pixels to
 * read six panels in as the reader with a small window. And it fires on the crossing rather
 * than on every pixel of a drag, so crossing the floor swaps the presentation without a
 * reload and without the surface being rebuilt on the way.
 */
export function useAboveFloor(config: Configuration | null): boolean {
  const query =
    config === null
      ? null
      : `(min-width: ${String(config.presentation.minimumViewportWidthPx)}px) and ` +
        `(min-height: ${String(config.presentation.minimumViewportHeightPx)}px)`;
  const [above, setAbove] = useState(true);

  // A layout effect rather than an ordinary one: the query only becomes answerable in the
  // commit where the configuration arrives, and an ordinary effect would let the browser
  // paint the four regions into a window that cannot hold them before correcting itself.
  useLayoutEffect(() => {
    if (query === null) return;
    const media = window.matchMedia(query);
    setAbove(media.matches);
    const onChange = (event: MediaQueryListEvent): void => { setAbove(event.matches); };
    media.addEventListener('change', onChange);
    return () => { media.removeEventListener('change', onChange); };
  }, [query]);

  return above;
}

export function Regions({ config, statement, controls, centre, scores, detail }: RegionsProps) {
  return (
    <main className="one-view" data-testid="one-view" style={regionGeometry(config)}>
      {/*
        FR-44. Every cause in one place, so the thing just changed is never hunted for. The
        column's contents scroll within themselves because the run's provenance sits behind
        disclosures beneath the controls and a reader who opens all of them has asked for more
        than a column holds. The statement above the scroller does not move when they do.
      */}
      <RegionSection id="controls">
        {statement}
        <div className="controls-scroll" data-testid="controls-scroll" data-scrolls="true">
          {controls}
        </div>
      </RegionSection>

      {/*
        The centre and the scores are one grid, which is what makes FR-046 structural: the
        scores row is a `subgrid` of these tracks, so a score cannot be under the wrong panel
        without the browser having placed it there.
      */}
      <div className="centre-stack" data-testid="centre-stack" data-scrolls="true">
        <RegionSection id="centre">{centre}</RegionSection>
        <RegionSection id="scores">{scores}</RegionSection>
      </div>

      {/* FR-47. Selecting fills this and moves nothing: its width is declared, not fitted. */}
      <RegionSection id="detail" scrolls>
        {detail}
      </RegionSection>
    </main>
  );
}

export interface BelowFloorProps {
  readonly config: Configuration;
  readonly statement: ReactNode;
  /**
   * The size the application needs (FR-009, FR-043). Built by the shell, because that size is
   * a **declared** figure and the figure kinds live with the shell; this module places it and
   * does not phrase it.
   */
  readonly notice: ReactNode;
  /**
   * The same centre the four regions get, and that is beat 015's point: below the floor the
   * union is forced to an enlargement rather than laid out again here.
   */
  readonly centre: ReactNode;
  /** Every declared horizon's skill figures, as above the floor: one implementation. */
  readonly scores: ReactNode;
  readonly detail: ReactNode;
  readonly controls: ReactNode;
}

/**
 * The answer below the declared floor (FR-009, FR-043, US7).
 *
 * Three regions side by side need the two declared column widths and every declared horizon
 * at the declared minimum. A window that has not got them invites two obvious answers --
 * shrink the panels past legibility, or scroll the row -- and both are the fault the row
 * exists to prevent (ADR-0003). So this is the third: **say the size, and show one panel at a
 * time.**
 *
 * The four named regions are all still here and still named, in one column. What changes is
 * their arrangement and what the centre carries -- not what exists, and not what is computed.
 * The statement of FR-02 and the required size stay out of the scroller, because a statement
 * a reader has to scroll to find is not one the surface is making.
 */
export function BelowFloor(props: BelowFloorProps) {
  return (
    <main
      className="one-view below-floor"
      data-testid="one-view"
      data-presentation="single-panel"
      style={regionGeometry(props.config)}
    >
      <section className="region floor-answer" data-testid="region-floor">
        {props.statement}
        {props.notice}
      </section>

      <div className="below-floor-body" data-testid="below-floor-body" data-scrolls="true">
        <RegionSection id="centre">{props.centre}</RegionSection>
        <RegionSection id="scores">{props.scores}</RegionSection>
        <RegionSection id="detail">{props.detail}</RegionSection>
        {/*
          Last rather than first, and that is the one thing this arrangement gives up: above
          the floor the causes are the first column a reader meets. Below it the payload has
          to come first, because a reader who has been told the window is too small needs to
          see what they are being offered instead before they are offered controls for it.
        */}
        <RegionSection id="controls">{props.controls}</RegionSection>
      </div>
    </main>
  );
}
