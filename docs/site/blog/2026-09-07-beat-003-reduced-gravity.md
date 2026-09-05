---
title: "Beat 003: an ocean, and three things it refused to do"
summary: A one-and-a-half layer reduced-gravity model initialised from HYCOM. It blew up twice and outcropped once, and each refusal was more useful than the fix.
date: 2026-09-07
---

# Beat 003: an ocean, and three things it refused to do

This is the first beat with something to look at.

![Sea-surface height anomaly over the Gulf Stream domain, initialised from the truth record: cold shelf water to the north-west, warm Sargasso water to the south-east, and a meandering front between them](../images/003-field-initial.png)

That is a real Gulf Stream meander, initialised from the HYCOM sea-surface height of
2013-09-01 through the reduced-gravity relation, and it is what a one-and-a-half layer ocean
looks like when you give it a front to hold. There is no fixture behind it.

The interesting part of the beat, though, is the three times the code refused to run.

## One: the cells are not square

ADR-0001 had done the feasibility arithmetic in advance, as an ADR should: reduced gravity
0.02 m/s² over a 500 m layer gives a gravity-wave speed of about 3.2 m/s, and on 5 500 m
cells that admits a timestep of order twenty minutes. Ten minutes was declared, with margin.

The stability check refused it on its first run:

```
the declared timestep of 600.0 s exceeds the largest stable timestep of 549.9 s
for this grid and these parameters (gravity-wave speed 3.162 m/s ...)
No integration was started.
```

A five-degree box at 36.5 °N is **4 474 m per cell east–west** and 5 529 m north–south. It is
square in degrees and not in kilometres, and the stability limit is set by the smaller of the
two. The ADR's 5 500 m was a nominal figure that nobody had ever made the code evaluate.

`GridSpec` now carries two cell sizes and configuration declares none, because declaring one
number for both would be declaring something untrue.

## Two: the criterion had no teeth

The replacement, 540 s, was inside the limit. The model blew up in fifty steps.

```
step    0  h [4.651e+2, 5.200e+2]  u [0.000e+0, 0.000e+0]
step   25  h [5.000e+1, 9.418e+2]  u [-2.160e+0, 2.186e+0]
step   50  h [Infinity, -Infinity] bad=192
```

The criterion had been written as `cfl / (c · sqrt(dx⁻² + dy⁻²))`. The discrete gradient on a
C-grid has a largest eigenvalue of `2/dx`, not `1/dx`, so that expression returns the linear
stability boundary *itself* — and a declared CFL of 0.5 was buying no margin at all. The
model was being asked to run exactly on the neutral curve, where the nonlinear terms tip it
over within a few hours.

With the factor of two restored: boundary 549.9 s, the declared criterion admits 275.0 s,
and 240 s is declared — which also divides an hour, so FR-006's "diagnose each hour" is exact
rather than approximately every 3.33 steps.

Two amendments to one ADR in one afternoon, both made by the tree rather than by a reviewer.
That is what "the tree is the authority and the record is a claim about it" is *for*.

## Three: leapfrog will not diffuse

The third failure was subtler and would have been much more expensive to find later.

Leapfrog is unconditionally unstable for a diffusion term evaluated at the current time
level. Not conditionally — unconditionally: the grid-scale mode grows like `(1 + 2r)^n` for
any positive `r`. The first kernel evaluated its Laplacian at time *n*, as the equations are
usually written, and blew up from grid-scale initial noise inside two hundred steps.

Lagging viscosity and bottom drag to the previous level makes them forward-Euler over `2Δt`,
which is stable while the viscous number stays under a half. It is 0.032 as declared. That
number is now computed by `assessStability` and the run refuses if it is not met, beside the
wave-speed criterion, because a criterion that only checks one of the two things that can
destabilise a scheme is a criterion that will be believed when it should not be.

## What the model actually does

96 hours over both domains, every figure printed by the test rather than merely asserted:

| | Gulf Stream front | Open gyre |
|---|---|---|
| Initial layer thickness from truth | 111–804 m | 439–558 m |
| Volume drift, sponge on | 1.6 × 10⁻² | 5.5 × 10⁻⁴ |
| Energy over 96 h | −25.9 % | −26.4 % |
| Sea-surface height variance, 96 h ÷ initial | 0.66 | 0.59 |
| Outcrop clamps | 261 | 0 |

Energy falls and never rises, which is the assertion that would catch a sign error in the
nonlinear terms: viscosity, drag and the Robert–Asselin filter all remove energy and nothing
adds any.

## The conservation test that was measuring the wrong thing

The volume-conservation test started at a tolerance of 10⁻⁹ and failed at 1.6 × 10⁻². The
tempting fix is to widen the tolerance until it passes. What that would have bought is a test
that could no longer distinguish an open boundary from a bug.

So the claim was split, because there were two claims hiding in it.

**The scheme conserves volume.** Tested on a smooth bump with the sponge off and the layer
deep enough that the clamp cannot fire. Drift over a day: **7.8 × 10⁻¹⁵**. That is round-off,
and it is a real statement about the flux-divergence form of continuity.

**The shipping configuration exchanges mass with the outside**, because it has an open
boundary — that is what a sponge *is*. That drift is bounded and reported, not conflated with
the first claim.

And a third thing fell out of splitting them, which is the finding of the beat:

> With the sponge switched off, a closed box around the Gulf Stream front outcrops the layer
> within twelve hours. The clamp fires twenty-eight times.

FR-012's sponge is not tidiness. Without it the domain is a bathtub, and a bathtub with a
front in it empties one end.

## What the truth's velocity is for

FR-013 says to map the truth's sea-surface height *and velocity* onto the model. The height
maps cleanly through the reduced-gravity relation, with the domain mean removed because a
reduced-gravity model has no absolute reference for its free surface.

The velocity is not imposed. HYCOM's surface velocity carries barotropic, ageostrophic and
tidal motions this model has no layer for, and putting them into a balanced two-layer state
launches a gravity-wave shock that the first day of every forecast would be spent radiating
away. The model's velocity is put in geostrophic balance with the thickness it actually
holds.

The truth's velocity is used to *check* that:

```
geostrophic initialisation against the truth surface velocity:
  gulf-stream-front  correlation 0.904 over 19980 components;
                     mean speed 0.445 m/s against 0.492 m/s
  open-gyre          correlation 0.741 over 20000 components;
                     mean speed 0.122 m/s against 0.125 m/s
```

0.904 across a strong front is a better use of that field than imposing it would have been,
and it is a number the harness can show.

## A kind that does not move

Depth is displayed, never integrated: the profile is a warm layer over a cold one, joined by
a `tanh` centred on the layer thickness. NFR-05 says a figure does not change kind between
states, which forces a decision that is easy to get wrong. A level cannot be `computed` when
the interface happens to sit on it and `derived` when it does not. So the surface and the
deepest declared level are the model's own two layers and are always `computed`; everything
between is always `derived`.

The relation inverts, which is what beat 004's observation operator will need — and the
inverse reports whether it **resolved** anything. A `tanh` saturates: a thermometer at 100 m
in an ocean whose interface is at 700 m reads the upper layer's own temperature and infers
680 m with no confidence whatever. It now says so. An observation that constrains nothing
must not be allowed to look as though it did, and beat 005 will be weighting these.

## One deviation, recorded

The field is drawn on a 2-D canvas, and the constitution's Technology section names WebGL. A
single 100 × 100 field costs about a tenth of a millisecond through `ImageData`; taking on a
GL context, a shader pipeline and a headless software rasteriser to save that would be paying
for beat 007's problem three beats early. `FieldView` is one component, so the swap is one
file when six panels make it earn its keep.

Next: instruments. Truth becomes observations in exactly one place, and gate G-02 arrives to
make sure it stays that way.
