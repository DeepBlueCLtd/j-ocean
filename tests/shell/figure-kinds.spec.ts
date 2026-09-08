import { expect, test, type Page } from '@playwright/test';
import { decodePng, type Pixels } from './greyscale.js';
import { FLOOR } from './declared-geometry.js';

/**
 * The four figure kinds, measured on rendered pixels (spec 018 FR-008, SC-006; SRD-v1 FR-07,
 * FR-19; NFR-05; constitution Principle V).
 *
 * Beat 017 asserted this by reading `getComputedStyle` for each kind and comparing weight,
 * slant and border. That is a measurement of the stylesheet. It is a good check — it catches a
 * kind whose rule was deleted — and it is not the claim: the claim is that a **monochrome
 * print** of this surface still says which kind a figure is, and a print is made of pixels.
 * Beat 007 established the discipline on the attribution field for exactly this reason, and
 * beat 018 applies it to the typography, because beat 017 recorded that three of the four
 * kinds had been separated by colour alone before it fixed them.
 *
 * So each kind is photographed through a real saturation filter and three things are measured
 * off the photograph:
 *
 * - **ink**: what fraction of the glyph box is darker than the paper, which is weight;
 * - **underline**: whether the bottom rows of the box carry a rule, which is the dotted or
 *   dashed border two of the kinds use;
 * - **lean**: how far the ink's centre of mass moves between the top of the box and the
 *   bottom, which is slant.
 *
 * Every pair of kinds must differ in at least one of the three by more than a declared margin.
 * Colour is not read at all: it is the channel the requirement says may not be the only one,
 * and the filter has removed it anyway — which is itself asserted first, because a greyscale
 * measurement taken on a photograph still in colour would pass while measuring nothing.
 */

/** How much of the box's ink must differ before two kinds count as differently weighted. */
const INK_MARGIN = 0.02;
/** How far the ink's centre must move down the box before a kind counts as slanted. */
const LEAN_MARGIN_PX = 0.25;
/** How much of a row must be ink before it counts as a rule under the word. */
const RULE_SHARE = 0.3;

interface Signature {
  readonly kind: string;
  readonly ink: number;
  readonly underlined: boolean;
  readonly lean: number;
  readonly colourful: number;
}

/**
 * What a photograph of one figure says, in the three channels a monochrome print keeps.
 *
 * The paper is taken from the box's own corner rather than assumed white: a figure inside a
 * banner or a table cell sits on a different ground, and a threshold against the wrong paper
 * would measure the ground rather than the ink.
 */
function signatureOf(kind: string, pixels: Pixels): Signature {
  const paper = Math.max(
    pixels.luminanceAt(0, 0),
    pixels.luminanceAt(pixels.width - 1, 0),
    pixels.luminanceAt(0, pixels.height - 1),
  );
  const dark = (x: number, y: number): boolean => pixels.luminanceAt(x, y) < paper - 40;

  let ink = 0;
  let colourful = 0;
  let topMass = 0;
  let topX = 0;
  let bottomMass = 0;
  let bottomX = 0;
  const third = pixels.height / 3;

  for (let y = 0; y < pixels.height; y += 1) {
    for (let x = 0; x < pixels.width; x += 1) {
      const [r, g, b] = pixels.channelsAt(x, y);
      if (Math.max(Math.abs(r - g), Math.abs(g - b)) > 4) colourful += 1;
      if (!dark(x, y)) continue;
      ink += 1;
      if (y < third) {
        topMass += 1;
        topX += x;
      } else if (y > pixels.height - third) {
        bottomMass += 1;
        bottomX += x;
      }
    }
  }

  /* A rule under the word: the bottom two rows of the box, mostly ink across their width. */
  let underlined = false;
  for (let y = pixels.height - 3; y < pixels.height; y += 1) {
    if (y < 0) continue;
    let run = 0;
    for (let x = 0; x < pixels.width; x += 1) if (dark(x, y)) run += 1;
    if (run / pixels.width >= RULE_SHARE) underlined = true;
  }

  const lean =
    topMass === 0 || bottomMass === 0 ? 0 : topX / topMass - bottomX / bottomMass;

  return {
    kind,
    ink: ink / (pixels.width * pixels.height),
    underlined,
    lean,
    colourful,
  };
}

/** Everything a reader has to have on screen before all four kinds exist to be compared. */
async function everyKindOnScreen(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('pane-controls')).toBeVisible();
  // Host time arrives with a measured step.
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 60_000 });
  // A derived level arrives with a measured profile beside the model's own.
  await page.getByTestId('build-row').click();
  await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('enlarge-24').click();
  await expect(page.getByTestId('enlarged-centre')).toBeVisible();
  const id = await page
    .getByTestId('panel-field-24-marks')
    .locator('li[data-kind="drop"]')
    .first()
    .getAttribute('data-mark-id');
  await page.getByTestId(`needle-${String(id)}`).click();
  await expect(page.getByTestId('profile-comparison')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(FLOOR);
});

test.describe('every figure says what kind it is, without colour', () => {
  test('is distinguishable on rendered pixels through a saturation filter', async ({ page }) => {
    test.setTimeout(300_000);
    await everyKindOnScreen(page);

    await page.evaluate(() => {
      document.documentElement.style.filter = 'grayscale(1)';
    });

    const signatures: Signature[] = [];
    for (const kind of ['declared', 'computed', 'derived', 'host-time']) {
      /* The widest instance of the kind, so the photograph has glyphs in it rather than a
         single character: a signature taken from one narrow figure would be a measurement of
         that figure and not of the kind. */
      const element = page.locator(`.${kind}`).filter({ hasNotText: /^$/ }).first();
      await expect(element, `no "${kind}" figure is on the surface to be photographed`).toBeVisible();
      signatures.push(signatureOf(kind, decodePng(await element.screenshot())));
    }

    for (const one of signatures) {
      expect(
        one.colourful,
        `the saturation filter did not apply to the "${one.kind}" figure, so nothing about it ` +
          'was measured',
      ).toBe(0);
    }

    console.log(
      '    figure kinds on rendered pixels, through grayscale(1):\n' +
        signatures
          .map(
            (one) =>
              `      ${one.kind.padEnd(9)} ink ${one.ink.toFixed(4)}  ` +
              `${one.underlined ? 'underlined' : 'no rule   '}  lean ${one.lean.toFixed(2)} px`,
          )
          .join('\n'),
    );

    const failures: string[] = [];
    for (const one of signatures) {
      for (const other of signatures) {
        if (one.kind >= other.kind) continue;
        const differs =
          one.underlined !== other.underlined ||
          Math.abs(one.ink - other.ink) > INK_MARGIN ||
          Math.abs(one.lean - other.lean) > LEAN_MARGIN_PX;
        if (!differs) {
          failures.push(
            `"${one.kind}" and "${other.kind}" photograph identically once the colour is taken ` +
              `away: ink ${one.ink.toFixed(4)} against ${other.ink.toFixed(4)}, ` +
              `${one.underlined ? 'underlined' : 'no rule'} against ` +
              `${other.underlined ? 'underlined' : 'no rule'}, lean ${one.lean.toFixed(2)} ` +
              `against ${other.lean.toFixed(2)}`,
          );
        }
      }
    }
    expect(
      failures,
      'a monochrome print of this surface cannot say which kind these figures are, so a figure ' +
        'is carrying its provenance in colour alone (SRD-v1 FR-19, NFR-05, Principle V)',
    ).toEqual([]);
  });

  /**
   * And the stylesheet check beat 017 wrote, kept: it fails on a *rule* that was deleted,
   * which the pixel measurement above would only catch if the deletion happened to make two
   * kinds photograph alike. The two are not the same check and neither replaces the other.
   */
  test('is distinguishable in the channels the stylesheet declares', async ({ page }) => {
    test.setTimeout(300_000);
    await everyKindOnScreen(page);
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('details')) {
        (node as HTMLDetailsElement).open = true;
      }
    });

    const kinds = await page.evaluate(() => {
      const seen: Record<string, string[]> = {};
      for (const kind of ['declared', 'computed', 'derived', 'host-time']) {
        for (const element of document.querySelectorAll(`.${kind}`)) {
          if (element.getClientRects().length === 0) continue;
          const style = getComputedStyle(element);
          const signature = [
            style.fontWeight,
            style.fontStyle,
            style.borderBottomStyle,
            style.textDecorationLine,
          ].join('|');
          const already = (seen[kind] ??= []);
          if (!already.includes(signature)) already.push(signature);
        }
      }
      return seen;
    });

    expect(
      Object.keys(kinds).sort(),
      'not every figure kind was on the surface to be compared',
    ).toEqual(['computed', 'declared', 'derived', 'host-time']);

    for (const one of Object.keys(kinds)) {
      for (const other of Object.keys(kinds)) {
        if (one === other) continue;
        const shared = (kinds[one] ?? []).filter((signature) =>
          (kinds[other] ?? []).includes(signature),
        );
        expect(
          shared,
          `a "${one}" figure and an "${other}" figure are drawn identically once the colour is ` +
            'taken away, so a greyscale reader cannot tell them apart (SRD-v1 FR-19, NFR-05)',
        ).toEqual([]);
      }
    }
  });

  /**
   * FR-008's other half, and Principle VI (spec 018 US4, second acceptance scenario).
   *
   * The requirement has two halves that pull in opposite directions, and each is asserted
   * where it belongs. **The loss is visible as a figure** with nothing opened: the skill
   * against climatology is a negative number in the panel, printed as it computes. **The
   * scorer's own statement is one disclosure away**, unsoftened -- it was drawn over the
   * figures until beat 018, which is a sentence doing a readout's job, and moving it is
   * allowed to change where it is and nothing about what it says.
   *
   * So the statement is required to be *behind* the disclosure and required to be *whole*
   * when it is opened. A test that only looked for the words would pass on a surface that had
   * put them back over the figures; a test that only looked for the figures would pass on one
   * that had quietly dropped the verdict.
   */
  test('keeps the scorer’s own words one disclosure away, unsoftened', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('score-row').click();
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 120_000 });

    // Principle VI, in the panel, with nothing opened: the losing figure is on screen and it
    // is negative. Read as a number rather than as text, because "the loss is visible" is a
    // claim about a figure and not about a form of words.
    const losing = page.getByTestId('panel-skill-climatology-24');
    await expect(losing).toBeVisible();
    const value = Number((await losing.textContent())?.trim());
    expect(value, 'the skill against climatology is not a figure a reader can read').not.toBeNaN();
    expect(
      value,
      'this run does not lose to climatology at +24 h, so the case this test exists to hold ' +
        'is not on screen; it is the harness losing that Principle VI is about',
    ).toBeLessThan(0);

    // And the scorer's own words are behind the disclosure rather than over the figures.
    const score = page.getByTestId('panel-score-24');
    const provenance = page.getByTestId('panel-provenance-24');
    await expect(provenance).not.toHaveAttribute('open', '');
    await expect(
      score.locator('.statement:visible'),
      'the scorer’s statement is drawn on the surface again, over the figures that say the ' +
        'same thing (spec 018 FR-008: it belongs one disclosure away)',
    ).toHaveCount(0);

    await provenance.locator('summary').click();
    // Unsoftened: the scorer's own construction, with its own number, not a gentler gloss.
    await expect(provenance.locator('.statement')).toContainText(
      /worse than climatology by \d+(\.\d+)? per cent/,
    );
    await expect(provenance).toContainText('cells');
    await expect(provenance).toContainText('declining to resolve below');
    await expect(provenance).toContainText(/Means removed/);
  });
});
