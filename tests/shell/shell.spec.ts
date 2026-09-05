import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Request } from '@playwright/test';

/**
 * SC-003 and User Story 3 of spec 001.
 *
 * The site is served statically from `dist/`, not from the dev server, because the claim
 * being tested — that a visit makes no request other than for the site's own assets — is a
 * claim about what ships (NFR-02).
 */

const CONFIG_REQUEST = /j-ocean.*\.json$/;

/** The declared presentation geometry, read from the file the shell is served. */
const declared = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../config/j-ocean.json', import.meta.url)), 'utf8'),
) as { presentation: { referenceViewportWidthPx: number; minimumPanelWidthPx: number } };

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

  test('draws the field the model holds, and says what it is', async ({ page }) => {
    await page.goto('/');
    const panel = page.getByTestId('field-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('img')).toBeVisible();
    await expect(panel).toContainText('no fixture behind this');
    await expect(page.getByTestId('initialisation')).toContainText('geostrophic balance');
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

    // The gaps in the source are stated, not smoothed over.
    await expect(page.getByTestId('truth-instants')).toContainText('interpolates nothing at build time');

    // FR-24: flagged levels are kept, and the surface says they will be drawn as flagged.
    await expect(page.getByTestId('observation-count')).toContainText('drawn as flagged, never omitted');

    // ADR-0008: the climatology's dependence on the same subset is on the surface, not in a
    // document the surface does not carry.
    await expect(page.getByTestId('climatology-overlap')).toContainText(
      'not a fully independent measure',
    );
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

  test('fits every declared horizon at the declared reference width, and never scrolls the page', async ({
    page,
  }) => {
    // FR-013's "all visible at once" is a claim about geometry at a declared width, so it is
    // measured. The row's container may scroll below that width; the page may not, ever.
    await page.setViewportSize({
      width: declared.presentation.referenceViewportWidthPx,
      height: 1000,
    });
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    const row = await page
      .getByTestId('horizon-row')
      .evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(
      row.scrollWidth,
      `the row scrolls at the declared reference width: ${String(row.scrollWidth)} > ${String(row.clientWidth)}`,
    ).toBeLessThanOrEqual(row.clientWidth + 1);

    // Every panel is inside the container it is drawn in, and no narrower than the declared
    // minimum -- "visible" is not the same as "present and one pixel wide".
    const container = await page.getByTestId('horizon-row').boundingBox();
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
   * FR-014 and SC-003. Enlarging a panel changes what is shown and never what is computed,
   * and the assertion is by identity: the same array object is in the panel afterwards.
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

    // Every other panel is still on screen: "in place" means in place.
    for (const lead of [0, 12, 48, 72, 96]) {
      await expect(page.getByTestId(`panel-${String(lead)}`)).toBeVisible();
    }
    const after = await page.getByTestId('panel-field-24').locator('canvas').first().evaluate((canvas) => {
      const context = (canvas as HTMLCanvasElement).getContext('webgl2');
      return context === null ? 'canvas2d' : 'webgl2';
    });
    expect(after).toBe(before);

    await page.getByTestId('enlarge-24').click();
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
    await page.getByTestId('panel-0').hover();
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

  test('never shows an error figure without two references and their provenance', async ({
    page,
  }) => {
    await page.goto('/');
    const panel = page.getByTestId('score-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('never one here without');
    await expect(page.getByTestId('score-run')).toBeVisible();

    await page.getByTestId('score-run').click();
    await expect(page.getByTestId('score-statement')).toBeVisible({ timeout: 30_000 });

    // FR-021: the convention, and the words. Whichever way this run falls, the statement
    // says it in the SRD's terms rather than in kinder ones.
    await expect(page.getByTestId('score-statement')).toContainText(/than (persistence|climatology)/);
    await expect(page.getByTestId('score-errors')).toContainText('persistence');
    await expect(page.getByTestId('score-errors')).toContainText('climatology');

    // FR-022: a score without provenance is an assertion.
    await expect(page.getByTestId('score-provenance')).toContainText('root-mean-square');
    await expect(page.getByTestId('score-provenance')).toContainText('sponge margin');
    await expect(page.getByTestId('score-provenance')).toContainText('declines to resolve below');
    await expect(page.getByTestId('score-offsets')).toContainText('published rather than absorbed');

    // ADR-0007: the caveat travels with the figure.
    await expect(page.getByTestId('score-caveat')).toContainText('not independent evidence');
  });

  test('draws the attribution as the analysis own weights, and a cell breakdown on demand', async ({
    page,
  }) => {
    await page.goto('/');
    const panel = page.getByTestId('attribution-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('cannot disagree with it');

    // Review R-7: the radius is a property of the declared length scale, and the surface
    // says so rather than letting a reader take it for a property of the ocean.
    await expect(page.getByTestId('influence-radius')).toContainText('not of the ocean');

    // FR-18: a breakdown is an instrument of a selected cell, never a per-panel summary.
    await expect(page.getByTestId('cell-breakdown')).toContainText('never a per-panel summary');
    await page.getByTestId('attribution-view-overlay').click({ position: { x: 200, y: 200 } });
    await expect(page.getByTestId('cell-breakdown')).toContainText('observations');
    await expect(page.getByTestId('cell-breakdown')).toContainText('climatology');
  });

  test('says what the instruments measured and what each measurement was priced at', async ({
    page,
  }) => {
    await page.goto('/');
    const panel = page.getByTestId('instruments-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Truth becomes an observation in exactly one module');
    await expect(page.getByTestId('surface-count')).toContainText('representativeness');
    await expect(page.getByTestId('drop-count')).toContainText('the depth it');

    // ADR-0007: the dependency travels with the figure, not in a document the surface does
    // not carry.
    await expect(page.getByTestId('argo-state')).toContainText('not independent evidence');

    // FR-24: a flagged observation keeps its value and is drawn as flagged.
    await expect(page.getByTestId('flag-summary')).toContainText('drawn as flagged');

    // ADR-0005: the operator's justification, on the surface.
    await expect(page.getByTestId('interface-estimates')).toContainText('interface depth');
  });

  test('states the declared values, so that no figure on the page is unattributed', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('horizons')).toContainText('0, 12, 24, 48, 72, 96 h');
    await expect(page.getByTestId('declared-panel')).toContainText('100 × 100');
    await expect(page.getByTestId('declared-panel').locator('.figure.declared').first()).toBeVisible();
  });
});
