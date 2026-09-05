# Implementation Plan: Simulated Instruments

**Feature**: `004-simulated-instruments` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-07 | **Depends on**: 002 (the records), 003 (the thermal structure)
**ADRs landed first**: [0005](../../docs/adr/0005-observation-operator.md) (the observation
operator), [0007](../../docs/adr/0007-argo-in-the-analysis.md) (Argo in the analysis)

## Summary

The only place in the codebase where a truth value becomes an observation. Everything the
harness later says a measurement was *worth* is priced here, so the whole beat is about
making that pricing explicit and then making it impossible to bypass.

Two mechanisms do the work. `Observation` carries a brand keyed by a symbol that
`src/instruments/observation.ts` declares and never exports, so no other module can name the
key and therefore no other module can construct one. Gate G-02 holds the other half: it fails
if the brand appears anywhere else, and if `src/model/` or `src/analysis/` imports the
truth-source port.

## The first thing the gate caught was ours

Beat 003 put `initialiseFromTruth` under `src/model/`, where it imported the truth-source
port. The SRD's FR-013 requires initialisation to go through the port; the constitution's
Principle II says in terms that *the model and the analysis import neither the truth port nor
the scoring module*. Both are satisfied by the **run** doing the wiring, and the file is now
`src/run/initialise-from-truth.ts`. Where a spec and the constitution disagree, the
constitution wins.

The planted fixture `truth-boundary-model/` is that violation, kept so the gate keeps
watching for it.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **I. Seeded streams** | Yes | Every instrument derives its own named stream, so no two can disturb each other's draws. The XBT draws its noise even for a level it could not sample, so an overshoot does not silently shift every later draw. Observation identifiers derive from the instrument and the logical index, never from entropy. |
| **II. Truth only through an instrument** | Centrally | See above. G-02's two static halves land here; the behavioural half needs an analysis and lands in beat 005, and the gate *says so on every run* rather than leaving the hole unmentioned. |
| **IV. Attribution derived** | Prepared | Nothing is attributed yet. The `external` flag and the per-part error breakdown are what beat 005 will weight and beat 006 will caveat. |
| **V. No figure without provenance** | Yes | An observation's error is three declared parts, not one opaque figure: instrument noise, representativeness, and any declared bias. The surface says which is which. |
| **VI. The harness can lose** | Yes | A flagged observation keeps its value and is drawn as flagged. A profile that does not cross the thermocline reports a *bound*, never a plausible depth. |
| **X. Declared in configuration** | Yes | Track, drops, depths, noise, checks, thresholds and the Argo toggle. The schema also refuses configurations whose arithmetic is self-defeating — see below. |

**Result: PASS.** No Complexity Tracking entry.

## Three findings that changed the configuration

**1. A quality-control threshold below the instrument's own noise flags the instrument.** The
declared vertical-inversion tolerance was 0.05 °C against an XBT whose total error is
0.224 °C, and every real profile tripped it in the weakly stratified deep water. The schema
now refuses any tolerance below twice the XBT's total error, and the declared figure is
0.6 °C.

**2. An XBT can reach past the end of the truth record.** It infers its depth from a fall
rate, so a probe asked for 700 m may reach 703 m — and the record stops at 700. The level is
kept, flagged `outside-record`, and valueless. Clamping the depth would report a measurement
from a place the harness has no record of; dropping the level would hide a hole that belongs
to the *record* rather than to the ocean. Three of seventy-eight levels do this.

**3. The operator's saturation is the reason to prefer it.** ADR-0005 chose interface depth
over a temperature anomaly on a vertical mode. The propagated error is
`|dh/dT| = 2L / (|ΔT|(1 − f²))`, which diverges as a measurement leaves the thermocline — so
a level that constrains nothing acquires a weight near zero *through the arithmetic*. A test
adds ten such levels to a three-level profile and asserts the answer does not move.

## Project structure

```text
src/instruments/
  observation.ts             the type, the brand, and the single construction site
  observation-operator.ts    profile -> interface depth, with the error propagated
  quality-control.ts         the declared checks; each produces a flag and drops nothing
  climatology-reference.ts   the departure scale the artefact can answer for
  instruments.ts             the track, the surface instrument, the XBT, and Argo
scripts/gates/check-truth-boundary.ts       G-02
scripts/gates/fixtures/truth-boundary-*/    three planted violations
tests/instruments/instruments.test.ts
```

## Measured, and printed by the tests

| | |
|---|---|
| Residual standard deviation over 289 seeded draws | 0.3935 °C against a declared 0.4 |
| Interface recovered from a zero-noise profile | 200.0, 350.0 and 500.0 m, ±0.7 to ±0.9 m |
| Levels reaching past the end of the record | 3 of 78, flagged rather than clamped |
| Argo flags in the record, and on the observations | 6 and 6 |
| XBT total error against the declared inversion tolerance | 0.224 °C against 0.6 °C |
