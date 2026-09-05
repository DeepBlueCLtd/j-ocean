# Implementation Plan: Foundation and Ports

**Feature**: `001-foundation-and-ports` | **Branch**: `claude/implementation-continuation-py7g5x`
**Date**: 2026-09-05 | **Spec**: [`spec.md`](./spec.md)
**Input**: SRD v1 §2.1, §6, §7, §8; constitution 1.0.0; `docs/development-plan.md` beat 001

## Summary

Beat 001 lands no ocean. It lands the shape every later beat fills in and the proof that
the shape is enforced: a pnpm/TypeScript workspace that builds to static assets, four
ports with contract tests, a seeded RNG whose streams are named and recorded, a
simulation clock nothing but the run may advance, a run manifest a second run can be
built from byte-identically, and three gates that have been watched failing on planted
fixtures.

The one design decision worth stating up front is that **the run, not the model, owns
determinism**. The kernel is handed a state and a step context; it never reaches for a
seed, a clock or a stream of its own. That is what lets feature 003 replace the trivial
kernel rather than extend it, and what makes the replay test a property of the foundation
instead of a property of the ocean.

## Technical Context

| | |
|---|---|
| **Language** | TypeScript 5.9, `strict`, ES2022 target, ESM throughout |
| **Runtime baseline** | Node 22, pnpm 10 (spec Assumptions); browsers with WebGL 2 |
| **Build** | Vite 7 → static assets in `dist/`; `pnpm build` is the one command |
| **Shell** | React 19 |
| **Tests** | vitest 3 (Node environment, no DOM); Playwright 1.63 for the shell |
| **Lint** | eslint 9 flat config + typescript-eslint 8; `tsc --noEmit` |
| **Config validation** | zod 4 — a schema in code, one loader module, validated before any computation |
| **Gates** | `tsx` scripts under `scripts/gates/`, one entry point `pnpm gates` |
| **Storage** | none. Nothing persists between visits (NFR-02) |
| **Scale** | 100 × 100 declared grid; beat 001 exercises it with a scalar diffusion kernel |

### Choices that did not earn an ADR

Per PR-03, routine choices are recorded here and not in `docs/adr/`.

- **Vite over a bespoke bundler.** Not contested; NFR-03 names the toolchain and Vite is
  the ordinary way to satisfy it.
- **zod over JSON Schema + ajv.** Principle X asks for a schema validated at startup with
  a readable message, not for a particular schema language. zod gives the loader a single
  source for both the runtime check and the static type, which removes the drift between
  them that a separate `.json` schema plus hand-written interface would create. Reversible:
  the loader is one module and the config files stay plain JSON either way.
- **A pure-TypeScript SHA-256 for the configuration digest.** `crypto.subtle` is
  asynchronous and secure-context-only; `node:crypto` is not available in the browser. The
  digest must be computable identically in both, so it is written out in
  `src/config/digest.ts` and covered by the RFC 6234 test vectors.
- **xoshiro128\*\* for the RNG and SplitMix64 for seed derivation.** Both are small,
  published, integer-exact in TypeScript, and have no host dependency. The generator
  version string in the manifest is what makes this reversible: changing the generator
  changes the version and an old manifest then refuses to load rather than replaying
  wrongly.

### New directories under `src/`

The canonical layout in the constitution enumerates `src/ports/`, `src/model/`,
`src/instruments/`, `src/analysis/`, `src/scoring/` and `src/harness/`. This beat adds two
siblings and says why here, as the layout requires:

- **`src/config/`** — Principle X requires configuration to be *loaded through one module*.
  That module cannot live in `src/model/` (the harness needs it) nor in `src/harness/`
  (the headless run needs it), so it is its own ring below both.
- **`src/run/`** — the manifest, the seed derivation and the run that owns the clock.
  Principle I's subject is the *run*, which is neither the model (it must not know about
  seeds and manifests) nor the harness (a run must be constructible headlessly, AT-04).

Both sit below `src/model/` in the dependency direction: they import ports and nothing
else. No new **top-level** directory is proposed.

## Constitution Check

Every principle this beat touches, and how it complies. Principles II, IV and VI have no
surface in this beat and are listed with the beat that first tests them.

| Principle | Touched | How this beat complies |
|---|---|---|
| **I. Seeded streams, no wall-clock, deterministic replay** | Yes, centrally | The RNG port is the only generator; streams are named and derived from the root seed by SplitMix64, and every derived seed is written to the manifest. The clock port is the only simulation time and only the run holds its advance handle. The two exemptions are the only two markers in the tree and each is a named module — `src/harness/timing.ts` and `src/harness/seed-provisioning.ts`; G-04 honours the marker nowhere else and lists the two it honoured. Replay is `tests/run/replay.test.ts`, at 1,000 steps, byte-compared. |
| **II. Truth only through an instrument** | Interface only | The truth-source port is declared here with a constant-field implementation for the contract test. No `Observation` type exists yet; G-02 lands in beat 004 with the instruments module, as the gate schedule says. |
| **III. The model knows nothing about display** | Yes | `src/model/` imports the kernel port and nothing above it. G-03 enforces it by import scan; `tests/model/headless.test.ts` runs the kernel under vitest's Node environment with `document`, `window` and `WebGLRenderingContext` asserted absent. |
| **IV. Attribution derived, never authored** | No | Beat 005. |
| **V. No figure without its provenance** | Partly | The shell states the root seed (declared), whether the run is the recorded case (declared) and the step time (host time, typographically marked by the `.host-time` class per exemption (a)). The three figure kinds get their typography here so later beats inherit it rather than inventing it. |
| **VI. The harness can lose** | Not yet | Nothing is scored in this beat. The shell has no demo mode and no fixture path: what it shows is the manifest of a run that exists. |
| **VII. No tracked entities, no customer material** | Yes | The vocabulary gate lands here. See *Vocabulary gate design* below — the design point is that a word list which must not contain customer names cannot be a plaintext list of customer names. |
| **VIII. Honest ports, CPU kernel is the reference** | Yes | Four files in `src/ports/`, no index barrel, and `tests/ports/port-count.test.ts` fails naming Principle VIII if a fifth appears. The trivial kernel is registered as `reference: true`; the contract test is what a second kernel will be accepted against in beat 003. |
| **IX. Derived artefacts, not fixtures** | Not yet | No artefact exists. G-01 lands in beat 002. `pnpm gates` reports G-01 as *not yet landed*, distinct from *skipped*, so that beat 002 has something to turn on. |
| **X. Declared in configuration, not judged at review** | Yes | `config/j-ocean.json` carries the grid, the timestep, the horizons, the frame budget, the domains and the default seed. No literal appears in a component: the port-and-run code takes its numbers from the loaded configuration. A schema failure is a startup failure with the offending path and message, and provisions no run. |

**Result: PASS.** No Complexity Tracking entry is owed.

## Project Structure

```text
config/
  j-ocean.json                  # declared values (Principle X)
scripts/gates/
  check-host-time.ts            # G-04
  check-model-imports.ts        # G-03
  check-vocabulary.ts           # vocabulary gate
  vocabulary.json               # the reviewed word list, beside the gate
  gate-lib.ts                   # shared: file walk, --root, reporting
  run-all.ts                    # pnpm gates
  fixtures/
    host-time/src/model/...     # one planted violation per gate, mirroring the layout
    model-imports/src/model/...
    vocabulary/src/...
src/
  config/
    schema.ts                   # the zod schema; the one place a declared value is named
    digest.ts                   # canonical serialisation + SHA-256
    load.ts                     # the one loader; readable startup failure
  ports/
    kernel.ts  rng.ts  clock.ts  truth-source.ts     # exactly four, no barrel
  model/
    grid.ts                     # typed-array state, shape from configuration
    diffusion-kernel.ts         # the trivial reference kernel of this beat
  run/
    manifest.ts                 # RunManifest type, serialise, parse, version checks
    seeds.ts                    # SplitMix64 derivation; root seed → named seeds
    run.ts                      # Run: clock owner, stream registry, kernel driver
  harness/
    App.tsx  main.tsx  index.css
    timing.ts                   # exemption (a): performance.now around a step
    seed-provisioning.ts        # exemption (b): entropy once, before a run exists
tests/
  config/    digest.test.ts  load.test.ts
  ports/     port-count.test.ts  kernel-contract.test.ts  rng-contract.test.ts
             clock-contract.test.ts  truth-source-contract.test.ts
  run/       manifest.test.ts  replay.test.ts
  model/     headless.test.ts
  gates/     gates.test.ts     # each gate spawned against its planted fixture
  shell/     shell.spec.ts     # Playwright
```

## Design notes for the parts that are not obvious

### Seed derivation and named streams

The root seed is a 64-bit value written as 16 hex characters in configuration and in the
manifest. A named stream's seed is `splitmix64(rootSeed ⊕ fnv1a64(name))`, and the stream
itself is xoshiro128\*\* initialised from four SplitMix64 outputs. Two consequences the
spec asks for fall out of this rather than being arranged: a stream is independent of
every other stream's draw order because it never shares state with one, and asking twice
for the same name returns the same sequence *from the start* because `stream(name)` is a
construction, not a lookup. The run records each name it has been asked for, with its
derived seed, in the manifest.

### What the manifest holds, and what it deliberately does not

It holds the root seed, the derived seeds by name, the generator version, the clock
configuration, the configuration digest, the step count reached, whether the run is the
recorded case, and an empty `counterfactual` slot (beat 010, FR-34). It does **not** hold
state. Replay is re-computation from the manifest, not restoration of a snapshot, which is
what makes the byte-identity test meaningful: a snapshot would compare itself with itself.

Loading refuses in two ways, each naming both values: a generator-version mismatch, and a
configuration-digest mismatch. Refusal leaves no run behind.

### Vocabulary gate design

A list of forbidden words held in the repository is a contradiction when the words are the
customer names Principle VII says must not appear in the repository. The gate therefore
holds two kinds of entry:

- **`terms`** — plaintext, for the tracked-entity vocabulary. Checked in every tracked file
  except the documents whose subject *is* the prohibition (the constitution) and vendored
  tooling under `.claude/`. That exemption is listed in `vocabulary.json` and is reviewed
  with it.
- **`hashedTerms`** — salted SHA-256 of a term that must not be written down. The gate
  hashes each word token of each scanned file and compares. **No exemption applies to
  these**: a customer name is forbidden in the constitution too.

`track` is on neither list, and `tests/gates/gates.test.ts` asserts a sentence using it
navigationally passes.

### Why `pnpm gates` reports a gate that does not exist yet

G-01, G-02, G-05 and G-06 land in later beats. The runner prints them as `not yet landed
(beat NNN)` and exits zero, while a gate that is present but cannot run — G-01 without
Python, in beat 002 — will exit non-zero, because the spec's edge case is right that a
skipped gate is not a passed gate. Distinguishing *absent* from *skipped* is what keeps
both true at once.

## Phasing

1. **Toolchain** — workspace, TypeScript, lint, vitest, Vite, Playwright. Nothing to
   demonstrate yet.
2. **Configuration** — schema, digest, loader, and their tests. Everything downstream
   takes its numbers from here, so it comes first.
3. **Ports** — four interfaces, their reference implementations and their contract tests,
   including the port-count test.
4. **Run and manifest** — seed derivation, the run, export/import, the replay test at
   1,000 steps.
5. **Gates** — the three gates, their fixtures, the runner, and the commit that says each
   was watched failing (PR-04).
6. **Shell** — the React surface, the not-operational statement, the seed, the recorded-case
   line, new-run, the config-failure path, and the Playwright test.

Phases 2–4 are testable headlessly and land before anything is drawn, which is the same
ordering M2-before-M3 applies at the scale of the whole plan.

## Risks

1. **The replay test passes for the wrong reason** — a trivial kernel whose output does not
   depend on its stream would replay identically no matter how broken the RNG was. Mitigated
   by making the diffusion kernel consume a per-step draw from a named stream, and by a
   negative test: two runs from *different* root seeds must differ.
2. **A gate that passes because it scans nothing.** Each gate reports the file count it
   scanned and `tests/gates/gates.test.ts` asserts it is non-zero on the tree.
3. **Playwright's bundled browser version and the environment's browser disagree.** The
   shell test is the only part of this beat that needs a browser; it is written to use the
   configured Chromium and is reported honestly if the environment cannot launch one. The
   headless half of AT-04, which is what beat 001 owes, does not depend on it.

## Acceptance for this beat

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm gates`, `pnpm build` all pass from a
  clean checkout.
- SC-001 … SC-005 of the spec are each covered by a named test.
- The three gates have each been watched failing on their fixture and the commit says so.
