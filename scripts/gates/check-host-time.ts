import { readLines, runAsMain, stripComments, walk, type GateResult, type Violation } from './gate-lib.js';

/**
 * Gate G-04 — no host clock, no unseeded randomness (constitution Principle I, FR-007).
 *
 * The forbidden reads are exactly the ones the constitution names. `Date.parse` and
 * `new Date(ms)` are absent from the list because neither reads the host: both are pure
 * functions of an argument that came from configuration or from a step count. What is
 * forbidden is the argument-free `new Date()`, which is the form that asks the machine
 * what time it is.
 *
 * The exemption marker is honoured in two modules and nowhere else — the timing module and
 * the seed-provisioning step — because those are the two exemptions Principle I opens with,
 * and a marker that worked anywhere would be a way of opting out of the principle rather
 * than a record of where it has been bounded. Every marker honoured is printed, so that
 * "every marker is reviewed" is something a reviewer can actually do.
 */
export const GATE = 'G-04 host time and unseeded randomness';

const MARKER = 'j-ocean:allow-host-time';

/** Where the marker may appear. Principle I, exemptions (a) and (b). */
const MARKER_ALLOWED_IN = [
  'src/harness/timing.ts',
  'src/harness/seed-provisioning.ts',
];

const FORBIDDEN: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /\bDate\s*\.\s*now\b/, what: 'Date.now' },
  { pattern: /\bnew\s+Date\s*\(\s*\)/, what: 'new Date()' },
  { pattern: /\bperformance\s*\.\s*now\b/, what: 'performance.now' },
  { pattern: /\bMath\s*\.\s*random\b/, what: 'Math.random' },
  { pattern: /\bcrypto\s*\.\s*getRandomValues\b/, what: 'crypto.getRandomValues' },
  { pattern: /\bgetRandomValues\b/, what: 'getRandomValues' },
  { pattern: /\bcrypto\s*\.\s*randomUUID\b/, what: 'crypto.randomUUID' },
  { pattern: /\brandomUUID\b/, what: 'randomUUID' },
];

export function checkHostTime(root: string): GateResult {
  // Operational code only: the tests may name a forbidden call in order to assert it is
  // absent, and the gates themselves must be able to write the patterns down.
  const files = walk(root, { include: ['src'], extensions: ['.ts', '.tsx'] });
  const violations: Violation[] = [];
  const honoured: string[] = [];

  for (const file of files) {
    const lines = readLines(root, file);
    // Markers are read from the source, because a marker is a comment. Forbidden calls are
    // read from the stripped source, because a call is code.
    const code = stripComments(lines);
    lines.forEach((text, index) => {
      const line = index + 1;
      const marked = text.includes(MARKER);

      if (marked) {
        const reason = text.slice(text.indexOf(MARKER) + MARKER.length).trim().replace(/^\*\/\s*$/, '');
        if (MARKER_ALLOWED_IN.includes(file)) {
          honoured.push(`${file}:${String(line)} — ${reason.length > 0 ? reason : '(no reason given)'}`);
        } else {
          violations.push({
            file,
            line,
            text,
            message:
              `the ${MARKER} marker is honoured only in ${MARKER_ALLOWED_IN.join(' and ')}; ` +
              'constitution Principle I bounds the exemptions to those two modules and says a ' +
              'third must be argued on its own merits, never by analogy',
          });
        }
        return;
      }

      for (const { pattern, what } of FORBIDDEN) {
        const match = pattern.exec(code[index] ?? '');
        if (match) {
          violations.push({
            file,
            line,
            column: match.index + 1,
            text,
            message:
              `${what} is a host read; constitution Principle I: simulation time comes from ` +
              'the clock port and every generator from the RNG port',
          });
          return;
        }
      }
    });
  }

  return { gate: GATE, scanned: files.length, violations, honoured: honoured.sort() };
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) runAsMain(checkHostTime);
