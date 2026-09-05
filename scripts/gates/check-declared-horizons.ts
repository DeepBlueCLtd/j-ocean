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
 */
export const GATE = 'G-05 declared horizons rendered';

export function checkDeclaredHorizons(): GateResult {
  try {
    const output = execFileSync(
      'pnpm',
      ['exec', 'playwright', 'test', '--project=gate-g05'],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const passed = /(\d+) passed/.exec(output);
    return {
      gate: GATE,
      scanned: passed === null ? 0 : Number(passed[1]),
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
    const missingBrowser = /playwright install|Executable doesn't exist/.test(text);
    return {
      gate: GATE,
      scanned: 0,
      violations: [
        {
          file: 'tests/gates/declared-horizons.gate.ts',
          line: 1,
          text: text.split('\n').filter((line) => line.trim() !== '').slice(-6).join(' | '),
          message: missingBrowser
            ? 'this gate needs a browser: run `pnpm exec playwright install chromium`, or set ' +
              'J_OCEAN_CHROMIUM to one already installed. A skipped gate is not a passed gate, ' +
              'so this is reported as a failure.'
            : 'the rendered horizons are not the declared ones. Constitution Principle X: every ' +
              'horizon declared in configuration is rendered, and no panel is drawn for a ' +
              'horizon that is not declared.',
        },
      ],
    };
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  process.exit(report(checkDeclaredHorizons()));
}
