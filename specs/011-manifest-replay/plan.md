# Implementation Plan: Manifest Export and Replay

**Feature**: `011-manifest-replay` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-14 | **Depends on**: 001 (the manifest), 009 (issue time), 010 (the edits)
**Milestone**: **M3, the surface**, fifth beat.

## Summary

The manifest is the only thing that leaves the browser and the only thing that comes back. This
beat gives it a strict schema and a committed JSON Schema generated from it, adds the build's
own commit and the domain to what it records, and puts export and import on the surface — with
the byte-identity claim tested where it matters, across two browser contexts.

## Two findings

### 1. Replay caught an analysis that depended on when it was computed

The two-context test compared a digest of the run's fields and its analysed field, and it did
not match. The seed matched, the step count matched, the instant matched. The analysis did not.

The shell built its analysis from *the state as it stood when the run was constructed*. For a
fresh run that is the initial state, which is what beat 005 declared the analysis instant to be.
For a **replayed** run it is the state after the replay has advanced it to the step the manifest
records — so the same run, rebuilt from its own manifest, produced a different analysis from the
one it had exported.

Neither run was wrong about anything it said; the analysis panel simply meant something
different in each. The background is now taken before anything advances the state, which is what
"the analysis at the run's initial instant" always meant.

**This is what AT-04 is for.** Nothing else in the suite would have found it: the headless
replay test compares run state and manifests, both of which agreed, and no single-visit test can
tell an analysis-at-step-0 from an analysis-at-step-72 because a single visit only ever makes
one of them.

### 2. A gate was allowed to reuse a server it did not start

G-05 runs in a browser, and Playwright reuses an already-running preview server outside CI. A
server left over from an earlier command serves the `dist/` that existed when *it* started — so
the gate could ask its question of a build that is not the tree, and pass or fail for reasons
nothing in the tree explains. It did exactly that once during this beat: the gate failed against
a stale build and passed a minute later against a fresh one, with no change in between.

A gate that can do that is worth nothing, which is the same sentence PR-04 uses about a check
that has never been seen to fail. The gate now sets `J_OCEAN_GATE`, and the Playwright config
refuses to reuse a server when it is set.

## What the manifest says now

`codeVersion` (the build's commit, injected at build time) and `domainId` join the seed, the
derived seeds, the generator version, the clock, the configuration digest, the step count, the
issue instant and the ordered edit list. Format version 4.

The schema is a **strict** zod object, which is what makes FR-002 true rather than merely
intended: a manifest carrying a field, a score or an observation is rejected for carrying a key
the schema does not know, not because somebody remembered to look for those three words. The
committed `schemas/run-manifest.schema.json` is generated from that one definition and a test
regenerates and compares it — the same arrangement G-01 makes for the data artefacts, for the
same reason.

## The four checks, in order

They happen before anything is provisioned, so a refused import leaves the run you have alone:

1. **The schema**, naming the field at fault.
2. **The format version**, before the shape, so a manifest from another version is told what it
   is rather than told about a field that moved.
3. **The configuration digest** — a refusal, because the declared values differ and a run made
   against other values is a different run.
4. **The domain**, naming the one the manifest asked for and the ones this build has.

And one that is deliberately *not* a refusal: **the code version**. A reader holding a manifest
from last month is better served by a warned replay than by a door, so the mismatch is reported
beside the run and says identity is only promised for the same code.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **I. Seeded streams and deterministic replay** | Centrally | This is the beat that tests the principle where a reader would exercise it: two contexts, one manifest, byte-identical fields. |
| **V. No figure without its provenance** | Yes | The build's commit and the results digest are on the surface, so "the same run" is a claim a reader can check by looking at two tabs. |
| **VI. The harness can lose** | Yes | Finding 1 is a defect this beat found in its own predecessor, and finding 2 is a gate that could have been lying. |
| **NFR-02, nothing persists** | Yes, and measured | A test replaces `localStorage.setItem`, `sessionStorage.setItem`, `document.cookie` and `indexedDB.open` before the page loads and asserts that a whole visit — integrate, build the row, draw a new run — writes nothing. |

**Result: PASS.** No Complexity Tracking entry.

## Measured

- 241 headless tests, 34 shell tests, 7 gates.
- Export from one browser context, import in another: identical results digest, identical seed,
  and the edits come back with it.
