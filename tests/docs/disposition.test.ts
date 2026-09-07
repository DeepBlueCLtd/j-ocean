import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  build,
  readRecord,
  RECORD_PATH,
  SITE_PAGE_PATH,
  splitDestination,
  spliced,
  srdSection,
  sitePage,
  SRD_PATH,
  type DispositionRecord,
  type Entry,
} from '../../scripts/docs/build-disposition.js';

/**
 * The disposition record, held against the tree (spec 014 US2, FR-002, SC-002; SRD-v2 §7).
 *
 * `we tidied the page` and `we deleted the explanation` look identical from the outside, and
 * a record on disk that nothing checks is the second of those wearing the first's clothes.
 * So this file is what makes the record worth having:
 *
 * 1. every **site** entry resolves to a heading that exists in a page under `docs/site/`, and
 *    that section contains the matter;
 * 2. every **help** entry is reported as owed to the beat that will build it, and the count is
 *    asserted, so the holes cannot quietly grow;
 * 3. every **stays** entry names one of the four regions of beat 013.
 *
 * It was watched failing on a planted entry whose destination does not exist, which is the
 * standing half of PR-04 and is kept standing by the planted cases below.
 */

const ROOT = new URL('../../', import.meta.url).pathname;
const REGIONS = ['controls', 'centre', 'scores', 'detail'] as const;

/**
 * Prose is compared for what it says, not for how it is punctuated on the day. Markdown
 * emphasis, inline HTML, curly quotation marks and the three kinds of dash all differ between
 * a JSX literal and a markdown page while the sentence is word for word the same one, and a
 * test that failed on those would be a test of typography.
 */
export function normalise(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '-')
    .replace(/&ndash;/g, '-')
    .replace(/&rsquo;/g, "'")
    .replace(/[*_`]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text under a heading, up to the next heading at the same level or above it. */
export function sectionUnder(markdown: string, heading: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const wanted = normalise(heading);
  for (let at = 0; at < lines.length; at += 1) {
    const match = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[at] as string);
    if (match === null || normalise(match[2] as string) !== wanted) continue;
    const level = (match[1] as string).length;
    const body: string[] = [];
    for (let then = at + 1; then < lines.length; then += 1) {
      const next = /^(#{1,6})\s+/.exec(lines[then] as string);
      if (next !== null && (next[1] as string).length <= level) break;
      body.push(lines[then] as string);
    }
    return body.join('\n');
  }
  return null;
}

/**
 * What the record claims, checked against the tree. A list of failures rather than an
 * assertion, so that a planted entry can be watched producing one without the check itself
 * having to be duplicated for the planted case.
 */
export function failuresOf(record: DispositionRecord, root: string): string[] {
  const failures: string[] = [];
  const say = (entry: Entry, what: string): void => {
    failures.push(`${entry.id}: ${what} (destination ${entry.destination})`);
  };

  for (const entry of record.entries) {
    if (entry.kind === 'stays') {
      if (!(REGIONS as readonly string[]).includes(entry.destination)) {
        say(entry, `stays, but ${entry.destination} is not one of the four regions`);
      }
      continue;
    }

    if (entry.kind === 'help') {
      if (!entry.destination.startsWith('help:')) {
        say(entry, 'goes to help, but its destination does not name a help entry');
      }
      continue;
    }

    const parts = splitDestination(entry.destination);
    if (parts === null) {
      say(entry, 'goes to the site, but its destination names no heading');
      continue;
    }
    if (!parts.page.startsWith('docs/site/')) {
      say(entry, 'goes to the site, but its destination is not a page under docs/site/');
      continue;
    }
    const path = join(root, parts.page);
    if (!existsSync(path)) {
      say(entry, `goes to a page that does not exist: ${parts.page}`);
      continue;
    }
    const section = sectionUnder(readFileSync(path, 'utf8'), parts.heading);
    if (section === null) {
      say(entry, `${parts.page} has no heading "${parts.heading}"`);
      continue;
    }
    // An entry marked as arrived was already at its destination before this beat, in the
    // destination's own words: the record keeps the application's wording and names the words
    // that are actually there, and both have to be true.
    const wanted = entry.arrived === true ? entry.restatedAs : entry.matter;
    if (wanted === undefined) {
      say(entry, 'is marked as arrived but does not say in what words');
      continue;
    }
    if (!normalise(section).includes(normalise(wanted))) {
      say(entry, `the section "${parts.heading}" in ${parts.page} does not contain the matter`);
    }
  }
  return failures;
}

const record = readRecord(ROOT);

describe('the disposition record', () => {
  it('says where every piece of matter went, and nothing is unaccounted for', () => {
    expect(record.entries.length).toBeGreaterThan(0);
    const ids = record.entries.map((entry) => entry.id);
    expect(new Set(ids).size, 'two entries share an id').toBe(ids.length);
    for (const entry of record.entries) {
      expect(entry.matter.trim(), `${entry.id} carries no matter`).not.toBe('');
      expect(['stays', 'site', 'help']).toContain(entry.kind);
    }
  });

  it('resolves every site destination to a section that contains the matter', () => {
    expect(failuresOf(record, ROOT)).toEqual([]);
  });

  it('names one of the four regions for everything that stayed', () => {
    for (const entry of record.entries.filter((one) => one.kind === 'stays')) {
      expect(REGIONS, `${entry.id} stays in ${entry.destination}`).toContain(
        entry.destination as (typeof REGIONS)[number],
      );
    }
  });

  /**
   * The holes, counted. Beat 016 builds the help entries; until it does, this is what is
   * owed, and the number is asserted rather than reported so that a later beat cannot quietly
   * send a ninth paragraph into a destination that does not exist yet.
   */
  it('reports the help entries as owed to the beat that will build them, and counts them', () => {
    const owed = record.entries.filter((entry) => entry.kind === 'help');
    expect(record.owedTo).toBe('016-panel-help');
    expect(
      owed.length,
      'the number of paragraphs owed to beat 016 has changed; if that is deliberate, ' +
        'change the number here and say so in the commit',
    ).toBe(8);
    for (const entry of owed) {
      expect(entry.destination, `${entry.id} is owed to no named panel`).toMatch(/^help:[a-z-]+/);
    }
    console.log(
      `    ${String(owed.length)} explanations are owed to beat ${record.owedTo}: ` +
        owed.map((entry) => entry.destination).join(', '),
    );
  });
});

describe('a planted entry, so that the check is watched failing', () => {
  const plant = (entry: Partial<Entry>): DispositionRecord => ({
    ...record,
    entries: [
      ...record.entries,
      {
        id: 'planted',
        wasAt: 'nowhere: this entry is planted by the test',
        fromBeat: '014',
        kind: 'site',
        destination: 'docs/site/data-model.md#A heading no page has',
        matter: 'A paragraph that was never written and has nowhere to have gone.',
        ...entry,
      } as Entry,
    ],
  });

  it('fails naming the entry and the heading it expected', () => {
    const failures = failuresOf(plant({}), ROOT);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('planted');
    expect(failures[0]).toContain('A heading no page has');
  });

  it('fails naming the page when the page does not exist', () => {
    const failures = failuresOf(
      plant({ destination: 'docs/site/nowhere.md#Configuration' }),
      ROOT,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('docs/site/nowhere.md');
  });

  it('fails when the heading exists but the matter never arrived under it', () => {
    const failures = failuresOf(
      plant({ destination: 'docs/site/data-model.md#Configuration' }),
      ROOT,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('does not contain the matter');
  });

  it('fails when something that stays names a region that does not exist', () => {
    const failures = failuresOf(plant({ kind: 'stays', destination: 'sidebar' }), ROOT);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('not one of the four regions');
  });
});

/**
 * Principle IX. §7 and the site's disposition page are rendered from the record rather than
 * transcribed beside it, so a record edited without the generator being run is a tree in which
 * two tables disagree. This is what notices.
 */
describe('what is generated from the record', () => {
  it('is what is on disk, in the requirements and on the site', () => {
    const srd = readFileSync(join(ROOT, SRD_PATH), 'utf8');
    expect(
      srd,
      `§7 of ${SRD_PATH} is not what ${RECORD_PATH} generates; run pnpm disposition`,
    ).toBe(spliced(srd, srdSection(record)));
    expect(
      readFileSync(join(ROOT, SITE_PAGE_PATH), 'utf8'),
      `${SITE_PAGE_PATH} is not what ${RECORD_PATH} generates; run pnpm disposition`,
    ).toBe(sitePage(record));
  });

  it('is written by a build step, not by hand', () => {
    expect(typeof build).toBe('function');
  });

  /**
   * FR-005's other half. The application names the site it sent the narrative to -- held in the
   * browser by tests/shell/prose.spec.ts -- and the site has to offer the way back, or a reader
   * who followed the link out has been sent to a document about an application they can no
   * longer reach.
   */
  it('leaves the site offering the way back to the application', () => {
    const overview = readFileSync(join(ROOT, 'docs/site/index.md'), 'utf8');
    expect(overview, 'the site no longer offers a way into the application').toContain(
      'app/index.html',
    );
    const layout = readFileSync(join(ROOT, 'scripts/docs/build-site.ts'), 'utf8');
    expect(layout, 'the site masthead no longer carries the launch link on every page').toContain(
      'class="launch"',
    );
  });
});
