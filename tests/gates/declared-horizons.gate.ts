import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Gate G-05 -- every horizon declared in configuration is rendered, and no panel is drawn for
 * a horizon that is not declared (constitution Principle X, SRD G-05, FR-13).
 *
 * It runs in a browser and it must: the constitution says this gate "checks this in the
 * running shell, not by reading the source", because the failure it exists to catch is a row
 * that has quietly stopped agreeing with configuration -- and source can be read into agreeing
 * with anything.
 *
 * The planted violation is the second test, and getting it right took two attempts. The first
 * injected an *extra* horizon into the configuration the page received -- and the row rendered
 * seven panels, because it is properly data-driven and does what it is told. Nothing was
 * planted; the shell was simply obeying a different file.
 *
 * The failure this gate actually exists to catch is a row that has stopped agreeing with the
 * configuration **on disk**. So the fixture serves the page a configuration with one horizon
 * removed while the gate compares against the declared file, which is exactly that
 * disagreement. It is watched failing on every run rather than once by a person.
 */

const CONFIG_PATH = fileURLToPath(new URL('../../config/j-ocean.json', import.meta.url));
const CONFIG_REQUEST = /j-ocean.*\.json$/;

interface DeclaredConfig {
  horizons: { leadHours: number[] };
}

const declaredHorizons = (): number[] => {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as DeclaredConfig;
  return [...config.horizons.leadHours].sort((a, b) => a - b);
};

async function renderedHorizons(page: Page): Promise<number[]> {
  await page.goto('/');
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
  return page
    .getByTestId('horizon-row')
    .locator('[data-lead-hours]')
    .evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLElement).dataset['leadHours'])));
}

test.describe('G-05 declared horizons rendered', () => {
  test('renders every declared horizon, in order, and no others', async ({ page }) => {
    const declared = declaredHorizons();
    const rendered = await renderedHorizons(page);

    // Order matters as much as membership: a row out of order would still show every horizon
    // and would still be a lie about decay.
    expect(rendered, 'the rendered horizons must be exactly the declared ones, in order').toEqual(
      declared,
    );
  });

  test('fails when the row stops agreeing with the declared file (the planted violation)', async ({
    page,
  }) => {
    const declared = declaredHorizons();
    const missing = declared[3];
    expect(missing, 'the declared row needs at least four horizons for this fixture').toBeDefined();

    // The page is served a configuration one horizon short of the declared one. The row obeys
    // it, as it should; what has been planted is the *disagreement*, which is the thing G-05
    // exists to notice.
    await page.route(CONFIG_REQUEST, async (route) => {
      const response = await route.fetch();
      const config = JSON.parse(await response.text()) as DeclaredConfig;
      config.horizons.leadHours = declared.filter((hours) => hours !== missing);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    });

    const rendered = await renderedHorizons(page);

    // G-05's assertion, inverted: here it must fail, and this test asserts that it does.
    expect(rendered).not.toEqual(declared);
    expect(declared.filter((hours) => !rendered.includes(hours))).toEqual([missing]);
    expect(rendered.length).toBe(declared.length - 1);
  });
});
