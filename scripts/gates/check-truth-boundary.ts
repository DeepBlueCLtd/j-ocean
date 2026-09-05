import { readLines, runAsMain, stripComments, walk, type GateResult, type Violation } from './gate-lib.js';

/**
 * Gate G-02 -- no truth value reaches the analysis except through a simulated instrument
 * (constitution Principle II, SRD G-02, FR-12).
 *
 * Three halves, and the third is not here yet.
 *
 * **The import boundary.** `src/model/` and `src/analysis/` may not import the truth-source
 * port, the truth artefact reader, or the scoring module. The constitution says so in terms,
 * and it caught a real violation the day it landed: beat 003 put `initialiseFromTruth` under
 * `src/model/`, where it held the port. It is in `src/run/` now.
 *
 * **The single construction site.** The `Observation` brand is a symbol declared in
 * `src/instruments/observation.ts` and exported from nowhere. This gate fails if the brand's
 * name appears in any other file, which is what stops somebody reintroducing a cast.
 *
 * **The behavioural half** -- an analysis run with instrument error set arbitrarily large
 * recovers nothing of truth beyond the background -- needs an analysis, and the analysis
 * lands in beat 005. The gate says so in its own output on every run, so that its absence is
 * a hole with a date on it rather than a hole nobody mentions.
 */
export const GATE = 'G-02 truth boundary';

/** Where the truth port and the scoring module may not be reached from (Principle II). */
const FORBIDDEN_IMPORTERS = ['src/model', 'src/analysis'];

const FORBIDDEN_SPECIFIERS: readonly { test: (s: string) => boolean; why: string }[] = [
  {
    test: (s) => /(^|\/)ports\/truth-source(\.js)?$/.test(s),
    why: 'the truth-source port; only src/instruments/ may hold it to produce observations, and src/scoring/ to score after the fact',
  },
  { test: (s) => /(^|\/)truth\/[\w-]+(\.js)?$/.test(s), why: 'the truth artefact reader' },
  { test: (s) => /(^|\/)scoring(\/|$)/.test(s), why: 'the scoring module' },
];

/** The name of the brand symbol. It lives in exactly one file and this gate says which. */
const BRAND = 'OBSERVATION_BRAND';
const BRAND_HOME = 'src/instruments/observation.ts';

const SPECIFIER =
  /(?:^|[^\w$])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[^\w$])import\s*\(\s*['"]([^'"]+)['"]|(?:^|[^\w$])require\s*\(\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/;

export function checkTruthBoundary(root: string): GateResult {
  const violations: Violation[] = [];
  let scanned = 0;

  for (const directory of FORBIDDEN_IMPORTERS) {
    const files = walk(root, { include: [directory], extensions: ['.ts', '.tsx'] });
    scanned += files.length;
    for (const file of files) {
      stripComments(readLines(root, file)).forEach((text, index) => {
        const match = SPECIFIER.exec(text);
        if (match === null) return;
        const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
        if (specifier === undefined) return;
        for (const { test, why } of FORBIDDEN_SPECIFIERS) {
          if (test(specifier)) {
            violations.push({
              file,
              line: index + 1,
              text,
              message:
                `${directory}/ imports "${specifier}": ${why}. Constitution Principle II: the ` +
                'model and the analysis import neither the truth port nor the scoring module.',
            });
            return;
          }
        }
      });
    }
  }

  // The single construction site. Anything that can name the brand can forge an Observation.
  const everything = walk(root, { include: ['src'], extensions: ['.ts', '.tsx'] });
  scanned += everything.length;
  for (const file of everything) {
    if (file === BRAND_HOME) continue;
    stripComments(readLines(root, file)).forEach((text, index) => {
      if (!text.includes(BRAND)) return;
      violations.push({
        file,
        line: index + 1,
        text,
        message:
          `${BRAND} appears outside ${BRAND_HOME}. Constitution Principle II: the Observation ` +
          'type is opaque and has a single construction site; there is no cast or helper ' +
          'elsewhere by which a truth value becomes an observation.',
      });
    });
  }

  return {
    gate: GATE,
    scanned,
    violations,
    notes: [
      `the construction site is ${BRAND_HOME}`,
      'behavioural half (an analysis with arbitrarily large instrument error recovers nothing ' +
        'beyond the prior): landed in beat 005, and run by tests/analysis/analysis.test.ts -- ' +
        'a gate cannot run it, because it needs the analysis to actually execute',
    ],
  };
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) runAsMain(checkTruthBoundary);
