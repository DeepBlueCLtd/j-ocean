# ADR-0003: The horizon row, not a slider and not a grid

- **Status:** Accepted
- **Date:** 2026-09-11
- **Owed by:** SRD FR-13, FR-14, PR-01, §3.2
- **Written before:** beat 007

## Context

The harness exists to let a reader see what a forecast is worth as lead time grows. Six
lead times are declared, and there are three ways to put six fields in front of somebody.

**A slider.** One panel, a control that moves through lead time. It is the cheapest to
build, it gives every panel the whole width of the page, and it is what most forecast
viewers do.

**A grid.** Two rows of three, or three of two. Every panel is large, and the layout is
comfortable at any window width.

**A row.** Six panels left to right in lead-time order, all on screen at once, each
smaller than it would be in either alternative.

The question is not which is prettiest. It is which of them can be *wrong* about the
thing the harness claims: that skill decays with lead time, and that the reader should
judge that rather than be told it.

## Decision

**The primary surface is a single row of one panel per declared horizon, in horizon
order, all visible at once. A slider is rejected; a grid is rejected.**

A slider shows one lead time and remembers the others on the reader's behalf. What is not
on screen is what the eye forgets, and a claim about a *trend* delivered one frame at a
time is a claim the reader has to take on trust — which is the thing this harness is for
not doing. It also makes the comparison sequential when it is inherently simultaneous:
"is +96 h worse than +24 h" is one glance in a row and an act of memory in a slider.

A grid loses the axis. Lead time is one-dimensional and monotone; laying it out in two
dimensions invents a second ordering the data does not have, and the reader has to learn
the reading order before the picture means anything. Two rows of three also puts +24 h
directly above +96 h, inviting a comparison between neighbours that are three days apart.

The row keeps the axis, keeps everything on screen, and pays for it in panel size. That
cost is answered by **enlarge in place** (FR-14): one panel grows, the other five stay
visible and shrink to a declared minimum. It is deliberately not a modal or a new page,
because an enlargement that hides the row would be a slider with extra steps.

**"All visible at once" is a declared width, not an aspiration.** `presentation` in
configuration declares the reference viewport width, the minimum panel width, the gap and
the page gutter; the schema refuses a configuration whose reference width cannot hold
every declared horizon at that minimum, and a Playwright test measures the rendered
geometry at that width. Below the reference width the row's own container scrolls
horizontally — never the page, and never into a grid.

## Consequences

**Good.** The decay is seen rather than asserted. Adding a horizon is a configuration
change that either fits — and G-05 checks the panel appeared — or is refused at load with
the arithmetic in the message. The row survives being screenshotted into a document,
which a slider does not.

**Accepted costs.** A panel is about 190 px wide at the declared minimum, which is not
enough for an ISO instant on one line: the panels stack the date over the time and carry
the full instant on the element, and the field itself is small until enlarged. The row
breaks out of the page's prose column, so the page has two measures — a reading column
and a wider band for the row — which is a real complication in the stylesheet.

**What would change this.** More horizons than a row can hold at a legible width. The
answer then is *fewer horizons on the primary surface*, with the rest reachable, not a
grid: the schema failure is the trigger, and its message says which two declared numbers
disagree.
