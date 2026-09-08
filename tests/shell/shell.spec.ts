import { expect, test, type Page, type Request } from '@playwright/test';
import { declared } from './declared-geometry.js';

/**
 * SC-003 and User Story 3 of spec 001.
 *
 * The site is served statically from `dist/`, not from the dev server, because the claim
 * being tested — that a visit makes no request other than for the site's own assets — is a
 * claim about what ships (NFR-02).
 */

const CONFIG_REQUEST = /j-ocean.*\.json$/;

/** A disclosure has to be opened before what is inside it can be seen. */
async function openDisclosure(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).evaluate((node) => {
    (node as HTMLDetailsElement).open = true;
  });
}

test.describe('the shell', () => {
  test('loads from a static server making no external request', async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', (request: Request) => {
      if (!request.url().startsWith(baseURL ?? 'http://127.0.0.1')) foreign.push(request.url());
    });

    await page.goto('/');
    await expect(page.getByTestId('run-panel')).toBeVisible();
    expect(foreign, `these requests left the site: ${foreign.join(', ')}`).toEqual([]);
  });

  test('states what j-ocean is not, in the first viewport, with no way to dismiss it', async ({
    page,
  }) => {
    await page.goto('/');
    const statement = page.getByTestId('not-operational');
    await expect(statement).toBeVisible();
    await expect(statement).toContainText('not an operational forecast system');
    await expect(statement).toContainText('relative');

    // "Visible without scrolling" is a claim about geometry, so it is measured rather than
    // assumed: the whole statement sits inside the first viewport.
    const box = await statement.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
    await expect(page.getByRole('button', { name: /dismiss|close|hide/i })).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('shows the run it is showing: the seed, and that it is the recorded case', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('root-seed')).toHaveText(/^[0-9a-f]{16}$/);
    await expect(page.getByTestId('recorded-case')).toContainText('the recorded case');
    await expect(page.getByTestId('manifest')).toContainText('"recordedCase": true');
  });

  test('integrates the run and reports the step time as host time', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('steps')).toHaveText('0');
    await expect(page.getByTestId('step-time')).toContainText('not yet measured');
    const startInstant = await page.getByTestId('instant').textContent();

    await page.getByTestId('advance').click();
    // Twelve hours at the declared timestep. The exact count comes from configuration, so
    // the test waits for the integration to stop rather than asserting a literal.
    await expect(page.getByTestId('steps')).not.toHaveText('0');
    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByTestId('step-time')).toContainText('ms/step');
    // Principle V: the figure is host time and says so, in a kind of its own.
    await expect(page.getByTestId('step-time').locator('.host-time')).toBeVisible();
    await expect(page.getByTestId('instant')).not.toHaveText(startInstant ?? '');
  });

  /**
   * Beat 013 deleted the field panel: its field is the row's six panels and, before the row
   * is built, the centre's analysed field at full size. The claims it carried are unchanged
   * and are asserted here against where each of them now lives -- the picture in the centre,
   * the initialisation figures in the run disclosure.
   */
  test('draws the field the model holds, and says what it is', async ({ page }) => {
    await page.goto('/');
    const panel = page.getByTestId('analysed-field');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('img')).toBeVisible();
    // Beat 014 took the caption's claims -- that this is the analysis's own arithmetic and
    // not a picture drawn to illustrate it -- to the site's architecture page, where
    // tests/docs/disposition.test.ts holds them. What is left here is the label of the
    // picture, and the picture is still the analysis's own field.
    await expect(panel).toContainText('the analysis’s own gain');
    await openDisclosure(page, 'run-panel');
    await expect(page.getByTestId('initialisation')).toContainText('layer thickness');
    // FR-003: the criterion is on the surface, not only in a test.
    await expect(page.getByTestId('stability')).toContainText('the declared criterion admits');
    await expect(page.getByTestId('outcrops')).toContainText('counted rather than swallowed');

    // FR-010: one rendering module. The surface says which path it took rather than leaving
    // a reader to assume, and this test records it.
    const backend = await panel.getByRole('img').getAttribute('data-backend');
    expect(['webgl2', 'canvas2d']).toContain(backend);
    console.log(`    the field surface is using ${String(backend)}`);

    // The canvas holds a field with structure in it, not a flat colour.
    const distinct = await panel.getByRole('img').evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const gl = canvas.getContext('webgl2');
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      if (gl !== null) {
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      } else {
        const image = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
        pixels.set(image?.data ?? new Uint8ClampedArray(pixels.length));
      }
      const seen = new Set<number>();
      for (let i = 0; i < pixels.length; i += 4) {
        seen.add(((pixels[i] ?? 0) << 16) | ((pixels[i + 1] ?? 0) << 8) | (pixels[i + 2] ?? 0));
      }
      return seen.size;
    });
    expect(distinct).toBeGreaterThan(50);
  });

  test('draws a seed once for a new run, and says it is no longer the recorded case', async ({
    page,
  }) => {
    await page.goto('/');
    const before = await page.getByTestId('root-seed').textContent();

    await page.getByTestId('new-run').click();
    await expect(page.getByTestId('recorded-case')).toContainText('not the recorded case');
    const after = await page.getByTestId('root-seed').textContent();
    expect(after).toMatch(/^[0-9a-f]{16}$/);
    expect(after).not.toBe(before);
    await expect(page.getByTestId('manifest')).toContainText('"recordedCase": false');
    await expect(page.getByTestId('steps')).toHaveText('0');
  });

  test('shows the validation error and provisions no run when configuration is invalid', async ({
    page,
  }) => {
    await page.route(CONFIG_REQUEST, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 1, grid: { nx: 1, ny: 100, cellSizeMetres: 5500 } }),
      }),
    );

    await page.goto('/');
    const failure = page.getByTestId('configuration-failure');
    await expect(failure).toBeVisible();
    await expect(failure).toContainText('no run was provisioned');
    await expect(failure).toContainText('grid.nx');
    await expect(page.getByTestId('run-panel')).toHaveCount(0);
    await expect(page.getByTestId('manifest-panel')).toHaveCount(0);
    // Principle VI: the page reports the failure rather than falling back to something
    // that looks like it worked.
    await expect(page.getByTestId('not-operational')).toBeVisible();
  });

  test('states what the run is scored against, and what that record costs', async ({ page }) => {
    await page.goto('/');
    const panel = page.getByTestId('truth-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('truth-source')).toContainText('HYCOM');

    // Review R-2: the truth is coarser than the model, and the surface says so rather than
    // leaving a reader to assume otherwise.
    await expect(panel).toContainText('coarser than the model grid');

    // The figures the domain choice changes are still here: the instants and their spacing,
    // the profiles and how many carry a flag, and the climatology's overlap with this run's
    // period. What each of them *means* went to the site's data-model page in beat 014, and
    // tests/docs/disposition.test.ts holds the words against that page.
    await expect(page.getByTestId('truth-instants')).toContainText('hours apart');
    await expect(page.getByTestId('observation-count')).toContainText('carry a flag');
    await expect(page.getByTestId('climatology-overlap')).toContainText('days');
    await expect(page.getByTestId('climatology-overlap').locator('.figure.computed')).toHaveCount(1);
  });

  test('draws one panel per declared horizon, in order, each saying what it is', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    // FR-013: one row, in order, all visible at once. Not a slider and not a grid.
    const leads = await page
      .getByTestId('horizon-row')
      .locator('[data-lead-hours]')
      .evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLElement).dataset['leadHours'])));
    expect(leads).toEqual([0, 12, 24, 48, 72, 96]);

    // FR-015: absolute instants, not only a lead time, so a reader is not left doing
    // arithmetic to find out whether two panels are comparable.
    for (const lead of leads) {
      await expect(page.getByTestId(`panel-valid-${String(lead)}`)).toContainText(/^2013-09-\d\d/);
      await expect(page.getByTestId(`panel-valid-${String(lead)}`)).toHaveAttribute('title', /^2013-09-\d\dT/);
      await expect(page.getByTestId(`panel-initialised-${String(lead)}`)).toContainText(/^2013-09-\d\d/);
    }

    // FR-008 of this beat: the not-operational statement shares the viewport with the row.
    await expect(page.getByTestId('not-operational')).toBeVisible();
  });

  test('fits every declared horizon at the width the four regions need, and never scrolls the page', async ({
    page,
  }) => {
    // FR-013's "all visible at once" is a claim about geometry at a declared width, so it is
    // measured. The centre's container may scroll below that width; the page may not, ever.
    await page.setViewportSize({
      width: declared.presentation.minimumViewportWidthPx,
      height: declared.presentation.minimumViewportHeightPx,
    });
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    const row = await page
      .getByTestId('centre-stack')
      .evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(
      row.scrollWidth,
      `the row scrolls at the declared reference width: ${String(row.scrollWidth)} > ${String(row.clientWidth)}`,
    ).toBeLessThanOrEqual(row.clientWidth + 1);

    // Every panel is inside the container it is drawn in, and no narrower than the declared
    // minimum -- "visible" is not the same as "present and one pixel wide".
    const container = await page.getByTestId('centre-stack').boundingBox();
    for (const lead of [0, 12, 24, 48, 72, 96]) {
      const box = await page.getByTestId(`panel-${String(lead)}`).boundingBox();
      expect(box, `panel ${String(lead)} has no box`).not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(declared.presentation.minimumPanelWidthPx - 1);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
        (container?.x ?? 0) + (container?.width ?? 0) + 1,
      );
    }

    const page_ = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(page_.scrollWidth).toBeLessThanOrEqual(page_.clientWidth);
  });

  test('scores every panel, names both references, and exposes the provenance', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });

    for (const lead of [0, 24, 96]) {
      const panel = page.getByTestId(`panel-score-${String(lead)}`);
      await expect(panel).toContainText('vs persistence');
      await expect(panel).toContainText('vs climatology');
      // FR-021, in the SRD's own words. This model loses to climatology, and it says so.
      await expect(panel).toContainText(/than (persistence|climatology)/);
    }

    // FR-022: the provenance is on the panel, one disclosure away.
    const provenance = page.getByTestId('panel-provenance-24');
    await provenance.getByRole('group').or(provenance).click();
    await expect(provenance).toContainText('root-mean-square');
    await expect(provenance).toContainText('declining to resolve below');
    // Beat 009: at the default issue time no Argo has arrived, so there is nothing to caveat
    // -- and the panel says that rather than leaving a blank space a reader cannot read.
    await expect(provenance).toContainText('no independence caveat');
  });

  /**
   * FR-014 and SC-003, as beat 015 rebuilt them (SRD-v2 FR-049, FR-050).
   *
   * Enlarging changes what is shown and never what is computed, and it hides nothing: the row
   * survives as the strip above the enlarged panel, so the other five horizons and what each
   * was worth are still on screen. "In place" is now a claim about the *regions* -- nothing
   * outside the centre moves -- and `tests/shell/enlargement.spec.ts` measures that, and the
   * field identity, in one place. What is checked here is beat 007's own pair: the panel is
   * enlarged, the other five are still there, and the drawing did not change surface.
   */
  test('enlarges a panel in place, recomputing nothing and hiding nothing', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    const before = await page.getByTestId('panel-field-24').locator('canvas').first().evaluate((canvas) => {
      const context = (canvas as HTMLCanvasElement).getContext('webgl2');
      return context === null ? 'canvas2d' : 'webgl2';
    });

    await page.getByTestId('enlarge-24').click();
    await expect(page.getByTestId('panel-24')).toHaveClass(/enlarged/);
    await expect(page.getByTestId('horizon-row')).toHaveCount(0);

    // Every other horizon is still on screen, in the strip: "in place" means in place, and
    // FR-050 says the comparison is the lesson, so it survives the enlargement.
    for (const lead of [0, 12, 48, 72, 96]) {
      await expect(page.getByTestId(`strip-${String(lead)}`)).toBeVisible();
    }
    const after = await page.getByTestId('panel-field-24').locator('canvas').first().evaluate((canvas) => {
      const context = (canvas as HTMLCanvasElement).getContext('webgl2');
      return context === null ? 'canvas2d' : 'webgl2';
    });
    expect(after).toBe(before);

    await page.getByTestId('enlarge-24').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible();
    await expect(page.getByTestId('panel-24')).not.toHaveClass(/enlarged/);
  });

  /**
   * FR-019 and SC-002. The attribution layer must read with the colour taken out, so this
   * test takes the colour out: it converts the rendered pixels to luminance and asserts an
   * observed patch is distinguishable from an unvisited corner by a declared margin.
   */
  test('draws attribution that survives having its colour removed', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('toggle-attribution').click();
    await expect(page.getByTestId('row-legend')).toContainText('second channel');

    // Six identical attribution fields would imply six analyses. The run makes one, and the
    // legend says so rather than leaving the row to suggest otherwise.
    await expect(page.getByTestId('attribution-scope')).toContainText('the same field on every panel');
    await expect(page.getByTestId('attribution-scope')).toContainText('analyses once');

    const contrast = await page
      .getByTestId('panel-field-24')
      .locator('canvas')
      .first()
      .evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const gl = canvas.getContext('webgl2');
        const width = canvas.width;
        const height = canvas.height;
        const pixels = new Uint8Array(width * height * 4);
        if (gl !== null) {
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        } else {
          const context = canvas.getContext('2d');
          const image = context?.getImageData(0, 0, width, height);
          pixels.set(image?.data ?? new Uint8ClampedArray(pixels.length));
        }
        const luminanceAt = (x: number, y: number): number => {
          const i = (y * width + x) * 4;
          return 0.2126 * (pixels[i] ?? 0) + 0.7152 * (pixels[i + 1] ?? 0) + 0.0722 * (pixels[i + 2] ?? 0);
        };
        const patch = (cx: number, cy: number): number => {
          let total = 0;
          let n = 0;
          for (let y = cy - 5; y <= cy + 5; y += 1) {
            for (let x = cx - 5; x <= cx + 5; x += 1) {
              total += luminanceAt(x, y);
              n += 1;
            }
          }
          return total / n;
        };
        // Where the observations actually mattered, and where they did not, read from the
        // rendered field rather than assumed. Beat 009 moved them: once the analysis sees
        // only what had happened by its issue instant, the observed patch is wherever the two
        // drops that had reported by then were, and a hard-coded corner measured nothing.
        let brightest = { x: 0, y: 0, luminance: -1 };
        let darkest = { x: 0, y: 0, luminance: 256 };
        for (let y = 6; y < height - 6; y += 4) {
          for (let x = 6; x < width - 6; x += 4) {
            const value = luminanceAt(x, y);
            if (value > brightest.luminance) brightest = { x, y, luminance: value };
            if (value < darkest.luminance) darkest = { x, y, luminance: value };
          }
        }
        return { observed: patch(darkest.x, darkest.y), unvisited: patch(brightest.x, brightest.y) };
      });

    // A declared margin, in luminance out of 255. Anything less and a monochrome print of the
    // attribution layer would not tell a reader where the observations were.
    const margin = Math.abs(contrast.observed - contrast.unvisited);
    console.log(`    greyscale contrast: ${margin.toFixed(1)} of 255 against a declared 40`);
    expect(margin).toBeGreaterThan(40);
  });

  test('draws the same field when WebGL is refused, and says which surface it used', async ({
    page,
  }) => {
    // FR-010 confines the renderer to one module and lets it fall back. A fallback that has
    // never been seen to run is worth nothing (PR-04), so WebGL2 is refused here and the
    // canvas2d path is made to draw the row for real.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]): any {
        if (kind === 'webgl2' || kind === 'webgl') return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (original as any).call(this, kind, ...rest);
      };
    });
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    const field = page.getByTestId('panel-field-24').locator('canvas').first();
    await expect(field).toHaveAttribute('data-backend', 'canvas2d');

    // And it drew something: a field of one colour would satisfy the attribute and nothing
    // else. The count is of distinct colours in the panel, which a painted field has many of.
    const distinct = await field.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const image = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
      const seen = new Set<number>();
      const data = image?.data ?? new Uint8ClampedArray();
      for (let i = 0; i < data.length; i += 4) {
        seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
      }
      return seen.size;
    });
    expect(distinct).toBeGreaterThan(32);
  });

  test('draws every observation on every panel, and says how many it drew', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    // SC-001: one mark per observation in each panel, counted rather than eyeballed. The
    // marks are a list as well as a drawing, which is what a canvas owes a reader who cannot
    // see it and the only way a count can be asserted at all.
    const counts: number[] = [];
    for (const lead of [0, 12, 24, 48, 72, 96]) {
      counts.push(await page.getByTestId(`panel-field-${String(lead)}-marks`).locator('li').count());
    }
    expect(new Set(counts).size, `panels disagree about how many marks there are: ${counts.join(', ')}`).toBe(1);

    const summary = page.getByTestId('footprint-summary');
    const declaredTotal =
      Number(await page.getByTestId('footprint-track-count').textContent()) +
      Number(await page.getByTestId('footprint-drop-count').textContent()) +
      Number(await page.getByTestId('footprint-external-count').textContent());
    expect(counts[0]).toBe(declaredTotal);
    expect(counts[0]).toBeGreaterThan(0);

    // FR-24 on the surface: the rejected are counted where the drawing is, not in a log.
    await expect(summary).toContainText('drawn as flagged, never omitted');
    expect(Number(await page.getByTestId('footprint-flagged-count').textContent())).toBeGreaterThan(0);

    // FR-002: the recorded case has marks on both sides of the initialisation instant, and
    // they are distinguishable. A run in which they were not would make the distinction
    // untestable and the drawing a claim nobody could check.
    const marks = page.getByTestId('panel-field-24-marks');
    expect(await marks.locator('li[data-after-initialisation="true"]').count()).toBeGreaterThan(0);
    expect(await marks.locator('li[data-after-initialisation="false"]').count()).toBeGreaterThan(0);
  });

  test('draws a flagged mark so it survives having its colour removed', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    // SC-004. A flagged mark is drawn white-filled inside a ring; an unflagged one is filled
    // dark. That is a luminance difference, so it survives a monochrome print -- which is the
    // whole claim, and it is measured on the rendered pixels rather than asserted.
    const contrast = await page
      .getByTestId('panel-field-24')
      .evaluate((figure) => {
        const list = figure.querySelector('ul');
        const overlay = figure.querySelector('canvas.overlay') as HTMLCanvasElement | null;
        if (list === null || overlay === null) return null;
        const context = overlay.getContext('2d');
        if (context === null) return null;
        const image = context.getImageData(0, 0, overlay.width, overlay.height);
        const scale = overlay.width / 100;
        const luminance = (element: Element): number => {
          const x = Math.round(Number((element as HTMLElement).dataset['x']) * scale);
          const y = Math.round(overlay.height - Number((element as HTMLElement).dataset['y']) * scale);
          const i = (Math.min(overlay.height - 1, Math.max(0, y)) * overlay.width + Math.min(overlay.width - 1, Math.max(0, x))) * 4;
          const d = image.data;
          return 0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
        };
        const flagged = [...list.querySelectorAll('li[data-flagged="true"]')].map(luminance);
        const plain = [...list.querySelectorAll('li[data-flagged="false"][data-kind="drop"]')].map(luminance);
        const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
        return { flagged: mean(flagged), plain: mean(plain), flaggedCount: flagged.length };
      });

    expect(contrast).not.toBeNull();
    expect(contrast?.flaggedCount ?? 0).toBeGreaterThan(0);
    const margin = Math.abs((contrast?.flagged ?? 0) - (contrast?.plain ?? 0));
    console.log(`    flagged vs unflagged luminance: ${margin.toFixed(1)} of 255`);
    expect(margin).toBeGreaterThan(40);
  });

  test('gives every profile a needle at the depths it actually reached', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('enlarge-24').click();

    // FR-003: the depth axis exists where there is room to read it. At row width a drop is a
    // depth-coded glyph; enlarged, it is a needle to the depth that probe reached.
    const elevation = page.getByTestId('needle-elevation');
    await expect(elevation).toBeVisible();
    const needles = elevation.locator('[data-deepest-metres]');
    expect(await needles.count()).toBeGreaterThan(0);

    const depths = await elevation
      .locator('[data-measured-nothing="false"]')
      .evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLElement).dataset['deepestMetres'])));
    // SC-002: an XBT infers its depth from a fall-rate equation, so no two drops reach the
    // same depth and none reaches exactly the depth it was asked for.
    expect(depths.every((depth) => depth > 0)).toBe(true);
    expect(new Set(depths.map((depth) => depth.toFixed(1))).size).toBeGreaterThan(1);

    // Five delayed-mode Argo profiles in the recorded case report a temperature at no level
    // at all. A needle of zero length would read as a probe that reached the surface, so they
    // are drawn as what they are and flagged as such.
    const nothing = elevation.locator('[data-measured-nothing="true"]');
    expect(await nothing.count()).toBeGreaterThan(0);
    expect(await elevation.locator('[data-measured-nothing="true"][data-flagged="true"]').count()).toBe(
      await nothing.count(),
    );

    // The spec's second edge case: a probe past the floor of the displayed volume is drawn to
    // the floor with an indicator, not silently truncated.
    expect(await elevation.locator('[data-continues-below="true"]').count()).toBeGreaterThan(0);

    await expect(elevation).toContainText('latitude is not shown');
  });

  test('shows a profile beside the model derived profile, with every level kind labelled', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('enlarge-24').click();

    const needle = page.getByTestId('needle-elevation').locator('[data-kind="drop"]').first();
    await needle.hover();
    await expect(page.getByTestId('observation-hover')).toBeVisible();

    // A click pins it: what a mark says has to survive the reader looking away from it, which
    // is the same rule beat 007 applied to a cell's breakdown.
    await needle.click();
    // Looking away -- at another horizon in the strip, which is where the other five are once
    // one of them is enlarged (FR-049).
    await page.getByTestId('strip-0').hover();
    await expect(page.getByTestId('observation-hover')).toBeVisible();

    // FR-005 and FR-07: the comparison SRD section 10 makes the trigger for dynamic depth. A
    // reader who sees the derived profile disagree with the XBT beside it has found
    // something -- but only because every derived level says it is derived.
    const comparison = page.getByTestId('profile-comparison');
    await expect(comparison).toBeVisible();
    expect(await comparison.locator('td[data-kind="derived"]').count()).toBeGreaterThan(0);
    expect(await comparison.locator('td[data-kind="computed"]').count()).toBe(2);
    await expect(comparison).toContainText('never advected');

    await expect(page.getByTestId('hover-depth')).toContainText('m');
    await expect(page.getByTestId('hover-assimilated')).toHaveText('yes');
  });

  test('says of an external profile whether it was assimilated', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('enlarge-24').click();

    // ADR-0007 and review R-3: Argo is drawn either way, and the footprint says which.
    //
    // The event is dispatched rather than hovered because Argo needles genuinely overlap in a
    // side elevation -- two floats at nearby longitudes are two needles a few pixels apart --
    // so a real pointer reaches whichever is on top. That is what any drawing does; it is not
    // a deterministic way to name the one this test means.
    await page
      .getByTestId('needle-elevation')
      .locator('[data-kind="external"]')
      .first()
      .dispatchEvent('mouseover');
    await expect(page.getByTestId('hover-instrument')).toContainText('argo');
    await expect(page.getByTestId('hover-assimilated')).toHaveText(/yes|drawn, not assimilated/);
  });

  test('has one issue-time control, and moving it changes only when the forecast was made', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    // §11's open question. Exactly one control, because the row is already the other axis and
    // a two-dimensional control is one nobody can read.
    await expect(page.getByTestId('issue-time')).toHaveCount(1);
    await expect(page.getByTestId('issue-offset')).toContainText('the recorded case');
    expect(
      await page.getByTestId('issue-observation-instants').locator('option').count(),
    ).toBeGreaterThan(0);

    const validBefore = await page.getByTestId('panel-valid-24').getAttribute('title');
    const issuedAt = await page.getByTestId('panel-initialised-24').getAttribute('title');

    // Move it twelve hours earlier. Nothing happens to the row yet: re-integrating takes
    // seconds, and NFR-04 says the interface does not freeze while it does.
    const control = page.getByTestId('issue-time');
    const step = 12 * 3_600_000;
    const current = Number(await control.inputValue());
    await control.fill(String(current - step));
    await expect(page.getByTestId('issue-stale')).toBeVisible();
    await expect(page.getByTestId('issue-offset')).toContainText('12 hours earlier');
    await expect(page.getByTestId('panel-initialised-24')).toHaveAttribute('title', issuedAt ?? '');

    await page.getByTestId('reissue').click();
    await expect(page.getByTestId('issue-stale')).toHaveCount(0, { timeout: 120_000 });

    // FR-002: the valid instant is where it was; what moved is the instant it was made and
    // therefore the lead actually asked of the model.
    await expect(page.getByTestId('panel-valid-24')).toHaveAttribute('title', validBefore ?? '');
    await expect(page.getByTestId('panel-initialised-24')).not.toHaveAttribute('title', issuedAt ?? '');
    await expect(page.getByTestId('panel-actual-lead-24')).toHaveText('+36 h');

    // FR-027: the panel that has fallen outside validity says so and draws nothing.
    await expect(page.getByTestId('panel-refusal-96')).toContainText('outside validity');
    await expect(page.getByTestId('panel-field-96')).toHaveCount(0);
    await expect(page.getByTestId('panel-score-96')).toContainText('no score');
  });

  test('shows the departure brief beside every forecast, and never refreshes it', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });

    // FR-026: persistence from the quay side, held constant, as the baseline everything else
    // is watched against.
    const brief = await page.getByTestId('panel-brief-24').textContent();
    expect(brief).toMatch(/^\d+\.\d m$/);

    // And it does not move when the issue time does, because it is never re-analysed.
    const control = page.getByTestId('issue-time');
    await control.fill(String(Number(await control.inputValue()) - 12 * 3_600_000));
    await page.getByTestId('reissue').click();
    await expect(page.getByTestId('issue-stale')).toHaveCount(0, { timeout: 120_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 60_000 });
    expect(await page.getByTestId('panel-brief-24').textContent()).toBe(brief);

    // FR-008: two curves once two issue times have been scored, labelled by issue instant.
    await openDisclosure(page, 'skill-disclosure');
    const curves = page.getByTestId('skill-inset').locator('[data-issue-instant]');
    expect(await curves.count()).toBe(2);
    // Exactly one of them is the row's current issue time; the other is the one it was.
    expect(await page.getByTestId('skill-inset').locator('[data-current="true"]').count()).toBe(1);
    await expect(page.getByTestId('skill-inset')).toContainText('Skill against persistence');

    // FR-009: the manifest records the issue time, so a rerun is reproducible from it.
    await expect(page.getByTestId('manifest')).toContainText('"issueInstantMs"');
  });

  test('says how many observations the analysis was allowed to see', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    // FR-001, and the finding this beat opened with: an analysis may only see what had
    // happened by the instant it was made, and the surface says how much that leaves out.
    const available = Number(await page.getByTestId('observations-available').textContent());
    const withheld = Number(await page.getByTestId('observations-withheld').textContent());
    expect(available).toBeGreaterThan(0);
    expect(withheld).toBeGreaterThan(0);
    await expect(page.getByTestId('issue-observations')).toContainText('had not happened yet');
  });

  test('says whether it shows the recorded case or an edit, and comes back in one action', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    // FR-034. Every other counterfactual is unsafe without this one: a reader who cannot tell
    // an edit from the record has been misled by the harness.
    await expect(page.getByTestId('run-status')).toContainText('recorded case');
    await expect(page.getByTestId('revert')).toBeDisabled();

    // Break the XBT by a degree and a half -- inside the gross-range check, which is the case
    // the harness must not pretend it catches.
    await page.getByTestId('bias-degrees').fill('1.5');
    await page.getByTestId('bias-degrees').blur();
    await expect(page.getByTestId('run-status')).toContainText('edit', { timeout: 120_000 });
    await expect(page.getByTestId('edit-list')).toContainText('biased by 1.50');

    await page.getByTestId('quality-control').uncheck();
    await expect(page.getByTestId('edit-list')).toContainText('quality control off', {
      timeout: 120_000,
    });

    // FR-010: edits compose in order, and one action removes all of them.
    await page.getByTestId('revert').click();
    await expect(page.getByTestId('run-status')).toContainText('recorded case', { timeout: 120_000 });
    await expect(page.getByTestId('revert')).toBeDisabled();
  });

  test('withholds a measurement, keeps drawing it, and shows what the edit changed', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    // Nothing to difference until something has been edited: the control says so.
    await expect(page.getByTestId('toggle-difference')).toBeDisabled();

    await page.getByTestId('enlarge-24').click();
    const needle = page.getByTestId('needle-elevation').locator('[data-kind="drop"]').first();
    await needle.click();
    await expect(page.getByTestId('observation-hover')).toBeVisible();
    await page.getByTestId('withhold-mark').click();

    // FR-006: withheld from the analysis and still drawn, because what a reader withheld is
    // part of what the reader did.
    await expect(page.getByTestId('run-status')).toContainText('withheld', { timeout: 120_000 });
    await expect(
      page.getByTestId('panel-field-24-marks').locator('li[data-withheld="true"]'),
    ).toHaveCount(1);

    // FR-005: edited minus recorded, for every horizon, with the moved region outlined.
    await page.getByTestId('toggle-difference').click();
    // The panel is drawing a difference, and says so where a reader who cannot see it can
    // still be told: on the image's own label.
    await expect(page.getByTestId('panel-field-24').getByRole('img')).toHaveAttribute(
      'aria-label',
      /Edited minus recorded/,
    );
    const spread = await page
      .getByTestId('panel-field-24')
      .locator('canvas')
      .first()
      .evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const gl = canvas.getContext('webgl2');
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl?.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const seen = new Set<number>();
        for (let i = 0; i < pixels.length; i += 4) {
          seen.add(((pixels[i] ?? 0) << 16) | ((pixels[i + 1] ?? 0) << 8) | (pixels[i + 2] ?? 0));
        }
        return seen.size;
      });
    // A difference field that is everywhere zero would be one flat colour. This one is not.
    expect(spread).toBeGreaterThan(8);
  });

  test('drags a measured profile and keeps the measurement as a ghost', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('enlarge-24').click();
    await page.getByTestId('needle-elevation').locator('[data-kind="drop"]').first().click();
    await expect(page.getByTestId('profile-editor')).toBeVisible();

    // FR-003: the measured profile stays drawn behind the edit. A picture that forgot the
    // measurement would make the difference field meaningless.
    await expect(page.getByTestId('profile-ghost')).toBeVisible();

    const point = page.getByTestId('profile-point-4');
    // Scrolled into view first: the mouse works in viewport coordinates, and an enlarged
    // panel puts its hover panel well below the fold.
    await point.scrollIntoViewIfNeeded();
    const box = await point.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move((box?.x ?? 0) + 2, (box?.y ?? 0) + 2);
    await page.mouse.down();
    await page.mouse.move((box?.x ?? 0) + 40, (box?.y ?? 0) + 2, { steps: 5 });
    await page.mouse.up();

    await expect(page.getByTestId('run-status')).toContainText('edited the profile', {
      timeout: 120_000,
    });
  });

  test('offers the track for redrawing, and says what redrawing it would cost', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    // The hint that said what redrawing would resample is owed to this control's help entry
    // (beat 016); the control itself says which state it is in, which is what a reader drives.
    await page.getByTestId('toggle-redraw-track').click();
    await expect(page.getByTestId('toggle-redraw-track')).toContainText('Stop redrawing');

    await page.getByTestId('enlarge-24').click();
    const overlay = page.getByTestId('panel-field-24-overlay');
    await overlay.scrollIntoViewIfNeeded();
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    // Where the waypoints actually are, read from the panel rather than guessed at.
    const first = page.getByTestId('panel-field-24-waypoints').locator('li').first();
    const grid = await first.evaluate((node) => ({
      x: Number((node as HTMLElement).dataset['x']),
      y: Number((node as HTMLElement).dataset['y']),
    }));
    const x = (box?.x ?? 0) + ((box?.width ?? 0) * grid.x) / 100;
    const y = (box?.y ?? 0) + (box?.height ?? 0) * (1 - grid.y / 100);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20, y - 20, { steps: 5 });
    await page.mouse.up();

    // FR-008 and FR-009: the instruments resample where the reader put the track, and the
    // surface says what the vessel would have had to do to sail it.
    await expect(page.getByTestId('run-status')).toContainText('track redrawn', {
      timeout: 120_000,
    });
    await expect(page.getByTestId('track-stretch')).toContainText(/knots/);
  });

  test('replays a run in a fresh context from its manifest alone', async ({ page, browser }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await openDisclosure(page, 'manifest-panel');
    await expect(page.getByTestId('manifest')).toContainText('rootSeed');

    // Make it a run worth replaying: a drawn seed, some integration and an edit.
    await page.getByTestId('new-run').click();
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('bias-degrees').fill('1.5');
    await page.getByTestId('bias-degrees').blur();
    await expect(page.getByTestId('run-status')).toContainText('edit', { timeout: 120_000 });

    const manifest = (await page.getByTestId('manifest').textContent()) ?? '';
    const digest = await page.getByTestId('results-digest').textContent();
    const seed = await page.getByTestId('root-seed').textContent();
    expect(manifest).toContain('"biasDegC": 1.5');
    // FR-002: the manifest carries no field, score or observation data.
    for (const forbidden of ['thickness', 'velocityU', 'skill', 'observations']) {
      expect(manifest, `the manifest carries ${forbidden}`).not.toContain(forbidden);
    }

    // AT-04, in the shell and across contexts: a second visit, on nothing but the manifest.
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(page.url());
    await openDisclosure(other, 'manifest-panel');
    await expect(other.getByTestId('manifest')).toContainText('rootSeed');
    await other.getByTestId('manifest-input').fill(manifest);
    await other.getByTestId('import-manifest').click();

    await expect(other.getByTestId('root-seed')).toHaveText(seed ?? '', { timeout: 60_000 });
    await expect(other.getByTestId('results-digest')).toHaveText(digest ?? '');
    await expect(other.getByTestId('import-failure')).toHaveCount(0);
    // The edits came back with it: a manifest that recorded them and a replay that ignored
    // them would reproduce a run nobody made.
    await expect(other.getByTestId('manifest')).toContainText('"biasDegC": 1.5');
    await fresh.close();
  });

  test('refuses a manifest that does not belong to this tree, and says which check failed', async ({
    page,
  }) => {
    await page.goto('/');
    await openDisclosure(page, 'manifest-panel');
    const manifest = (await page.getByTestId('manifest').textContent()) ?? '';
    const parsed = JSON.parse(manifest) as Record<string, unknown>;

    // FR-003 and FR-005. A digest difference is a refusal: the declared values differ, and a
    // run made against other values is a different run.
    await page.getByTestId('manifest-input').fill(
      JSON.stringify({ ...parsed, configDigest: 'not-this-configuration' }),
    );
    await page.getByTestId('import-manifest').click();
    await expect(page.getByTestId('import-failure')).toContainText('digest');
    await expect(page.getByTestId('import-failure')).toContainText('not-this-configuration');

    // A domain this build does not have is refused, naming it.
    await page.getByTestId('manifest-input').fill(JSON.stringify({ ...parsed, domainId: 'atlantis' }));
    await page.getByTestId('import-manifest').click();
    await expect(page.getByTestId('import-failure')).toContainText('atlantis');

    // A manifest carrying field data is refused by the schema, for carrying a key that does
    // not belong rather than because somebody looked for that word.
    await page.getByTestId('manifest-input').fill(
      JSON.stringify({ ...parsed, fields: { thickness: [1, 2, 3] } }),
    );
    await page.getByTestId('import-manifest').click();
    await expect(page.getByTestId('import-failure')).toContainText('not one this code can read');

    // Nothing was provisioned by any of that: the run on screen is the one that was there.
    await expect(page.getByTestId('recorded-case')).toContainText('the recorded case');
  });

  test('warns about a different build rather than refusing it', async ({ page }) => {
    await page.goto('/');
    await openDisclosure(page, 'manifest-panel');
    const parsed = JSON.parse((await page.getByTestId('manifest').textContent()) ?? '{}') as Record<
      string,
      unknown
    >;
    // FR-005: a reader holding a manifest from last month is better served by a warned replay
    // than by a door, and the warning says identity is no longer promised.
    await page.getByTestId('manifest-input').fill(
      JSON.stringify({ ...parsed, codeVersion: 'a-build-from-last-month' }),
    );
    await page.getByTestId('import-manifest').click();
    await expect(page.getByTestId('import-warning')).toContainText('a-build-from-last-month');
    await expect(page.getByTestId('import-warning')).toContainText('only');
    await expect(page.getByTestId('import-failure')).toHaveCount(0);
  });

  test('writes nothing to storage, in a whole visit', async ({ page }) => {
    // NFR-02 and FR-006. Measured rather than promised: the storage APIs are replaced before
    // the page loads and any write is recorded.
    await page.addInitScript(() => {
      const writes: string[] = [];
      (window as unknown as { __writes: string[] }).__writes = writes;
      for (const [name, storage] of [
        ['localStorage', window.localStorage],
        ['sessionStorage', window.sessionStorage],
      ] as const) {
        const original = storage.setItem.bind(storage);
        storage.setItem = (key: string, value: string) => {
          writes.push(`${name}.${key}`);
          original(key, value);
        };
      }
      const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
      Object.defineProperty(document, 'cookie', {
        get: () => cookie?.get?.call(document) ?? '',
        set: (value: string) => {
          writes.push(`cookie.${value}`);
        },
      });
      const openDatabase = indexedDB.open.bind(indexedDB);
      indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
        writes.push('indexedDB.open');
        return openDatabase(...args);
      }) as typeof indexedDB.open;
    });

    await page.goto('/');
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('new-run').click();

    const writes = await page.evaluate(() => (window as unknown as { __writes: string[] }).__writes);
    expect(writes, `these were written: ${writes.join(', ')}`).toEqual([]);
    expect(page.url()).not.toContain('#');
    expect(page.url()).not.toContain('?');
  });

  /**
   * Beat 014: the deferrals page was already carrying all four with their triggers, and
   * `tests/run/deferral-trigger.test.ts` still measures them on every run. So the panel became
   * a named link rather than a second copy that could drift from the first -- and the link is
   * outside every disclosure, because a reader has to be able to find what the harness does
   * not do without opening anything.
   */
  test('says where what it does not do is written down, without anything being opened', async ({
    page,
  }) => {
    await page.goto('/');
    const link = page.getByTestId('deferrals-link');
    await expect(link).toBeVisible();
    await expect(link).toContainText('What this does not do, and what would change that');
    await expect(link).toHaveAttribute('href', '../deferred.html');
    await expect(page.getByTestId('deferrals-panel')).toHaveCount(0);
  });

  /**
   * Beat 013 deleted the score panel: FR-046 says each panel's figures are drawn beneath that
   * panel and that no scores table exists anywhere else. Every claim the panel carried is
   * asserted here against the scores region, which is where those figures now are.
   *
   * One claim lost its subject and is recorded rather than quietly dropped. The score panel
   * scored the *run* from its start, where an Argo profile had been assimilated, so its
   * independence caveat fired; the row's panels score from the issue instant, by which no
   * Argo profile has arrived (beat 009), so there is nothing to caveat. What the panel must
   * therefore say -- and what is asserted here -- is which of the two it is, because a reader
   * cannot tell "independent" from "nobody checked" out of a blank space (review R-3).
   */
  test('never shows an error figure without two references and their provenance', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('scores-empty')).toContainText('in that panel’s own column');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('panel-score-24')).toContainText('not scored yet');

    await page.getByTestId('score-row').click();
    const score = page.getByTestId('panel-score-24');
    await expect(score).toContainText('persistence', { timeout: 60_000 });

    // FR-021: the convention, and the words. Whichever way this run falls, the statement
    // says it in the SRD's terms rather than in kinder ones.
    await expect(score.locator('.statement')).toContainText(/than (persistence|climatology)/);
    await expect(score).toContainText('vs persistence');
    await expect(score).toContainText('vs climatology');

    // FR-022: a score without provenance is an assertion.
    await openDisclosure(page, 'panel-provenance-24');
    const provenance = page.getByTestId('panel-provenance-24');
    await expect(provenance).toContainText('root-mean-square');
    await expect(provenance).toContainText('sponge margin');
    await expect(provenance).toContainText('declining to resolve below');
    // Beat 014 took the harness's own gloss on the offsets to this panel's help, which beat
    // 016 builds. The reason is not lost with it: the scorer says it itself, in the metric it
    // names, and the scorer's words are what the surface prints verbatim.
    await expect(provenance).toContainText('the means removed are published beside the score');

    // ADR-0007 and review R-3: the caveat travels with the figure, and where there is none
    // the panel says so rather than leaving a space a reader has to interpret.
    await expect(provenance).toContainText(/not independent evidence|no independence caveat/);
  });

  /**
   * Beat 013 moved the attribution panel: its field is the centre's analysed field, drawn at
   * full size while there are no panels to select a cell on, and the breakdown it produced is
   * the detail region's (FR-047). The claims are the same ones.
   */
  test('draws the attribution as the analysis own weights, and a cell breakdown on demand', async ({
    page,
  }) => {
    await page.goto('/');
    const field = page.getByTestId('analysed-field');
    await expect(field).toBeVisible();
    await expect(field).toContainText('the analysis’s own gain');

    // Review R-7: the radius is a property of the declared length scale, and the surface
    // says so rather than letting a reader take it for a property of the ocean.
    await expect(page.getByTestId('influence-radius')).toContainText('not of the ocean');

    // FR-048: with nothing selected the region says what could be there and how to put it
    // there, rather than rendering blank.
    await expect(page.getByTestId('detail-empty')).toContainText('attribution breakdown');
    await expect(page.getByTestId('cell-breakdown')).toHaveCount(0);

    // FR-18: a breakdown is an instrument of a selected cell. It says which cell, and the
    // sentence explaining why it is never a per-panel summary is owed to this region's help.
    await page.getByTestId('attribution-view-overlay').click({ position: { x: 200, y: 200 } });
    const breakdown = page.getByTestId('cell-breakdown');
    await expect(breakdown).toContainText('as the analysis weighted it');
    await expect(breakdown).toContainText('observations');
    await expect(breakdown).toContainText('climatology');
    // Principle V: every share the breakdown prints is a computed figure and is drawn as one.
    await expect(breakdown.locator('.figure.computed').first()).toBeVisible();
  });

  /**
   * What the instruments produced, as figures. Beat 014 sent every sentence that explained one
   * of them to the site's data-model page -- the fall rate, the inversion, Argo's dependence
   * on the truth record, and what a flag does and does not do -- and
   * `tests/docs/disposition.test.ts` holds each of them against the section it went to. What
   * belongs here is the counts, because the toggles that change them are in this column.
   */
  test('says what the instruments measured and what each measurement was priced at', async ({
    page,
  }) => {
    await page.goto('/');
    const panel = page.getByTestId('instruments-panel');
    await expect(panel).toBeVisible();
    await openDisclosure(page, 'instruments-panel');
    await expect(page.getByTestId('surface-count')).toContainText('representativeness');
    await expect(page.getByTestId('drop-count')).toContainText('levels each');
    await expect(page.getByTestId('argo-state')).toContainText(/external|not assimilated/);
    await expect(page.getByTestId('flag-summary')).toBeVisible();
    await expect(page.getByTestId('interface-estimates').locator('.figure.computed').first()).toBeVisible();

    // ADR-0007's caveat is not lost with the sentence that carried it: every score still
    // prints its own independence caveat, which is where Principle V wants it.
    await expect(panel.locator('.figure.declared').first()).toBeVisible();
  });

  /**
   * SRD-v1 FR-11, built by beat 013 because it had never been built: the shell read
   * `domains.defaultId` and nothing on the surface offered the second domain. The contrast is
   * a requirement rather than a bonus -- a reader has to be able to watch the same machinery
   * buy much less over a deliberately bland ocean.
   *
   * And building it found that the bland domain cannot be run at all.
   * `instruments.track.waypoints` are declared once, in the eventful domain's longitudes, and
   * the bland domain's artefact does not cover them, so the ownship thermometer refuses to
   * sample there. Under FR-40 that is recorded rather than fixed: a per-domain track is a
   * configuration change and this beat changes no declared value. What is asserted here is
   * Principle VI -- the harness loses in a way a reader can read, in the instrument's own
   * words, and the run they had is still on screen afterwards.
   */
  test('offers the second domain, and says why it cannot be run', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await openDisclosure(page, 'truth-panel');
    await expect(page.getByTestId('truth-domain')).toContainText('gulf-stream-front');
    await expect(page.getByTestId('domain-gulf-stream-front')).toBeChecked();
    await expect(page.getByTestId('domain-open-gyre')).toHaveCount(1);

    await page.getByTestId('domain-open-gyre').check();

    const failure = page.getByTestId('domain-failure');
    await expect(failure).toBeVisible({ timeout: 60_000 });
    await expect(failure).toContainText('open-gyre');
    await expect(failure).toContainText('outside this artefact');

    // Nothing was provisioned by that: the run on screen is the one that was there, over the
    // domain it was over, and the choice is back where it was.
    await expect(page.getByTestId('recorded-case')).toContainText('the recorded case');
    await expect(page.getByTestId('domain-gulf-stream-front')).toBeChecked();
    await expect(page.getByTestId('truth-domain')).toContainText('gulf-stream-front');
    await openDisclosure(page, 'run-panel');
    await expect(page.getByTestId('run-panel')).toContainText('gulf-stream-front');
  });

  /**
   * Beat 014 dissolved the "What has been declared" disclosure: it was a list of declared
   * figures under a paragraph explaining what declared means, and the paragraph went to the
   * site's data-model page. FR-004 says a figure inside removed prose is relocated rather than
   * deleted, so the two figures that were nowhere else -- the grid and the epoch -- are in the
   * run disclosure now, and the other two were already inline where they are used.
   */
  test('states the declared values, so that no figure on the page is unattributed', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('declared-panel')).toHaveCount(0);

    // The horizons, where the row that draws them says what it will show.
    await expect(page.getByTestId('horizons')).toContainText('0, 12, 24, 48, 72, 96 h');
    // The domains, on the control that chooses one.
    await expect(page.getByTestId('domain-control').locator('.figure.declared').first()).toBeVisible();

    await openDisclosure(page, 'run-panel');
    const run = page.getByTestId('run-panel');
    await expect(run).toContainText('100 × 100');
    await expect(page.getByTestId('stability')).toContainText('2013-09');
    await expect(run.locator('.figure.declared').first()).toBeVisible();
  });
});
