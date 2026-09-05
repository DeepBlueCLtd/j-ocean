import { expect, test, type Request } from '@playwright/test';

/**
 * SC-003 and User Story 3 of spec 001.
 *
 * The site is served statically from `dist/`, not from the dev server, because the claim
 * being tested — that a visit makes no request other than for the site's own assets — is a
 * claim about what ships (NFR-02).
 */

const CONFIG_REQUEST = /j-ocean.*\.json$/;

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

    // The canvas holds a field with structure in it, not a flat colour.
    const distinct = await panel.getByRole('img').evaluate((canvas) => {
      const context = (canvas as HTMLCanvasElement).getContext('2d');
      const image = context?.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height);
      const seen = new Set<number>();
      for (let i = 0; i < (image?.data.length ?? 0); i += 4) {
        seen.add(((image?.data[i] ?? 0) << 16) | ((image?.data[i + 1] ?? 0) << 8) | (image?.data[i + 2] ?? 0));
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
