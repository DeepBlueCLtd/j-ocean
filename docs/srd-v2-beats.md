# SRD-v2: the surface beats

**Written**: 7 September 2026. **Closed**: 22 September 2026, when beat 017 landed.
**Against**: `j-ocean-ui-srd.md` (SRD-v2), which supplements `j-ocean-srd.md` and changes no
numerics.

All five have landed. The tables below were written before any of them, and they are kept as
they were written; **what actually landed** is recorded beneath them, including the places a
beat found something these tables did not anticipate and the places a requirement is still
owed. A plan table edited to match the outcome is a plan that was never wrong.

Five beats. They are ordered by dependency and not by importance: 013 cannot be demonstrated
without the space 014 frees, 015 is what makes 013's smallest-viewport answer possible, and
017 addresses selections that 013 and 015 define.

| Beat | Feature | What it settles |
|---|---|---|
| 013 | [`one-view`](../specs/013-one-view/spec.md) | The invariance gate, one non-scrolling viewport, the four regions, scores in their own columns, the smallest-viewport answer |
| 014 | [`narrative-to-the-site`](../specs/014-narrative-to-the-site/spec.md) | Introductory matter, blog and system documentation to the welcome site, with a checked record of where each part went |
| 015 | [`enlargement-as-selection`](../specs/015-enlargement-as-selection/spec.md) | Enlargement replaces the centre only; the strip keeps the comparison, with figures |
| 016 | [`panel-help`](../specs/016-panel-help/spec.md) | Help at the panel, held to a declaration on disk, teaching and never reporting; the tour retires |
| 017 | [`addressable-surface`](../specs/017-addressable-surface/spec.md) | Selection is addressable, selecting writes and mounting does not; keyboard, greyscale, reduced motion; the disclaimer stays visible |

## Requirement coverage

Every requirement in SRD-v2 lands in exactly one beat.

| SRD-v2 | Beat | SRD-v2 | Beat |
|---|---|---|---|
| FR-40 scope held by test | 013 | FR-50 the strip carries scores | 015 |
| FR-41 one viewport, no scroll | 013 | FR-51 shown, not computed | 015 |
| FR-42 narrative leaves | 014 | FR-52 help at the panel | 016 |
| FR-43 too small says so | 013 (fallback from 015) | FR-53 no help, no control | 016 |
| FR-44 controls, left | 013 | FR-54 help held to disk | 016 |
| FR-45 the row, centre | 013 | FR-55 help teaches, never reports | 016 |
| FR-46 scores in their columns | 013 | FR-56 addressable selection | 017 |
| FR-47 detail, right | 013 | FR-57 greyscale, keyboard, motion | 017 |
| FR-48 empty regions speak | 013 | FR-58 the disclaimer is visible | 017 |
| FR-49 enlargement is a selection | 015 | §7 the disposition table | 014 and 016 |

| Acceptance | Beat |
|---|---|
| AT-10 byte-identical computed quantities for a fixed seed | 013, and green across 014 to 017 |
| AT-11 complete at the declared minimum, no scrollbar | 013 |
| AT-12 a control changes and every consequence is visible | 013 |
| AT-13 enlarge, swap, and nothing else moves | 015 |
| AT-14 help offered where declared, reported where missing | 016 |
| AT-15 a link opens on the cell; remounting does not rewrite | 017 |

Acceptance is watched in the browser, not inferred from green tests (SRD-v2 §8). Each beat's
plan owes a browser pass and a screenshot, as every beat here has.

## New gates

Two, both watched failing against a planted violation before they are trusted.

| Gate | Holds | Lands in | Planted violation |
|---|---|---|---|
| Surface invariance | Every computed field, score and derived quantity is byte-identical for the recorded seed | 013 | one coefficient changed in the analysis |
| Help coverage | Every declared panel region has a help entry and every entry a panel | 016 | a panel declaring a region with no entry |

Both landed and both were watched failing. G-07 landed in 013 as planned but was **not added to
the constitution's gate schedule until 016**, so it ran in CI unlisted for three beats; that is
recorded as a finding in ADR-0013 rather than backdated, because a gate that runs without being
listed is one whose disappearance nobody would notice. G-08 was watched failing on four planted
fixtures and on the clean fixture, which declares no panels and therefore has to fail rather
than pass trivially.

## The open questions of §9, and where they are answered

| Question | Answered by | What the answer turned out to be |
|---|---|---|
| Whether the controls column stays fixed or gains a disclosure | 013, as a measurement: the column is specified fixed and the plan records what it takes to overflow | Fixed, at a declared width, with its contents scrolling inside it and the FR-02 statement above that scroller |
| Whether attribution is derived from the analysis's own weights in the code as built | 013, as a **finding first**: recorded before it is fixed, per FR-40 | It is. Gate G-06 holds the attribution type to one construction site in `src/analysis/` with no writer in `src/harness/`, and it passes, so no finding was owed |
| What the smallest viewport actually is | 013, measured from the built layout and then declared in configuration | **2038 × 682** in beat 013, raised to **2038 × 728** by beat 015's strip, and unchanged by 016 and 017 |

## What actually landed

| Beat | Landed as planned | What it found that these tables did not anticipate |
|---|---|---|
| 013 `one-view` | Yes. G-07, one non-scrolling viewport, four regions, scores in their own columns, and the smallest-viewport answer measured rather than chosen | Three findings, each recorded rather than fixed: **the drawn anomaly is not the scored anomaly** (the panels remove a global mean, the scorer a mean over the domain less its sponge margin); **one of the two declared domains cannot be run** (SRD-v1 FR-11's track waypoints are declared once, in the eventful domain's longitudes); and the declared reference width had stopped describing a usable layout |
| 014 `narrative-to-the-site` | Yes, and the record is checked rather than written: every destination resolves against the tree | Three of the spec's proposed dispositions were wrong about the surface as built and the built surface won. Two figures were found **drawn as plain text since beat 005** — the cell breakdown's per-observation shares and the recorded case's declared label — by the test that counts prose |
| 015 `enlargement-as-selection` | Yes: the centre alone is replaced, the strip survives with its figures, and the below-floor fallback became this union forced rather than a second presentation | Beat 007's identity claim **was not being asserted by identity**: the browser test compared the rendering backend, which is a weaker thing that happened to hold. Fixed by comparing inside the page. The declared floor rose to 2038 × 728, which is the honest cost of the strip |
| 016 `panel-help` | Yes, and the walkthrough retired: help at the panel, held to `panels.json`, teaching and never reporting | The panel list became **one list**, drawn from and checked against, which removed a third copy of the region names that beat 014 had left. G-07's absence from the constitution's gate schedule was found here rather than in 013 |
| 017 `addressable-surface` | Yes: three keys, selecting writes and mounting does not, keyboard, greyscale, reduced motion, the disclaimer | Two findings. **Three of the four figure kinds were distinguished by colour alone** wherever a figure carried the kind class without `.figure` and outside a panel — a `derived` level in the profile comparison was drawn as plain text, which is the distinction SRD-v1 FR-07 exists to draw. And **the Release control had been inert since beat 008**: it called the hover path, which a pinned mark is guarded against by design |

Every one of AT-10 to AT-15 is asserted in a browser, and AT-10 is green across all five: G-07's
forty-one digests are byte-identical to the record in 013, 014, 016 and 017. One digest moved,
once — `configuration`, in beat 015, because that beat declares three new presentation figures
and raises the viewport floor. Nothing computed changed in any of the five.

## What is still owed, by name

These tables said every SRD-v2 requirement lands in exactly one beat, and every one did. What
follows is owed against **SRD-v1** and against the harness's own honesty, found by these beats
and not fixed by them. None is ticked anywhere.

- **SRD-v1 FR-11, the second domain, cannot be run.** The bland open gyre is a requirement
  rather than a bonus, and the surface offers it, refuses in the instrument's own words and
  leaves the standing run alone — which is Principle VI working, not the requirement met. The
  fix is `instruments.track.waypoints` declared per domain, which is a configuration change and
  belongs to whoever declares the configuration. Found in beat 013; still owed.
- **The drawn anomaly is not the scored anomaly.** Each panel draws its field as an anomaly
  about the mean of every finite cell; the scorer removes the mean over the domain less its
  six-cell sponge margin. 10,000 cells against 7,744. The comment above the drawing loop argues
  that a picture and a number must not describe different things, which is the argument against
  what the code does. Found in beat 013; still owed, and it is a numeric change, so it is not a
  surface beat's to make.
- **AT-02 and AT-06 do not pass**, and the deferrals page says so with the figures on every run.
  That is not one of these beats' requirements, but it is the trigger for adaptive sampling and
  it remains unmet.
- **Keyboard observation selection needs an enlargement.** FR-057 is met — every tab stop is
  reached and the elevation is a roving-focus group — but the elevation is drawn only in the
  enlarged panel, because FR-051 puts the marks at their full fidelity only there. So a reader
  working by keyboard selects a profile by enlarging a panel first. That is a consequence of
  FR-051 rather than a gap in FR-057, and it is written down here rather than left to be
  discovered.

## What is deliberately not here

- **No numeric, data source or computed quantity changes.** Where the refactor appears to
  require one, it is a finding under FR-40. Feature 013 lists the three kinds expected.
- **No new capability.** Every diagram these beats rearrange is already computed.
- **No persistence.** Feature 017's addressability carries selection only; a run still travels
  as a manifest, and replay is still re-computation rather than restoration.
