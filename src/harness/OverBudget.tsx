import { useEffect, useRef, type RefObject } from 'react';
import type { Configuration } from '../config/schema.js';
import { Declared, HostTime } from './figures.js';
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
 * It is a decision prompt, so it leads with the two figures the decision is between and then
 * with the two things a reader may do. The three sentences that explained the frame budget --
 * what the chunk it measured counts toward, and that the page is saying so rather than
 * freezing -- are an explanation and not a decision, so under FR-007 they are in the help for
 * the `controls/run` panel, and `docs/narrative-disposition.json` records where they went.
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
  /** What the longest declared horizon is projected to cost, in host milliseconds. */
  readonly projectedMs: number;
  /** Integrate the rest of the advance anyway. */
  readonly onProceed: () => void;
  /** Integrate nothing beyond the chunk already measured. */
  readonly onDecline: () => void;
  /** The control this was opened from, which is where focus goes when it closes. */
  readonly returnFocusTo: RefObject<HTMLButtonElement | null>;
}

export function OverBudget({
  config,
  projectedMs,
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
      {/* The two figures the decision is between, each with its provenance and neither of them
          ellipsised: a truncated figure is a figure without its provenance (Principle V), and
          the fifth pass of this beat already found this notice's step time losing the word
          that said whether the budget was met. */}
      <dl className="modal-figures" data-testid="over-budget-figures">
        <div>
          <dt>
            Projected, longest declared horizon (<Declared>{longestHorizonHours} h</Declared>)
          </dt>
          <dd>
            <HostTime>{projectedMs.toFixed(0)} ms</HostTime>
          </dd>
        </div>
        <div>
          <dt>Declared frame budget</dt>
          <dd>
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
