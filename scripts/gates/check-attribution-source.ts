import { readLines, runAsMain, stripComments, walk, type GateResult, type Violation } from './gate-lib.js';

/**
 * Gate G-06 -- attribution is read from the analysis's own weights and from nowhere else
 * (constitution Principle IV, SRD G-06, FR-17).
 *
 * The rule this enforces is the one the SRD arrived at by getting it wrong first: a per-panel
 * summary bar was specified before the attribution field was, and it was wrong, because a
 * summary can be computed from something other than the analysis and a field drawn from the
 * gain cannot.
 *
 * So the `Attribution` type is branded by a symbol `src/analysis/attribution.ts` declares and
 * never exports, and this gate fails if that symbol's name appears anywhere else -- in
 * `src/harness/` above all, which is where the temptation to paint one lives.
 */
export const GATE = 'G-06 attribution source';

const BRAND = 'ATTRIBUTION_BRAND';
const BRAND_HOME = 'src/analysis/attribution.ts';

/** Names that would let a module build an attribution-shaped thing of its own. */
const FORBIDDEN_IN_HARNESS: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /\bmakeAttribution\b/, what: 'makeAttribution' },
  { pattern: /\bfunction\s+\w*[Aa]ttribution\w*\s*\(/, what: 'a function producing an attribution' },
];

export function checkAttributionSource(root: string): GateResult {
  const violations: Violation[] = [];

  const everything = walk(root, { include: ['src'], extensions: ['.ts', '.tsx'] });
  for (const file of everything) {
    if (file === BRAND_HOME) continue;
    stripComments(readLines(root, file)).forEach((text, index) => {
      if (!text.includes(BRAND)) return;
      violations.push({
        file,
        line: index + 1,
        text,
        message:
          `${BRAND} appears outside ${BRAND_HOME}. Constitution Principle IV: there is exactly ` +
          'one producer of the attribution type, and the harness reads it and may not blend, ' +
          'smooth, paint or otherwise construct one.',
      });
    });
  }

  const harness = walk(root, { include: ['src/harness'], extensions: ['.ts', '.tsx'] });
  for (const file of harness) {
    stripComments(readLines(root, file)).forEach((text, index) => {
      for (const { pattern, what } of FORBIDDEN_IN_HARNESS) {
        if (pattern.test(text)) {
          violations.push({
            file,
            line: index + 1,
            text,
            message:
              `src/harness/ contains ${what}. Constitution Principle IV: the attribution field ` +
              'is the analysis own weights, and a picture computed from the same arithmetic as ' +
              'the answer cannot disagree with it -- one painted to illustrate it can.',
          });
          return;
        }
      }
    });
  }

  return {
    gate: GATE,
    scanned: everything.length,
    violations,
    notes: [
      `the construction site is ${BRAND_HOME}`,
      'a per-panel summary bar is forbidden as the primary attribution display (FR-16); a ' +
        'summary may exist only as an instrument of a selected cell',
    ],
  };
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) runAsMain(checkAttributionSource);
