# Review of the j-ocean SRD, Version 1 (draft of 5 September 2026)

**Reviewer:** Claude, at the constitution beat, 5 September 2026.
**Verdict:** The SRD is unusually well-argued and is fit to constrain a constitution
and a first series of specs. It carries eight findings that the specs must resolve by
stated assumption or that the author must settle, listed most consequential first.
None blocks the foundation beat. Three (R-1, R-2, R-3) block the model, instrument and
analysis beats respectively and are resolved in those specs by a recorded assumption
that the author can overturn.

Where a finding is resolved in a spec, the spec's Assumptions section names it by the
identifier below.

---

## R-1. The observation operator is unstated, and every counterfactual turns on it

A reduced-gravity model carries layer thickness and velocity. An XBT measures a
temperature profile. The SRD never says how one becomes the other. FR-07 diagnoses a
depth profile from layer state for display, and FR-28 lets a reader drag that profile and
expects the analysis to reweight and the model to rerun. That requires a stated,
invertible-enough mapping from a temperature profile to an increment in layer thickness —
an observation operator and its adjoint, in the language the SRD avoids.

This is not a detail. It decides what an XBT is *worth* (the currency of §1), what a
dragged point *means*, and whether AT-03 and AT-06 can be scored at all. It is the single
most consequential omission.

*Resolution:* spec 004 declares a two-layer thermal structure — a warm upper layer of
uniform temperature over a cold deep layer, with the interface at the diagnosed layer
thickness and a declared transition thickness — as the operator. A profile then observes
interface depth; a drag edit is a change to interface depth. The choice earns an ADR.

## R-2. The truth is coarser than the model, not finer

The §4 note says the front is sharper than the model's 5 km cells, "so the model works at
a slightly coarser scale than the truth field." HYCOM's global reanalysis is on a 1/12°
grid, roughly 7–9 km at Gulf Stream latitudes. A 100 × 100 model grid over a five-degree
box is finer than its own truth. The consequence is the reverse of the one stated: truth
must be interpolated *up* onto the model grid, skill below the truth's resolution is
meaningless, and the "tighter box for a higher-resolution study" is bounded by HYCOM's
resolution, not by the frame budget of FR-06.

*Resolution:* spec 002 records the truth resolution as a declared value beside the
domain, and spec 006 forbids a score at a scale finer than it. The §4 note should be
corrected.

## R-3. Argo's role in the analysis is ambiguous, and its independence is compromised

FR-10 makes Argo the "observation record." FR-12 makes simulated instruments the only
path by which truth reaches the analysis. Argo profiles are real measurements, not truth
samples, so the two are compatible — but the SRD never says whether Argo profiles *enter
the analysis*, are *drawn beside it* as a check on the derived depth structure (the FR-07
trigger reads that way), or both. Further, the HYCOM reanalysis assimilates Argo, so
scoring an analysis that used Argo against HYCOM truth rewards agreement the truth already
contains.

*Resolution:* spec 004 admits Argo profiles into the analysis as a second observation
class with their own quality flags, and spec 006 records the independence caveat on every
score computed over a window containing an assimilated profile. The alternative — Argo
drawn but never assimilated — is the safer scientific choice and costs the harness one
observation source. This should be the author's call and is flagged as such.

## R-4. "A fresh seeded run each visit" conflicts with "the recorded case"

NFR-02 provisions a fresh seeded run on every visit. FR-34 reverts every counterfactual
to "the recorded case." If every visit draws a fresh seed there is no recorded case, only
this visit's case; if there is a recorded case, visits are not fresh.

*Resolution:* spec 001 fixes the default seed in configuration — the recorded case — and
provides a "new run" action that draws entropy exactly once (constitution Principle I,
exemption b). "Fresh" then means *nothing persisted*, not *nothing shared*.

## R-5. The drift gate as stated makes every CI run depend on an external server

FR-09 regenerates the truth artefact and fails the build on any difference. Regeneration
from source means an OPeNDAP request to a HYCOM server during CI. Those servers are not
reliable at CI cadence, and a failed fetch is indistinguishable from a drift unless the
gate is designed to tell them apart. The same holds for the Ifremer Argo mirror.

*Resolution:* spec 002 splits the pipeline into a *fetch* (network, checksummed raw
subset, run on demand) and a *convert* (raw subset to committed format, run in CI). The
gate regenerates from the checksummed raw subset, and a checksum mismatch is reported as
an upstream change, not a tree drift. Whether the raw subset is committed or fetched into
a cache is a size question the spec leaves to the plan.

## R-6. The period of the truth record is never stated

Six horizons to 96 h, an issue-time slider that moves backwards, a departure brief that
ages, a climatology window, and a spin-up period all need a stated span of truth. The SRD
names a domain and never a date range. The choice also determines which HYCOM product is
available (the 1994–2015 reanalysis or the ongoing analysis) and how many Argo profiles
fall inside the box.

*Resolution:* spec 002 declares the period in configuration and states the constraints
on it; the value itself is left to the author, with a recommendation.

## R-7. Skill "in the neighbourhood" and "the radius" presuppose a covariance model

AT-03 wants the harness to show the radius of an XBT's influence. That radius is a
property of the analysis scheme's background-error covariance, which the SRD does not
choose. Optimal interpolation makes the weights of FR-17 explicit and the radius a
declared length scale; a variational or ensemble scheme makes both harder to draw.

*Resolution:* spec 005 chooses optimal interpolation with a declared, isotropic
covariance length scale, and says so. This earns an ADR; it is contested by anyone who
wants flow-dependent covariances, and it is the right first answer regardless.

## R-8. Smaller findings

- **The shore forecast's producer is unstated (FR-25).** Same model, initialised from the
  analysis at issue time with the observations available then? Or a different, coarser
  forecast? Spec 009 assumes the former.
- **G-05 is not a lint gate.** "Every declared horizon is rendered" is a running-shell
  check. The constitution assigns it to Playwright.
- **Step-time measurement needs the host clock (NFR-04 versus FR-08).** The constitution
  grants a bounded exemption for it rather than pretending the conflict away.
- **WebGL is a large tool for a 100 × 100 field.** Six such panels draw trivially on a 2D
  canvas. The justification is FR-06's rising resolution ceiling; if that ceiling is
  bounded by HYCOM (R-2), the justification weakens. NFR-03 is kept as written and the
  renderer is confined to one module so the choice is cheap to revisit.
- **Accessibility is silent.** The drag interaction of FR-28 has no keyboard path. For a
  personal learning instrument this is acceptable; it is noted so it is a decision.
- **The three purposes are ranked understanding > teaching > evidence, but every
  acceptance test is evidence.** Not a contradiction — evidence is what can be tested —
  but AT-06's "watched in the shell rather than inferred from a green test" is the only
  place understanding is checked, and it should stay.

---

## What the SRD gets right, and the constitution keeps

The deferral-with-trigger discipline (§10), the requirement that the harness be able to
lose (FR-21, FR-37), the field-not-summary correction in FR-16 with its own history, the
opaque truth boundary (FR-12), and "a check that has never been seen to fail is worth
nothing" (PR-04) are the load-bearing parts. Each has become a principle or a workflow
rule rather than a requirement, so that a spec cannot trade it away.
