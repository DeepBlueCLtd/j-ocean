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

export type Kind = 'stays' | 'site' | 'help';

export interface Entry {
  readonly id: string;
  readonly wasAt: string;
  readonly fromBeat: string;
  readonly kind: Kind;
  readonly destination: string;
  readonly matter: string;
  readonly arrived?: boolean;
  readonly restatedAs?: string;
  readonly note?: string;
}

export interface DispositionRecord {
  readonly record: string;
  readonly beat: string;
  readonly kinds: Readonly<Record<Kind, string>>;
  readonly regions: readonly string[];
  readonly owedTo: string;
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
  const owed = of(record, 'help');
  const rows = record.entries.map((entry) => {
    const where =
      entry.kind === 'stays'
        ? `Stays, in the **${entry.destination}** region`
        : entry.kind === 'site'
          ? `${entry.arrived === true ? 'Site, and was already there' : 'Site'}: \`${entry.destination}\``
          : `Help, owed to beat ${record.owedTo}: \`${entry.destination}\``;
    return `| ${cell(entry.wasAt)} | ${cell(entry.matter)} | ${where} |`;
  });

  return [
    BEGIN,
    '',
    `Generated from \`${RECORD_PATH}\`, which is held by \`tests/docs/disposition.test.ts\`.`,
    `${String(record.entries.length)} pieces of matter: ${String(of(record, 'stays').length)} stay in a region,`,
    `${String(of(record, 'site').length)} went to the site, and ${String(owed.length)} are **owed to beat`,
    `${record.owedTo}** — a known hole with a beat number on it, which is not the same as a pass.`,
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
    'The record itself is',
    `[\`${RECORD_PATH}\`](https://github.com/DeepBlueCLtd/j-ocean/blob/main/${RECORD_PATH}),`,
    'and `tests/docs/disposition.test.ts` holds it: every destination on this page has to',
    'exist and has to contain the words, and the help entries that do not exist yet are',
    'counted so that the holes cannot quietly grow.',
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
      `Owed to beat ${record.owedTo}`,
      `It explains a panel that stays, so it belongs in that panel's help, which beat ${record.owedTo} builds. ` +
        'Until then the words live in the record and the test reports the destination as owed. ' +
        'That is a known hole with a beat number on it, and not a pass.',
      (entry) => `\`${cell(entry.destination)}\``,
    ),
    table(
      'stays',
      'It stayed on the application',
      'A reader drives it, or reads a live figure from it, so it stays — compacted — in the region that owns it.',
      (entry) => `The **${cell(entry.destination)}** region`,
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

  const owed = of(record, 'help').length;
  process.stdout.write(
    `disposition: ${String(record.entries.length)} entries -> ${SRD_PATH} §7 and ${SITE_PAGE_PATH}` +
      ` (${String(owed)} owed to beat ${record.owedTo})\n`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) build();
