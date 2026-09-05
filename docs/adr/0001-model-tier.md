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
| Gravity-wave speed `sqrt(g'H)` | 3.162 m/s | Computed from the two above |
| Cell size, east–west | 4 474 m | Computed from the domain box and the 100 × 100 grid |
| Cell size, north–south | 5 529 m | The same |
| Linear stability boundary | **549.9 s** | `1 / (2c · sqrt(dx⁻² + dy⁻²))` — the C-grid gradient's largest eigenvalue is `2/dx` |
| Limit at the declared CFL of 0.5 | **275.0 s** | The boundary times the criterion |
| Declared timestep | **270 s** | Inside it, with the margin the criterion exists to buy |
| 96 h at 270 s | 1 280 steps of 10⁴ cells | |

> **Amended twice on 2026-09-06, by the tree, and the second amendment is the interesting one.**
>
> This table first said a 5 500 m square cell and a ten-minute timestep. A five-degree box at
> 36.5 °N is 4 474 m per cell east–west and 5 529 m north–south — it is not square in
> kilometres — and the limit is set by the *smaller* of the two. Beat 003's stability check
> refused the configuration on its first run, naming both figures.
>
> The replacement, 540 s, then blew the model up inside fifty steps. The criterion had been
> written as `cfl / (c · sqrt(dx⁻² + dy⁻²))`, which omits the factor of two in the C-grid
> gradient's largest eigenvalue — so it returned the linear boundary itself rather than a
> figure inside it, and a declared CFL of 0.5 bought no margin at all. With the factor
> restored, the boundary is 549.9 s, the criterion admits 275 s, and 270 s is declared.
>
> The lesson is the one the constitution already states, twice over: the criterion is a number
> the code evaluates, not an arithmetic somebody did once in a document — and a criterion is
> only worth having if it has been watched refusing something.

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
