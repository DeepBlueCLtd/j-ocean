import { expect, test, type Page } from '@playwright/test';
import { declared, LEADS } from './declared-geometry.js';
import { decodePng } from './greyscale.js';

/**
 * An addressable, operable surface (spec 017 SC-001 to SC-007; SRD-v2 FR-56 to FR-58, AT-15).
 *
 * Three claims are held here, and each is measured rather than inspected.
 *
 * **A link opens on the thing being discussed, and never restores a run.** The address carries
 * panel, cell and observation and nothing else; a planted `seed=` is ignored and reported, and
 * `tests/harness/address.test.ts` is what stops a fourth key ever being added. What a link
 * names that this run has not got is said **by name**, and the surface shows its unselected
 * state rather than the nearest thing.
 *
 * **Selecting writes the address; mounting does not.** That is asserted twice over, because
 * one of the two ways of asserting it is too weak on its own: the **whole address string** is
 * compared across a remount -- a reordered query string is still a rewritten URL to anyone who
 * copies it -- and every call to `history.replaceState` and `pushState` is counted, so "no
 * write" is the absence of a call rather than the absence of a visible difference.
 *
 * **Operable and legible.** The keyboard pass walks the whole surface and **names what it
 * could not reach**; greyscale is measured on pixels rendered through a real saturation
 * filter; and `prefers-reduced-motion` is one walk over every element in every state rather
 * than three assertions in three files.
 */

/** The run's own grid, for a cell address that this run can honour. */
const GRID = `${String(100)}x${String(100)}`;

/**
 * Every write to the address, counted from before the page's own script runs.
 *
 * Wrapping the two methods is the only way to tell "nothing was written" from "what was
 * written happened to match": a surface that canonicalised a query string on mount and got the
 * same string back would pass a comparison and fail the requirement.
 */
async function countAddressWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __addressWrites?: string[] };
    store.__addressWrites = [];
    for (const name of ['replaceState', 'pushState'] as const) {
      const original = history[name].bind(history);
      history[name] = (data: unknown, unused: string, url?: string | URL | null): void => {
        store.__addressWrites?.push(`${name} ${String(url ?? '')}`);
        original(data, unused, url ?? null);
      };
    }
  });
}

const writes = async (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __addressWrites?: string[] }).__addressWrites ?? []);

/** Loaded far enough that the address has been resolved against a run that exists. */
async function loaded(page: Page): Promise<void> {
  await expect(page.getByTestId('run-panel')).toBeVisible();
  /* The digest as the status strip publishes it. Beat 018 put a copy in the manifest tab and
     one in the strip, and the strip's is the one on screen without a reader going anywhere --
     which is what "loaded" means here. */
  await expect(page.getByTestId('status-digest')).not.toBeEmpty();
}

async function buildRow(page: Page): Promise<void> {
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row').or(page.getByTestId('enlarged-centre'))).toBeVisible({
    timeout: 60_000,
  });
}

/** One observation id this run actually made, read off the surface rather than assumed. */
async function anObservationId(page: Page): Promise<string> {
  const id = await page
    .getByTestId('panel-field-24-marks')
    .locator('li[data-kind="drop"]')
    .first()
    .getAttribute('data-mark-id');
  expect(id, 'this run drew no XBT drop, so there is no observation to address').not.toBeNull();
  return id as string;
}

test.describe('a link opens on the thing being discussed', () => {
  /**
   * SC-001 and AT-15. The whole of the first user story: a panel, a cell, and the detail
   * region filled from the address alone.
   */
  test('opens on the panel and the cell a link names', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(`/?panel=48&cell=2431@${GRID}`);
    await loaded(page);

    // The cell needs no row: the analysis exists as soon as the run does, and the breakdown is
    // an instrument of a selected cell.
    await expect(page.getByTestId('cell-breakdown')).toBeVisible();
    await expect(page.getByTestId('cell-breakdown')).toContainText('2431');
    await expect(page.getByTestId('address-refusals')).toHaveCount(0);

    // The panel is held until the row it is in exists, and the surface says so and what it
    // costs (FR-048) rather than leaving a reader at an empty centre.
    await expect(page.getByTestId('address-held')).toContainText('+48 h');
    await expect(page.getByTestId('address-held')).toContainText('when you ask');

    await buildRow(page);
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();
    await expect(page.getByTestId('panel-48')).toBeVisible();
    await expect(page.getByTestId('strip-48')).toHaveAttribute('data-marked', 'true');
    // And the cell that was selected on the way in is still what the detail region holds.
    await expect(page.getByTestId('cell-breakdown')).toContainText('2431');
  });

  /** SC-001's other half: an observation address fills the region with the profile and ghost. */
  test('opens on the observation a link names, with its own profile', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await loaded(page);
    await buildRow(page);
    const id = await anObservationId(page);

    await page.goto(`/?panel=24&observation=${id}`);
    await loaded(page);
    await buildRow(page);

    await expect(page.getByTestId('observation-hover')).toHaveAttribute('data-mark-id', id);
    // FR-28 carried: the measured levels are kept as a ghost beside the model's derived ones.
    await expect(page.getByTestId('profile-comparison')).toBeVisible();
    await expect(page.getByTestId('address-refusals')).toHaveCount(0);
  });

  /**
   * FR-005 and Principle VI, four links over. Each names something plausible that this run has
   * not got, and in each the near match is the tempting answer. None is taken.
   */
  test('reports by name what this run has not got, and selects nothing near it', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const cases: { readonly address: string; readonly says: readonly string[] }[] = [
      { address: '?panel=144', says: ['+144 h', 'does not declare'] },
      { address: `?cell=2431@120x120`, says: ['120 × 120', '100 × 100', 'a different place'] },
      { address: `?cell=999999@${GRID}`, says: ['cell 999999', '10000 cells'] },
      {
        address: '?observation=xbt/9999/interface',
        says: ['xbt/9999/interface', 'this run has not got'],
      },
      { address: '?seed=6a09e667f3bcc908', says: ['"seed"', 'does not honour', 'as a manifest'] },
    ];

    for (const one of cases) {
      await page.goto(`/${one.address}`);
      await loaded(page);
      const banner = page.getByTestId('address-refusals');
      await expect(banner, `${one.address} was accepted without a word`).toBeVisible();
      for (const words of one.says) {
        await expect(banner, `${one.address} did not say "${words}"`).toContainText(words);
      }
      // The unselected state, not a near match: no breakdown, no profile, no enlargement.
      await expect(page.getByTestId('detail-empty')).toBeVisible();
      await expect(page.getByTestId('cell-breakdown')).toHaveCount(0);
      await expect(page.getByTestId('observation-hover')).toHaveCount(0);
      await expect(page.getByTestId('address-held')).toHaveCount(0);
    }
  });

  /**
   * The spec's last edge case. A reader who arrived by link has not asked to be put in the
   * detail region, and moving them there would be the surface deciding where they should be
   * looking.
   */
  test('does not move focus to the detail region', async ({ page }) => {
    await page.goto(`/?cell=2431@${GRID}`);
    await loaded(page);
    await expect(page.getByTestId('cell-breakdown')).toBeVisible();

    const where = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) return 'nothing';
      const region = active.closest('[data-pane-id]')?.getAttribute('data-pane-id');
      return `${active.tagName.toLowerCase()} in ${region ?? 'no region'}`;
    });
    expect(where, 'opening a link moved the reader into the detail region').toBe(
      'body in no region',
    );
  });

  /**
   * FR-040 in its purest form. Addressing computes nothing: a link that opened on a cell has
   * the same fields and the same analysis as a visit that opened on nothing, and the digest
   * the manifest panel publishes is how a reader checks that for themselves.
   */
  test('computes nothing: the results digest is the same as a visit with no address', async ({
    page,
  }) => {
    await page.goto('/');
    await loaded(page);
    const plain = await page.getByTestId('status-digest').textContent();

    await page.goto(`/?panel=48&cell=2431@${GRID}&seed=6a09e667f3bcc908`);
    await loaded(page);
    expect(
      await page.getByTestId('status-digest').textContent(),
      'opening a link changed what the run computed, which is the FR-040 entanglement itself',
    ).toBe(plain);
  });
});

test.describe('selecting writes the address; mounting does not', () => {
  /**
   * SC-002, both ways. The **whole** string is compared, and every write is counted.
   *
   * The address deliberately carries something the surface refused -- an unknown key and a
   * cell from another grid -- because that is where a mount-time write would show: the
   * tempting thing for a surface to do is tidy the URL it was given, and tidying is rewriting.
   */
  test('leaves the whole address string identical across three mounts', async ({ page }) => {
    test.setTimeout(240_000);
    await countAddressWrites(page);
    const address = `/?observation=nobody&seed=6a09e667f3bcc908&panel=48&cell=2431@120x120`;

    for (const mount of ['first load', 'a reload', 'a returning tab']) {
      if (mount === 'a reload') await page.reload();
      else await page.goto(address);
      await loaded(page);
      await expect(page.getByTestId('address-refusals')).toBeVisible();

      expect(
        await page.evaluate(() => location.pathname + location.search),
        `${mount} rewrote the address`,
      ).toBe(address);
      expect(
        await writes(page),
        `${mount} wrote to the address; mounting must not (FR-056)`,
      ).toEqual([]);
    }

    // And then a selection writes, once, replacing rather than pushing.
    const before = await page.evaluate(() => history.length);
    await page.getByTestId('attribution-view-overlay').click({ position: { x: 40, y: 40 } });
    await expect(page.getByTestId('cell-breakdown')).toBeVisible();
    const written = await writes(page);
    expect(written, `a selection wrote ${String(written.length)} times, not once`).toHaveLength(1);
    expect(written[0]).toContain('replaceState');
    expect(
      await page.evaluate(() => history.length),
      'the selection pushed a history entry rather than replacing one',
    ).toBe(before);

    // The refused parts -- the unknown key, the cell from another grid, the observation this
    // run has not got -- are gone the moment the reader chooses something, and the one part the
    // link named that this run does have is still there. The address is written from the
    // selection, not from the string it arrived as.
    const now = await page.evaluate(() => location.search);
    expect(now).toMatch(/^\?panel=48&cell=\d+@100x100$/);
  });

  /** T032. Clearing a selection returns the address to its unselected form: nothing at all. */
  test('returns the address to its unselected form when the selection is cleared', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await loaded(page);
    await buildRow(page);
    const id = await anObservationId(page);

    await page.getByTestId('enlarge-24').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();
    expect(await page.evaluate(() => location.search)).toBe('?panel=24');

    // Pinning a mark, from the elevation the enlarged panel draws.
    await page.getByTestId(`needle-${id}`).click();
    await expect(page.getByTestId('observation-hover')).toBeVisible();
    expect(await page.evaluate(() => location.search)).toBe(
      `?panel=24&observation=${id}`,
    );

    // Release, which had been an inert control since beat 008: a hover may not take a pinned
    // selection away, and the guard that says so was swallowing the Release click as well.
    await page.getByTestId('unpin-mark').click();
    await expect(page.getByTestId('observation-hover')).toHaveCount(0);
    expect(await page.evaluate(() => location.search)).toBe('?panel=24');

    // And closing the enlargement empties it altogether.
    await page.getByTestId('enlarge-24').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible();
    expect(
      await page.evaluate(() => location.pathname + location.search),
      'clearing every selection left something in the address',
    ).toBe('/');
  });

  /**
   * T033. What the back button does, asserted rather than left emergent.
   *
   * Writes replace, so no number of selections stands between the reader and wherever they
   * were before they arrived: the back button undoes the **arrival**, not the poking about.
   * That is the whole reason for choosing replace -- a reader learning the field by clicking
   * cells would otherwise build a history they have to escape backwards through, which
   * punishes exactly the behaviour the instrument wants.
   */
  test('takes the reader back past every selection to where they arrived from', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/?panel=0');
    await loaded(page);
    await page.goto('/');
    await loaded(page);
    const entries = await page.evaluate(() => history.length);

    await page.getByTestId('attribution-view-overlay').click({ position: { x: 30, y: 30 } });
    await expect(page.getByTestId('cell-breakdown')).toBeVisible();
    await page.getByTestId('attribution-view-overlay').click({ position: { x: 60, y: 60 } });
    await page.getByTestId('attribution-view-overlay').click({ position: { x: 90, y: 90 } });
    await expect(page.getByTestId('cell-breakdown')).toBeVisible();

    expect(
      await page.evaluate(() => history.length),
      'three selections built three history entries; writes are meant to replace',
    ).toBe(entries);

    await page.goBack();
    await loaded(page);
    expect(
      await page.evaluate(() => location.search),
      'the back button landed on a selection rather than on where the reader arrived from',
    ).toBe('?panel=0');
  });
});

test.describe('operable without a mouse', () => {
  /**
   * SC-004. The pass **names what it could not reach** rather than counting what it could: a
   * count passes by growing, and the thing worth knowing is which control a keyboard reader
   * cannot press.
   *
   * The surface is walked in its fullest state -- the row built and scored, a panel enlarged,
   * every disclosure open -- because a control that renders only after something has been
   * clicked is still a control.
   */
  test('reaches every control, in an order that does not go back on itself', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await loaded(page);
    await buildRow(page);
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', {
      timeout: 60_000,
    });
    await page.getByTestId('enlarge-24').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('details')) {
        (node as HTMLDetailsElement).open = true;
      }
    });

    /** Everything a reader is meant to be able to operate, stamped so the walk can name it. */
    const walk = await page.evaluate(() => {
      const surface = document.querySelector('[data-testid="one-view"]');
      if (surface === null) throw new Error('there is no surface to walk');
      /*
       * Everything in the tab order. `tabindex="-1"` is excluded and that is not a loophole:
       * the strip and the elevation are roving-focus groups, so their entries are reached by
       * the arrow keys from the one stop the group has, and the test below walks both of them
       * that way. Six slots and thirty needles as thirty-six tab stops would put the next
       * region a very long way from this one.
       */
      const operable = surface.querySelectorAll<HTMLElement>(
        'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), ' +
          'input:not([disabled]):not([tabindex="-1"]), ' +
          'textarea:not([disabled]):not([tabindex="-1"]), ' +
          'select:not([disabled]):not([tabindex="-1"]), [tabindex="0"]',
      );
      const found: { mark: string; name: string; region: string }[] = [];
      const grouped: { name: string; group: string }[] = [];
      let at = 0;
      for (const element of operable) {
        if (element.getClientRects().length === 0) continue;
        /*
         * A radio group is one tab stop -- the checked button -- and the arrow keys move
         * within it. That is the browser's own behaviour and it is the right one: a group of
         * choices is one choice. The unchecked buttons are recorded as reached through their
         * group rather than quietly dropped, and the group's own tab stop has to be in the
         * walk for that to be true.
         */
        if (element instanceof HTMLInputElement && element.type === 'radio' && !element.checked) {
          grouped.push({
            name: `${element.getAttribute('data-testid') ?? 'a radio'} (group "${element.name}")`,
            group: element.name,
          });
          continue;
        }
        const mark = String(at);
        at += 1;
        element.setAttribute('data-kbd', mark);
        const region = (() => {
          /* A pane's **tab** is its header, and the layout manager draws it outside the
             pane's own element -- so a tab is a control of the pane whose content is in the
             same group, and not a control belonging to nothing. Beat 013 had no headers and
             could ask the element directly. */
          const direct = element.closest('[data-pane-id]');
          if (direct !== null) return direct.getAttribute('data-pane-id') ?? 'no pane';
          const content = element.closest('.dv-groupview')?.querySelector('[data-pane-id]');
          return content?.getAttribute('data-pane-id') ?? 'no pane';
        })();
        const label =
          element.getAttribute('data-testid') ??
          element.getAttribute('aria-label') ??
          (element.textContent ?? '').trim().slice(0, 40);
        found.push({ mark, name: `${element.tagName.toLowerCase()} "${label}"`, region });
      }
      const stops = new Set(
        [...operable]
          .filter((element) => element instanceof HTMLInputElement && element.type === 'radio' && element.checked)
          .map((element) => (element as HTMLInputElement).name),
      );
      return { found, grouped, groupsWithAStop: grouped.every((one) => stops.has(one.group)) };
    });
    expect(walk.found.length, 'nothing operable was found, so the walk proves nothing').toBeGreaterThan(
      20,
    );
    expect(
      walk.groupsWithAStop,
      `these are only reachable inside a radio group with no tab stop of its own: ` +
        walk.grouped.map((one) => one.name).join(', '),
    ).toBe(true);
    const expected = walk.found;

    const reached: string[] = [];
    const regions: string[] = [];
    const unringed: string[] = [];
    /*
     * The walk starts above the surface rather than from wherever the last click left the
     * focus, and it gets there through a sentinel outside the application's own root.
     *
     * Two things make that necessary and neither is incidental. Blurring is not enough: the
     * browser keeps a sequential-navigation starting point where the blurred element was, so
     * the next Tab would resume half way down the surface and report the top of it as
     * unreachable. And focusing the first control directly would reach it *programmatically*,
     * which is not `:focus-visible` -- so the ring would be missing for the one element the
     * test did not press Tab to get to. The sentinel is a child of the body rather than of the
     * React root, so nothing is inserted into a tree React reconciles.
     */
    await page.evaluate(() => {
      const sentinel = document.createElement('button');
      sentinel.type = 'button';
      sentinel.id = 'kbd-sentinel';
      sentinel.textContent = 'start of the keyboard walk';
      sentinel.style.position = 'fixed';
      sentinel.style.left = '-9999px';
      document.body.insertBefore(sentinel, document.body.firstChild);
      sentinel.focus();
    });
    for (let step = 0; step < expected.length + 12; step += 1) {
      await page.keyboard.press('Tab');
      const here = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active === null || active === document.body) return null;
        const style = getComputedStyle(active);
        const width = Number.parseFloat(style.outlineWidth);
        return {
          mark: active.getAttribute('data-kbd'),
          name: active.getAttribute('data-testid') ?? active.tagName.toLowerCase(),
          region: (() => {
            const direct = active.closest('[data-pane-id]');
            if (direct !== null) return direct.getAttribute('data-pane-id') ?? 'no pane';
            const content = active.closest('.dv-groupview')?.querySelector('[data-pane-id]');
            return content?.getAttribute('data-pane-id') ?? 'no pane';
          })(),
          ringed: style.outlineStyle !== 'none' && (Number.isNaN(width) || width > 0),
        };
      });
      if (here === null) break;
      if (here.mark !== null) reached.push(here.mark);
      if (regions[regions.length - 1] !== here.region) regions.push(here.region);
      if (!here.ringed) unringed.push(here.name);
    }

    const missed = expected.filter((one) => !reached.includes(one.mark));
    expect(
      missed.map((one) => `${one.region}: ${one.name}`),
      'these controls are on the surface and no amount of tabbing reaches them',
    ).toEqual([]);
    expect(
      unringed,
      'these controls take focus without showing a focus ring, so a keyboard reader cannot ' +
        'see where they are',
    ).toEqual([]);

    /*
     * The tab order does not go back on itself: it may stay in a pane and it may move on, but
     * once it has left a pane it does not return to it. A tab order that wandered between
     * columns would be a reader losing their place on every keystroke.
     *
     * Beat 013 asserted this against four fixed regions in a fixed order. A workspace a reader
     * may rearrange cannot promise a fixed order -- and should not: a reader who moved the
     * selection pane to the left moved where it comes in the reading order too. So the claim
     * is stated as what it always was, without the list: each pane is one contiguous run of
     * tab stops, so no pane is returned to.
     */
    const revisited = regions.filter((pane, at) => regions.indexOf(pane) !== at);
    expect(
      revisited,
      `the tab order goes back on itself: ${regions.join(' -> ')}`,
    ).toEqual([]);
    expect(
      regions.filter((pane) => pane === 'no pane'),
      `the tab order reached a control that belongs to no pane: ${regions.join(' -> ')}`,
    ).toEqual([]);

    console.log(
      `    keyboard: ${String(expected.length)} tab stops, all reached, plus ` +
        `${String(walk.grouped.length)} inside a radio group, in the pane order ` +
        `${regions.join(' -> ')}`,
    );
  });

  /**
   * The strip and the elevation are roving-focus groups, so their entries are reached by the
   * arrow keys rather than by a tab stop each. Six slots and thirty needles would otherwise put
   * thirty-six keystrokes between this region and the next.
   */
  test('reaches every strip entry and every needle with the arrow keys', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await loaded(page);
    await buildRow(page);
    await page.getByTestId('enlarge-0').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();

    await page.getByTestId(`strip-${String(LEADS[0])}`).focus();
    const visited: string[] = [];
    for (let step = 0; step < LEADS.length - 1; step += 1) {
      await page.keyboard.press('ArrowRight');
      visited.push(
        (await page.evaluate(() => document.activeElement?.getAttribute('data-lead-hours'))) ?? '',
      );
    }
    expect(visited, 'the arrow keys did not reach every slot in the strip').toEqual(
      LEADS.slice(1).map(String),
    );

    // The elevation: one tab stop, the arrows move along the needles, Enter pins one, and the
    // detail region fills without the reader's place being taken from them (FR-057).
    await page.getByTestId('needle-elevation-needles').focus();
    await expect(page.getByTestId('observation-hover')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('observation-hover')).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
      'committing from the elevation moved the reader out of it',
    ).toBe('needle-elevation-needles');
  });

  /**
   * FR-057's fourth clause, and T043. A cell chosen with the keyboard fills the detail region,
   * the change is announced, and the reader is left exactly where they were.
   */
  test('fills the detail region from the keyboard, announced, without taking focus', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await loaded(page);

    await expect(page.getByTestId('pane-selection')).toHaveAttribute('aria-live', 'polite');
    await page.getByTestId('attribution-view-cells').focus();
    await expect(page.getByTestId('attribution-view-cells')).toContainText('cell 5050');

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('attribution-view-cells')).toContainText('cell 5151');
    // Moving the cursor selects nothing: the reader is looking, and Enter is the commit.
    await expect(page.getByTestId('detail-empty')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('cell-breakdown')).toContainText('5151');
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
      'the detail region filling took the reader out of the field they were reading',
    ).toBe('attribution-view-cells');
    // And it is a selection like any other, so it is in the address.
    expect(await page.evaluate(() => location.search)).toBe(`?cell=5151@${GRID}`);
  });
});

test.describe('legible without colour, and still under prefers-reduced-motion', () => {
  /**
   * SC-005. The page is rendered through a real saturation filter and photographed, and the
   * distinctions a reader is asked to make are measured on those pixels.
   *
   * The filter is on the document rather than on the screenshot, so what is measured is a
   * composited page -- the WebGL field, the hatch and the chrome together -- and the first
   * thing asserted is that the filter actually applied. A greyscale measurement taken on a
   * photograph still in colour would pass while measuring nothing.
   */
  test('keeps the attribution field structure with the colour taken out', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await loaded(page);
    await page.evaluate(() => {
      document.documentElement.style.filter = 'grayscale(1)';
    });

    const field = page.getByTestId('attribution-view');
    await expect(field).toBeVisible();
    const pixels = decodePng(await field.screenshot());

    let colourful = 0;
    let brightest = -1;
    let darkest = 256;
    for (let y = 6; y < pixels.height - 6; y += 3) {
      for (let x = 6; x < pixels.width - 6; x += 3) {
        const [r, g, b] = pixels.channelsAt(x, y);
        if (Math.max(Math.abs(r - g), Math.abs(g - b)) > 4) colourful += 1;
        const value = pixels.luminanceAt(x, y);
        brightest = Math.max(brightest, value);
        darkest = Math.min(darkest, value);
      }
    }
    expect(colourful, 'the saturation filter did not apply, so nothing here was measured').toBe(0);

    const margin = brightest - darkest;
    console.log(
      `    attribution field through grayscale(1): ${darkest.toFixed(1)} to ` +
        `${brightest.toFixed(1)} of 255, margin ${margin.toFixed(1)} against a declared 40`,
    );
    expect(
      margin,
      'with the colour removed the attribution field is flat, so a monochrome reader cannot ' +
        'see where the observations were',
    ).toBeGreaterThan(40);
  });

  /**
   * The strip's marking, measured the same way. Beat 015 measured it on the rendered page as
   * it is drawn; this measures it on a page that has had its colour taken away, which is the
   * claim FR-057 actually makes.
   */
  test('marks the enlarged horizon with the colour taken out', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await loaded(page);
    await buildRow(page);
    await page.getByTestId('enlarge-48').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.filter = 'grayscale(1)';
    });

    const strip = page.getByTestId('horizon-strip');
    const stripBox = await strip.boundingBox();
    const marked = await page.getByTestId('strip-48').boundingBox();
    const plain = await page.getByTestId('strip-24').boundingBox();
    const pixels = decodePng(await strip.screenshot());
    const border = (box: { x: number; y: number; width: number; height: number } | null): number =>
      pixels.luminanceAt(
        (box?.x ?? 0) - (stripBox?.x ?? 0) + 1,
        (box?.y ?? 0) - (stripBox?.y ?? 0) + (box?.height ?? 0) / 2,
      );
    const margin = Math.abs(border(marked) - border(plain));
    console.log(
      `    strip marking through grayscale(1): margin ${margin.toFixed(1)} of 255 against a ` +
        'declared 40',
    );
    expect(margin).toBeGreaterThan(40);
    // And the word beside it, which is the channel for a reader who can see neither.
    await expect(page.getByTestId('strip-48')).toContainText('enlarged');
  });

  /*
   * Beat 017's test that the four figure kinds are distinguished by something other than hue
   * moved to `tests/shell/figure-kinds.spec.ts` in beat 018, and grew a second half.
   *
   * The claim did not change and the instrument did: beat 017 read what the *stylesheet*
   * computed for each kind, and the requirement is that a monochrome **print** still says
   * which kind a figure is. A print is made of pixels, so each kind is now photographed
   * through the same saturation filter used above and compared on ink, underline and lean.
   * The stylesheet check is kept beside it, because the two fail on different mistakes.
   */

  /**
   * SC-006, once for the whole surface. Nothing animates anywhere: enlarging replaces the
   * centre's contents, opening help places a card, and a selection fills a region. This walks
   * every element in every state a reader can reach and names anything that still moves --
   * one test rather than an assertion per beat, because "nothing animates" is one claim.
   */
  test('animates nothing anywhere, in every state, under prefers-reduced-motion', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const moving = async (state: string): Promise<string[]> =>
      page.evaluate((where) => {
        const named: string[] = [];
        for (const element of Array.from(document.querySelectorAll('*'))) {
          const style = getComputedStyle(element);
          const durations = [style.transitionDuration, style.animationDuration]
            .flatMap((value) => value.split(',').map((part) => part.trim()))
            .filter((value) => value !== '0s' && value !== '');
          if (durations.length > 0) {
            named.push(
              `[${where}] ${element.tagName.toLowerCase()}.${String(
                (element as HTMLElement).className,
              )}: ${durations.join(' ')}`,
            );
          }
        }
        return named;
      }, state);

    const still: string[] = [];
    await page.goto('/');
    await loaded(page);
    still.push(...(await moving('on arrival')));

    // The manifest is a tab of the provenance pane, so its help control is reached by
    // selecting it -- and selecting a tab is itself a state this test wants measured.
    await page.locator('.dv-tab', { hasText: 'Manifest' }).first().click();
    await page.getByTestId('help-control-controls/manifest').click();
    await expect(page.getByTestId('help-controls/manifest')).toBeVisible();
    still.push(...(await moving('with help open')));
    await page.keyboard.press('Escape');

    await buildRow(page);
    still.push(...(await moving('with the row built')));

    await page.getByTestId('enlarge-48').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();
    still.push(...(await moving('enlarged')));

    await page.getByTestId('panel-field-48-overlay').click({ position: { x: 40, y: 40 } });
    await expect(page.getByTestId('cell-breakdown')).toBeVisible();
    still.push(...(await moving('with a cell selected')));

    await page.setViewportSize({ width: 900, height: 700 });
    await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
    still.push(...(await moving('below the declared floor')));

    expect(
      still,
      `these parts of the surface still move under prefers-reduced-motion:\n  ${still.join('\n  ')}`,
    ).toEqual([]);
  });
});

test.describe('the disclaimer', () => {
  /**
   * SC-007. FR-058 is the one piece of prose the layout beats may not reclaim, and "visible
   * without interaction" is a claim about geometry, so it is measured: nothing is clicked, no
   * disclosure is opened, and the whole rectangle is inside the viewport.
   */
  test('is visible without interaction at the declared minimum, and in the fallback', async ({
    page,
  }) => {
    const within = async (where: string): Promise<void> => {
      const statement = page.getByTestId('not-operational');
      await expect(statement, `the statement is not on screen ${where}`).toBeVisible();
      await expect(statement).toContainText('not an operational forecast system');
      const box = await statement.boundingBox();
      const viewport = page.viewportSize();
      expect(box?.y ?? -1, `the statement is above the viewport ${where}`).toBeGreaterThanOrEqual(0);
      expect(
        (box?.y ?? 0) + (box?.height ?? 0),
        `the statement runs off the bottom of the viewport ${where}`,
      ).toBeLessThanOrEqual(viewport?.height ?? 0);
      expect((box?.x ?? -1)).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
    };

    // The declared minimum, which is the viewport this suite runs at.
    await page.setViewportSize({
      width: declared.presentation.minimumViewportWidthPx,
      height: declared.presentation.minimumViewportHeightPx,
    });
    await page.goto('/');
    await loaded(page);
    await within('at the declared minimum viewport');

    // The FR-043 fallback, where there is least room and most to say.
    await page.setViewportSize({ width: 900, height: 700 });
    await expect(page.getByTestId('viewport-floor-notice')).toBeVisible();
    await within('in the single-panel fallback');
  });

  /**
   * FR-058's second half. It is not the thing that got moved behind a help control when space
   * ran short: it is in the flow of the controls region, outside that region's scroller, and
   * inside neither a disclosure nor a help card.
   */
  test('is not behind a disclosure or a help control', async ({ page }) => {
    await page.goto('/');
    await loaded(page);

    const placed = await page.getByTestId('not-operational').evaluate((element) => ({
      insideADisclosure: element.closest('details') !== null,
      insideHelp: element.closest('[data-help]') !== null,
      insideAScroller: element.closest('[data-scrolls="true"]') !== null,
      region: element.closest('[data-pane-id]')?.getAttribute('data-pane-id') ?? null,
    }));
    expect(placed.insideADisclosure, 'the statement is behind a disclosure').toBe(false);
    expect(placed.insideHelp, 'the statement is behind a help control').toBe(false);
    expect(placed.insideAScroller, 'the statement can be scrolled off screen').toBe(false);
    /* Beat 018 moved it to the status strip, which is not a pane and cannot be closed, tabbed
       behind anything or dragged into a corner. The claim -- that FR-58's statement is on the
       surface and not behind anything -- is the same one and is now stronger: on beat 013's
       surface it was in a region a reader could not remove because there were no controls to
       remove one with; here it is outside the dock by construction. */
    expect(placed.region).toBe('status');

    // No help control anywhere opens onto it either, which is what makes "not the only place"
    // true rather than merely likely: the sentence is on the surface, and it is not in help.
    const inHelp = await page.evaluate(async () => {
      const found: string[] = [];
      for (const control of document.querySelectorAll<HTMLButtonElement>('.help-control')) {
        control.click();
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        for (const card of document.querySelectorAll('[data-help]')) {
          if ((card.textContent ?? '').includes('not an operational forecast system')) {
            found.push(card.getAttribute('data-help') ?? 'a help card');
          }
        }
        control.click();
      }
      return found;
    });
    expect(inHelp, 'the statement is inside a help card, which is where FR-058 forbids it').toEqual(
      [],
    );
  });
});
