import { expect, test, type Page } from '@playwright/test';
import { declared, PANE_IDS, REFERENCE } from './declared-geometry.js';

/**
 * The workspace, and what it remembers (spec 018 US1, US2, FR-001, FR-004, FR-005, SC-003,
 * SC-004; ADR-0014; constitution Principle IX).
 *
 * `tests/harness/workspace-state.test.ts` holds the grammar; this holds the browser. The two
 * are not the same claim: the grammar says what *may* be stored, and this says what actually
 * is, read out of the storage a real visit wrote.
 *
 * The planted `seed` appears here too, and it is planted the way it would actually arrive: in
 * storage, put there by something that is not this build — an older version, another tab, a
 * reader with a console. It is refused by name and the default arrangement comes back.
 */

const KEY = declared.presentation.workspace.storageKey;

async function stored(page: Page): Promise<Record<string, unknown> | null> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), KEY);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}

async function loaded(page: Page): Promise<void> {
  await expect(page.getByTestId('pane-controls')).toBeVisible();
  await expect(page.getByTestId('pane-horizons')).toBeVisible();
}

/*
 * At the reference viewport, not at the floor.
 *
 * The floor is where the panes are already at the width below which they cannot be read, so
 * there is no slack for a reader to rearrange: dragging a sash there moves nothing, which is
 * correct behaviour and makes the floor the wrong window to assert rearranging in. The claim
 * is about a reader with a screen.
 */
test.beforeEach(async ({ page }) => {
  await page.setViewportSize(REFERENCE);
});

test.describe('a docked workspace', () => {
  /** FR-001: panes with headers, resizable, re-dockable and tabbed together. */
  test('draws every pane with a header, and the provenance panes as tabs', async ({ page }) => {
    await page.goto('/');
    await loaded(page);

    /* A tab that is not showing is not in the document — that is what a tab is — so the walk
       selects each provenance tab in turn and requires its pane to arrive. */
    const seen = new Set<string>();
    const record = async (): Promise<void> => {
      for (const id of await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]')).map(
          (element) => element.dataset['paneId'] ?? '',
        ),
      )) {
        seen.add(id);
      }
    };
    const TABS: readonly { readonly title: string; readonly pane: string }[] = [
      { title: 'Instruments', pane: 'provenance/instruments' },
      { title: 'Truth record', pane: 'provenance/truth' },
      { title: 'Manifest', pane: 'provenance/manifest' },
      { title: 'The run', pane: 'provenance/run' },
    ];
    await record();
    for (const tab of TABS) {
      await page.locator('.dv-tab', { hasText: tab.title }).first().click();
      // Waited for rather than assumed: a tab's pane arrives in the document when the tab is
      // shown, and a walk that recorded before it arrived would report a pane as missing.
      await expect(page.getByTestId(`pane-${tab.pane}`)).toBeVisible();
      await record();
    }
    for (const id of PANE_IDS) {
      expect(seen.has(id), `${id} is not on the surface`).toBe(true);
    }

    // Every pane has a header a reader can grab, which is what makes it re-dockable.
    const tabs = await page.locator('.dv-tab').allTextContents();
    for (const title of ['Controls', 'Horizons', 'Selection', 'The run', 'Manifest']) {
      expect(tabs.join(' | '), `${title} has no tab`).toContain(title);
    }

    // The four provenance panes share one group, which is what makes them tabs rather than
    // four more rectangles competing with the row for the window.
    const groups = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.dv-groupview')).map((group) =>
        Array.from(group.querySelectorAll<HTMLElement>('.dv-tab')).length,
      ),
    );
    expect(groups, 'no group carries the four provenance tabs').toContain(4);

    // And a sash between every pair, which is the resizing affordance.
    expect(await page.locator('.dv-sash, .sash').count()).toBeGreaterThan(0);
  });

  /** SC-004, first half: a rearranged workspace survives a reload. */
  test('remembers a rearranged workspace across a reload', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await loaded(page);

    const before = (await page.getByTestId('pane-controls').boundingBox())?.width ?? 0;
    // Dragged, not set: the arrangement a reader leaves is the one they made with a mouse.
    const sash = page.locator('.dv-sash').first();
    const box = await sash.boundingBox();
    expect(box, 'there is no sash to drag, so nothing can be rearranged').not.toBeNull();
    await page.mouse.move((box?.x ?? 0) + 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await page.mouse.down();
    await page.mouse.move((box?.x ?? 0) + 90, (box?.y ?? 0) + (box?.height ?? 0) / 2, { steps: 8 });
    await page.mouse.up();

    const after = (await page.getByTestId('pane-controls').boundingBox())?.width ?? 0;
    expect(after, 'dragging the sash moved nothing').toBeGreaterThan(before + 20);

    await page.reload();
    await loaded(page);
    const returned = (await page.getByTestId('pane-controls').boundingBox())?.width ?? 0;
    expect(
      Math.abs(returned - after),
      `the workspace came back ${String(Math.round(returned))} px wide having been left ` +
        `${String(Math.round(after))} px wide`,
    ).toBeLessThanOrEqual(2);
  });

  /**
   * SC-003, in the browser. What a real visit writes is geometry and pane identity, and every
   * key in it is one the grammar admits. Nothing about the run is anywhere in the string.
   */
  test('stores geometry and pane identity, and nothing of the run', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await loaded(page);
    // A run with something in it: built, scored, and an edit applied, so that if anything of
    // the run could reach storage there is something to find.
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 120_000 });

    const record = await stored(page);
    expect(record, 'the workspace stored nothing at all').not.toBeNull();
    expect(Object.keys(record ?? {}).sort()).toEqual(['activeGroup', 'grid', 'panels', 'version']);
    for (const pane of Object.values((record?.['panels'] ?? {}) as Record<string, object>)) {
      expect(Object.keys(pane).sort()).toEqual(['component', 'id', 'title']);
    }

    // And the run itself, by name. The seed is on the surface and it is not in storage.
    const seed = await page.getByTestId('root-seed').textContent();
    // The digest as the status strip publishes it: the manifest tab's copy is behind a tab,
    // and a figure behind a tab is not a figure this test can read without going there.
    const digest = await page.getByTestId('status-digest').textContent();
    const text = JSON.stringify(record);
    expect(seed?.trim() ?? '').not.toBe('');
    expect(text, 'the root seed reached storage').not.toContain(seed?.trim() ?? 'no-seed');
    expect(text, 'the results digest reached storage').not.toContain(digest?.trim() ?? 'no-digest');

    /*
     * Pane identity is a closed vocabulary, and that is what stops it carrying a payload.
     *
     * A pane is called Manifest and its id is `provenance/manifest`, and neither is a manifest:
     * they are the name of a piece of furniture. So the check is not that the word never
     * appears -- loosening a word list until it passes is how a check stops meaning anything --
     * but that every id and every component name is one this build declares. An id nothing
     * declares is the only way identity could carry something, and it is refused on the way in
     * as well (see the planted cases below).
     */
    for (const [id, pane] of Object.entries(
      (record?.['panels'] ?? {}) as Record<string, { id: string; component: string }>,
    )) {
      expect(PANE_IDS, `the stored pane "${id}" is not one the layout declares`).toContain(id);
      expect(PANE_IDS, `the stored pane "${id}" names an undeclared component`).toContain(
        pane.component,
      );
    }

    /*
     * And the geometry carries no vocabulary at all: with pane identity taken out, what is left
     * is the tree of splits and their sizes, and none of the run's words may be in it.
     *
     * Identity is taken out by name rather than by key, because the layout manager writes a
     * pane's id in three places -- as a field, as a key of `panels`, and inside the grid's own
     * leaves. Every one of those is a declared pane id, checked as a closed vocabulary just
     * above; removing exactly those strings is what leaves the geometry alone to be scanned.
     */
    const geometryOnly = PANE_IDS.reduce(
      (text, id) => text.split(id).join(''),
      JSON.stringify(record, (key, value) =>
        key === 'title' || key === 'id' || key === 'component' ? undefined : value,
      ),
    );
    for (const word of ['seed', 'manifest', 'edit', 'observation', 'forecast', 'score', 'digest']) {
      expect(geometryOnly.toLowerCase(), `"${word}" reached the stored geometry`).not.toContain(word);
    }

    // Nothing else was written either: one key, and it is the declared one.
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys).toEqual([KEY]);
  });

  /**
   * SC-004, second half, and US2 scenario 3. A stored arrangement carrying a run key is
   * refused **by name** and the default is restored -- planted the way it would arrive, in
   * storage, by something that is not this build.
   */
  test('refuses a planted seed in storage by name, and restores the default', async ({ page }) => {
    await page.addInitScript(
      ([key, payload]) => {
        window.localStorage.setItem(key as string, payload as string);
      },
      [
        KEY,
        JSON.stringify({
          version: declared.presentation.workspace.layoutVersion,
          seed: '6a09e667f3bcc908',
          grid: { root: { type: 'leaf', data: { views: ['controls'], id: '1' }, size: 400 }, width: 1658, height: 800, orientation: 'HORIZONTAL' },
          panels: { controls: { id: 'controls', contentComponent: 'controls', title: 'Controls' } },
        }),
      ],
    );
    await page.goto('/');
    await loaded(page);

    const refusal = page.getByTestId('workspace-refusal');
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText('"seed"');
    await expect(refusal).toContainText('Principle IX');

    // And the seed did nothing: the run is the recorded case, from the declared seed.
    await expect(page.getByTestId('recorded-case')).toContainText('the recorded case');
  });

  /** US2 scenario 3: a stored layout naming a pane this build has not got. */
  test('reports a stored layout it cannot apply, and restores the default', async ({ page }) => {
    await page.addInitScript(
      ([key, payload]) => {
        window.localStorage.setItem(key as string, payload as string);
      },
      [
        KEY,
        JSON.stringify({
          version: declared.presentation.workspace.layoutVersion,
          grid: { root: { type: 'leaf', data: { views: ['sidebar'], id: '1' }, size: 400 }, width: 1658, height: 800, orientation: 'HORIZONTAL' },
          panels: { sidebar: { id: 'sidebar', contentComponent: 'sidebar', title: 'Sidebar' } },
        }),
      ],
    );
    await page.goto('/');
    await loaded(page);
    await expect(page.getByTestId('workspace-refusal')).toContainText('"sidebar"');
    // The panes that are not behind a tab are all back; the tabbed group is back as a group.
    for (const id of ['controls', 'horizons', 'selection', 'provenance/run']) {
      await expect(page.getByTestId(`pane-${id}`)).toHaveCount(1);
    }
  });

  /** US2 scenario 4: one control returns the default arrangement. */
  test('returns the default arrangement on one control', async ({ page }) => {
    await page.goto('/');
    await loaded(page);
    const before = (await page.getByTestId('pane-controls').boundingBox())?.width ?? 0;

    const sash = page.locator('.dv-sash').first();
    const box = await sash.boundingBox();
    await page.mouse.move((box?.x ?? 0) + 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await page.mouse.down();
    await page.mouse.move((box?.x ?? 0) + 90, (box?.y ?? 0) + (box?.height ?? 0) / 2, { steps: 8 });
    await page.mouse.up();
    expect((await page.getByTestId('pane-controls').boundingBox())?.width ?? 0).toBeGreaterThan(before + 20);

    await page.getByTestId('reset-workspace').click();
    const back = (await page.getByTestId('pane-controls').boundingBox())?.width ?? 0;
    expect(Math.abs(back - before), 'the default arrangement did not come back').toBeLessThanOrEqual(2);
    expect(await stored(page), 'the arrangement was not forgotten').not.toBeNull();
  });

  /**
   * The spec's second edge case. A pane may be closed; the surface offers it back **by name**,
   * and nothing that was computed is lost by closing it.
   */
  test('offers a closed pane back by name, with the run untouched', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await loaded(page);
    const digest = await page.getByTestId('status-digest').textContent();

    await page
      .locator('.dv-tab', { hasText: 'Selection' })
      .first()
      .locator('.dv-default-tab-action, svg, button')
      .first()
      .click();
    await expect(page.getByTestId('pane-selection')).toHaveCount(0);

    const offer = page.getByTestId('open-pane-selection');
    await expect(offer).toBeVisible();
    await expect(offer).toContainText('Selection');
    // Nothing computed went with it.
    expect(await page.getByTestId('status-digest').textContent()).toBe(digest);

    await offer.click();
    await expect(page.getByTestId('pane-selection')).toHaveCount(1);
    expect(await page.getByTestId('status-digest').textContent()).toBe(digest);
  });

  /**
   * FR-58, as geometry. The status strip is not in the dock, so there is no arrangement a
   * reader can reach in which the statement has been closed, tabbed away or dragged into a
   * corner.
   */
  test('keeps the statement out of the dock, where nothing can close it', async ({ page }) => {
    await page.goto('/');
    await loaded(page);
    const outside = await page
      .getByTestId('pane-status')
      .evaluate((element) => element.closest('.dv-groupview') === null && element.closest('[data-testid="workspace-dock"]') === null);
    expect(outside, 'the status strip is inside the dock').toBe(true);
    await expect(page.getByTestId('pane-status').getByTestId('not-operational')).toBeVisible();
  });
});
