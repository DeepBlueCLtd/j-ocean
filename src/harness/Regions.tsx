import type { CSSProperties, ReactNode } from 'react';
import type { Configuration } from '../config/schema.js';

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
 */

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

/**
 * A flanking column's width, where configuration has not declared one.
 *
 * Two panels and the gap between them. It is not a round number somebody liked: the detail
 * region has to draw FR-028's profile editor whole, and a column one panel wide clips it --
 * which would leave a reader dragging a point they cannot see the end of. The controls column
 * takes the same width because a column narrower than that turns every button's label into one
 * word per line.
 *
 * Both are built out of `minimumPanelWidthPx` and `panelGapPx`, which are declared. That is a
 * declared figure standing in for a declared figure, and not a literal standing in for one.
 * `controlsWidthPx` and `detailWidthPx` are in the schema and take precedence the moment
 * `config/j-ocean.json` declares them, which is a one-line change and needs no code.
 */
const flankingWidth = (presentation: Configuration['presentation']): number =>
  2 * presentation.minimumPanelWidthPx + presentation.panelGapPx;

/** The declared geometry, handed to the stylesheet (Principle X). */
export function regionGeometry(config: Configuration): CSSProperties {
  const { presentation, horizons } = config;
  const controls = presentation.controlsWidthPx ?? flankingWidth(presentation);
  const detail = presentation.detailWidthPx ?? flankingWidth(presentation);
  return {
    '--horizon-count': String(horizons.leadHours.length),
    '--controls-width': `${String(controls)}px`,
    '--detail-width': `${String(detail)}px`,
    '--panel-minimum-width': `${String(presentation.minimumPanelWidthPx)}px`,
    '--panel-gap': `${String(presentation.panelGapPx)}px`,
    '--page-gutter': `${String(presentation.pageGutterPx)}px`,
  } as CSSProperties;
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
      <section className="region controls" data-testid="region-controls">
        {statement}
        <div className="controls-scroll" data-testid="controls-scroll" data-scrolls="true">
          {controls}
        </div>
      </section>

      {/*
        The centre and the scores are one grid, which is what makes FR-046 structural: the
        scores row is a `subgrid` of these tracks, so a score cannot be under the wrong panel
        without the browser having placed it there.
      */}
      <div className="centre-stack" data-testid="centre-stack" data-scrolls="true">
        <section className="region centre" data-testid="region-centre">
          {centre}
        </section>
        <section className="region scores" data-testid="region-scores">
          {scores}
        </section>
      </div>

      {/* FR-47. Selecting fills this and moves nothing: its width is declared, not fitted. */}
      <section className="region detail" data-testid="region-detail" data-scrolls="true">
        {detail}
      </section>
    </main>
  );
}
