import { describeEdit, type Edit } from '../instruments/edits.js';
import type { LongOperation, Progress, RowOperation } from './working.js';

/**
 * What the reader did, and the way back (FR-034, FR-001 of this beat).
 *
 * The surface always says whether it is showing the recorded run or an edit of it, and lists
 * the edits in order. Every other counterfactual is unsafe without this: a reader who cannot
 * tell an edit from the record has been misled by the harness, which is worse than a harness
 * that refuses to let them edit anything.
 *
 * Revert is one action and it removes all of them, because an edit is a value applied to a
 * fresh run rather than a mutation of one — so reverting is not undo, it is arithmetic with a
 * shorter list.
 *
 * Every control here rebuilds the row, which costs seconds, so every control here is disabled
 * while that runs and *Revert* carries the count in its own label — the treatment the advance
 * has had since beat 018's sixth pass and the other long controls had not (the author's report:
 * *"for the other buttons in that panel, there is no indication of progress"*). The two inputs
 * carry no count: a count in the label of a number field would be a readout inside a control's
 * name, and the status strip says how far along for whichever control asked.
 */

export interface CounterfactualsProps {
  readonly edits: readonly Edit[];
  readonly instrumentIds: readonly string[];
  readonly qualityControlDefault: boolean;
  /** What is running and how far it has got, from the shell's one notion (`working.ts`). */
  readonly working: LongOperation | null;
  readonly progress: Progress | null;
  /** The digits the count reserves its width against, so that saying it moves nothing. */
  readonly countSizer: string;
  readonly onApply: (edits: readonly Edit[], what: RowOperation) => void;
}

export function Counterfactuals(props: CounterfactualsProps) {
  const { edits } = props;
  const bias = edits.find((edit): edit is Extract<Edit, { kind: 'bias' }> => edit.kind === 'bias');
  const control = edits.find(
    (edit): edit is Extract<Edit, { kind: 'quality-control' }> => edit.kind === 'quality-control',
  );
  const qualityControlOn = control?.enabled ?? props.qualityControlDefault;

  const replace = (edit: Edit | null, kind: Edit['kind']): void => {
    const kept = edits.filter((existing) => existing.kind !== kind);
    props.onApply(edit === null ? kept : [...kept, edit], 'applying an edit');
  };

  const busy = props.working !== null;
  const reverting = props.working === 'reverting to the recorded case';

  return (
    <div className="counterfactuals" data-testid="counterfactuals">
      {/*
        SRD-v1 FR-34, as a readout rather than a sentence (beat 018). The surface always says
        whether what is shown is the recorded run or an edit of it; what it no longer does is
        say it in a sentence with a button embedded in the middle of it. The label, the state
        and the way back, in that order.
      */}
      <p className="run-status" data-testid="run-status">
        <span className="run-status-label">Showing</span>{' '}
        {edits.length === 0 ? (
          <span className="figure declared">the recorded case</span>
        ) : (
          <>
            <span className="figure computed">an edit</span>:{' '}
            <span data-testid="edit-list">{edits.map(describeEdit).join('; ')}</span>
          </>
        )}
        <button
          type="button"
          data-testid="revert"
          className="reserving"
          onClick={() => { props.onApply([], 'reverting to the recorded case'); }}
          disabled={edits.length === 0 || busy}
        >
          <span className="reserve" aria-hidden="true">Revert to the recorded case</span>
          <span className="reserve" aria-hidden="true">
            Reverting {props.countSizer} of {props.countSizer}
          </span>
          <span data-testid="revert-label">
            {reverting && props.progress !== null
              ? `Reverting ${String(props.progress.done)} of ${String(props.progress.total)}`
              : 'Revert to the recorded case'}
          </span>
        </button>
      </p>

      <div className="row-controls">
        <label htmlFor="bias">
          Break an instrument by
          <input
            id="bias"
            type="number"
            step="0.5"
            data-testid="bias-degrees"
            disabled={busy}
            value={bias?.biasDegC ?? 0}
            onChange={(event) => {
              const value = Number(event.target.value);
              replace(
                value === 0
                  ? null
                  : { kind: 'bias', instrumentId: props.instrumentIds[1] ?? '', biasDegC: value },
                'bias',
              );
            }}
          />
          &deg;C
        </label>

        <label htmlFor="quality-control">
          <input
            id="quality-control"
            type="checkbox"
            data-testid="quality-control"
            disabled={busy}
            checked={qualityControlOn}
            onChange={(event) => {
              replace(
                event.target.checked === props.qualityControlDefault
                  ? null
                  : { kind: 'quality-control', enabled: event.target.checked },
                'quality-control',
              );
            }}
          />
          Quality control
        </label>
      </div>
    </div>
  );
}
