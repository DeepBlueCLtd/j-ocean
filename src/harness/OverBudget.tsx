import { useEffect, useRef, type RefObject } from 'react';
import type { Configuration } from '../config/schema.js';
import { ADVANCE_HOURS, stepsPerAdvance } from './advance.js';
import { Computed, Declared, HostTime } from './figures.js';
import { workspaceGeometry } from './Workspace.js';

/**
 * The over-budget decision, as a modal dialog (FR-008; spec 018 FR-016, US3).
 *
 * ## What was wrong with it being a notice in a pane
 *
 * It was a `.banner.warn` at the foot of the controls pane, and the author reported it: *"the
 * popup showed within the 'Controls' pane, but it's too tall for me to see the 'Integrate
 * anyway' button."* The arithmetic behind that is the whole argument for this file. The
 * notice's **height** scales with the reader's declared font and the pane's **width** does
 * not, so its paragraph wraps to more and more lines in a column that is getting shorter at
 * the same time. Measured at 950 x 875 with a 310 px controls pane, the room under `Integrate
 * anyway` was 347 px at a 16 px root font, 225 px at 20 px, 39 px at 24 px, and gone at 28 px
 * -- where the control was painted 183 px below the foot of the pane, behind an ancestor with
 * `overflow: hidden` and therefore with no scrollbar anywhere to reach it.
 *
 * A previous pass measured this and **recorded it as a finding**. Recording is the right
 * posture for a numeric question under FR-40 and the wrong one for a control a reader cannot
 * reach: it should have been fixed then.
 *
 * ## Why a native dialog
 *
 * `showModal()` gives the top layer, focus containment and Escape from the platform. Every one
 * of those hand-rolled is a second implementation of something the browser already does
 * correctly, and the two would drift. Being in the top layer is also what makes the claim in
 * the requirement true by construction rather than by inspection: the dialog is laid out
 * against the **viewport**, so no pane's width or height decides what a reader can see of it,
 * and no pane moves when it opens.
 *
 * ## What it says, and what it no longer says
 *
 * It is a decision prompt, so it leads with the figures the decision is between and then with
 * the two things a reader may do. The three sentences that explained the frame budget -- what
 * the chunk it measured counts toward, and that the page is saying so rather than freezing --
 * are an explanation and not a decision, so under FR-007 they are in the help for the
 * `controls/run` panel, and `docs/narrative-disposition.json` records where they went.
 *
 * ## The figure it printed was not about the control that opened it
 *
 * Until beat 018's ninth pass this said one projected figure, under the heading of a press of
 * *Integrate 12 hours*, and that figure was `projectedHorizonMs`: the **longest declared
 * horizon**, 96 h and 1 440 steps. The advance is 180 steps. So the notice answered a question
 * about the row's integration while a reader read it as the cost of the button they had just
 * pressed -- eight times over, with the reader's own report saying so: *"it happens a lot
 * quicker than the dialog warned."* A figure presented as being about something it is not about
 * is the Principle V fault, and it is a fault of **attribution** rather than of arithmetic.
 *
 * The check is unchanged, and must be: NFR-04 gauges the machine against the worst case and
 * FR-008 says a run whose projected time *for the longest declared horizon* exceeds the budget
 * says so. What changed is that both costs are now printed, each named for the work it is the
 * cost of -- this advance, and the row -- with the declared budget beneath them. Three figures
 * and two buttons is still a decision; naming which of them the surface stopped on is what
 * makes it one a reader can take.
 *
 * ## Escape declines
 *
 * Declining integrates nothing beyond the chunk already measured and counted, which is exactly
 * what not proceeding has always meant here; and focus goes back to the control that opened
 * this, because a reader who arrived by keyboard must not be left at the top of the document.
 * A click on the backdrop does the same, for the reader who has reached for the mouse -- the
 * walkthrough's scrim closes that way for the same reason.
 *
 * Nothing here animates, in any media state. This surface animates nothing anywhere, so
 * `prefers-reduced-motion` has nothing to ask of it.
 */
export interface OverBudgetProps {
  readonly config: Configuration;
  /** What the advance the reader pressed is projected to cost, in host milliseconds. */
  readonly advanceMs: number;
  /**
   * What the longest declared horizon is projected to cost, in host milliseconds: the figure
   * FR-008 holds against the budget, and what building the horizon row would cost.
   */
  readonly rowMs: number;
  /** Integrate the rest of the advance anyway. */
  readonly onProceed: () => void;
  /** Integrate nothing beyond the chunk already measured. */
  readonly onDecline: () => void;
  /** The control this was opened from, which is where focus goes when it closes. */
  readonly returnFocusTo: RefObject<HTMLButtonElement | null>;
}

export function OverBudget({
  config,
  advanceMs,
  rowMs,
  onProceed,
  onDecline,
  returnFocusTo,
}: OverBudgetProps) {
  const dialog = useRef<HTMLDialogElement | null>(null);

  /*
   * Opened as a modal rather than rendered open. `open` as an attribute is a dialog in the
   * flow of the page -- no top layer, no backdrop, no focus containment and no Escape -- which
   * is the notice this replaces wearing a dialog's tag name.
   *
   * Focus goes to the dialog itself and not to either button. A reader who has just pressed a
   * control and been asked a question should not have one of the two answers already under
   * their return key, and it is what the walkthrough's card does for the same reason.
   */
  useEffect(() => {
    const element = dialog.current;
    if (element === null || element.open) return;
    element.showModal();
    element.focus();
  }, []);

  const decline = (): void => {
    dialog.current?.close();
    returnFocusTo.current?.focus();
    onDecline();
  };

  const longestHorizonHours = Math.max(...config.horizons.leadHours);
  const stepsOfAnAdvance = stepsPerAdvance(config);
  /* The row's integration is cumulative across the declared horizons, so what it costs is the
     walk to the longest of them -- which is the horizon FR-008 projects and the reason the two
     figures below differ by the factor they do. */
  const stepsToTheRow = Math.round((longestHorizonHours * 3600) / config.clock.timestepSeconds);

  return (
    <dialog
      ref={dialog}
      className="modal over-budget"
      data-testid="over-budget"
      /* The geometry the stylesheet reads. The dialog is in the top layer and therefore not a
         descendant of the element the workspace sets these on, so it is handed the same
         declared figures from the same function -- rather than a second copy of them. */
      style={workspaceGeometry(config)}
      aria-labelledby="over-budget-heading"
      tabIndex={-1}
      onCancel={(event) => {
        // Escape. Taken here rather than left to the platform's own close so that declining by
        // key and declining by button are one path with one meaning.
        event.preventDefault();
        decline();
      }}
      onClick={(event) => {
        /* The backdrop. A click on it lands on the dialog element itself, because the backdrop
           is not a node of its own; a click on anything inside lands on that thing. */
        if (event.target === dialog.current) decline();
      }}
    >
      <h4 id="over-budget-heading">Over the frame budget</h4>
      {/* The three figures the decision is between, each named for the work it is the cost of
          and none of them ellipsised: a truncated figure is a figure without its provenance
          (Principle V), and the fifth pass of this beat already found this notice's step time
          losing the word that said whether the budget was met. The ninth pass found the worse
          version of the same fault -- one projection, correctly computed, printed under the
          heading of a control it was not about. */}
      <dl className="modal-figures" data-testid="over-budget-figures">
        <div>
          <dt>
            Projected, this advance (<Declared>{ADVANCE_HOURS} h</Declared>,{' '}
            <Computed>{stepsOfAnAdvance}</Computed> steps)
          </dt>
          <dd data-testid="projected-advance">
            <HostTime>{advanceMs.toFixed(0)} ms</HostTime>
          </dd>
        </div>
        <div>
          <dt>
            Projected, the horizon row (<Declared>{longestHorizonHours} h</Declared>,{' '}
            <Computed>{stepsToTheRow}</Computed> steps)
          </dt>
          <dd data-testid="projected-row">
            <HostTime>{rowMs.toFixed(0)} ms</HostTime>
          </dd>
        </div>
        <div>
          <dt>Declared frame budget, held against the row</dt>
          <dd data-testid="declared-budget">
            <Declared>{config.budget.frameBudgetMs} ms</Declared>
          </dd>
        </div>
      </dl>
      <div className="modal-choice">
        <button
          type="button"
          onClick={() => {
            dialog.current?.close();
            onProceed();
          }}
          data-testid="proceed-anyway"
        >
          Integrate anyway
        </button>
        <button type="button" onClick={decline} data-testid="stop-here">
          Stop here
        </button>
      </div>
    </dialog>
  );
}
