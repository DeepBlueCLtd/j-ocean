import { checkArtefactDrift } from './check-artefact-drift.js';
import { checkHostTime } from './check-host-time.js';
import { checkModelImports } from './check-model-imports.js';
import { checkVocabulary } from './check-vocabulary.js';
import { REPO_ROOT, report, type GateResult } from './gate-lib.js';

/**
 * `pnpm gates` (constitution, Quality gates; FR-010).
 *
 * Runs every gate that has landed, in the order the constitution lists them, and names the
 * ones that have not. That distinction matters more than it looks. A gate which is absent
 * because its beat has not happened is a known hole with a date on it; a gate which is
 * present but did not run is a hole that looks like a pass. Beat 001 has only the first
 * kind, and beat 002's G-01 will be the first to need the second: a machine without Python
 * must see G-01 *fail*, because a skipped gate is not a passed gate (spec 001, Edge Cases).
 */

interface Landed {
  readonly run: (root: string) => GateResult;
}

interface NotYetLanded {
  readonly name: string;
  readonly beat: string;
  readonly holds: string;
}

const GATES: readonly (Landed | NotYetLanded)[] = [
  { run: () => checkArtefactDrift([]) },
  { name: 'G-02 truth boundary', beat: '004', holds: 'no truth value reaches the analysis except through an instrument' },
  { run: checkModelImports },
  { run: checkHostTime },
  { name: 'G-05 declared horizons rendered', beat: '007', holds: 'every declared horizon is rendered and no other panel is drawn' },
  { name: 'G-06 attribution source', beat: '005', holds: 'attribution is read from the analysis own weights and from nowhere else' },
  { run: checkVocabulary },
];

const isLanded = (gate: Landed | NotYetLanded): gate is Landed => 'run' in gate;

function main(): void {
  let failures = 0;
  let landed = 0;

  for (const gate of GATES) {
    if (isLanded(gate)) {
      landed += 1;
      failures += report(gate.run(REPO_ROOT));
    } else {
      process.stdout.write(`----  ${gate.name}  not yet landed (beat ${gate.beat})\n`);
      process.stdout.write(`      it will hold: ${gate.holds}\n`);
    }
  }

  process.stdout.write(
    `\n${String(landed)} gate${landed === 1 ? '' : 's'} ran, ` +
      `${String(GATES.length - landed)} not yet landed, ` +
      `${String(failures)} failing\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
