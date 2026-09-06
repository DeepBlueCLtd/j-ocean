# ADR-0010: A GPU kernel is assessed, deferred, and cheap to adopt

- **Status:** Deferred
- **Date:** 2026-09-05
- **Owed by:** SRD §10
- **Written before:** beat 003

## Context

The kernel is a port precisely because a GPU implementation is conceivable (ADR-0002). At
100 × 100 with a ten-minute timestep, 576 steps is milliseconds on a development machine, so
there is nothing for a GPU to buy yet.

## Decision

**Deferred.** The CPU kernel is the reference and remains so (ADR-0002).

The trigger, quoted from the SRD:

> The grid shall be **configurable and shall start at 100 × 100**. The integration step time
> shall be measured and reported by the harness, and the resolution raised only until a
> declared frame budget is reached. (FR-06)

Operationally: **when the resolution study of FR-06 raises the grid to the point where the
measured step time meets the declared frame budget, and the questions being asked still need
a finer grid.** Both halves matter. Hitting the budget at a resolution nobody needs is not a
reason to write a second kernel.

## Why it stays cheap

- `ModelKernel` is `createState` and `step` and nothing else, so a second implementation has
  a small surface to satisfy.
- The acceptance criterion is written already: a second kernel is accepted against the
  reference's output to a tolerance recorded in the accepting test (ADR-0002 proposes a
  relative L∞ difference of 1e-5 over 576 steps).
- The harness already measures and reports step time against the declared budget, so the
  evidence for pulling this trigger is on screen before anybody argues about it.

## Consequences

The frame budget binds first at the resolution study, not before. Until then the honest
report is that the CPU kernel is fast enough, which the surface can make because it shows
the figure.
