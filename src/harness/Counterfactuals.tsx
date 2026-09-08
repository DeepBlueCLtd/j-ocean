import { describeEdit, type Edit } from '../instruments/edits.js';

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
 */

export interface CounterfactualsProps {
  readonly edits: readonly Edit[];
  readonly instrumentIds: readonly string[];
  readonly qualityControlDefault: boolean;
  readonly busy: boolean;
  readonly onApply: (edits: readonly Edit[]) => void;
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
    props.onApply(edit === null ? kept : [...kept, edit]);
  };

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
          onClick={() => { props.onApply([]); }}
          disabled={edits.length === 0 || props.busy}
        >
          Revert to the recorded case
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
