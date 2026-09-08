import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLines, runAsMain, walk, type GateResult, type Violation } from './gate-lib.js';

/**
 * Gate G-08 — help coverage (SRD-v2 FR-53, FR-54, AT-14; spec 016 FR-004).
 *
 * Help kept separately from the thing it explains goes stale silently. The component tour of
 * beat 013 answered to that discipline by anchoring every step to an element that had to be on
 * the page; this gate applies it to the explanations themselves, and holds the pairing **in
 * both directions**:
 *
 *  - every region or layer a panel declares in `src/harness/panels.json` has an explanation;
 *  - every explanation names a panel and a feature that are declared;
 *  - every panel the layout draws is declared, and every declaration is drawn.
 *
 * The last of those is what stops the gate being satisfied by declaring nothing. A panel is
 * drawn by naming its declaration -- `<PanelHead panel="controls/manifest" />` -- so a heading
 * on the surface and an entry in the list are one fact; a panel named in the harness and not
 * declared fails here, and so does a declaration nothing draws.
 *
 * It also holds the four rows §7 of the requirements owes an explanation to, **by name**, so
 * that the table in the requirements is a test rather than a promise (spec 016 SC-006).
 *
 * **Why it reads the sources rather than importing them.** Every gate here runs against a
 * fixture tree through `--root`, which is what makes it possible to watch it fail on a planted
 * violation down the same code path (PR-04). Importing would run the repository's modules
 * whatever `--root` said. The declarations are therefore JSON, which is parsed rather than
 * matched, and only the help entries are read as text -- against shapes this gate documents
 * below. `tests/harness/help.test.ts` closes the gap by importing the entries for real and
 * asserting that what this gate parsed is what the modules export.
 */
export const GATE = 'G-08 help coverage';

const PANELS_PATH = 'src/harness/panels.json';
const REGIONS_PATH = 'src/harness/panels.ts';
const HELP_DIR = 'src/harness/help';

/** The shapes this gate reads out of a help module. Both are single-quoted string literals. */
const PANEL_OF_ENTRY = /\bpanel:\s*'([^']*)'/g;
const FEATURE_OF_EXPLANATION = /\bfeature:\s*(?:'([^']*)'|"([^"]*)")/g;
/** How a panel is drawn: by naming its declaration on one of the head components. */
const PANEL_DRAWN = /\bpanel="([^"]*)"/g;
/** The layout's own list of regions, which a panel's `region` has to be one of. */
const REGIONS_DECLARED = /export const REGIONS = \[([^\]]*)\] as const/;

/**
 * How much text an explanation must have before it counts as one.
 *
 * FR-053 prefers absence to a stub: a help entry a reader opens and finds empty teaches them
 * that the control is not worth pressing, which is worse than the panel having offered none.
 * The threshold is letters after the markup and the expressions are stripped, so an entry that
 * is only its own boilerplate does not clear it.
 */
const MINIMUM_LETTERS = 60;

interface Declared {
  readonly id: string;
  readonly region: string;
  readonly heading: string;
  readonly features: readonly string[];
  readonly nothingToExplain?: string;
}

export interface ParsedEntry {
  readonly file: string;
  readonly panel: string;
  readonly features: readonly { readonly feature: string; readonly letters: number; readonly line: number }[];
}

/** The file a panel's entry has to be in: the id, with its separator flattened. */
export function entryFileFor(panelId: string): string {
  return `${HELP_DIR}/${panelId.replace(/\//g, '-')}.tsx`;
}

/** Everything in an explanation that a reader would read: no tags, no expressions, letters. */
function lettersIn(source: string): number {
  return source
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/[^A-Za-z]/g, '')
    .length;
}

export function parseEntry(root: string, file: string): ParsedEntry | { readonly error: string } {
  const text = readFileSync(join(root, file), 'utf8');
  const panels = [...text.matchAll(PANEL_OF_ENTRY)].map((match) => match[1] ?? '');
  if (panels.length !== 1) {
    return {
      error:
        `a help module declares the panel it explains exactly once, as \`panel: '...'\`; ` +
        `this one does it ${String(panels.length)} times`,
    };
  }
  const marks = [...text.matchAll(FEATURE_OF_EXPLANATION)];
  const features = marks.map((match, at) => {
    const from = (match.index ?? 0) + match[0].length;
    const next = marks[at + 1];
    const to = next === undefined ? text.length : (next.index ?? text.length);
    return {
      feature: match[1] ?? match[2] ?? '',
      letters: lettersIn(text.slice(from, to)),
      line: text.slice(0, match.index ?? 0).split('\n').length,
    };
  });
  return { file, panel: panels[0] ?? '', features };
}

/**
 * Every help entry this gate can see, as it read them.
 *
 * Exported so that `tests/harness/help.test.ts` can import the modules for real and assert
 * that what the gate parsed is what they export. That is the honest way to run a gate on text:
 * the text is what makes `--root` possible, and a test that imports is what stops the reading
 * quietly drifting from the reality.
 */
export function parseHelpEntries(root: string): readonly ParsedEntry[] {
  const found: ParsedEntry[] = [];
  for (const file of walk(root, { include: [HELP_DIR], extensions: ['.tsx'] })) {
    const parsed = parseEntry(root, file);
    if (!('error' in parsed)) found.push(parsed);
  }
  return found;
}

export function checkHelpCoverage(root: string): GateResult {
  const violations: Violation[] = [];
  const notes: string[] = [];

  const say = (file: string, line: number, text: string, message: string): void => {
    violations.push({ file, line, text, message });
  };

  /* The declarations. JSON rather than TypeScript so that this gate parses nothing it does not
     have to: a regular expression over a declaration list is a second grammar to get wrong. */
  let declared: readonly Declared[] = [];
  try {
    declared = (JSON.parse(readFileSync(join(root, PANELS_PATH), 'utf8')) as {
      panels: readonly Declared[];
    }).panels;
  } catch (error) {
    /* A tree with no declarations would pass every pairing check below trivially -- nothing
       declared is nothing unexplained -- so its absence is the failure, not a skip. */
    return {
      gate: GATE,
      scanned: 0,
      violations: [
        {
          file: PANELS_PATH,
          line: 1,
          text: PANELS_PATH,
          message:
            'this tree declares no panels at all, so there is nothing to hold the help ' +
            `entries against: ${String(error)}`,
        },
      ],
    };
  }

  /* One list of regions, not two: a panel's region has to be one the layout draws. */
  let regions: readonly string[] = [];
  try {
    const match = REGIONS_DECLARED.exec(readFileSync(join(root, REGIONS_PATH), 'utf8'));
    regions = match === null ? [] : [...(match[1] ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1] ?? '');
  } catch {
    regions = [];
  }
  if (regions.length === 0) {
    say(REGIONS_PATH, 1, REGIONS_PATH, 'the layout declares no regions, so no panel can be in one');
  }

  const byId = new Map(declared.map((panel) => [panel.id, panel]));
  if (byId.size !== declared.length) {
    say(PANELS_PATH, 1, PANELS_PATH, 'two panels are declared with the same id');
  }

  for (const panel of declared) {
    if (!regions.includes(panel.region)) {
      say(
        PANELS_PATH,
        1,
        panel.id,
        `panel "${panel.id}" is in region "${panel.region}", which the layout does not draw ` +
          `(the regions are ${regions.join(', ')})`,
      );
    }
    if (panel.heading.trim() === '') {
      say(PANELS_PATH, 1, panel.id, `panel "${panel.id}" has no heading`);
    }
    /* FR-053. A panel with nothing to explain shows no control, and the absence is
       information -- which it only is if the declaration says why. "Nobody has written it
       yet" and "there is nothing to write" look identical from the surface. */
    if (panel.features.length === 0 && (panel.nothingToExplain ?? '').trim() === '') {
      say(
        PANELS_PATH,
        1,
        panel.id,
        `panel "${panel.id}" declares no feature and does not say why; FR-053 prefers absence ` +
          'to a stub, but an unexplained absence is an oversight rather than a fact',
      );
    }
    if (panel.features.length > 0 && panel.nothingToExplain !== undefined) {
      say(
        PANELS_PATH,
        1,
        panel.id,
        `panel "${panel.id}" declares features and also says it has nothing to explain`,
      );
    }
  }

  /* The entries. One module per panel, named for the panel, so the sentence that describes a
     thing is beside the thing (spec 016, plan). */
  const helpFiles = walk(root, { include: [HELP_DIR], extensions: ['.tsx'] });
  const entries: ParsedEntry[] = [];
  for (const file of helpFiles) {
    const parsed = parseEntry(root, file);
    if ('error' in parsed) {
      say(file, 1, file, parsed.error);
      continue;
    }
    entries.push(parsed);
    const panel = byId.get(parsed.panel);
    if (panel === undefined) {
      say(
        file,
        1,
        parsed.panel,
        `this help entry names the panel "${parsed.panel}", which is not declared in ` +
          `${PANELS_PATH}: an explanation of something nobody can see`,
      );
      continue;
    }
    if (file !== entryFileFor(parsed.panel)) {
      say(file, 1, file, `the entry for "${parsed.panel}" belongs in ${entryFileFor(parsed.panel)}`);
    }
    for (const explained of parsed.features) {
      if (!panel.features.includes(explained.feature)) {
        say(
          file,
          explained.line,
          explained.feature,
          `panel "${parsed.panel}" has no feature "${explained.feature}"; it declares ` +
            `${panel.features.map((f) => `"${f}"`).join(', ') || 'none'}`,
        );
        continue;
      }
      if (explained.letters < MINIMUM_LETTERS) {
        say(
          file,
          explained.line,
          explained.feature,
          `the explanation of "${explained.feature}" on panel "${parsed.panel}" is empty ` +
            `(${String(explained.letters)} letters); FR-053 prefers no control at all to a stub`,
        );
      }
    }
    const seen = new Set(parsed.features.map((one) => one.feature));
    for (const feature of panel.features) {
      if (!seen.has(feature)) {
        say(
          file,
          1,
          feature,
          `panel "${parsed.panel}" declares the feature "${feature}" and nothing explains it`,
        );
      }
    }
  }

  const explained = new Map(entries.map((entry) => [entry.panel, entry]));
  for (const panel of declared) {
    if (panel.features.length > 0 && !explained.has(panel.id)) {
      say(
        PANELS_PATH,
        1,
        panel.id,
        `panel "${panel.id}" declares ${panel.features.map((f) => `"${f}"`).join(', ')} and has ` +
          `no help entry at all; it belongs in ${entryFileFor(panel.id)}`,
      );
    }
    if (panel.features.length === 0 && explained.has(panel.id)) {
      say(
        entryFileFor(panel.id),
        1,
        panel.id,
        `panel "${panel.id}" declares nothing to explain and yet something explains it`,
      );
    }
  }

  /*
   * Every panel the layout draws is declared, and every declaration is drawn.
   *
   * Without this the gate passes trivially on an empty list: nothing declared is nothing to
   * explain. A panel is drawn by naming its declaration, so the set of names in the harness
   * and the set of ids in the list have to be the same set.
   */
  const drawn = new Map<string, { file: string; line: number; text: string }>();
  const sources = walk(root, { include: ['src/harness'], extensions: ['.tsx'] }).filter(
    (file) => !file.startsWith(`${HELP_DIR}/`),
  );
  for (const file of sources) {
    readLines(root, file).forEach((text, index) => {
      for (const match of text.matchAll(PANEL_DRAWN)) {
        const id = match[1] ?? '';
        if (!drawn.has(id)) drawn.set(id, { file, line: index + 1, text });
      }
    });
  }
  for (const [id, where] of drawn) {
    if (!byId.has(id)) {
      say(
        where.file,
        where.line,
        where.text,
        `the layout draws a panel "${id}" that ${PANELS_PATH} does not declare`,
      );
    }
  }
  for (const panel of declared) {
    if (!drawn.has(panel.id)) {
      say(
        PANELS_PATH,
        1,
        panel.id,
        `panel "${panel.id}" is declared and nothing draws it; a declaration nothing renders ` +
          'is a list that has stopped describing the surface',
      );
    }
  }

  /*
   * The four rows §7 owes an explanation to, held by name (spec 016 SC-006, T031). The
   * requirements table says these four subjects have a help destination; naming them here is
   * what makes that a test rather than a promise.
   */
  const SECTION_SEVEN: readonly { readonly subject: string; readonly panel: string; readonly feature: string }[] = [
    { subject: 'attribution', panel: 'centre/attribution', feature: 'the influence radius' },
    { subject: 'lead and issue time', panel: 'controls/issue-time', feature: 'lead time and issue time' },
    { subject: 'the references and skill', panel: 'scores', feature: 'skill against a reference' },
    {
      subject: 'the observation footprint',
      panel: 'controls/observation-footprint',
      feature: 'the observation footprint',
    },
  ];
  for (const owed of SECTION_SEVEN) {
    const entry = explained.get(owed.panel);
    const has = entry?.features.some((one) => one.feature === owed.feature) ?? false;
    if (!has) {
      say(
        PANELS_PATH,
        1,
        owed.subject,
        `§7 of the requirements owes ${owed.subject} an explanation, and "${owed.feature}" on ` +
          `panel "${owed.panel}" is not there`,
      );
    }
  }

  const explanations = entries.reduce((total, entry) => total + entry.features.length, 0);
  notes.push(
    `${String(declared.length)} panels declared, ${String(explanations)} explanations in ` +
      `${String(entries.length)} entries, ${String(drawn.size)} panels drawn by the layout`,
  );
  notes.push(
    'the entries are read as text so that --root can swap the tree for a fixture; ' +
      'tests/harness/help.test.ts imports them and asserts this gate read them correctly',
  );

  return { gate: GATE, scanned: declared.length + explanations, violations, notes };
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) runAsMain(checkHelpCoverage);
