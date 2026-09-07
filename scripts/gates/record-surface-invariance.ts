import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT, rootFromArgv } from './gate-lib.js';
import { configurationAt, quantitiesOfRecordedCase, type Quantity } from './surface-invariance.js';

/**
 * `pnpm record-invariance` — write the record gate G-07 holds the tree against.
 *
 * The record is derived, never hand-edited (constitution Principle IX). Nothing else in the
 * repository is allowed to write it, and re-recording it is a deliberate act: the gate turning
 * red means either a bug or a change somebody meant, and running this script is how the second
 * one is admitted to. The commit that re-records says which quantities moved and why, which is
 * what this program prints so that the message can be written from it.
 */

export const RECORD_PATH = 'scripts/gates/records/surface-invariance.json';

const DERIVED =
  'Derived by scripts/gates/record-surface-invariance.ts (pnpm record-invariance). Never edited ' +
  'by hand: it is the committed record of what the recorded case computes, and a hand-edited ' +
  'record would hold the tree against nothing (constitution Principle IX).';

export interface SurfaceInvarianceRecord {
  readonly derived: string;
  readonly gate: string;
  readonly seed: string;
  readonly quantities: readonly Quantity[];
}

/** Pretty-printed, keys in the order they are written, one quantity per entry. */
export function serialiseRecord(record: SurfaceInvarianceRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

function main(): void {
  const root = rootFromArgv(process.argv.slice(2));
  const quantities = quantitiesOfRecordedCase(root);
  const record: SurfaceInvarianceRecord = {
    derived: DERIVED,
    gate: 'G-07 surface invariance',
    seed: configurationAt(root).loaded.config.run.defaultSeed,
    quantities: quantities.map(({ name, digest, producer }) => ({ name, digest, producer })),
  };

  const path = join(REPO_ROOT, RECORD_PATH);
  const before = new Map<string, string>();
  if (existsSync(path)) {
    const previous = JSON.parse(readFileSync(path, 'utf8')) as SurfaceInvarianceRecord;
    for (const quantity of previous.quantities) before.set(quantity.name, quantity.digest);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialiseRecord(record));

  const names = new Set(quantities.map((q) => q.name));
  const moved = quantities.filter((q) => before.has(q.name) && before.get(q.name) !== q.digest);
  const added = quantities.filter((q) => !before.has(q.name));
  const removed = [...before.keys()].filter((name) => !names.has(name));

  process.stdout.write(`wrote ${RECORD_PATH}: ${String(quantities.length)} quantities\n`);
  if (before.size === 0) {
    process.stdout.write('      there was no previous record, so every quantity is new\n');
    return;
  }
  for (const quantity of moved) {
    process.stdout.write(
      `      moved:   ${quantity.name}  ${String(before.get(quantity.name))} -> ${quantity.digest}\n`,
    );
  }
  for (const quantity of added) process.stdout.write(`      added:   ${quantity.name}\n`);
  for (const name of removed) process.stdout.write(`      removed: ${name}\n`);
  if (moved.length === 0 && added.length === 0 && removed.length === 0) {
    process.stdout.write('      nothing changed\n');
  }
}

main();
