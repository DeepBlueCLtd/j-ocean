# ADR-0013: G-07 and G-08 join the constitution's gate schedule

**Status:** Accepted
**Date:** 2026-09-21
**Beat:** 016-panel-help

## Context

The constitution's *Quality gates* section listed nine things every change must pass, ending
at the forbidden-vocabulary gate. Two gates were not on it.

**G-07 surface invariance** landed in beat 013 and has run in `pnpm gates` and in CI on every
commit since. It was never added to the schedule. That is a small thing with a specific cost:
the schedule is where somebody looks to find out what is being enforced, and a gate that runs
without being listed is one whose disappearance nobody would notice. The list is the claim;
the gate is the enforcement; a claim short of its enforcement is the wrong way round.

**G-08 help coverage** lands in this beat. SRD-v2 FR-54 requires each panel's help to be held
to something on disk, and AT-14 requires a planted panel with an undeclared region to be
reported by name. That is a gate, and the constitution's own rule is that a gate is listed and
is watched failing before it is trusted.

## Decision

Both are added to the *Quality gates* list, as items 10 and 11, each with the requirement it
holds and the principle or SRD reference it holds it for. The constitution goes to **1.1.0**:
guidance materially expanded, no principle removed or redefined, so work that complied
yesterday complies today.

The amendment log records G-07's late arrival as a finding rather than quietly backdating it.

## Consequences

- `pnpm gates` runs eleven checks in the order the constitution lists them, and the count in a
  commit message is a number a reader can check against this file.
- A future gate that lands without a line here is now visibly the third instance of the same
  omission, which is the point of recording the first two.
- Nothing about either gate changed. G-07's record is untouched by this beat and G-08's
  planted violations were watched failing before it was registered, as PR-04 requires.
