import { execFileSync } from 'node:child_process';
import { REPO_ROOT, report, type GateResult } from './gate-lib.js';

/**
 * Gate G-05 -- every declared horizon is rendered, and no other (SRD G-05, FR-13).
 *
 * Unlike the other gates in this directory, this one cannot read source: the constitution
 * requires it to check "in the running shell", because a row that has quietly stopped
 * agreeing with configuration is a failure source can be read into agreeing with. So it
 * spawns Playwright, which builds the site, serves it statically and drives a browser.
 *
 * That makes it the second gate with a runtime of its own -- G-01 needs Python, this needs a
 * browser -- and the same rule applies to both: **a missing browser is a failure, not a
 * skip.** A skipped gate is not a passed gate, and the message says exactly what to install.
 *
 * ## Beat 018: what a spawned gate has to say about not having run
 *
 * This gate reported `FAIL ... (0 files scanned)` with the message *the rendered horizons are
 * not the declared ones*, and the row was in perfect agreement with configuration. Playwright
 * had never opened a browser: a preview server left behind by an earlier command held the
 * port, and `J_OCEAN_GATE` deliberately forbids reusing a server this gate did not start --
 * because a gate asking its question of a build that is not the tree is worth nothing. The
 * spawn failed before the first test, and every non-zero exit was being read as the one
 * failure this gate exists to report.
 *
 * A gate that cannot tell **"the row disagrees"** from **"the gate never ran"** sends whoever
 * reads it to look for a defect in the row. So the exit is classified, and the two are named
 * separately.
 *
 * The other half is worse, because it is silent: `scanned` was taken from the `N passed` line
 * and defaulted to zero, so a run that executed **no tests at all** -- a renamed file the
 * project's `testMatch` no longer matches, a `--grep` that selects nothing -- exited zero with
 * no violations and reported a **pass** over an empty scan. That is the shape of hole the
 * whole gate library exists to refuse (`gate-lib.ts`: "a gate that passes because its walk
 * found nothing is the most comfortable kind of broken"). Here the walk is a browser run, so
 * the gate requires its own tests to have run: the assertion and the planted violation, both
 * of them, or it fails saying so.
 */
export const GATE = 'G-05 declared horizons rendered';

/**
 * What the gate's own project must run: the assertion, and the planted violation beside it.
 *
 * Named here rather than left implicit, so that a test file which stops being matched is a
 * failure with a number in it instead of a pass over nothing. Both must run: an assertion
 * without its planted violation is an assertion nobody has watched fail.
 */
const TESTS_IN_THE_GATE = 2;

/** The gate's own file, quoted as the place to look whatever went wrong. */
const GATE_FILE = 'tests/gates/declared-horizons.gate.ts';

/** The last few lines of a spawned run, which is where Playwright says what it could not do. */
const lastLines = (text: string, count: number): string =>
  text.split('\n').filter((line) => line.trim() !== '').slice(-count).join(' | ');

export function checkDeclaredHorizons(): GateResult {
  try {
    const output = execFileSync(
      'pnpm',
      /* `--reporter=list` rather than whichever reporter the environment would choose: the
         gate reads the run's own summary to know how many tests ran, and a reporter that
         rewrites its last line is a reporter this gate cannot read. */
      ['exec', 'playwright', 'test', '--project=gate-g05', '--reporter=list'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        /*
         * The gate never reuses a preview server it did not start.
         *
         * Playwright reuses one by default outside CI, and a server left running by an earlier
         * command serves the `dist/` that was there when it started -- so the gate would be
         * asking its question of a build that is not the tree, and could pass or fail for
         * reasons nothing in the tree explains. A gate that can do that is worth nothing.
         */
        env: { ...process.env, J_OCEAN_GATE: '1' },
      },
    );
    const passed = /(\d+) passed/.exec(output);
    const ran = passed === null ? 0 : Number(passed[1]);

    /*
     * Zero tests is a failure, and so is fewer than the gate declares.
     *
     * Playwright exits zero when it has nothing to run, so without this the gate reports a
     * pass over an empty scan -- which is exactly the comfortable kind of broken `gate-lib`
     * makes every other gate count files to avoid.
     */
    if (ran < TESTS_IN_THE_GATE) {
      return {
        gate: GATE,
        scanned: ran,
        violations: [
          {
            file: GATE_FILE,
            line: 1,
            text: lastLines(output, 4),
            message:
              `this gate ran ${String(ran)} of its ${String(TESTS_IN_THE_GATE)} tests. It ` +
              'checks nothing by reading source, so a run that executed no tests has checked ' +
              'nothing at all -- and a gate that scanned nothing is not a gate that passed. ' +
              'Look for a test file the `gate-g05` project no longer matches.',
          },
        ],
      };
    }

    return {
      gate: GATE,
      scanned: ran,
      violations: [],
      notes: [
        'checked in a running browser, not by reading source: the constitution requires it, ' +
          'because a row that has stopped agreeing with configuration is a failure source can ' +
          'be read into agreeing with',
        'its planted violation -- a configuration served to the page one horizon short of the ' +
          'declared file -- is watched failing on every run, not once by a person',
      ],
    };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: string };
    const text = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
    const passed = /(\d+) passed/.exec(text);
    const ran = passed === null ? 0 : Number(passed[1]);

    /*
     * Why the exit is classified rather than reported as one failure.
     *
     * Everything below reaches this branch as the same non-zero exit: a browser that is not
     * installed, a preview server that could not be started, and a row that has stopped
     * agreeing with the declared file. Only the last is the finding this gate exists to
     * report, and reporting the first two as that finding sends a reader to look for a defect
     * in a row that is correct -- which is what happened, and cost a beat's coordinator the
     * time to find out that a stale `vite preview` was holding the port.
     */
    const missingBrowser = /playwright install|Executable doesn't exist/.test(text);
    const serverRefused = /is already used|webServer|Timed out waiting .* from config/.test(text);
    const message = missingBrowser
      ? 'this gate needs a browser: run `pnpm exec playwright install chromium`, or set ' +
        'J_OCEAN_CHROMIUM to one already installed. A skipped gate is not a passed gate, ' +
        'so this is reported as a failure.'
      : serverRefused
        ? 'this gate never reached a browser: the preview server it serves the built tree ' +
          'from could not be started, so nothing has been checked. The gate sets ' +
          'J_OCEAN_GATE, which forbids reusing a server it did not start -- a gate asking ' +
          'its question of a build that is not the tree can pass or fail for reasons nothing ' +
          'in the tree explains -- so a `vite preview` left running by an earlier command ' +
          'has to be stopped rather than borrowed. This is not a finding about the row.'
        : 'the rendered horizons are not the declared ones. Constitution Principle X: every ' +
          'horizon declared in configuration is rendered, and no panel is drawn for a ' +
          'horizon that is not declared.';

    return {
      gate: GATE,
      /* What actually ran, so the report distinguishes a gate that checked its two tests and
         found a disagreement from one that checked nothing. */
      scanned: ran,
      violations: [
        {
          file: GATE_FILE,
          line: 1,
          text: lastLines(text, 6),
          message,
        },
      ],
    };
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  process.exit(report(checkDeclaredHorizons()));
}
