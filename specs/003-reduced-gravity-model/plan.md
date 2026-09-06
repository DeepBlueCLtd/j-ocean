# Implementation Plan: The Reduced-Gravity Model

**Feature**: `003-reduced-gravity-model` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-06 | **Depends on**: beat 001 (the kernel port), beat 002 (the truth record)
**ADRs landed first**: [0001](../../docs/adr/0001-model-tier.md) (the model tier),
[0002](../../docs/adr/0002-kernel-port-and-reference.md) (the kernel port and its reference),
[0009](../../docs/adr/0009-dynamic-depth-deferred.md) and
[0010](../../docs/adr/0010-gpu-kernel-deferred.md) (the two deferrals)

## Summary

An active upper layer over a motionless deep layer, initialised from the truth record and
integrated for four days in typed arrays behind the kernel port. This is the first beat with
something to look at, and the discipline that matters is not to let that change what gets
asserted: what the tests claim is that the integration is *physical*, not that the forecast
is *good*. Whether it is good is beat 006's question, and beat 006 must be free to answer no.

## The scheme, and why each part of it

| Choice | Why |
|---|---|
| **One-and-a-half layer reduced gravity** | ADR-0001. The simplest core that produces genuine eddies and fronts. |
| **Arakawa C-grid** | Height at centres, velocity on faces, vorticity at corners. The C-grid is what makes the pressure gradient and the divergence adjacent rather than averaged, which is what stops a two-grid-interval checkerboard from being invisible to the scheme. |
| **Vector-invariant (Sadourny) momentum** | `q (hv)~ - grad(g'h + K)`. The nonlinear terms conserve energy rather than merely approximating it, which is the only condition under which AT-01's invariant test is worth running. |
| **Leapfrog with a Robert–Asselin filter** | Second-order and free of amplitude error, which is what a ninety-six hour integration needs. Its computational mode is real and the declared filter coefficient damps it, at a small cost in energy that shows up in the invariant test rather than being hidden by a loose tolerance. |
| **Viscosity and drag lagged one level** | Not a detail. Leapfrog is *unconditionally unstable* for a diffusion term evaluated at the current level. See below. |
| **A sponge at the boundary** | FR-012. The domain is a box in an open ocean, and a closed box around this front outcrops the layer within twelve hours — which this beat measured rather than assumed. |

## Three things the tree found that the plan would not have

**1. The cells are not square, and the ADR's arithmetic was wrong twice.** ADR-0001 assumed a
5 500 m square cell. A five-degree box at 36.5 °N is 4 474 m east–west and 5 529 m
north–south, and the limit is set by the smaller. The stability check refused the declared
ten-minute timestep on its first run. The replacement, 540 s, then blew the model up inside
fifty steps, because the criterion had been written without the factor of two in the C-grid
gradient's largest eigenvalue and so returned the boundary itself rather than a figure inside
it. With the factor restored the boundary is 549.9 s, the declared CFL of 0.5 admits 275 s,
and 240 s is declared — which also divides an hour, so FR-006's hourly diagnosis is exact.
ADR-0001 carries both amendments.

**2. Leapfrog and diffusion.** The first kernel evaluated the Laplacian at the current time
level. Leapfrog is unconditionally unstable for a diffusion term there — the grid-scale mode
grows like `(1 + 2r)^n` — and it blew up in two hundred steps from grid-scale initial noise.
Lagging viscosity and drag to the previous level makes them forward-Euler over `2Δt`, stable
below a viscous number of a half. `assessStability` computes that number (0.032 as declared)
and refuses the configuration if it is not met.

**3. A closed box around the Gulf Stream front is a bathtub.** With the sponge switched off,
the layer thins to the outcrop clamp within twelve hours and the clamp fires twenty-eight
times. That is a fact about the ocean rather than about the arithmetic, and it is why the
conservation claim is tested in two places: a synthetic smooth bump with no sponge and no
possible clamp (drift **7.8 × 10⁻¹⁵**, round-off), and the real domain, where the drift is
bounded and attributed rather than tolerated.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **I. Seeded streams, no wall-clock** | Yes | The kernel reads nothing but its `StepContext`. Step time is measured through `src/harness/timing.ts` under exemption (a), marked as host time, and never enters the run or the manifest. Replay at 1 000 steps still holds byte-identically with the real kernel. |
| **II. Truth only through an instrument** | Boundary held | The model imports the *truth-source port*, never the artefact. `initialiseFromTruth` takes a `TruthSource`. The model has no `Observation` and consumes none; G-02 lands with the instruments in beat 004. |
| **III. Model knows nothing about display** | Centrally | G-03 passes over `src/model/`. The results interface hands out copies, so integration buffers are not reachable from the harness — and a test asserts that mutating a published array leaves the model unchanged. |
| **V. No figure without its provenance** | Yes | The surface states the declared timestep beside the computed limit and the scheme's boundary, the computed cell sizes, the initialisation range, the excluded margin and the outcrop count. Profile levels carry a kind that does not move with the interface. |
| **VI. The harness can lose** | Yes | The outcrop count is published rather than swallowed; the over-budget path reports both figures and refuses to integrate; the invariant tests print their margins. |
| **X. Declared in configuration** | Yes | Every physical constant is in `config.model`. There is no literal in `src/model/` that does not trace to it through `parameters.ts`. The grid has no declared cell size, because a five-degree box has two of them. |

**Result: PASS**, with one Complexity Tracking entry.

## Complexity Tracking

| What | Why it is necessary | The simpler alternative, and why it was rejected |
|---|---|---|
| The field is drawn on a 2-D canvas, not the WebGL surface the constitution's Technology section names | A single 100 × 100 field costs about a tenth of a millisecond through `ImageData`. Taking on a GL context, a shader pipeline and a headless software rasteriser to save that would be paying for beat 007's problem three beats early, and would put a CI dependency on WebGL in a beat that does not need one. | Writing the WebGL surface now. Rejected on cost and on risk; it lands in beat 007 with the row, where six panels make it earn its keep. `FieldView` is one component, so the swap is one file. |

## What was deliberately not done

- **The truth's surface velocity is not imposed on the model.** FR-013 maps both fields
  across. The initialisation maps the height and then puts the velocity in geostrophic
  balance with the thickness the model actually holds, because HYCOM's surface velocity
  carries barotropic, ageostrophic and tidal parts this model has no layer for, and imposing
  it would launch a gravity-wave shock that the first day of every forecast would be spent
  radiating away. The truth's velocity is used to *check* the initialisation instead:
  correlation **0.904** in the Gulf Stream domain and **0.741** in the open gyre, printed by
  the test. That is a stronger use of the field than imposing it would have been.
- **A second kernel.** ADR-0002 records the acceptance tolerance (relative 1 × 10⁻⁵) and the
  acceptance test exists and runs; with one kernel registered it reports *reference only*
  rather than passing silently, which is what SC-005 asks for.

## Measured, and printed by the tests

| Figure | Gulf Stream front | Open gyre |
|---|---|---|
| Initial layer thickness from truth | 111–804 m | 439–558 m |
| Geostrophic initialisation against the truth's surface velocity | correlation 0.904 | 0.741 |
| Volume drift, 96 h, sponge on | 1.6 × 10⁻² | 5.5 × 10⁻⁴ |
| Volume drift, smooth bump, no sponge, no clamp | 7.8 × 10⁻¹⁵ | — |
| Energy over 96 h | −25.9 % | −26.4 % |
| Sea-surface height variance, 96 h ÷ initial | 0.66 | 0.59 |
| Outcrop clamps over 96 h | 261 | 0 |
