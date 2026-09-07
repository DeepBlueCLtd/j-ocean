import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, runAsMain, type GateResult, type Violation } from './gate-lib.js';
import { configurationAt, quantitiesOfRecordedCase, type Quantity } from './surface-invariance.js';

/**
 * Gate G-07 — surface invariance (spec 013 FR-001, SRD-v2 FR-40, AT-10).
 *
 * Beat 013 rearranges the surface and claims it computes nothing new. This gate is what makes
 * that claim checkable by somebody who was not there: `scripts/gates/surface-invariance.ts`
 * walks the recorded case from the declared seed and digests every field, score and derived
 * quantity it produces, and this compares each digest against the committed record. A moved
 * figure is named, with the digest that was recorded and the digest the tree now produces, and
 * the sentence saying which module computed it — because "something changed" is a report
 * nobody can act on.
 *
 * A quantity present on one side and not the other is a violation too, and says which side it
 * was missing from. A refactor that quietly stopped computing something would otherwise pass
 * by having nothing left to disagree with.
 *
 * `--root` is the root the *declared configuration* is read from; the data artefacts always
 * come from the repository, and the record always does. A root with no `config/j-ocean.json`
 * falls back to the repository's configuration, which is what lets the `clean/` fixture —
 * one source file and no configuration — pass this gate along with every other.
 */
export const GATE = 'G-07 surface invariance';

const RECORD_PATH = 'scripts/gates/records/surface-invariance.json';

interface RecordFile {
  readonly quantities?: readonly Quantity[];
}

const RE_RECORD = 'If the change was meant, re-record with `pnpm record-invariance` and say in the commit message which quantity moved and why.';

export function checkSurfaceInvariance(root: string): GateResult {
  const recordFile = join(REPO_ROOT, RECORD_PATH);
  if (!existsSync(recordFile)) {
    return {
      gate: GATE,
      scanned: 0,
      violations: [
        {
          file: RECORD_PATH,
          line: 1,
          text: 'no record',
          message:
            'there is no committed record to hold the tree against. Write one with ' +
            '`pnpm record-invariance`; a gate with nothing to compare is not a passing gate.',
        },
      ],
    };
  }

  const parsed = JSON.parse(readFileSync(recordFile, 'utf8')) as RecordFile;
  const recorded = parsed.quantities ?? [];
  const recordedByName = new Map(recorded.map((quantity) => [quantity.name, quantity]));
  const recordedLine = new Map(recorded.map((quantity, index) => [quantity.name, index + 1]));

  const source = configurationAt(root);
  const current = quantitiesOfRecordedCase(root);
  const currentByName = new Map(current.map((quantity) => [quantity.name, quantity]));

  const violations: Violation[] = [];
  const names = [...new Set([...recorded.map((q) => q.name), ...current.map((q) => q.name)])];

  for (const [index, name] of names.entries()) {
    const was = recordedByName.get(name);
    const now = currentByName.get(name);
    const line = recordedLine.get(name) ?? index + 1;

    if (was === undefined && now !== undefined) {
      violations.push({
        file: RECORD_PATH,
        line,
        text: `${name}: recorded (absent), current ${now.digest}`,
        message:
          `the quantity "${name}" is computed by the tree and is not in the record. ` +
          `${now.producer} ${RE_RECORD}`,
      });
      continue;
    }
    if (was !== undefined && now === undefined) {
      violations.push({
        file: RECORD_PATH,
        line,
        text: `${name}: recorded ${was.digest}, current (absent)`,
        message:
          `the quantity "${name}" is in the record and the tree no longer computes it. ` +
          `${was.producer} ${RE_RECORD}`,
      });
      continue;
    }
    if (was !== undefined && now !== undefined && was.digest !== now.digest) {
      violations.push({
        file: RECORD_PATH,
        line,
        text: `${name}: recorded ${was.digest}, current ${now.digest}`,
        message:
          `the quantity "${name}" moved. ${now.producer} This beat computes nothing new, so a ` +
          `moved figure is a defect until somebody shows otherwise. ${RE_RECORD}`,
      });
    }
  }

  const notes = [
    `${String(names.length)} quantities compared against ${RECORD_PATH}; the count above is of quantities, not files`,
    source.fellBackToRepository
      ? `this root declares no configuration, so the repository's config/j-ocean.json was used`
      : `configuration read from ${source.path}`,
    'the data artefacts are read from the repository whatever --root says, because G-01 holds those bytes',
  ];

  return { gate: GATE, scanned: names.length, violations, notes };
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) runAsMain(checkSurfaceInvariance);
