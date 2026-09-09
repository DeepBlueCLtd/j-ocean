import { expect, test, type Page, type Request } from '@playwright/test';
import { declared, FLOOR, REFERENCE } from './declared-geometry.js';
import { advanceThroughTheBudget } from './census.js';

/**
 * SC-003 and User Story 3 of spec 001.
 *
 * The site is served statically from `dist/`, not from the dev server, because the claim
 * being tested — that a visit makes no request other than for the site's own assets — is a
 * claim about what ships (NFR-02).
 */

const CONFIG_REQUEST = /j-ocean.*\.json$/;

/** A disclosure has to be opened before what is inside it can be seen. */
/**
 * Open whatever holds a panel's figures.
 *
 * Beat 018 turned four disclosures into four tabs of the provenance pane, so "open the run
 * panel" is now "select the run tab". The claim every caller makes is unchanged -- these
 * figures are on the surface when a reader asks for them -- so the helper takes the change and
 * the tests keep their assertions. Where the element is still a `<details>` it is still opened.
 */
const PROVENANCE_TABS: Readonly<Record<string, string>> = {
  'run-panel': 'The run',
  'instruments-panel': 'Instruments',
  'truth-panel': 'Truth record',
  'manifest-panel': 'Manifest',
};

async function openDisclosure(page: Page, testId: string): Promise<void> {
  const tab = PROVENANCE_TABS[testId];
  if (tab !== undefined) {
    await page.locator('.dv-tab', { hasText: tab }).first().click();
    await expect(page.getByTestId(testId)).toBeVisible();
    return;
  }
  await page.getByTestId(testId).evaluate((node) => {
    (node as HTMLDetailsElement).open = true;
  });
}

/**
 * What the advance control says it does, and what that is in the run's own units.
 *
 * The hours are read off the control's label rather than written down here: the claim under
 * test is that the run ends up where the surface said it would, so the surface has to be the
 * one saying it. The timestep is declared, like every other figure these tests measure
 * against.
 */
async function advanceTheControlOffers(page: Page): Promise<{
  readonly label: string;
  readonly hours: number;
  readonly steps: number;
  readonly instantAfter: (fromMs: number, advances: number) => string;
}> {
  // The label the reader is being shown, and not the two the control reserves its width
  // against: `advance-label` is what the button says now (see `App.tsx`, the run controls).
  const label = ((await page.getByTestId('advance-label').textContent()) ?? '').trim();
  const match = /(\d+(?:\.\d+)?)\s*hours?/.exec(label);
  expect(match, `the advance control does not say how far it advances: "${label}"`).not.toBeNull();
  const hours = Number(match?.[1]);
  return {
    label,
    hours,
    steps: Math.round((hours * 3600) / declared.clock.timestepSeconds),
    instantAfter: (fromMs, advances) =>
      new Date(fromMs + advances * hours * 3_600_000).toISOString(),
  };
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
    await openDisclosure(page, 'manifest-panel');
    await expect(page.getByTestId('manifest')).toContainText('"recordedCase": true');
  });

  test('integrates the run and reports the step time as host time', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('steps')).toHaveText('0');
    await expect(page.getByTestId('step-time')).toContainText('not yet measured');
    const startInstant = await page.getByTestId('instant').textContent();

    // Twelve hours at the declared timestep, through the budget's question if this machine's
    // step time provokes one. The exact count comes from configuration, so the test waits for
    // the integration to stop rather than asserting a literal.
    await advanceThroughTheBudget(page);
    await expect(page.getByTestId('steps')).not.toHaveText('0');
    await expect(page.getByTestId('step-time')).toContainText('ms/step');
    // Principle V: the figure is host time and says so, in a kind of its own.
    await expect(page.getByTestId('step-time').locator('.host-time')).toBeVisible();
    await expect(page.getByTestId('instant')).not.toHaveText(startInstant ?? '');
  });

  /**
   * The control does what it says, whichever way a reader reaches the end of it (FR-008,
   * FR-009; spec 018 US3).
   *
   * ## The defect this was written for
   *
   * The author pressed *Integrate 12 hours*, was shown the over-budget notice, pressed
   * *Integrate anyway*, and the run advanced **16 h 48 min**. `integrate` advanced a chunk in
   * order to time it, *then* asked whether the budget allowed the rest, and on a refusal it
   * kept those 72 steps and counted none of them; proceeding took a fresh 180 from where the
   * probe had left the run. 72 + 180 = 252 steps at 240 s. Two presses landed on 33 h 36 min.
   *
   * Nothing in the suite asked what the run had actually advanced. The existing integration
   * test asserted `steps` was *not* `0` and the instant had *changed*, with a comment saying
   * the exact count comes from configuration so the test waits rather than asserting a
   * literal. That is the shape of the hole: a figure derived from configuration can be
   * derived in the test as well as in the shell, and a control 40 per cent wrong satisfies
   * "not zero".
   *
   * ## How far it should have gone, read off the control itself
   *
   * The hours come from the button's own label and the timestep from the declared clock, so
   * this is not a test of 180 steps: it is a test that the run stands where the control said
   * it would put it. Change the label and the assertion changes with it; change the advance
   * and the assertion does not.
   */
  test('advances exactly what its label says, through the refusal and again after it', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Served a frame budget no machine can meet, the way G-05 and one-view.spec reach this
    // notice: the refusal is the state under test, not this host's step time.
    await page.route(CONFIG_REQUEST, async (route) => {
      const response = await route.fetch();
      const config = JSON.parse(await response.text()) as { budget: { frameBudgetMs: number } };
      config.budget.frameBudgetMs = 0.000_001;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(config),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    const advance = await advanceTheControlOffers(page);
    await expect(page.getByTestId('steps')).toHaveText('0');
    const start = Date.parse((await page.getByTestId('instant').textContent()) ?? '');

    // The press. The probe is measured, the budget refuses, and what it was measured on is a
    // chunk of the advance rather than a mutation nobody counted.
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('over-budget')).toBeVisible({ timeout: 30_000 });
    const refused = Number(await page.getByTestId('steps').textContent());
    expect(refused, 'the probe took no step, so nothing was measured').toBeGreaterThan(0);
    expect(
      refused,
      'the refusal integrated the whole advance, which is not what "nothing beyond the first ' +
        'chunk" says',
    ).toBeLessThan(advance.steps);
    expect(refused).toBe(declared.model.chunkSteps);

    // "Integrate anyway": the advance finishes where it was going, not a whole advance past it.
    await page.getByTestId('proceed-anyway').click();
    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 60_000 });
    await expect(
      page.getByTestId('steps'),
      `pressing ${advance.label} once and proceeding did not advance ${String(advance.steps)} steps`,
    ).toHaveText(String(advance.steps));
    await expect(page.getByTestId('instant')).toHaveText(advance.instantAfter(start, 1));

    // The completion is announced where the advance was asked for, with the figures.
    const report = page.getByTestId('advance-report');
    await expect(report).toHaveAttribute('role', 'status');
    await expect(report).toContainText(String(advance.steps));
    await expect(report).toContainText(advance.instantAfter(start, 1));

    // And again. Two presses of a twelve-hour control are twenty-four hours; this landed on
    // 504 steps -- 33 h 36 min -- until the probe's chunk was counted.
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('over-budget')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('proceed-anyway').click();
    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 60_000 });
    await expect(
      page.getByTestId('steps'),
      'two presses did not land on two advances',
    ).toHaveText(String(2 * advance.steps));
    await expect(page.getByTestId('instant')).toHaveText(advance.instantAfter(start, 2));
  });

  /**
   * The over-budget decision is a modal, and declining it is a decision too (spec 018 FR-016).
   *
   * The author could not reach *Integrate anyway*: it was a notice at the foot of the controls
   * pane, and the pane decided how tall it was. It is a `<dialog>` opened with `showModal()`
   * now, which is what makes the three claims here true by construction rather than by
   * inspection -- the top layer moves no pane, the platform contains focus, and Escape closes.
   * Asserted anyway, because "by construction" is what the notice's own layout was said to be.
   *
   * **Escape declines**, and declining is the meaning not proceeding has always had here: the
   * chunk that was measured stands and counted, and nothing beyond it is integrated. Pressing
   * the control again resumes the *same* advance rather than starting another, so a reader who
   * declines and then changes their mind lands on twelve hours and not on twenty-four -- which
   * is the arithmetic `advance.ts` was written for, on a path it had never been asked about.
   */
  test('opens the over-budget decision as a modal, moves no pane, and declines on Escape', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.route(CONFIG_REQUEST, async (route) => {
      const response = await route.fetch();
      const config = JSON.parse(await response.text()) as { budget: { frameBudgetMs: number } };
      config.budget.frameBudgetMs = 0.000_001;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(config),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    const advance = await advanceTheControlOffers(page);
    const start = Date.parse((await page.getByTestId('instant').textContent()) ?? '');

    await page.getByTestId('advance').click();
    const decision = page.getByTestId('over-budget');
    await expect(decision).toBeVisible({ timeout: 30_000 });

    // A dialog in the flow of the page is not a modal: no top layer, no backdrop, no focus
    // held and no Escape. `showModal` is the difference and it is visible from here.
    expect(
      await decision.evaluate((node) => (node as HTMLDialogElement).matches(':modal')),
      'the over-budget decision is a dialog that was rendered open rather than opened as a modal',
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('[data-testid="over-budget"]') !== null,
      ),
      'opening the decision left focus outside it',
    ).toBe(true);

    // It moves no pane. Measured across the close rather than across the open, because the
    // advance's own chunk changes what the provenance pane prints and this claim is about the
    // dialog alone.
    const geometry = async (): Promise<string> =>
      page.evaluate(() =>
        JSON.stringify(
          Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]')).map((pane) => {
            const box = pane.getBoundingClientRect();
            return [pane.dataset['paneId'], box.x, box.y, box.width, box.height];
          }),
        ),
      );
    const withItOpen = await geometry();

    const refused = Number(await page.getByTestId('steps').textContent());
    expect(refused).toBe(declared.model.chunkSteps);

    await page.keyboard.press('Escape');
    await expect(decision).toHaveCount(0);
    expect(await geometry(), 'closing the over-budget decision moved a pane').toBe(withItOpen);
    expect(
      await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.dataset['testid'] ?? '',
      ),
      'declining left focus at the top of the document instead of on the control it came from',
    ).toBe('advance');

    // Declining integrates nothing beyond the chunk that was measured.
    await expect(page.getByTestId('steps')).toHaveText(String(refused));

    // And pressing again resumes the advance the reader asked for: twelve hours in total, not
    // twelve on top of the chunk and not twenty-four.
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('over-budget')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('proceed-anyway').click();
    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 60_000 });
    await expect(
      page.getByTestId('steps'),
      'declining and then proceeding did not land on one advance',
    ).toHaveText(String(advance.steps));
    await expect(page.getByTestId('instant')).toHaveText(advance.instantAfter(start, 1));
  });

  /**
   * The same claim on the path where the budget says nothing, which is the path a fast enough
   * machine takes and the one a refusal test can never reach.
   */
  test('advances exactly what its label says when the budget is not exceeded', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.route(CONFIG_REQUEST, async (route) => {
      const response = await route.fetch();
      const config = JSON.parse(await response.text()) as { budget: { frameBudgetMs: number } };
      // A budget no step time can exceed, so the notice cannot appear and the advance runs
      // straight through its chunks.
      config.budget.frameBudgetMs = 1_000_000;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(config),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();
    const advance = await advanceTheControlOffers(page);
    const start = Date.parse((await page.getByTestId('instant').textContent()) ?? '');

    await page.getByTestId('advance').click();
    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId('over-budget')).toHaveCount(0);
    await expect(page.getByTestId('steps')).toHaveText(String(advance.steps));
    await expect(page.getByTestId('instant')).toHaveText(advance.instantAfter(start, 1));

    await page.getByTestId('advance').click();
    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId('steps')).toHaveText(String(2 * advance.steps));
    await expect(page.getByTestId('instant')).toHaveText(advance.instantAfter(start, 2));
  });

  /**
   * NFR-04's other half: while it runs, the surface says so and the control cannot be pressed
   * again.
   *
   * The author measured `aria-busy` absent and the button enabled at every sample of a run
   * they watched take seconds. `view.integrating` did disable the button, and it was set in
   * the same task as the chunk it described: the main thread was blocked by the work before
   * the browser could paint the state that says the work is happening. Every chunk runs after
   * a yield now, the measured one included, so the busy state is on screen for the whole of
   * it -- which is what this samples.
   */
  test('cannot be pressed again while it integrates, and says it is working', async ({ page }) => {
    test.setTimeout(120_000);
    await page.route(CONFIG_REQUEST, async (route) => {
      const response = await route.fetch();
      const config = JSON.parse(await response.text()) as { budget: { frameBudgetMs: number } };
      config.budget.frameBudgetMs = 1_000_000;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(config),
      });
    });
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();

    // Sampled from inside the page, between the chunks the integration yields on: an
    // assertion driven from the test process cannot see a state that lasts a tenth of a
    // second.
    const samples = await page.evaluate(async () => {
      const read = (): { busy: boolean; disabled: boolean; says: string } => ({
        busy:
          document.querySelector('[data-testid="run-controls"]')?.getAttribute('aria-busy') ===
          'true',
        disabled:
          (document.querySelector('[data-testid="advance"]') as HTMLButtonElement | null)
            ?.disabled ?? false,
        says: document.querySelector('[data-testid="advance-report"]')?.textContent ?? '',
      });
      const taken: { busy: boolean; disabled: boolean; says: string }[] = [];
      (document.querySelector('[data-testid="advance"]') as HTMLButtonElement).click();
      for (let i = 0; i < 400; i += 1) {
        const state = read();
        taken.push(state);
        if (!state.busy && i > 0) break;
        await new Promise((resolve) => { setTimeout(resolve, 0); });
      }
      return taken;
    });

    const busy = samples.filter((sample) => sample.busy);
    expect(
      busy.length,
      'no sample caught the integration in progress, so nothing on the surface reports it',
    ).toBeGreaterThan(0);
    expect(
      busy.filter((sample) => !sample.disabled),
      'the advance control was pressable while it was integrating',
    ).toEqual([]);
    expect(
      busy.filter((sample) => !sample.says.includes('Integrating')),
      'the live region said nothing while the run was integrating',
    ).toEqual([]);

    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId('run-controls')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByTestId('advance-report')).toContainText('Integrated');
  });

  /**
   * The pointer says something long is running, for all three of them (NFR-04; the author's
   * report: *"when that long process is running, I need to see some kind of busy cursor"*).
   *
   * **Three operations and one flag.** An advance, building the horizon row and scoring every
   * horizon each block the main thread for seconds, and until beat 018's seventh pass only the
   * advance said anything at all -- and it said it in a live region and a disabled button, not
   * at the pointer, which is where a reader who has just clicked is looking. `working.ts`
   * holds the one notion; the stylesheet has one rule against it, so the three cannot drift
   * into saying different things.
   *
   * **`progress` and not `wait`.** `wait` says the application is blocked. The advance yields
   * between chunks and every pane stays readable while it runs, so `progress` -- "working,
   * still usable" -- is the true one.
   *
   * **Sampled from inside the page**, because each of these blocks the main thread from the
   * moment it starts: an assertion driven from the test process cannot ask a question while
   * the work it is asking about is running. What is sampled for the two synchronous ones is
   * the frame *after* the one that paints the busy state, which is the frame the work is
   * scheduled on -- if the flag were not up by then, no reader would ever see it.
   */
  test('shows a busy pointer for every operation that takes seconds', async ({ page }) => {
    test.setTimeout(300_000);
    await page.route(CONFIG_REQUEST, async (route) => {
      const response = await route.fetch();
      const config = JSON.parse(await response.text()) as { budget: { frameBudgetMs: number } };
      // A budget no step time can exceed: this test is about the pointer, and the over-budget
      // refusal is a different question, asked above.
      config.budget.frameBudgetMs = 1_000_000;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    });
    await page.goto('/');
    await expect(page.getByTestId('pane-controls')).toBeVisible();

    /** Press a control, and read the surface on the frame the work is scheduled on. */
    const press = async (testId: string): Promise<{ resting: string; working: string; flag: string }> =>
      page.evaluate(async (id) => {
        const surface = document.querySelector('[data-testid="one-view"]') as HTMLElement;
        const cursor = (): string => getComputedStyle(surface).cursor;
        const resting = cursor();
        (document.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click();
        await new Promise((resolve) => { requestAnimationFrame(() => { resolve(null); }); });
        return { resting, working: cursor(), flag: surface.dataset['working'] ?? '(unset)' };
      }, testId);

    const building = await press('build-row');
    expect(building.resting, 'the surface said it was working before anything was asked of it').toBe('auto');
    expect(building.flag, 'building the horizon row does not say what the surface is doing').toBe(
      'building the horizon row',
    );
    expect(
      building.working,
      'the pointer does not say the surface is working while the row is built, which is the ' +
        'longest wait this surface has',
    ).toBe('progress');
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('one-view')).toHaveAttribute('data-working', 'false');

    const scoring = await press('score-row');
    expect(scoring.flag, 'scoring every horizon does not say what the surface is doing').toBe(
      'scoring every horizon',
    );
    expect(scoring.working, 'the pointer does not say the surface is working while it scores').toBe(
      'progress',
    );
    await expect(page.getByTestId('panel-score-24')).toContainText('persistence', { timeout: 120_000 });
    await expect(page.getByTestId('one-view')).toHaveAttribute('data-working', 'false');

    // The advance drives itself in chunks, so it is sampled between them rather than on one
    // frame: every sample of it must say the same thing the other two said once.
    const samples = await page.evaluate(async () => {
      const surface = document.querySelector('[data-testid="one-view"]') as HTMLElement;
      const read = (): { busy: boolean; says: string; cursor: string } => ({
        busy: surface.dataset['working'] !== 'false',
        says: surface.dataset['working'] ?? '(unset)',
        cursor: getComputedStyle(surface).cursor,
      });
      const taken: { busy: boolean; says: string; cursor: string }[] = [];
      (document.querySelector('[data-testid="advance"]') as HTMLButtonElement).click();
      for (let i = 0; i < 400; i += 1) {
        const state = read();
        taken.push(state);
        if (!state.busy && i > 0) break;
        await new Promise((resolve) => { setTimeout(resolve, 0); });
      }
      return taken;
    });
    const busy = samples.filter((sample) => sample.busy);
    expect(busy.length, 'no sample caught the advance in progress').toBeGreaterThan(0);
    expect(
      busy.filter((sample) => sample.cursor !== 'progress'),
      'the pointer did not say the surface was working while it integrated',
    ).toEqual([]);
    expect(
      busy.filter((sample) => sample.says !== 'integrating').map((sample) => sample.says),
      'the surface said it was doing something other than integrating while it integrated',
    ).toEqual([]);
    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId('one-view')).toHaveAttribute('data-working', 'false');
  });

  /**
   * The control says how far it has got, and saying so moves nothing (the author's request;
   * spec 018 FR-002).
   *
   * A progress line under the button would be a line in the pane whose content height **is**
   * the declared floor. A relabel costs no line at all -- and costs nothing else either, which
   * is the property measured here: the button reserves the width of its widest label up front,
   * so the button, the control beside it and every pane in the dock have the same rectangle
   * while it works as when it is idle.
   *
   * The defect this is written against is beat 018's own: the walkthrough offer changed its
   * label from *Walk me through it* to *Close the walkthrough* and moved every pane in the
   * dock by 11 px. A label that changes width is a layout that moves under the reader's
   * pointer, and it is measured at the floor -- where the controls pane is narrowest and a
   * wider button is a wrapped row -- and at the reference width.
   */
  test('relabels the advance control while it works, and reflows nothing', async ({ page }) => {
    test.setTimeout(300_000);
    await page.route(CONFIG_REQUEST, async (route) => {
      const response = await route.fetch();
      const config = JSON.parse(await response.text()) as { budget: { frameBudgetMs: number } };
      config.budget.frameBudgetMs = 1_000_000;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    });

    for (const width of [FLOOR.width, REFERENCE.width]) {
      await page.setViewportSize({ width, height: FLOOR.height });
      await page.goto('/');
      await page.evaluate(() => { window.localStorage.clear(); });
      await page.reload();
      await expect(page.getByTestId('pane-controls')).toBeVisible();

      /* One advance first, and the resting layout measured after it. What is under test is
         the relabel and nothing else, and the run's own figures arrive with the first advance
         -- the step time in the status strip is *not yet measured* until then, and a strip
         whose figures have just been filled in is a strip that changed for a reason that has
         nothing to do with this control. So both snapshots are taken with the run in the same
         state: advanced, its step time measured, its completion confirmed. */
      await advanceThroughTheBudget(page);
      await expect(page.getByTestId('advance-report')).toContainText('Integrated');

      const run = await page.evaluate(async () => {
        const boxes = (): string =>
          JSON.stringify(
            [
              ...Array.from(document.querySelectorAll<HTMLElement>('[data-pane-id]')).map(
                (pane) => [pane.dataset['paneId'], pane.getBoundingClientRect()] as const,
              ),
              ...['advance', 'new-run'].map(
                (id) =>
                  [
                    id,
                    (document.querySelector(`[data-testid="${id}"]`) as HTMLElement).getBoundingClientRect(),
                  ] as const,
              ),
            ].map(([name, box]) => [name, box.x, box.y, box.width, box.height]),
          );
        const label = (): string =>
          (document.querySelector('[data-testid="advance-label"]')?.textContent ?? '').trim();

        const resting = { boxes: boxes(), label: label() };
        const seen: { boxes: string; label: string }[] = [];
        (document.querySelector('[data-testid="advance"]') as HTMLButtonElement).click();
        for (let i = 0; i < 400; i += 1) {
          const surface = document.querySelector('[data-testid="one-view"]');
          seen.push({ boxes: boxes(), label: label() });
          if (surface?.getAttribute('data-working') === 'false' && i > 0) break;
          await new Promise((resolve) => { setTimeout(resolve, 0); });
        }
        return { resting, seen, after: { boxes: boxes(), label: label() } };
      });

      const relabelled = run.seen.filter((sample) => sample.label !== run.resting.label);
      expect(
        relabelled.length,
        `at ${String(width)} px the control never said it was integrating, so there is no ` +
          'relabel to measure',
      ).toBeGreaterThan(0);
      expect(
        relabelled.filter((sample) => !/^Integrating \d+ of \d+$/.test(sample.label)).map((s) => s.label),
        'the control said something other than how far it has got',
      ).toEqual([]);
      const moved: string[] = [];
      for (const sample of run.seen) {
        if (sample.boxes === run.resting.boxes) continue;
        const was = JSON.parse(run.resting.boxes) as [string, number, number, number, number][];
        const now = JSON.parse(sample.boxes) as [string, number, number, number, number][];
        for (const [at, one] of now.entries()) {
          const then = was[at];
          if (then === undefined || JSON.stringify(one) === JSON.stringify(then)) continue;
          moved.push(`"${sample.label}": ${one[0]} was ${JSON.stringify(then.slice(1))} and is ${JSON.stringify(one.slice(1))}`);
        }
      }
      expect(
        moved,
        `at ${String(width)} px the relabel moved something: every pane's rectangle, the ` +
          "control's own and its neighbour's are measured against the resting layout, and one " +
          'of these samples differs from it',
      ).toEqual([]);
      expect(run.after.boxes, 'the layout did not come back to where it started').toBe(run.resting.boxes);
      expect(run.after.label).toBe(run.resting.label);

      console.log(
        `    at ${String(width)} px the advance control is ` +
          `${String(JSON.parse(run.resting.boxes).find((one: [string, number, number, number]) => one[0] === 'advance')[3])} px wide ` +
          `saying "${run.resting.label}" and saying "${relabelled[0]?.label ?? ''}", across ` +
          `${String(run.seen.length)} samples of one advance, and nothing else moved`,
      );
    }
  });

  /**
   * The advance is confirmed where a reader can see it, and says nothing before there is one
   * (the author's request: *"plus some verification that it's complete"*).
   *
   * **In the status strip, and the measurement chose it.** Beside the control that asked for
   * it, a visible line is 30 px of the controls pane -- two wrapped lines in a pane 220 px
   * wide -- and the pane's own content height at the floor's width *is* the declared floor, so
   * it would take the floor past the 768 px of the shortest window in the matrix. In the strip
   * it costs **nothing**: the strip's height at the floor is set by FR-58's statement, and the
   * readouts beside it have 22 px of room under them. That is what the last assertion here
   * measures -- the strip is the same height with the confirmation on screen as without it, so
   * it cannot be the two-row strip that cost the floor 44 px before beat 018 cut it to one.
   *
   * And it is on screen whatever pane has focus, which the run controls are not: a reader may
   * close the controls pane, and the strip is not a pane.
   */
  test('confirms a completed advance in the strip, and says nothing until there is one', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(FLOOR);
    await page.goto('/');
    await page.evaluate(() => { window.localStorage.clear(); });
    await page.reload();
    await expect(page.getByTestId('pane-controls')).toBeVisible();

    const report = page.getByTestId('advance-report');
    await expect(report).toHaveAttribute('role', 'status');
    // FR-048 is answered by the control, which says what it will do before it does it: a strip
    // that always says something about an advance nobody asked for is noise.
    await expect(report).toHaveText('');
    const before = await page.getByTestId('pane-status').evaluate((strip) => ({
      strip: strip.getBoundingClientRect().height,
      report: (strip.querySelector('[data-testid="advance-report"]') as HTMLElement).getBoundingClientRect()
        .height,
    }));
    expect(
      before.report,
      'the line is not held before there is anything to say, so the strip will grow under a ' +
        'reader at the moment their advance finishes',
    ).toBeGreaterThan(0);

    const advance = await advanceTheControlOffers(page);
    const start = Date.parse((await page.getByTestId('instant').textContent()) ?? '');
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('over-budget')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('proceed-anyway').click();
    await expect(page.getByTestId('advance')).toBeEnabled({ timeout: 60_000 });

    // Painted, and inside the strip rather than in the accessibility tree alone.
    await expect(report).toBeVisible();
    await expect(page.getByTestId('pane-status').getByTestId('advance-report')).toHaveCount(1);
    await expect(report).toContainText(String(advance.steps));
    await expect(report).toContainText(advance.instantAfter(start, 1));
    // Principle V: both figures carry their kind, and the kind is the one the run's own
    // figures carry, because these are the run's own figures.
    await expect(report.locator('.figure.computed')).toHaveCount(2);

    const after = await page.getByTestId('pane-status').evaluate((strip) => ({
      strip: strip.getBoundingClientRect().height,
      report: (strip.querySelector('[data-testid="advance-report"]') as HTMLElement).getBoundingClientRect()
        .height,
      scrolls: strip.scrollWidth > strip.clientWidth + 1,
    }));
    expect(after.report, 'the confirmation is not drawn').toBeGreaterThan(0);
    expect(after.report, 'the confirmation is more than the line the strip held for it').toBe(before.report);
    expect(after.scrolls, 'the confirmation runs past the strip').toBe(false);
    expect(
      after.strip,
      `the confirmation made the status strip ${String(after.strip)} px tall against ` +
        `${String(before.strip)} px without it. At the floor's width the strip is one row, and ` +
        'a second row is 44 px of a height budget the floor spends exactly (spec 018, "the ' +
        'floor, re-measured")',
    ).toBe(before.strip);
    console.log(
      `    at the declared floor the strip is ${String(before.strip)} px tall without the ` +
        `confirmation and ${String(after.strip)} px with it, of which the confirmation is ` +
        `${String(Math.round(after.report))} px`,
    );
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
    /* Beat 018 made this a figure label of five words. What the field *is* -- the analysis's
       own gain, exported from the same arithmetic that produced the answer -- was already on
       the site (docs/narrative-disposition.json, `analysed-field`), and the label names the
       quantity rather than arguing for it. */
    await expect(panel).toContainText('Weight carried by observations');
    await openDisclosure(page, 'run-panel');
    /* Beat 018 made the run's provenance a term list: the same figures, each on its own line
       with its own label, rather than four sentences that joined them with connective prose.
       So the claim is asserted against the labels the list uses. */
    const run = page.getByTestId('run-panel');
    await expect(page.getByTestId('initialisation')).toContainText(/^\d{4}-/);
    await expect(run).toContainText('Layer thickness');
    // FR-003: the criterion is on the surface, not only in a test. The declared timestep, the
    // largest stable one and the scheme's linear boundary are three figures a reader compares.
    await expect(page.getByTestId('stability')).toContainText(' s');
    await expect(run).toContainText('Largest stable step');
    await expect(run).toContainText('Linear boundary');
    await expect(run).toContainText('Outcrop clamps');
    await expect(page.getByTestId('outcrops')).toContainText(' m');

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
    /* Beat 018 says this in the status strip as a figure and a label rather than as a
       sentence: the seed that was drawn, and that it was drawn for this visit -- which is
       what "no longer the recorded case" meant. */
    await expect(page.getByTestId('recorded-case')).toContainText('drawn for this visit');
    const after = await page.getByTestId('root-seed').textContent();
    expect(after).toMatch(/^[0-9a-f]{16}$/);
    expect(after).not.toBe(before);
    /* The run's own figures and the manifest are two tabs of one pane, and the layout manager
       takes an unselected tab's contents out of the document rather than hiding them. So each
       figure is read from the tab that holds it, which is what a reader does. */
    await expect(page.getByTestId('steps')).toHaveText('0');
    await openDisclosure(page, 'manifest-panel');
    await expect(page.getByTestId('manifest')).toContainText('"recordedCase": false');
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
    await openDisclosure(page, 'truth-panel');
    const panel = page.getByTestId('truth-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('truth-source')).toContainText('HYCOM');

    // Review R-2: the truth is coarser than the model, and the surface says so rather than
    // leaving a reader to assume otherwise.
    // Beat 018 turned the sentence into a term list, so what is asserted is the figures: the
    // truth's own resolution and how many model cells it is worth. The claim -- that the
    // surface says the truth is coarser rather than leaving a reader to assume otherwise --
    // is the same one, made by two figures instead of by a clause.
    await expect(panel).toContainText('the model grid');

    // The figures the domain choice changes are still here: the instants and their spacing,
    // the profiles and how many carry a flag, and the climatology's overlap with this run's
    // period. What each of them *means* went to the site's data-model page in beat 014, and
    // tests/docs/disposition.test.ts holds the words against that page.
    await expect(page.getByTestId('truth-instants')).toContainText('h apart');
    await expect(page.getByTestId('observation-count')).toContainText('flagged');
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
      .getByTestId('pane-horizons')
      .evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(
      row.scrollWidth,
      `the row scrolls at the declared reference width: ${String(row.scrollWidth)} > ${String(row.clientWidth)}`,
    ).toBeLessThanOrEqual(row.clientWidth + 1);

    // Every panel is inside the container it is drawn in, and no narrower than the declared
    // minimum -- "visible" is not the same as "present and one pixel wide".
    const container = await page.getByTestId('pane-horizons').boundingBox();
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

    /* The legend labels the two marks and no longer argues about them. Beat 018 took the two
       clauses that explained -- *a second channel, so the field reads without colour* and
       *this run analyses once, at ...; attribution becomes per horizon when the forecast
       cycles* -- into `centre/attribution`'s help (FR-007, and the disposition record's
       `attribution-hatch-channel` and `attribution-scope`). What the first of them claimed is
       measured below rather than asserted in a legend. */
    await expect(page.getByTestId('row-legend')).toContainText('hatched where observations lead');

    // Six identical attribution fields would imply six analyses. The run makes one, and the
    // legend says which it is -- as a label of six words -- rather than leaving the row to
    // suggest otherwise.
    await expect(page.getByTestId('attribution-scope')).toContainText('the same field on every panel');

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

    /*
     * FR-24 on the surface: the rejected are counted where the drawing is, not in a log.
     *
     * Beat 018 made the summary a readout, so what is asserted is the readout: the count is
     * labelled FLAGGED and is a figure. The clause that used to be beside it -- "drawn as
     * flagged, never omitted" -- was an explanation of a property the surface has, and it is
     * this panel's own help (docs/narrative-disposition.json, `footprint-summary`).
     */
    await expect(summary).toContainText('Flagged');
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

    /* Beat 018 moved this sentence to `help:centre/horizon-panel`, under *enlarging a panel*
       (docs/narrative-disposition.json, `needle-elevation-caption`). What is left under the
       figure is its label: the floor depth, and that the needles hang to the depths reached. */
    await expect(elevation).toContainText('at the depths reached');
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

    /*
     * FR-008: two curves once two issue times have been scored, labelled by issue instant.
     *
     * Beat 013 put the curve behind a disclosure and said why: at the width six panels take,
     * drawn open across the scores region it would have been either a small picture in a band
     * of empty paper or six hundred pixels tall. Beat 018 gave it the horizons pane's own
     * width and the height the row does not use -- which is the band beat 013 left empty -- so
     * it is drawn rather than disclosed, and this reads it where it is.
     */
    const curves = page.getByTestId('skill-inset').locator('[data-issue-instant]');
    expect(await curves.count()).toBe(2);
    // Exactly one of them is the row's current issue time; the other is the one it was.
    expect(await page.getByTestId('skill-inset').locator('[data-current="true"]').count()).toBe(1);
    await expect(page.getByTestId('skill-curve')).toContainText('Skill by lead time');

    // FR-009: the manifest records the issue time, so a rerun is reproducible from it.
    await openDisclosure(page, 'manifest-panel');
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
    /*
     * Beat 018 made this a readout: SEEN and NOT YET with the figures under them, where it had
     * been "The analysis at this issue instant saw 2 observations; 29 had not happened yet" --
     * a sentence a reader had to read to find two numbers, and one the author's review named.
     * The claim is the same: the surface says how much the issue instant leaves out, and it
     * says it as two labelled figures.
     */
    await expect(page.getByTestId('issue-observations')).toContainText('Not yet');
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

    /* Clicked rather than `uncheck()`ed, and the difference is what beat 018's seventh pass
       changed. Applying an edit rebuilds the row, which takes seconds, so it now runs on the
       frame after the one that says the surface is working (`working.ts`) -- and until that
       work commits, the control shows the state of the run, which is the state before the
       edit. `uncheck()` asserts the box has flipped by the time the click returns, which is
       an assertion that the edit was applied before the surface said it was working.
       FR-034's claim is about what the run is, and it is asserted below on the edit list and
       the box together. */
    await page.getByTestId('quality-control').click();
    await expect(page.getByTestId('edit-list')).toContainText('quality control off', {
      timeout: 120_000,
    });
    await expect(page.getByTestId('quality-control')).not.toBeChecked();

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
    await advanceThroughTheBudget(page);
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('bias-degrees').fill('1.5');
    await page.getByTestId('bias-degrees').blur();
    await expect(page.getByTestId('run-status')).toContainText('edit', { timeout: 120_000 });

    await openDisclosure(page, 'manifest-panel');
    const manifest = (await page.getByTestId('manifest').textContent()) ?? '';
    // The digest from the status strip, which is outside the dock and therefore always there.
    const digest = await page.getByTestId('status-digest').textContent();
    // The seed from the tab that holds it: an unselected tab's contents are not in the
    // document, so a figure is read where it is drawn.
    await openDisclosure(page, 'run-panel');
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
    /* Beat 018's fifth pass folded the paste box into a disclosure: at the declared floor the
       tab is 220 px wide and the two figures, the document and this form together want 463 px
       of a 311 px pane, so the tab arrives showing the manifest and opens the box on request. */
    await openDisclosure(other, 'manifest-import');
    await other.getByTestId('manifest-input').fill(manifest);
    await other.getByTestId('import-manifest').click();

    await expect(other.getByTestId('status-digest')).toHaveText(digest ?? '', { timeout: 60_000 });
    await expect(other.getByTestId('import-failure')).toHaveCount(0);
    // The edits came back with it: a manifest that recorded them and a replay that ignored
    // them would reproduce a run nobody made.
    await expect(other.getByTestId('manifest')).toContainText('"biasDegC": 1.5');
    await openDisclosure(other, 'run-panel');
    await expect(other.getByTestId('root-seed')).toHaveText(seed ?? '');
    await fresh.close();
  });

  test('refuses a manifest that does not belong to this tree, and says which check failed', async ({
    page,
  }) => {
    await page.goto('/');
    await openDisclosure(page, 'manifest-panel');
    const manifest = (await page.getByTestId('manifest').textContent()) ?? '';
    const parsed = JSON.parse(manifest) as Record<string, unknown>;
    await openDisclosure(page, 'manifest-import');

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
    await openDisclosure(page, 'manifest-import');
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

  /**
   * NFR-02, restated where beat 018 moved the line.
   *
   * This test used to read "writes nothing to storage, in a whole visit", and that was the
   * whole claim while the surface had no furniture to remember. A workspace does: a reader
   * who drags a sash and comes back to a different arrangement has been given a layout
   * manager and denied the only thing one is for.
   *
   * So the claim is narrowed to exactly what the constitution's amended Principle IX allows,
   * and every part of it is still measured rather than promised. **One** key is written, and
   * it is the key configuration declares. No cookie, no IndexedDB, no session storage, and
   * nothing in the address. What is inside that key -- geometry and pane identity, and no
   * seed, no manifest and nothing the run computed -- is `tests/shell/workspace.spec.ts` and
   * `tests/harness/workspace-state.test.ts`, which fail by name on a planted `seed`.
   */
  test('writes one key and no other storage, in a whole visit', async ({ page }) => {
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
    await advanceThroughTheBudget(page);
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('new-run').click();

    const writes = await page.evaluate(() => (window as unknown as { __writes: string[] }).__writes);
    const allowed = `localStorage.${declared.presentation.workspace.storageKey}`;
    expect(
      [...new Set(writes)].filter((write) => write !== allowed),
      `these were written besides ${allowed}: ${writes.join(', ')}`,
    ).toEqual([]);
    // And the one that is allowed is a preference about furniture, held under the key
    // configuration declares -- not a key a component chose for itself.
    /* Read through `key(i)` rather than `Object.keys`, which would also return the `setItem`
       this test assigned to the storage object a moment ago -- the instrument reporting on
       itself. */
    const keys = await page.evaluate(() =>
      Array.from({ length: window.localStorage.length }, (_, at) => window.localStorage.key(at)),
    );
    expect(keys).toEqual([declared.presentation.workspace.storageKey]);
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
    /* Beat 013's scores region had an empty state saying where the figures would appear.
       There is no scores region now -- each panel carries its own figures -- so the claim is
       made where it is now true: the panel itself says it has not been scored. */
    await page.getByTestId('build-row').click();
    await expect(page.getByTestId('horizon-row')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('panel-score-24')).toContainText('not scored yet');

    await page.getByTestId('score-row').click();
    const score = page.getByTestId('panel-score-24');
    await expect(score).toContainText('persistence', { timeout: 60_000 });

    // The readout, which is what a reader glances at: two skills against two references.
    await expect(score).toContainText('vs persistence');
    await expect(score).toContainText('vs climatology');

    // FR-022: a score without provenance is an assertion. FR-021's words are the first thing
    // inside it since beat 018 -- the convention, and whichever way this run falls, said in
    // the SRD's terms rather than in kinder ones.
    await openDisclosure(page, 'panel-provenance-24');
    const provenance = page.getByTestId('panel-provenance-24');
    await expect(provenance.locator('.statement')).toContainText(
      /than (persistence|climatology)/,
    );
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
    /* Beat 018 made this a figure label of five words; what the field *is* -- the analysis's
       own gain, exported from the same arithmetic that produced the answer -- is the panel's
       own help, and docs/narrative-disposition.json records both moves. */
    await expect(field).toContainText('Weight carried by observations');

    /* Review R-7: the radius is a property of the declared length scale and not of the ocean.
       The clause that argued that was already the panel's help word for word, so the surface
       says the figure with its unit and its kind and stops repeating the argument. */
    const radius = page.getByTestId('influence-radius');
    await expect(radius).toContainText(' km');
    await expect(radius.locator('.figure.declared')).toHaveCount(1);

    /* FR-048: with nothing selected the pane says what could be there and how to put it
       there, rather than rendering blank. Beat 018 said the same thing in nine words rather
       than in a paragraph: what is missing, and the one act that supplies it. */
    await expect(page.getByTestId('detail-empty')).toContainText('Nothing selected');
    await expect(page.getByTestId('detail-empty')).toContainText('Click a cell');
    await expect(page.getByTestId('cell-breakdown')).toHaveCount(0);

    // FR-18: a breakdown is an instrument of a selected cell. It says which cell, and the
    // sentence explaining why it is never a per-panel summary is owed to this region's help.
    await page.getByTestId('attribution-view-overlay').click({ position: { x: 200, y: 200 } });
    const breakdown = page.getByTestId('cell-breakdown');
    /* The clause that said the shares are the analysis's own weighting is a help entry now
       (docs/narrative-disposition.json). What is asserted here is what it named: the cell,
       and the three shares as computed figures. */
    await expect(breakdown).toContainText('Cell');
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
    // The instruments are a tab of the provenance pane now, so the panel is reached before it
    // can be asserted about.
    await openDisclosure(page, 'instruments-panel');
    const panel = page.getByTestId('instruments-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('surface-count')).toContainText(' h');
    await expect(panel).toContainText('representativeness');
    await expect(page.getByTestId('drop-count')).toContainText('levels');
    /* Whether Argo was assimilated, said either way: this configuration assimilates, and the
       readout is the count and the state rather than a sentence about the state. */
    await expect(page.getByTestId('argo-state')).toContainText(/assimilated/);
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
    /* Beat 018 gave the epoch a line of its own rather than a clause inside the timestep's
       sentence. The claim -- that the epoch is on the surface and attributed -- is the same,
       and it is now made by a labelled figure instead of by a sentence. */
    await expect(run).toContainText('Epoch');
    await expect(run).toContainText('2013-09');
    await expect(run.locator('.figure.declared').first()).toBeVisible();
  });
});
