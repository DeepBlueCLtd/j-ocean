import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { declared } from './declared-geometry.js';

/**
 * Help, where the reader asks for it (spec 016 SC-001 to SC-006; SRD-v2 FR-52, FR-53, FR-57,
 * AT-14).
 *
 * Every success criterion of the beat is here, watched in a browser rather than inferred from
 * a green headless suite. That is not a formality: the two things this beat could get wrong --
 * a control that is not where a reader looks, and an explanation that shoves the surface
 * around when it opens -- are both geometry, and geometry is only true where it is measured.
 *
 * The viewport is the **declared floor** on both axes, because a claim about a surface not
 * moving is worth asserting at the tightest window the application admits and nowhere else.
 */

const PANELS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src/harness/panels.json', import.meta.url)), 'utf8'),
) as {
  panels: readonly {
    id: string;
    region: string;
    heading: string;
    features: readonly string[];
    nothingToExplain?: string;
  }[];
};

const WITH_HELP = PANELS.panels.filter((panel) => panel.features.length > 0).map((p) => p.id);
const WITHOUT_HELP = PANELS.panels.filter((panel) => panel.features.length === 0).map((p) => p.id);

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
      controls: box('region-controls'),
      centre: box('region-centre'),
      scores: box('region-scores'),
      detail: box('region-detail'),
    };
  });
}

/** Every panel on the surface right now, and whether it is offering a control. */
async function panelsOnScreen(page: Page): Promise<{ id: string; controls: number }[]> {
  return page.evaluate(() => {
    const found = new Map<string, number>();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'))) {
      const id = element.dataset['panel'] ?? '';
      const controls = element.querySelectorAll('.help-control').length;
      found.set(id, (found.get(id) ?? 0) + controls);
    }
    return [...found].map(([id, controls]) => ({ id, controls }));
  });
}

async function openEverything(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('details')) {
      (node as HTMLDetailsElement).open = true;
    }
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({
    width: declared.presentation.minimumViewportWidthPx,
    height: declared.presentation.minimumViewportHeightPx,
  });
});

test.describe('a control exactly where there is something to explain', () => {
  /**
   * SC-001, both halves. The set of panels rendering a control is the set declaring help --
   * and a panel with nothing to explain renders *nothing*, not a disabled control and not a
   * placeholder, because a stub teaches a reader that the control is not worth pressing.
   */
  test('offers one on every panel that declares help, and none on any that does not', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('run-panel')).toBeVisible();
    await openEverything(page);

    const seen = await panelsOnScreen(page);
    expect(seen.length, 'no panel declared itself on the page').toBeGreaterThan(0);

    for (const panel of seen) {
      if (WITH_HELP.includes(panel.id)) {
        expect(panel.controls, `${panel.id} declares help and offers no control`).toBeGreaterThan(0);
      } else {
        expect(WITHOUT_HELP, `${panel.id} is on the page and is not declared`).toContain(panel.id);
        expect(panel.controls, `${panel.id} has nothing to explain and offers a control`).toBe(0);
      }
    }

    // And every control on the page belongs to a panel that declares help: an orphan control
    // would open nothing, which is the failure FR-053 is about seen from the other side.
    const controls = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.help-control')).map(
        (element) => element.closest('[data-panel]')?.getAttribute('data-panel') ?? 'nowhere',
      ),
    );
    expect(controls.length).toBeGreaterThan(0);
    for (const owner of controls) expect(WITH_HELP).toContain(owner);
  });

  /**
   * "Top right" is geometry, so it is measured. Asserting that the element exists would pass
   * with it anywhere on the panel, which is the lesson beat 007 taught about tests that count
   * elements instead of measuring them.
   */
  test('puts the control at the top right of the panel it belongs to', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('run-panel')).toBeVisible();
    await openEverything(page);

    const placements = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.help-control')).map((element) => {
        /* The box a reader would call "the panel": the control-group, the horizon panel, the
           disclosure, the figure, or -- for a panel that is a whole region -- the region. Not
           the wrapper the control itself sits in, which would make the question trivial. */
        const owner = element.closest(
          '.control-group, .panel, details, figure, .row-invitation-prose, .region',
        ) as HTMLElement;
        const control = element.getBoundingClientRect();
        const panel = owner.getBoundingClientRect();
        return {
          id:
            owner.querySelector('[data-panel]')?.getAttribute('data-panel') ??
            owner.dataset['panel'] ??
            owner.className,
          // Distance from the panel's right edge and its top, in that panel's own box.
          fromRight: panel.right - control.right,
          fromTop: control.top - panel.top,
          panelWidth: panel.width,
          panelHeight: panel.height,
        };
      }),
    );
    expect(placements.length).toBeGreaterThan(0);
    for (const placed of placements) {
      expect(placed.fromRight, `${placed.id} is not at its panel's right`).toBeLessThan(
        Math.max(24, placed.panelWidth / 4),
      );
      expect(placed.fromTop, `${placed.id} is not at its panel's top`).toBeLessThan(
        Math.max(24, placed.panelHeight / 4),
      );
    }
  });
});

test.describe('opening in place', () => {
  /**
   * SC-005, and the reason the explanation is placed rather than laid out: opening it may not
   * change any region's bounding rectangle. To the pixel, because "does not move" admits of no
   * tolerance -- a surface that shifted by two pixels on a click teaches the same caution as
   * one that reflowed.
   */
  test('changes no region’s rectangle, and does not grow the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('run-panel')).toBeVisible();

    const before = await regionBoxes(page);
    const extentBefore = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));

    await page.getByTestId('help-control-controls/manifest').click();
    await expect(page.getByTestId('help-controls/manifest')).toBeVisible();

    expect(await regionBoxes(page)).toEqual(before);
    expect(await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }))).toEqual(extentBefore);
  });

  /**
   * FR-041, at the panel that makes it hard: a horizon panel is one declared minimum wide, and
   * an explanation of what a panel says is longer than that. It scrolls within itself, declares
   * that it does with `data-scrolls`, and stays inside the window.
   */
  test('scrolls within itself rather than off the window', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('help-control-centre/horizon-panel#24').click();
    const card = page.getByTestId('help-centre/horizon-panel#24');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-scrolls', 'true');

    const measured = await card.evaluate((element) => ({
      scrolls: element.scrollHeight > element.clientHeight + 1,
      overflowY: getComputedStyle(element).overflowY,
      rect: element.getBoundingClientRect().toJSON() as { top: number; bottom: number; left: number; right: number },
      window: { width: window.innerWidth, height: window.innerHeight },
      page: {
        width: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        height: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      },
    }));
    expect(measured.overflowY).toBe('auto');
    expect(measured.rect.top).toBeGreaterThanOrEqual(0);
    expect(measured.rect.bottom).toBeLessThanOrEqual(measured.window.height + 1);
    expect(measured.rect.left).toBeGreaterThanOrEqual(0);
    expect(measured.rect.right).toBeLessThanOrEqual(measured.window.width + 1);
    expect(measured.page.width).toBeLessThanOrEqual(measured.page.clientWidth);
    expect(measured.page.height).toBeLessThanOrEqual(measured.page.clientHeight);
    console.log(
      `    the horizon panel's help is ${String(Math.round(measured.rect.bottom - measured.rect.top))} px tall ` +
        `and ${measured.scrolls ? 'scrolls within itself' : 'fits'}`,
    );
  });

  /** FR-052: no sequence. Not a next button, not a previous one, not a step count. */
  test('offers no next, no previous and no step count', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('run-panel')).toBeVisible();
    await page.getByTestId('help-control-controls/manifest').click();
    const card = page.getByTestId('help-controls/manifest');
    await expect(card).toBeVisible();

    expect(await card.locator('button, a').count(), 'help offers something to press').toBe(0);
    await expect(card).not.toContainText(/\bstep\b/i);
    await expect(card).not.toContainText(/\bnext\b/i);
    // And exactly one is open: opening a second closes the first, so nothing sequences by
    // accumulation either.
    await page.getByTestId('help-control-detail/attribution-breakdown').click();
    await expect(page.getByTestId('help-detail/attribution-breakdown')).toBeVisible();
    await expect(page.locator('[data-help]')).toHaveCount(1);
  });

  /** FR-057: the control closes it, Escape closes it, and focus comes back to the control. */
  test('closes on the control and on Escape, with focus returned', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('run-panel')).toBeVisible();
    const control = page.getByTestId('help-control-controls/manifest');
    const card = page.getByTestId('help-controls/manifest');

    await control.click();
    await expect(card).toBeVisible();
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    // Opening help is not a request to open the disclosure it is on.
    await expect(page.getByTestId('manifest-panel')).not.toHaveAttribute('open', '');
    await control.click();
    await expect(card).toHaveCount(0);
    await expect(control).toBeFocused();

    await control.press('Enter');
    await expect(card).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await expect(control).toBeFocused();
  });
});

test.describe('help belongs to a panel, and dies with it', () => {
  /**
   * The pair of behaviours from US1 scenario 3, which are the same mechanism seen twice.
   * Enlarging moves a panel from the row into the centre and it is *the same panel*, so its
   * help follows it. Choosing another horizon in the strip puts a different panel there, so
   * the explanation closes rather than standing over a panel that is no longer on the surface.
   */
  test('follows its panel through enlargement and closes on a strip swap', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('help-control-centre/horizon-panel#48').click();
    await expect(page.getByTestId('help-centre/horizon-panel#48')).toBeVisible();

    await page.getByTestId('enlarge-48').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();
    // The same entry, at more room, still open: the panel did not stop being that panel.
    await expect(page.getByTestId('help-centre/horizon-panel#48')).toBeVisible();

    await page.getByTestId('strip-96').click();
    await expect(page.getByTestId('panel-96')).toBeVisible();
    await expect(page.getByTestId('help-centre/horizon-panel#48')).toHaveCount(0);
    await expect(page.locator('[data-help]')).toHaveCount(0);
  });

  /** And nothing about opening help changes what is computed, or what the centre is holding. */
  test('leaves the centre holding what it was holding', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('enlarge-24').click();
    await expect(page.getByTestId('enlarged-centre')).toBeVisible();

    const before = await page.getByTestId('centre-ledger').getAttribute('data-centre-ledger');
    await page.getByTestId('help-control-centre/horizon-panel#24').click();
    await expect(page.getByTestId('help-centre/horizon-panel#24')).toBeVisible();
    expect(await page.getByTestId('centre-ledger').getAttribute('data-centre-ledger')).toBe(before);
  });
});

/**
 * SC-006: the four rows §7 owes an explanation to, opened in a browser. G-08 holds them by name
 * on disk; this is a reader pressing each one and finding words there.
 */
test.describe('the four §7 destinations', () => {
  const OWED: readonly { subject: string; panel: string; says: RegExp }[] = [
    { subject: 'attribution', panel: 'centre/attribution', says: /influences the far side/ },
    { subject: 'lead and issue time', panel: 'controls/issue-time', says: /Two axes, not one/ },
    { subject: 'the references and skill', panel: 'scores', says: /no better than the reference/ },
    {
      subject: 'the observation footprint',
      panel: 'controls/observation-footprint',
      says: /drawn as flagged and never omitted/,
    },
  ];

  /*
   * Two of the four are on the surface before the row is built and two after it: the analysed
   * field is what the centre holds until there are panels, and the issue-time axis and the
   * footprint counts arrive with the row they describe. So the reader is walked through both
   * states rather than being asserted about in one.
   */
  test('each opens on the panel it belongs to and says something', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await expect(page.getByTestId('run-panel')).toBeVisible();
    await openOwed(page, OWED.filter((one) => one.panel === 'centre/attribution'));

    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await openOwed(page, OWED.filter((one) => one.panel !== 'centre/attribution'));
  });
});

async function openOwed(
  page: Page,
  owedList: readonly { subject: string; panel: string; says: RegExp }[],
): Promise<void> {
  {
    for (const owed of owedList) {
      const control = page.getByTestId(`help-control-${owed.panel}`);
      await expect(control, `§7 owes ${owed.subject} an explanation`).toBeVisible();
      await control.click();
      const card = page.getByTestId(`help-${owed.panel}`);
      await expect(card).toBeVisible();
      await expect(card, `${owed.subject} says nothing`).toContainText(owed.says);
      await page.keyboard.press('Escape');
    }
  }
}

/** SC-004: no tour, no overlay, no step counter, and nothing left of the button that opened one. */
test('the walkthrough is gone from the surface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('run-panel')).toBeVisible();
  for (const testId of [
    'help-button',
    'walkthrough-card',
    'walkthrough-spotlight',
    'walkthrough-progress',
    'walkthrough-next',
    'walkthrough-back',
    'walkthrough-done',
  ]) {
    await expect(page.getByTestId(testId), `${testId} is still on the page`).toHaveCount(0);
  }
  // And the legend it carried is reachable, on the site, from the application.
  await expect(page.getByTestId('figure-kinds-link')).toHaveAttribute(
    'href',
    '../data-model.html#the-figure-kinds',
  );
});
