import { expect, test, type Page } from '@playwright/test';
import { LEADS } from './declared-geometry.js';
import { decodePng } from './greyscale.js';

/**
 * Enlargement is a selection, not a mode (spec 015 SC-001 to SC-005; SRD-v2 FR-049 to FR-051,
 * FR-057, AT-13).
 *
 * The requirement this file holds is a requirement about **the surface not moving**. Enlarging
 * a panel replaces what the centre region holds and nothing else: the controls, the scores and
 * the detail region keep their rectangles, a selection already in the detail region survives,
 * and choosing another horizon in the strip swaps the centre with no unenlarged frame in
 * between. Each of those is measured here rather than inspected.
 *
 * Three of the measurements are worth saying something about.
 *
 * **The rectangles are compared to the pixel**, because "does not move" admits of no
 * tolerance: a surface that shifted by two pixels on a click would teach the same caution a
 * surface that reflowed does. It holds because the centre's height is declared rather than
 * fitted (`presentation.centreChromeHeightPx`), so the box the scores sit beneath is the same
 * box whatever the centre is holding.
 *
 * **The absence of an intermediate frame is read from a ledger, not from a clock.** The centre
 * writes each content kind it renders into `data-centre-ledger`; a swap must read
 * `enlarged(48) enlarged(96)` with no `row` between them. A timing assertion would pass on a
 * fast machine and fail on a slow one, which is a test that measures the machine.
 *
 * **Field identity is identity.** The array each canvas drew is left on that canvas, and the
 * comparison is `===` inside the page. Deep equality would be satisfied by a recomputed copy,
 * which is the failure FR-051 exists to forbid.
 */

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function regionBoxes(page: Page): Promise<Record<string, Rect | null>> {
  return page.evaluate(() => {
    const box = (testId: string): Rect | null => {
      const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      controls: box('pane-controls'),
      centre: box('pane-horizons'),
      detail: box('pane-selection'),
    };
  });
}

/** The recorded case, with the row built and scored: the fullest the centre ever is. */
async function scoredRow(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('score-row').click();
  await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
}

async function ledger(page: Page): Promise<string[]> {
  const entries = await page.getByTestId('centre-ledger').getAttribute('data-centre-ledger');
  return (entries ?? '').split(' ').filter((entry) => entry !== '');
}

test.describe('enlargement is a selection', () => {
  /**
   * SC-001 and AT-13. A panel is enlarged, a second is chosen in the strip, and the controls,
   * the scores and the detail region are unmoved throughout -- with a selection already in the
   * detail region, which has to survive both.
   */
  test('replaces the centre and moves nothing else, through an enlargement and a swap', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await scoredRow(page);

    // A selection first: FR-047 gives the detail region whatever was last selected, and this
    // beat may not take it away by enlarging something.
    await page.getByTestId('panel-field-24-overlay').click({ position: { x: 60, y: 60 } });
    await expect(page.getByTestId('cell-breakdown')).toBeVisible();
    const selected = await page.getByTestId('cell-breakdown').textContent();

    const withTheRow = await regionBoxes(page);

    await page.getByTestId('enlarge-48').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();
    const enlarged = await regionBoxes(page);

    await page.getByTestId('strip-96').click();
    await expect(page.getByTestId('panel-96')).toBeVisible();
    const swapped = await regionBoxes(page);

    for (const region of ['controls', 'scores', 'detail'] as const) {
      expect(
        enlarged[region],
        `the ${region} region moved when a panel was enlarged`,
      ).toEqual(withTheRow[region]);
      expect(
        swapped[region],
        `the ${region} region moved when the strip swapped the centre`,
      ).toEqual(withTheRow[region]);
    }

    // And the centre itself keeps its box, which is what makes the three above true: it is
    // the region whose *contents* changed, and its height is declared rather than fitted.
    expect(enlarged['centre'], 'the centre region changed shape when it was enlarged').toEqual(
      withTheRow['centre'],
    );
    expect(swapped['centre'], 'the centre region changed shape on a swap').toEqual(
      withTheRow['centre'],
    );

    // The selection survived both, unchanged.
    await expect(page.getByTestId('cell-breakdown')).toBeVisible();
    expect(await page.getByTestId('cell-breakdown').textContent()).toBe(selected);

    // And back to the row, which is again only the centre's contents.
    await page.getByTestId('enlarge-96').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible();
    const backToTheRow = await regionBoxes(page);
    expect(backToTheRow).toEqual(withTheRow);
  });

  /**
   * The centre holds the row or exactly one enlarged panel, never both and never neither, and
   * whichever it holds fits the box it has. A centre whose content outgrew it would spill into
   * the scores region, which is how the layout would come apart without anything failing.
   */
  test('holds the row or one enlarged panel, and whatever it holds fits the box', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const fit = async (state: string): Promise<void> => {
      const measured = await page.getByTestId('pane-horizons').evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      expect(
        measured.scrollHeight,
        `the centre's content overflows it in the "${state}" state`,
      ).toBeLessThanOrEqual(measured.clientHeight + 1);
      expect(
        measured.clientHeight - measured.scrollHeight,
        `the centre has spare height in the "${state}" state, so its declared height is more ` +
          'than the layout needs',
      ).toBeLessThan(60);
    };

    await page.goto('/');
    await expect(page.getByTestId('row-invitation')).toBeVisible();
    await fit('row unbuilt');

    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('enlarged-centre')).toHaveCount(0);
    await fit('row built');

    await page.getByTestId('enlarge-24').click();
    await expect(page.getByTestId('enlarged-centre')).toHaveCount(1);
    await expect(page.getByTestId('horizon-row')).toHaveCount(0);
    await fit('enlarged');
  });

  /**
   * SC-002 and FR-050. Every declared horizon is in the strip, in order, each with the same
   * skill figures the scores region draws beneath the row, and the marked one is the enlarged
   * one. A strip of pictures alone would reduce the comparison to a picture.
   */
  test('carries every declared horizon in the strip, each with its skill figures', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await scoredRow(page);
    await page.getByTestId('enlarge-48').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();

    const inTheStrip = await page
      .getByTestId('horizon-strip')
      .locator('[data-lead-hours]')
      .evaluateAll((nodes) =>
        nodes.map((node) => Number((node as HTMLElement).dataset['leadHours'])),
      );
    expect(inTheStrip, 'the strip is not the declared horizons, in order').toEqual([...LEADS]);

    for (const lead of LEADS) {
      const slot = page.getByTestId(`strip-${String(lead)}`);
      await expect(slot).toContainText(`+${String(lead)} h`);
      // FR-003 of this beat: the figures, in the scorer's words, and never a blank slot.
      const text = (await slot.textContent()) ?? '';
      expect(
        /vs persistence|vs climatology|not scored|no score|scoring refused/.test(text),
        `the slot for +${String(lead)} h says nothing about what it was worth: "${text}"`,
      ).toBe(true);
    }

    // The strip's height is declared, so that a horizon going from unscored to scored cannot
    // move the panel beneath it -- which means the declaration has to hold what is in it.
    const strip = await page.getByTestId('horizon-strip').evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(
      strip.scrollHeight,
      'the strip clips its own slots, so presentation.strip.heightPx is smaller than what it holds',
    ).toBeLessThanOrEqual(strip.clientHeight + 1);

    // The marking is on the enlarged one and on nothing else.
    await expect(page.getByTestId('strip-48')).toHaveAttribute('data-marked', 'true');
    expect(
      await page.getByTestId('horizon-strip').locator('[data-marked="true"]').count(),
      'the strip marks more than one horizon',
    ).toBe(1);

    await page.getByTestId('strip-0').click();
    await expect(page.getByTestId('strip-0')).toHaveAttribute('data-marked', 'true');
    await expect(page.getByTestId('strip-48')).toHaveAttribute('data-marked', 'false');
  });

  /**
   * FR-008 and Principle VI. Before anything has been scored the strip says so, in the words
   * the scores region uses, rather than showing six blank slots -- and asking for an
   * enlargement does not go and score anything (FR-040: display may not cause computation).
   */
  test('says which horizons are unscored, and enlarging does not go and score them', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('enlarge-24').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();

    for (const lead of LEADS) {
      await expect(page.getByTestId(`strip-${String(lead)}`)).toContainText('not scored yet');
    }

    // Scoring costs about a second and happens when it is asked for. If enlarging had asked,
    // the control would say it had been done.
    await expect(page.getByTestId('score-row')).toBeEnabled();
    // The label the reader is shown, and not the two the control reserves its width against
    // (see `HorizonRow.tsx`, the row's display controls).
    await expect(page.getByTestId('score-row-label')).toHaveText(
      'Score every horizon against truth',
    );
    await expect(page.getByTestId('panel-score-24')).toContainText('not scored yet');

    // A swap does not ask either.
    await page.getByTestId('strip-96').click();
    await expect(page.getByTestId('panel-96')).toBeVisible();
    await expect(page.getByTestId('score-row')).toBeEnabled();

    // And when it is asked, the same strip carries the figures.
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('strip-96')).toContainText('vs persistence', { timeout: 60_000 });
  });

  /**
   * FR-006 and FR-051. The row says what it is and is not showing, and the fidelity the
   * enlarged panel adds is actually there: the depth axis of beat 008, drawn only where there
   * is room to read it. A row that drew a depth-coded glyph without saying so would be
   * claiming a fidelity it has not got.
   */
  test('says what the row shows, and draws the depths only in the enlarged panel', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    /* FR-051's requirement is that the row *states* it is showing the field alone, and beat
       018 made that a label of eight words: the account of what the enlarged panel adds is
       `centre/horizon-row`'s help (`docs/narrative-disposition.json`, `row-fidelity`), because
       spec 018 FR-007 keeps explanation off the surface. The claim is unchanged and its
       wording is not. */
    await expect(page.getByTestId('row-fidelity')).toContainText('field only');
    await expect(page.getByTestId('row-fidelity')).toContainText('enlarged panel');
    await expect(page.getByTestId('needle-elevation')).toHaveCount(0);

    await page.getByTestId('enlarge-24').click();
    await expect(page.getByTestId('needle-elevation')).toBeVisible();
    // One elevation, for the one panel that has the room for it.
    await expect(page.getByTestId('needle-elevation')).toHaveCount(1);
    expect(
      await page.getByTestId('needle-elevation').locator('[data-deepest-metres]').count(),
      'the enlarged panel drew no needles, so there is no depth axis to have gained',
    ).toBeGreaterThan(0);
    // The marks are still a list on the field itself, at the panel's own fidelity.
    expect(
      await page.getByTestId('panel-field-24-marks').locator('li').count(),
    ).toBeGreaterThan(0);
    await expect(page.getByTestId('row-fidelity')).toHaveCount(0);
  });

  /**
   * SC-003. The centre goes from one enlargement to another with no unenlarged frame between
   * them: the reader's comparison is not destroyed and rebuilt on the way.
   */
  test('swaps directly, with no unenlarged frame rendered in between', async ({ page }) => {
    test.setTimeout(240_000);
    await scoredRow(page);
    expect(await ledger(page), 'the centre did not record rendering the row').toEqual(['row']);

    await page.getByTestId('enlarge-48').click();
    await expect(page.getByTestId('panel-48')).toBeVisible();
    await page.getByTestId('strip-96').click();
    await expect(page.getByTestId('panel-96')).toBeVisible();

    const rendered = await ledger(page);
    const from = rendered.indexOf('enlarged(48)');
    const to = rendered.indexOf('enlarged(96)');
    expect(from, `the centre never rendered enlarged(48): ${rendered.join(' ')}`).toBeGreaterThanOrEqual(0);
    expect(to, `the centre never rendered enlarged(96): ${rendered.join(' ')}`).toBeGreaterThan(from);
    expect(
      rendered.slice(from, to),
      `the centre rendered the unenlarged row during the swap: ${rendered.join(' ')}`,
    ).toEqual(['enlarged(48)']);
  });

  /**
   * SC-004, FR-005 and SRD-v1 FR-14 carried. The same `Float64Array` object backs the panel
   * before and after enlargement, and across a swap in the strip. Asserted by identity inside
   * the page, because an array that came out of `page.evaluate` is a clone and a clone of a
   * copy is indistinguishable from a clone of the original.
   */
  test('draws the same field object before and after enlargement, and across a swap', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await scoredRow(page);

    const remember = async (name: string, testId: string): Promise<void> => {
      await page.evaluate(
        ([key, id]) => {
          const canvas = document
            .querySelector(`[data-testid="${String(id)}"]`)
            ?.querySelector('canvas');
          const held = (canvas as unknown as { jOceanField?: Float64Array } | null)?.jOceanField;
          if (held === undefined) throw new Error(`${String(id)} is not holding a field`);
          ((window as unknown as Record<string, unknown>)[String(key)] as unknown) = held;
        },
        [name, testId],
      );
    };
    const isTheSameObject = async (name: string, testId: string): Promise<boolean> =>
      page.evaluate(
        ([key, id]) => {
          const canvas = document
            .querySelector(`[data-testid="${String(id)}"]`)
            ?.querySelector('canvas');
          const held = (canvas as unknown as { jOceanField?: Float64Array } | null)?.jOceanField;
          return held !== undefined && held === (window as unknown as Record<string, unknown>)[String(key)];
        },
        [name, testId],
      );

    await remember('__rowField48', 'panel-field-48');
    await remember('__rowField96', 'panel-field-96');

    await page.getByTestId('enlarge-48').click();
    await expect(page.getByTestId('panel-48')).toBeVisible();
    expect(
      await isTheSameObject('__rowField48', 'panel-field-48'),
      'enlarging replaced the field array, so something was recomputed for the display',
    ).toBe(true);

    // The strip draws the same objects too: a thumbnail computed for the strip would be a
    // reduction this harness made for a picture.
    expect(
      await isTheSameObject('__rowField96', 'strip-96'),
      'the strip drew a different array from the one the row drew',
    ).toBe(true);

    await page.getByTestId('strip-96').click();
    await expect(page.getByTestId('panel-96')).toBeVisible();
    expect(
      await isTheSameObject('__rowField96', 'panel-field-96'),
      'swapping the centre replaced the field array',
    ).toBe(true);
    expect(
      await isTheSameObject('__rowField48', 'strip-48'),
      'the horizon that was enlarged came back into the strip with a different array',
    ).toBe(true);

    // The thumbnail is the grid's own size, drawn small by the browser: nothing is resampled.
    const thumbnail = await page
      .getByTestId('strip-48')
      .locator('canvas')
      .evaluate((canvas) => ({
        width: (canvas as HTMLCanvasElement).width,
        height: (canvas as HTMLCanvasElement).height,
        drawn: (canvas as HTMLCanvasElement).getBoundingClientRect().width,
      }));
    expect(thumbnail.width, 'the strip drew into a canvas that is not the grid').toBe(100);
    expect(thumbnail.height).toBe(100);
    expect(thumbnail.drawn, 'the thumbnail is not smaller than the grid it draws').toBeLessThan(100);
  });

  /**
   * SC-005 and FR-057. The strip is a roving-tabindex toolbar: one slot is in the tab order,
   * the arrows move along it, the commit swaps the centre, and focus stays in the strip.
   */
  test('moves along the strip with the arrow keys and commits without losing focus', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await scoredRow(page);
    await page.getByTestId('enlarge-0').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();

    // Exactly one slot in the tab order, and it is the marked one.
    const tabbable = await page
      .getByTestId('horizon-strip')
      .locator('[tabindex="0"]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['leadHours']));
    expect(tabbable, 'the strip is not a roving tabindex').toEqual([String(LEADS[0])]);

    await page.getByTestId('strip-0').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('data-lead-hours')),
      'the arrow keys did not move along the strip',
    ).toBe(String(LEADS[2]));

    // Moving does not swap: the reader is looking, not choosing.
    await expect(page.getByTestId(`panel-${String(LEADS[0])}`)).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.getByTestId(`panel-${String(LEADS[2])}`)).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('data-lead-hours')),
      'focus left the strip when the centre was swapped',
    ).toBe(String(LEADS[2]));

    await page.keyboard.press('End');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-lead-hours'))).toBe(
      String(LEADS[LEADS.length - 1]),
    );
  });

  /**
   * SC-005's second half and FR-057. The marking survives having its colour removed, and it is
   * measured on the rendered pixels the way beat 007 measured the attribution hatch: the strip
   * is photographed and the marked slot's border is compared with an unmarked one's in
   * luminance. A border a monochrome print cannot show is a marking a monochrome print has not
   * got, and the word beside it is the second channel for a reader who cannot see either.
   */
  test('marks the enlarged horizon so it survives having its colour removed', async ({ page }) => {
    test.setTimeout(240_000);
    await scoredRow(page);
    await page.getByTestId('enlarge-48').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();

    const strip = page.getByTestId('horizon-strip');
    const stripBox = await strip.boundingBox();
    const markedBox = await page.getByTestId('strip-48').boundingBox();
    const plainBox = await page.getByTestId('strip-24').boundingBox();
    expect(stripBox).not.toBeNull();
    expect(markedBox).not.toBeNull();
    expect(plainBox).not.toBeNull();

    const pixels = decodePng(await strip.screenshot());
    // One pixel inside each slot's left border, half way down it: the border is the marking,
    // so the border is what is read.
    const luminance = (box: { x: number; y: number; width: number; height: number }): number =>
      pixels.luminanceAt(
        box.x - (stripBox?.x ?? 0) + 1,
        box.y - (stripBox?.y ?? 0) + box.height / 2,
      );
    const marked = luminance(markedBox as { x: number; y: number; width: number; height: number });
    const plain = luminance(plainBox as { x: number; y: number; width: number; height: number });
    const margin = Math.abs(marked - plain);

    // The weight, measured the same way: how many pixels of ink the border actually is,
    // counted from the slot's left edge until the paper inside it starts. The marking is a
    // weight *and* a darkness, so both are read rather than one being taken on trust.
    const weight = (box: { x: number; y: number; width: number; height: number }): number => {
      const y = box.y - (stripBox?.y ?? 0) + box.height / 2;
      const left = box.x - (stripBox?.x ?? 0);
      /* From one pixel inside the slot's left edge, which is where the luminance probe above
         reads: at the edge itself the sample can land on the paper outside the border, and a
         scan that starts there measures the gap rather than the border. */
      let inked = 0;
      while (inked < 12 && pixels.luminanceAt(left + 1 + inked, y) < 230) inked += 1;
      return inked;
    };
    const markedWeight = weight(markedBox as { x: number; y: number; width: number; height: number });
    const plainWeight = weight(plainBox as { x: number; y: number; width: number; height: number });

    console.log(
      `    strip marking, greyscale: marked border ${marked.toFixed(1)}, unmarked ` +
        `${plain.toFixed(1)}, margin ${margin.toFixed(1)} of 255 against a declared 40; ` +
        `border weight ${String(markedWeight)} px marked against ${String(plainWeight)} px`,
    );
    expect(margin).toBeGreaterThan(40);
    expect(
      markedWeight,
      'the marked slot is not drawn with more ink than an unmarked one',
    ).toBeGreaterThan(plainWeight);

    // And it is said in words as well as drawn, because a border is not a label.
    await expect(page.getByTestId('strip-48')).toContainText('enlarged');
    await expect(page.getByTestId('strip-24')).not.toContainText('enlarged');
  });

  /**
   * FR-057's third clause, as it bears on the swap: it happens in one rendered frame, and the
   * centre renders nothing but the horizon that was chosen.
   *
   * **The walk over every animated element moved to `tests/shell/addressable.spec.ts` in beat
   * 017.** "Nothing animates" is one claim about the whole surface, and holding it in three
   * files -- one per beat that touched something -- is how a surface ends up with a claim that
   * is true of the parts somebody remembered. What is left here is the part that is about
   * enlargement: the ledger, which is the record of what the centre actually rendered.
   */
  test('swaps in one rendered frame under prefers-reduced-motion', async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await scoredRow(page);
    await page.getByTestId('enlarge-48').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();

    const before = await ledger(page);
    await page.getByTestId('strip-96').click();
    await expect(page.getByTestId('panel-96')).toBeVisible();
    expect(
      (await ledger(page)).slice(before.length),
      'the swap rendered something other than the horizon that was chosen',
    ).toEqual(['enlarged(96)']);
  });

  /**
   * The spec's first edge case. A reissue while enlarged updates the same horizon in place;
   * the centre does not fall back to the row, and the centre and the two flanking columns do
   * not move.
   *
   * **The domain change is the same rule and is not asserted here, for a reason worth
   * recording.** The spec's second edge case expects a new domain under the same enlarged
   * horizon. The surface cannot reach that: the only other declared domain has no artefact
   * over its box and refuses (beat 013 found this), and a refused domain change re-provisions
   * the run, which takes the built row away and leaves FR-048's invitation -- so there is no
   * enlargement left for the rule to be about. That is beat 013's behaviour and not this
   * beat's, and asserting something else here would be asserting the wrong thing.
   */
  test('keeps the enlargement through a reissue, updated in place', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await scoredRow(page);
    await page.getByTestId('enlarge-48').click();
    await expect(page.getByTestId('panel-48')).toBeVisible();
    const before = await regionBoxes(page);
    const valid = await page.getByTestId('panel-valid-48').textContent();

    const control = page.getByTestId('issue-time');
    await control.fill(String(Number(await control.inputValue()) - 12 * 3_600_000));
    await page.getByTestId('reissue').click();
    await expect(page.getByTestId('issue-stale')).toHaveCount(0, { timeout: 180_000 });

    // Same horizon, updated in place. The centre did not fall back to the row.
    await expect(page.getByTestId('horizon-row')).toHaveCount(0);
    await expect(page.getByTestId('panel-48')).toBeVisible();
    await expect(page.getByTestId('centre-ledger')).toHaveAttribute(
      'data-centre-content',
      'enlarged(48)',
    );
    await expect(page.getByTestId('panel-initialised-48')).not.toHaveText(valid ?? '');

    // The centre and the two flanking columns are where they were. The scores region is not
    // compared here and deliberately: a reissue discards the scores that belonged to the
    // forecast it replaced, so that region is shorter afterwards -- in the row exactly as
    // much as enlarged. What this beat forbids is the *enlargement* moving it, which the
    // first test in this file measures.
    const after = await regionBoxes(page);
    for (const region of ['controls', 'centre', 'detail'] as const) {
      expect(after[region], `a reissue while enlarged moved the ${region} region`).toEqual(
        before[region],
      );
    }

    // The scores went with the forecast they belonged to, and the strip says so rather than
    // carrying figures for a forecast that has been replaced.
    await expect(page.getByTestId('strip-48')).toContainText('not scored yet');

    // And the ledger says the centre never went back to the row on the way: a reissue is a new
    // forecast for the horizon that is enlarged, not a reason to close the enlargement.
    expect(await ledger(page), 'the centre fell back to the row during a reissue').toEqual([
      'row',
      'enlarged(48)',
    ]);
  });
});
