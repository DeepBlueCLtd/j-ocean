import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The disposition record, rendered where it has to be read (spec 014 T025, Principle IX).
 *
 * `docs/narrative-disposition.json` is the record of where every piece of the application's
 * narrative went. Two places have to show it: §7 of the UI requirements, which is the
 * requirement that the record exists, and a page of the site, which is where a reader who
 * wants a paragraph back goes to find it.
 *
 * Both are **generated from the record** rather than written beside it. A table transcribed
 * twice is two tables that disagree the first time an entry is edited, and the whole point of
 * the record is that "we tidied the page" and "we deleted the explanation" have to stay
 * distinguishable months later.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const RECORD_PATH = 'docs/narrative-disposition.json';
export const SRD_PATH = 'j-ocean-ui-srd.md';
export const SITE_PAGE_PATH = 'docs/site/disposition.md';

/** The fences the generated block sits between, in a file that is otherwise hand-written. */
export const BEGIN = '<!-- generated from docs/narrative-disposition.json by scripts/docs/build-disposition.ts -->';
export const END = '<!-- end generated -->';

/**
 * Where a piece of matter went.
 *
 * `walkthrough` is beat 018's, and it is the one direction beat 016 had no way to record.
 * Matter *returned*: a workspace of docked panes raises "what am I looking at", which panel
 * help cannot answer, and two of the retired tour's steps belong to the walkthrough that
 * answers it. A record that could only say where matter went once would be a record that
 * quietly stopped describing the tree the second time it moved.
 */
export type Kind = 'stays' | 'site' | 'help' | 'dropped' | 'walkthrough';

export interface Entry {
  readonly id: string;
  readonly wasAt: string;
  readonly fromBeat: string;
  /** Which of the retired walkthrough's steps this was, where it was one (spec 016 FR-007). */
  readonly step?: number;
  readonly kind: Kind;
  readonly destination: string;
  /** Which of the panel's declared features carries it, for a `help` destination. */
  readonly feature?: string;
  readonly matter: string;
  readonly arrived?: boolean;
  readonly restatedAs?: string;
  /** Which beat built the help entry that carries it. */
  readonly builtIn?: string;
  /** Where this was before it moved again, for matter that has moved twice. */
  readonly previously?: string;
  /** The beat that reclaimed it, for matter that came back. */
  readonly reclaimedIn?: string;
  /** Why it is carried nowhere, for a `dropped` destination. Required for one. */
  readonly reason?: string;
  readonly note?: string;
}

export interface DispositionRecord {
  readonly record: string;
  readonly beat: string;
  readonly kinds: Readonly<Record<Kind, string>>;
  readonly regions: readonly string[];
  /** The beat that built the help entries. Beat 014 owed them; beat 016 paid them. */
  readonly helpBuiltIn: string;
  /** The beat that reclaimed matter for the walkthrough. Beat 016 retired it; beat 018 asked. */
  readonly walkthroughReclaimedIn: string;
  readonly entries: readonly Entry[];
}

export function readRecord(root = ROOT): DispositionRecord {
  return JSON.parse(readFileSync(join(root, RECORD_PATH), 'utf8')) as DispositionRecord;
}

const of = (record: DispositionRecord, kind: Kind): readonly Entry[] =>
  record.entries.filter((entry) => entry.kind === kind);

/** A cell of a markdown table: the pipe is the only character that would break one. */
const cell = (text: string): string => text.replace(/\|/g, '\\|');

/** `docs/site/data-model.md#Some heading` reads as a page and a heading, not as a slug. */
export function splitDestination(destination: string): { page: string; heading: string } | null {
  const at = destination.indexOf('#');
  if (at < 0) return null;
  return { page: destination.slice(0, at), heading: destination.slice(at + 1) };
}

const siteHref = (destination: string): string => {
  const parts = splitDestination(destination);
  if (parts === null) return destination;
  const page = parts.page.replace(/^docs\/site\//, '').replace(/\.md$/, '.html');
  return `[${cell(parts.heading)}](${page})`;
};

/**
 * §7 of the UI requirements: the shape SRD-v2 asked for -- what was on the application page,
 * and where it is now -- one row per piece of matter, in the record's order.
 */
export function srdSection(record: DispositionRecord): string {
  const rows = record.entries.map((entry) => {
    const where =
      entry.kind === 'stays'
        ? `Stays, in the **${entry.destination}** pane`
        : entry.kind === 'site'
          ? `${entry.arrived === true ? 'Site, and was already there' : 'Site'}: \`${entry.destination}\``
          : entry.kind === 'dropped'
            ? `**Dropped**, with a reason: ${entry.reason ?? ''}`
            : entry.kind === 'walkthrough'
              ? `Walkthrough: \`${entry.destination}\`${entry.previously === undefined ? '' : ` (reclaimed from ${entry.previously})`}`
              : `Help, at the panel: \`${entry.destination}\`${entry.feature === undefined ? '' : `, under *${entry.feature}*`}`;
    return `| ${cell(entry.wasAt)} | ${cell(entry.matter)} | ${where} |`;
  });

  return [
    BEGIN,
    '',
    `Generated from \`${RECORD_PATH}\`, which is held by \`tests/docs/disposition.test.ts\`.`,
    `${String(record.entries.length)} pieces of matter: ${String(of(record, 'stays').length)} stay in a region,`,
    `${String(of(record, 'site').length)} went to the site, ${String(of(record, 'help').length)} are a panel's own`,
    `help, built in beat ${record.helpBuiltIn}, ${String(of(record, 'walkthrough').length)} are the`,
    `walkthrough's, reclaimed in beat ${record.walkthroughReclaimedIn}, and ${String(of(record, 'dropped').length)}`,
    'were **dropped with a recorded reason** rather than carried anywhere. Every destination is',
    'resolved by the test: a site section that contains the words, a help entry or a walkthrough',
    'step that renders them, or a reason.',
    '',
    '| Was on the application page | The matter | Now |',
    '|---|---|---|',
    ...rows,
    '',
    END,
  ].join('\n');
}

/** The same record as a page of the site, where a reader who wants a paragraph back looks. */
export function sitePage(record: DispositionRecord): string {
  const table = (kind: Kind, heading: string, lead: string, destinationOf: (entry: Entry) => string): string => {
    const entries = of(record, kind);
    return [
      `## ${heading}`,
      '',
      lead,
      '',
      '| Where it was | The words | Where they are now |',
      '|---|---|---|',
      ...entries.map(
        (entry) => `| ${cell(entry.wasAt)} (beat ${entry.fromBeat}) | ${cell(entry.matter)} | ${destinationOf(entry)} |`,
      ),
      '',
    ].join('\n');
  };

  return [
    '---',
    'title: Disposition',
    'summary: Where every piece of the application page\'s narrative went when the application stopped carrying it.',
    'order: 6',
    '---',
    '',
    BEGIN,
    '',
    '# Where the narrative went',
    '',
    'Beat 014 took the prose off the application. The application opens on the forecast',
    'diagrams and the controls that drive them; nothing was deleted, and this page is the',
    'record of where each piece of it went.',
    '',
    'Beat 016 retired the walkthrough and built the panel help beat 014 was owed, so every one',
    "of the tour's steps has a row here too: a help entry, a section of this site, or a reason",
    'for being dropped.',
    '',
    'Beat 018 made the application a docked workspace, and two things followed. Eleven readouts',
    'that had been written as sentences became readouts. And the walkthrough returned, to answer',
    'the question a workspace of panes raises and panel help cannot — *what am I looking at* —',
    'so some matter that had gone to the site came back to it. Those rows say where they were.',
    '',
    'The record itself is',
    `[\`${RECORD_PATH}\`](https://github.com/DeepBlueCLtd/j-ocean/blob/main/${RECORD_PATH}),`,
    'and `tests/docs/disposition.test.ts` holds it: every destination on this page has to',
    'exist and has to contain the words — a site section that contains them, or a help entry',
    'that renders them.',
    '',
    table(
      'site',
      'It went to this site',
      'It stated no live figure, so it belongs where a reader arrives before the instrument.',
      (entry) =>
        `${siteHref(entry.destination)}${entry.arrived === true ? ' — already there before this beat, recorded as arrived rather than moved' : ''}`,
    ),
    table(
      'help',
      "It went to the panel's own help",
      'It explains a panel that stays, so it is behind that panel\'s help control, opening where ' +
        'the reader is looking. The test renders each entry and holds these words against what it ' +
        'renders, so a panel whose explanation is edited away fails the build.',
      (entry) =>
        `\`${cell(entry.destination)}\`${entry.feature === undefined ? '' : `, under **${cell(entry.feature)}**`}`,
    ),
    table(
      'walkthrough',
      'It came back, to the walkthrough',
      'Beat 016 retired the walkthrough and sent these elsewhere, on the reasoning that a ' +
        "workspace-level explanation had nowhere to live once the tour was gone. Beat 018's " +
        'docked workspace raises the question panel help cannot answer — *what am I looking ' +
        'at* — so the walkthrough returned and these came back with it. The test renders each ' +
        'step and holds these words against what it renders.',
      (entry) =>
        `\`${cell(entry.destination)}\`${entry.previously === undefined ? '' : ` — reclaimed from ${cell(entry.previously)}`}`,
    ),
    table(
      'dropped',
      'It was dropped, and here is why',
      'The surface now says it better, or says it for itself. Nothing is carried; the reason is ' +
        'written down, because a paragraph that vanished without one is indistinguishable from a ' +
        'paragraph somebody lost.',
      (entry) => cell(entry.reason ?? '— no reason recorded, which is itself a failure'),
    ),
    table(
      'stays',
      'It stayed on the application',
      'A reader drives it, or reads a live figure from it, so it stays — as a readout — in the pane that owns it.',
      (entry) => `The **${cell(entry.destination)}** pane`,
    ),
    END,
    '',
  ].join('\n');
}

/** Replaces the generated block of a hand-written file, leaving the rest of it alone. */
export function spliced(existing: string, block: string): string {
  const begin = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  if (begin < 0 || end < 0) {
    throw new Error(`the generated block's markers are missing: expected ${BEGIN} and ${END}`);
  }
  return existing.slice(0, begin) + block + existing.slice(end + END.length);
}

export function build(root = ROOT): void {
  const record = readRecord(root);

  const srd = join(root, SRD_PATH);
  writeFileSync(srd, spliced(readFileSync(srd, 'utf8'), srdSection(record)));
  writeFileSync(join(root, SITE_PAGE_PATH), sitePage(record));

  process.stdout.write(
    `disposition: ${String(record.entries.length)} entries -> ${SRD_PATH} §7 and ${SITE_PAGE_PATH}` +
      ` (${String(of(record, 'help').length)} in panel help, ${String(of(record, 'dropped').length)} dropped` +
      ` with a reason)\n`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) build();
