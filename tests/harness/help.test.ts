import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HELP_ENTRIES } from '../../src/harness/help/index.js';
import { PANELS, REGIONS } from '../../src/harness/panels.js';
import {
  entryFileFor,
  parseHelpEntries,
  checkHelpCoverage,
} from '../../scripts/gates/check-help-coverage.js';
import { REPO_ROOT, stripComments } from '../../scripts/gates/gate-lib.js';
import { declaredConfiguration } from '../support/config.js';

/**
 * Help teaches and does not report (SRD-v2 FR-55; spec 016 US4, FR-005, FR-006, SC-003).
 *
 * A help panel that reported would be a **second source** for a fact the surface already
 * shows, and two sources for one fact is how a surface starts lying: the copy is the one that
 * goes stale, and nobody finds out until a reader believes it.
 *
 * So this is a test over the sources rather than a rule somebody remembers at review. It
 * rejects three things:
 *
 *  1. **Run state.** A help body takes the validated configuration and nothing else, so it
 *     could not reach a run, a forecast or a score even if it tried; this fails the attempt at
 *     the source, and names the file, so the failure arrives before the type error does.
 *  2. **A provenance-typed figure that is not declared.** `Computed`, `derived` and host time
 *     are kinds of *reported* figure. Only `Declared` may appear in help.
 *  3. **A bare numeric.** Every digit in a help source has to sit inside an expression that
 *     reads it from configuration (Principle X, FR-006). A number a help entry teaches with --
 *     a length scale, a horizon -- is read from the file that declares it rather than restated
 *     beside it, because a restated number is the same second source in a smaller disguise.
 *
 * It was watched failing on planted entries, and the plants are kept below rather than
 * removed: a check nobody has seen fail is worth nothing (PR-04), and a check whose failure
 * was watched once is only worth something until somebody edits it.
 */

const HELP_DIR = 'src/harness/help';

/** The identifiers by which a help entry could reach something the surface is reporting. */
const RUN_STATE: readonly { readonly pattern: RegExp; readonly what: string }[] = [
  { pattern: /\brun\b\s*[.[]/, what: 'the run' },
  { pattern: /\bview\b\s*[.[]/, what: 'the shell’s view of the run' },
  { pattern: /\bforecast\b\s*[.[]/, what: 'a forecast' },
  { pattern: /\bscore\b\s*[.[]/, what: 'a score' },
  { pattern: /\banalysis\b\s*[.[]/, what: 'the analysis' },
  { pattern: /\bresults\b\s*[.[]/, what: 'published results' },
  { pattern: /\bfootprint\b\s*[.[]/, what: 'the observation footprint' },
  { pattern: /\bprops\b\s*[.[]/, what: 'whatever the panel was handed' },
  { pattern: /\bDate\b/, what: 'the host clock' },
  { pattern: /\bperformance\b\s*\./, what: 'the host clock' },
  { pattern: /\btoFixed\b/, what: 'a formatted quantity' },
  { pattern: /\$\{/, what: 'an interpolation' },
];

/** The provenance kinds a *reported* figure is drawn in. Help may draw only `Declared`. */
const REPORTED_FIGURE: readonly { readonly pattern: RegExp; readonly what: string }[] = [
  { pattern: /\bComputed\b/, what: 'a computed figure' },
  { pattern: /\bDerived\b/, what: 'a derived figure' },
  { pattern: /\bHostTime\b/, what: 'a host-time figure' },
  { pattern: /['"](?:figure )?(?:computed|derived|host-time|unmeasured)['"]/, what: 'a reported figure’s own typography' },
];

/** Every balanced `{...}` in the source, so a digit can be asked what expression it is in. */
function braceGroups(source: string): readonly { start: number; end: number }[] {
  const groups: { start: number; end: number }[] = [];
  const open: number[] = [];
  for (let at = 0; at < source.length; at += 1) {
    const c = source[at];
    if (c === '{') open.push(at);
    else if (c === '}') {
      const start = open.pop();
      if (start !== undefined) groups.push({ start, end: at });
    }
  }
  return groups;
}

/**
 * What a help source may not say, said back. Empty for every entry in the tree.
 *
 * Comments are blanked first, keeping the line numbers, for the reason gate-lib gives: a check
 * that reads comments flags the sentence explaining what it forbids, which trains people to
 * write around it rather than to obey it. A module docstring citing FR-055 is not a figure.
 */
export function helpViolations(raw: string, file: string): string[] {
  const failures: string[] = [];
  const source = stripComments(raw.split('\n')).join('\n');
  const lines = source.split('\n');

  lines.forEach((line, index) => {
    const where = `${file}:${String(index + 1)}`;
    /* A path into the validated configuration is not run state, however it is spelt: the
       reading is what makes it declared. So it is taken out before the question is asked. */
    const withoutConfig = line.replace(/\bconfig(?:\.[A-Za-z0-9_]+)+/g, ' ');
    for (const { pattern, what } of RUN_STATE) {
      if (pattern.test(withoutConfig)) {
        failures.push(`${where} states ${what}: help teaches, it does not report`);
      }
    }
    for (const { pattern, what } of REPORTED_FIGURE) {
      if (pattern.test(line)) {
        failures.push(`${where} draws ${what}; only a declared figure may appear in help`);
      }
    }
  });

  /*
   * Every digit has to be read from configuration. The check is positional rather than
   * textual: the digit's innermost enclosing expression is found and asked whether it reads
   * `config`, so `{config.horizons.leadHours.join(', ')}` passes and a sentence that says the
   * horizons are 0, 12, 24, 48, 72 and 96 hours does not.
   */
  const groups = braceGroups(source);
  const enclosing = (at: number): string | null => {
    let best: { start: number; end: number } | null = null;
    for (const group of groups) {
      if (group.start > at || group.end < at) continue;
      if (best === null || group.start > best.start) best = group;
    }
    return best === null ? null : source.slice(best.start, best.end + 1);
  };
  for (let at = 0; at < source.length; at += 1) {
    const c = source[at] as string;
    if (c < '0' || c > '9') continue;
    const expression = enclosing(at);
    if (expression !== null && /\bconfig\s*\./.test(expression)) continue;
    const line = source.slice(0, at).split('\n').length;
    failures.push(
      `${file}:${String(line)} states a numeral that is not read from configuration; ` +
        'a figure a help entry teaches with is a declared one (Principle X, FR-006)',
    );
  }

  return [...new Set(failures)];
}

const sourceFiles = readdirSync(join(REPO_ROOT, HELP_DIR))
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => `${HELP_DIR}/${name}`);

describe('help teaches and does not report', () => {
  it('has sources to check, so that a clean pass is not an empty walk', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(HELP_ENTRIES.length).toBe(sourceFiles.length);
  });

  it('states no live figure, no reported kind and no numeral configuration did not declare', () => {
    const failures = sourceFiles.flatMap((file) =>
      helpViolations(readFileSync(join(REPO_ROOT, file), 'utf8'), file),
    );
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

/**
 * The plants, kept. Each is what the corresponding rule exists to catch, written the way
 * somebody would actually write it if they were not thinking about FR-055.
 */
describe('a planted entry, so that the check is watched failing', () => {
  it('fails on an entry quoting a live skill score, naming the entry', () => {
    const planted = [
      "export const ENTRY = {",
      "  panel: 'scores',",
      "  explains: [",
      "    {",
      "      feature: 'skill against a reference',",
      "      body: () => (",
      "        <p>",
      "          This forecast is beating persistence by{' '}",
      "          <Computed>{run.score.skillAgainstPersistence.value.toFixed(3)}</Computed>.",
      "        </p>",
      "      ),",
      "    },",
      "  ],",
      "};",
    ].join('\n');
    const failures = helpViolations(planted, 'src/harness/help/scores.tsx');
    expect(failures.join('\n')).toContain('src/harness/help/scores.tsx');
    expect(failures.join('\n')).toContain('a score');
    expect(failures.join('\n')).toContain('a computed figure');
    expect(failures.join('\n')).toContain('a formatted quantity');
  });

  it('fails on a numeral restated rather than read from configuration', () => {
    const planted =
      "      body: () => <p>The correlation length scale is 60 km, which is a long way.</p>,";
    const failures = helpViolations(planted, 'src/harness/help/centre-attribution.tsx');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('not read from configuration');
  });

  it('passes the same numeral read from configuration', () => {
    const planted =
      '      body: (config) => <p>{config.analysis.correlationLengthScaleKilometres} km.</p>,';
    expect(helpViolations(planted, 'src/harness/help/centre-attribution.tsx')).toEqual([]);
  });

  it('fails on host time, which is the machinery reporting on itself', () => {
    const planted = '      body: () => <p>That took <HostTime>{lastStepMs} ms</HostTime>.</p>,';
    const failures = helpViolations(planted, 'src/harness/help/controls-run.tsx');
    expect(failures.join('\n')).toContain('a host-time figure');
  });
});

/**
 * FR-053's second half, and spec 016 T013: an entry with empty content fails the build.
 *
 * The gate holds it on the text, so that a fixture can be watched failing; this holds it on
 * what a reader would actually see, which is the thing the requirement is about.
 */
describe('every explanation has something in it', () => {
  const { config } = declaredConfiguration();

  it('renders words, not an empty box', () => {
    for (const entry of HELP_ENTRIES) {
      for (const explanation of entry.explains) {
        const rendered = renderToStaticMarkup(explanation.body(config) as never)
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        expect(
          rendered.length,
          `${entry.panel} / ${explanation.feature} renders nothing; FR-053 prefers no control ` +
            'at all to a stub',
        ).toBeGreaterThan(120);
      }
    }
  });
});

/**
 * What the gate read, against what the modules export.
 *
 * G-08 reads the entries as text, because `--root` is what lets a gate be watched failing on a
 * fixture and an importing gate would run this repository's modules whatever `--root` said.
 * The cost of reading text is that the reading can drift from the reality, and this is the
 * payment: the modules are imported and compared with the gate's own parse.
 */
describe('the gate reads the entries correctly', () => {
  it('parses the same panels and features the modules export', () => {
    const parsed = parseHelpEntries(REPO_ROOT);
    const fromSource = [...parsed]
      .map((entry) => ({ panel: entry.panel, features: entry.features.map((one) => one.feature) }))
      .sort((a, b) => a.panel.localeCompare(b.panel));
    const fromModules = HELP_ENTRIES.map((entry) => ({
      panel: entry.panel,
      features: entry.explains.map((one) => one.feature),
    })).sort((a, b) => a.panel.localeCompare(b.panel));
    expect(fromSource).toEqual(fromModules);
  });

  it('finds each entry in the file its panel names', () => {
    for (const entry of HELP_ENTRIES) {
      expect(sourceFiles).toContain(entryFileFor(entry.panel));
    }
  });

  it('passes the tree, and scans something while doing it', () => {
    const result = checkHelpCoverage(REPO_ROOT);
    expect(result.violations, result.violations.map((v) => v.message).join('\n')).toEqual([]);
    expect(result.scanned).toBeGreaterThan(0);
  });
});

/**
 * The declarations, held headlessly beside the gate. The gate is the enforcement; these are
 * the properties a reader of this suite would want stated in words.
 */
describe('the panel declarations', () => {
  it('put every panel in a region the layout draws', () => {
    for (const panel of PANELS) {
      expect(REGIONS as readonly string[], `${panel.id} is in ${panel.region}`).toContain(
        panel.region,
      );
    }
  });

  it('say why, wherever a panel has nothing to explain', () => {
    for (const panel of PANELS.filter((one) => one.features.length === 0)) {
      expect(
        (panel.nothingToExplain ?? '').length,
        `${panel.id} shows no help control and does not say why`,
      ).toBeGreaterThan(0);
    }
  });

  it('explain every feature exactly once, and explain nothing else', () => {
    const explained = new Map(HELP_ENTRIES.map((entry) => [entry.panel, entry]));
    for (const panel of PANELS) {
      const features = explained.get(panel.id)?.explains.map((one) => one.feature) ?? [];
      expect(features.slice().sort(), `${panel.id}`).toEqual([...panel.features].sort());
    }
    for (const entry of HELP_ENTRIES) {
      expect(PANELS.map((panel) => panel.id), `${entry.panel} explains no declared panel`).toContain(
        entry.panel,
      );
    }
  });
});
