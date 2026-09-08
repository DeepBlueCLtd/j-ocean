---
title: "A walkthrough, and what building one found"
summary: A bright help button and an eleven-step tour of the shell. Anchoring each step to the panel it describes turned three layout assumptions into failing tests, and one of them had been shipping a dimmed page with nothing lit.
date: 2026-09-17
---

# A walkthrough, and what building one found

<div class="banner warn">
<p><strong>Retired in beat 016.</strong> The walkthrough was the right instinct at the wrong
altitude: it answered <em>why is this panel next to that one</em> in a fixed order beginning
wherever it began, and it was a second place where the surface was described. Each panel now
carries its own explanation behind a control at its top right, and every one of the eleven
steps below has a recorded destination. See
<a href="2026-09-21-beat-016-panel-help.html">Beat 016</a> and the
<a href="../disposition.html">disposition record</a>. This note is kept because it is a record
of a beat that happened, and because what building the tour <em>found</em> outlived it.</p>
</div>

The shell had a problem no test could have caught: a reader opening it for the first time
did not know what they were looking at. Every panel says what it is — the run panel names
the seed, the attribution panel explains that it is the analysis's own gain — but none of
them says why it is next to the one above it, and nothing at all says how to read the four
kinds of number the page is built out of.

So: a bright yellow **?** fixed in the top-right corner, and behind it eleven steps, one per
panel, each anchored to the panel it is about.

![The help button, in the corner of a page a reader has just arrived at](images/013-help-button.png)

## The steps are anchored, not authored beside the page

A step does not carry a description of where it belongs. It carries a list of
`data-testid` values, in preference order, and resolves the first one that is actually in
the document:

```ts
{
  testIds: ['horizon-row-panel', 'row-invitation'],
  title: 'The forecast, at every horizon at once',
  body: /* ... */,
}
```

That has a consequence worth stating plainly: a step whose anchor is absent is **dropped**,
not shown against nothing. Refuse the configuration and the tour is one step long, because
one panel is all there is. That is the honest behaviour, and it is the same instinct as
Principle VI — the harness can lose, and a tour describing panels that are not on the screen
is the kind of loss that looks like success.

It is also a way to go quietly wrong. Rename a panel and the tour silently shortens; nothing
breaks, the reader just never hears about attribution. So the count is asserted:

```ts
const DECLARED_STEPS = 11;
await expect(page.getByTestId('walkthrough-progress'))
  .toContainText(`Step 1 of ${DECLARED_STEPS}`);
```

Renaming `attribution-panel` in `App.tsx` turns that into `Step 1 of 10` and the build
fails. Watched failing, as everything here is expected to be.

![The first step, over the statement of what j-ocean is not](images/013-walkthrough-first-step.png)

## Three things the tests found, in the order they hurt

**A one-step tour for anyone who asked early.** The first version resolved its steps once,
when the walkthrough opened. The page takes a second or two to provision, and "what am I
looking at?" is exactly the question a reader asks during that second — so they got a
one-step tour that never recovered. The list is now recomputed from a `MutationObserver`,
and the reader's place is held as a position in the *declared* list rather than in the
visible one, so a panel arriving mid-tour inserts itself without moving them.

The test for it delays the configuration fetch by two seconds and opens the walkthrough into
the gap:

```ts
await page.route(CONFIG_REQUEST, async (route) => {
  await new Promise((settle) => setTimeout(settle, 2_000));
  await route.continue();
});
```

**A dimmed page with nothing lit.** The step scrolls its anchor into view, and the ring is
drawn from the anchor's rectangle. Playwright's `toBeVisible` does not mean *in the
viewport*, so a step could pass its test while showing the reader a grey page with the ring
below the fold. The walk now polls the ring's position into the window at every step. It
also stopped using `scrollIntoView({ block: 'center' })`: centring a panel taller than the
screen puts its heading above the fold, so the reader is shown the middle of the thing the
card just named.

**A Next button below the bottom edge.** The card was placed from the anchor's rectangle and
its own measured height — but the two arrive a frame apart, so for one frame it was placed
using the *previous* step's height. On the field panel that left it hanging off the bottom
of the window with its controls out of reach. Chasing that with a wait in the test was the
wrong fix; the mechanism was wrong. The card is now placed from the **space** around the
anchor, which is known before it renders, and given a matching `max-height` so it scrolls
its own text instead of leaving the window:

```ts
const spaceBelow = window.innerHeight - (placement.top + placement.height) - 2 * CARD_MARGIN_PX;
if (spaceBelow >= MIN_CARD_SPACE_PX) {
  return { ...anchored, top: /* below the anchor */, maxHeight: `${spaceBelow}px` };
}
```

Below the anchor, else above it, else along the bottom of the window — the last for an
anchor taller than the screen, where the card must overlap something and the bottom is the
cheapest place to do it.

![Step three, ringing the centre region, with the card pinned clear of the row](images/013-walkthrough-field-step.png)

## It is not modal

The page stays live underneath. The spotlight takes no pointer events, so a reader can click
the thing a step has just described while the step is still open; Escape closes from
wherever focus has ended up, which is the point — a reader who clicked into the page no
longer has the card focused, and the way out should not depend on where they last clicked.

The dimming is the spotlight's own `box-shadow: 0 0 0 9999px`, so there is exactly one
element to position and the hole cannot drift from the ring around it.

## What it costs

Eleven steps of prose, about 380 lines including the copy, one CSS block, and six shell
tests. Four of the six have been watched failing against a real defect rather than a planted
one, which is the more useful kind.

The one thing it does not do is teach itself: the tour explains the page, and if the page
changes the tour does not notice — beyond the anchor check, which only knows that a panel
exists, not that the sentence about it is still true. That is a real limit, and the honest
mitigation is that the steps are eleven paragraphs in one file, next to each other, where a
reader changing a panel will see them.
