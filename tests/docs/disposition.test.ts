import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HELP_ENTRIES } from '../../src/harness/help/index.js';
import { REGIONS } from '../../src/harness/panels.js';
import { declaredConfiguration } from '../support/config.js';
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
 * 2. every **help** entry resolves to a panel whose help entry, **rendered**, contains the
 *    matter -- which is what beat 014 wrote this test forward to. Until beat 016 these were
 *    reported as owed and counted; they are paid now, and the same eight paragraphs are held
 *    against the sentences a reader actually opens;
 * 3. every **stays** entry names one of the four regions of beat 013;
 * 4. every **dropped** entry carries a reason, because a paragraph that vanished without one is
 *    indistinguishable from a paragraph somebody lost.
 *
 * It was watched failing on a planted entry whose destination does not exist, which is the
 * standing half of PR-04 and is kept standing by the planted cases below.
 */

const ROOT = new URL('../../', import.meta.url).pathname;

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
 * What every panel's help says, once rendered: the words a reader actually opens.
 *
 * Rendered rather than read from the source, because the requirement is about what the surface
 * says. A source that mentioned the words in a comment would satisfy a text search and teach a
 * reader nothing.
 */
export function renderedHelp(): ReadonlyMap<string, string> {
  const { config } = declaredConfiguration();
  return new Map(
    HELP_ENTRIES.map((entry) => [
      entry.panel,
      entry.explains
        .map((one) => renderToStaticMarkup(one.body(config) as never))
        .join(' '),
    ]),
  );
}

/**
 * What the record claims, checked against the tree. A list of failures rather than an
 * assertion, so that a planted entry can be watched producing one without the check itself
 * having to be duplicated for the planted case.
 */
export function failuresOf(
  record: DispositionRecord,
  root: string,
  help: ReadonlyMap<string, string> = renderedHelp(),
): string[] {
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

    if (entry.kind === 'dropped') {
      if ((entry.reason ?? '').trim() === '') {
        say(entry, 'was dropped and does not say why');
      }
      continue;
    }

    if (entry.kind === 'help') {
      if (!entry.destination.startsWith('help:')) {
        say(entry, 'goes to help, but its destination does not name a help entry');
        continue;
      }
      const panel = entry.destination.slice('help:'.length);
      const rendered = help.get(panel);
      if (rendered === undefined) {
        say(entry, `goes to a panel with no help entry: ${panel}`);
        continue;
      }
      const wanted = entry.restatedAs ?? entry.matter;
      if (!normalise(rendered).includes(normalise(wanted))) {
        say(entry, `the help at ${panel} does not say it`);
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
    const wanted = entry.restatedAs ?? (entry.arrived === true ? undefined : entry.matter);
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
      expect(['stays', 'site', 'help', 'dropped']).toContain(entry.kind);
    }
  });

  /**
   * One list of regions, not two. `REGIONS` is what `Regions.tsx` lays the surface out from and
   * what every panel declaration names; the record's own list has to be that list, or the
   * record is describing a surface that has moved on without it.
   */
  it('names the regions the layout draws, and not a copy of them', () => {
    expect(record.regions).toEqual([...REGIONS]);
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
   * The eight beat 014 owed to beat 016, paid.
   *
   * This test was written two beats before the thing it tests, which is the point of having
   * written it: the count was asserted so a ninth paragraph could not arrive quietly, and the
   * destinations were named so that building them was a checkable act rather than a claim.
   * The count is still asserted, and each one now has to be *in* the help a reader opens --
   * `failuresOf` renders the entry and looks for the words.
   */
  it('has paid the eight explanations beat 014 owed, at the panels it named', () => {
    const owed = record.entries.filter(
      (entry) => entry.kind === 'help' && entry.step === undefined,
    );
    expect(record.helpBuiltIn).toBe('016-panel-help');
    expect(
      owed.length,
      'the number of paragraphs beat 014 sent to panel help has changed; if that is ' +
        'deliberate, change the number here and say so in the commit',
    ).toBe(8);
    const help = renderedHelp();
    for (const entry of owed) {
      expect(entry.destination, `${entry.id} names no panel`).toMatch(/^help:[a-z-]+/);
      expect(entry.builtIn, `${entry.id} does not say which beat built it`).toBe('016-panel-help');
      expect(
        help.has(entry.destination.slice('help:'.length)),
        `${entry.id} names a panel with no help: ${entry.destination}`,
      ).toBe(true);
    }
    console.log(
      `    ${String(owed.length)} explanations beat 014 owed are built in beat ` +
        `${record.helpBuiltIn}: ${owed.map((entry) => entry.destination).join(', ')}`,
    );
  });

  /**
   * The walkthrough's steps, all of them (spec 016 FR-007, US5, SC-004).
   *
   * Eleven steps, and every one has a destination here: a panel's help, a section of the site,
   * or `dropped` with a reason. The count is asserted for the same reason beat 014 asserted
   * its own: a step that quietly stopped being accounted for would look exactly like a step
   * that never existed.
   */
  it('gives every one of the retired walkthrough\'s steps a destination', () => {
    const steps = record.entries.filter((entry) => entry.step !== undefined);
    const numbers = [...new Set(steps.map((entry) => entry.step))].sort((a, b) =>
      (a ?? 0) - (b ?? 0),
    );
    expect(numbers, 'the walkthrough declared eleven steps').toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    for (const entry of steps) {
      expect(['site', 'help', 'dropped'], `${entry.id} went nowhere nameable`).toContain(entry.kind);
    }
    console.log(
      `    ${String(steps.length)} pieces of the walkthrough, across ${String(numbers.length)} ` +
        `steps: ${String(steps.filter((e) => e.kind === 'help').length)} to panel help, ` +
        `${String(steps.filter((e) => e.kind === 'site').length)} to the site, ` +
        `${String(steps.filter((e) => e.kind === 'dropped').length)} dropped with a reason`,
    );
  });

  it('does not leave the walkthrough on the surface it retired', () => {
    expect(
      existsSync(join(ROOT, 'src/harness/Walkthrough.tsx')),
      'the walkthrough component is still in the tree; FR-052 says panel-level and not a tour',
    ).toBe(false);
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

  /** Beat 016's own three, so that the help and dropped branches are watched failing too. */
  it('fails when a help destination names a panel with no help', () => {
    const failures = failuresOf(plant({ kind: 'help', destination: 'help:centre/nowhere' }), ROOT);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('goes to a panel with no help entry');
  });

  it('fails when the panel has help and the help does not say it', () => {
    const failures = failuresOf(plant({ kind: 'help', destination: 'help:scores' }), ROOT);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('the help at scores does not say it');
  });

  it('fails when something is dropped and does not say why', () => {
    const failures = failuresOf(plant({ kind: 'dropped', destination: 'dropped' }), ROOT);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('does not say why');
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
