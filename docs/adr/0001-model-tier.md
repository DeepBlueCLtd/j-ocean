# ADR-0001: The model tier is a one-and-a-half layer reduced-gravity model

- **Status:** Accepted
- **Date:** 2026-09-05
- **Owed by:** SRD PR-03, FR-05
- **Written before:** beat 003
- **Supersedes:** nothing

## Context

j-ocean needs a dynamical core that produces a recognisable eddy field over four days on a
small domain, in a browser, inside a declared frame budget. Three tiers were considered.

**Primitive equations.** The honest thing if the questions were about dynamics. It is not
what this harness is for, it would dominate the frame budget at any interesting resolution,
and it would take the project's attention for weeks that belong to the assimilation and the
surface.

**Quasi-geostrophic.** Cheap, well understood, and produces plausible eddies. It also
assumes small Rossby number, which is exactly wrong across a strong front — and a strong
front is the whole point of the default domain. A model whose central assumption fails
where the interesting thing happens is worse than a cruder model whose assumptions hold.

**One-and-a-half layer reduced gravity.** An active upper layer over a motionless deep
layer. It carries the shallow-water dynamics that make eddies and meanders, it has a real
free surface, it is three prognostic fields on a regular grid, and its stability limit is
governed by a gravity-wave speed that a reduced gravity makes comfortably slow.

## Decision

**The dynamical core is a one-and-a-half layer reduced-gravity model on a regular grid: an
active upper layer of declared thickness over a motionless deep layer, integrated
explicitly with a declared timestep under a declared stability criterion.**

The reason is recorded rather than assumed: *the questions this harness exists to ask are
about the combination of information, not about dynamics, and the simplest core that
produces genuine eddies and fronts is therefore the right one.*

The arithmetic that makes it feasible:

| Quantity | Value | Where it comes from |
|---|---|---|
| Reduced gravity `g'` | 0.02 m/s² | Declared |
| Upper-layer thickness `H` | 500 m | Declared |
| Gravity-wave speed `sqrt(g'H)` | about 3.2 m/s | Computed from the two above |
| Cell size | 5 500 m | Declared (a 5° box at 100 × 100) |
| Explicit stability limit | of order 20 minutes | `dx / (c sqrt(2))` |
| Declared timestep | 10 minutes | Half the limit, for margin |
| 96 h at 10 minutes | 576 steps of 10⁴ cells | |

## Consequences

**Good.** Three prognostic fields in typed arrays. Real eddies, real meanders, a real free
surface to draw. A step cost of order milliseconds per horizon on a development machine,
which leaves the frame budget for the row and for the counterfactuals.

**Accepted costs.** No thermodynamics, no mixed-layer physics, no vertical advection. Depth
is *displayed but not integrated*: the vertical structure a reader sees is diagnosed from
layer state, and every surface drawing a profile says the levels between the model's own
are derived. That is not a limitation the surface hides; it is a label the surface carries.

**What would change this.** A question that turned on vertical structure, or a domain where
the motionless-deep-layer assumption visibly fails. Neither is in scope for version 1;
dynamic depth is deferred in ADR-0009 with its trigger.
