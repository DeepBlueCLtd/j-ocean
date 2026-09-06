import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { REPO_ROOT, report, type GateResult, type Violation } from './gate-lib.js';

/**
 * Gate G-01 -- truth and observation artefacts regenerate identically
 * (constitution Principle IX, SRD G-01, FR-09, FR-10).
 *
 * It re-runs `data/scripts/convert.py` into a temporary directory and compares every
 * committed artefact with the regenerated one, byte for byte, naming the first offset that
 * differs.
 *
 * Two things about it are deliberate.
 *
 * **It regenerates from the committed raw subset, never from the network.** A gate that
 * re-fetched would be testing a server that has no obligation to this project. The convert
 * step verifies each raw file against its recorded digest first, so an upstream change is
 * reported as an upstream change and a tree change as a tree change -- neither is guessed
 * at (review R-5).
 *
 * **Missing Python is a failure, not a skip.** A skipped gate is not a passed gate. The
 * message says exactly what to install.
 */
export const GATE = 'G-01 artefact drift';

const ARTEFACT_DIRECTORIES = ['truth', 'clim', 'obs'];

const pythonFrom = (argv: readonly string[]): string => {
  const index = argv.indexOf('--python');
  if (index !== -1) return argv[index + 1] ?? 'python3';
  return process.env['J_OCEAN_PYTHON'] ?? 'python3';
};

/** `resolve`, not `join`: an absolute path given on the command line means that path. */
const committedFrom = (argv: readonly string[]): string => {
  const index = argv.indexOf('--committed');
  return resolve(REPO_ROOT, index === -1 ? 'data' : (argv[index + 1] ?? 'data'));
};

/** Every artefact under the given root, as paths relative to it, in a fixed order. */
function artefacts(root: string): string[] {
  const found: string[] = [];
  for (const directory of ARTEFACT_DIRECTORIES) {
    const absolute = join(root, directory);
    let entries: string[];
    try {
      entries = readdirSync(absolute);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      if (statSync(join(absolute, entry)).isFile()) found.push(`${directory}/${entry}`);
    }
  }
  return found;
}

/** The first byte at which two buffers differ, or -1. */
function firstDifference(a: Buffer, b: Buffer): number {
  const shortest = Math.min(a.length, b.length);
  for (let i = 0; i < shortest; i += 1) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : shortest;
}

export function checkArtefactDrift(argv: readonly string[] = []): GateResult {
  const python = pythonFrom(argv);
  const committed = committedFrom(argv);
  const violations: Violation[] = [];
  const notes: string[] = [];

  const regenerated = mkdtempSync(join(tmpdir(), 'j-ocean-drift-'));
  try {
    try {
      execFileSync(python, [join(REPO_ROOT, 'data/scripts/convert.py'), '--out', regenerated], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const failure = error as { status?: number | null; stderr?: string; code?: string };
      const missing = failure.code === 'ENOENT';
      return {
        gate: GATE,
        scanned: 0,
        violations: [
          {
            file: 'data/scripts/convert.py',
            line: 1,
            text: missing ? `${python} was not found` : (failure.stderr ?? '').trim(),
            message: missing
              ? `the convert step needs Python: install it and ` +
                `\`python3 -m pip install -r data/scripts/requirements.txt\`. A skipped gate ` +
                'is not a passed gate, so this is reported as a failure.'
              : 'the convert step did not complete, so no artefact could be compared',
          },
        ],
      };
    }

    const committedNames = artefacts(committed);
    const regeneratedNames = artefacts(regenerated);

    for (const name of regeneratedNames) {
      if (!committedNames.includes(name)) {
        violations.push({
          file: `${relative(REPO_ROOT, committed)}/${name}`,
          line: 1,
          text: 'the convert step produced this artefact and the tree does not carry it',
          message: 'an artefact is missing from the tree; run data/scripts/convert.py and commit it',
        });
      }
    }

    for (const name of committedNames) {
      if (!regeneratedNames.includes(name)) {
        violations.push({
          file: `${relative(REPO_ROOT, committed)}/${name}`,
          line: 1,
          text: 'the tree carries this artefact and the convert step does not produce it',
          message: 'an artefact in the tree is not produced by the convert step, so it is a fixture',
        });
        continue;
      }
      const expected = readFileSync(join(committed, name));
      const actual = readFileSync(join(regenerated, name));
      const offset = firstDifference(expected, actual);
      if (offset !== -1) {
        violations.push({
          file: `${relative(REPO_ROOT, committed)}/${name}`,
          line: 1,
          text:
            `committed ${String(expected.length)} bytes, regenerated ${String(actual.length)} bytes; ` +
            `first difference at byte ${String(offset)}`,
          message:
            'this artefact does not regenerate from its raw input. Either the convert step ' +
            'changed, in which case re-run it and commit the result, or the artefact was ' +
            'edited by hand, which no derived artefact ever should be (Principle IX).',
        });
      }
    }

    notes.push(`regenerated ${String(regeneratedNames.length)} artefacts from data/raw/`);
    return { gate: GATE, scanned: committedNames.length, violations, notes };
  } finally {
    rmSync(regenerated, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  process.exit(report(checkArtefactDrift(process.argv.slice(2))));
}
