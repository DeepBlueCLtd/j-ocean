# Tasks: Foundation and Ports

**Feature**: `001-foundation-and-ports` | **Plan**: [`plan.md`](./plan.md) | **Spec**: [`spec.md`](./spec.md)

`[P]` marks tasks that touch disjoint files and may be done in parallel.
Each task names the spec requirement it discharges.

## Phase 1 — Toolchain (FR-001)

- [X] **T001** `package.json`, `pnpm-workspace.yaml`, `.npmrc`: pnpm workspace, ESM, scripts
      `build`, `dev`, `test`, `test:shell`, `lint`, `typecheck`, `gates`, `check`.
- [X] **T002** [P] `tsconfig.json` + `tsconfig.node.json`: TypeScript 5 strict, ES2022, bundler
      resolution, `noUncheckedIndexedAccess`.
- [X] **T003** [P] `eslint.config.js`: flat config, typescript-eslint recommended, plus the
      project rule that `src/model/` may not import React.
- [X] **T004** [P] `vitest.config.ts`: Node environment, `tests/**/*.test.ts`, no DOM.
- [X] **T005** [P] `vite.config.ts` + `index.html`: static build to `dist/`, relative base.
- [X] **T006** [P] `playwright.config.ts`: build then serve `dist/` statically, Chromium.
- [X] **T007** [P] `.gitignore` additions for `node_modules/`, `dist/`, `test-results/`.

## Phase 2 — Configuration (FR-011, Principle X)

- [X] **T010** `src/config/digest.ts`: canonical JSON serialisation (sorted keys, no
      insignificant whitespace) and a pure-TypeScript SHA-256. **FR-005** (digest), spec
      edge case *whitespace does not change the digest*.
- [X] **T011** [P] `tests/config/digest.test.ts`: RFC 6234 vectors; key order and whitespace
      invariance; a value change always changes the digest.
- [X] **T012** `src/config/schema.ts`: the zod schema naming every declared value — grid,
      timestep, clock epoch, horizons, frame budget, domains, default seed, forbidden-word
      list path. **FR-011**, Principle X.
- [X] **T013** `src/config/load.ts`: the single loader; parse, validate, digest; a failure
      is a readable error naming the path and the reason. **FR-011**.
- [X] **T014** [P] `config/j-ocean.json`: the declared values themselves.
- [X] **T015** [P] `tests/config/load.test.ts`: valid config loads and digests; an invalid
      config throws a `ConfigurationError` naming the field; SC-003 support.

## Phase 3 — Ports (FR-002, FR-003, FR-004, Principle VIII)

- [X] **T020** `src/ports/rng.ts`: `RngPort` — named streams from a root seed, `nextU32`,
      `nextFloat`, `nextGaussian`; `derivedSeeds()`; `generatorVersion`. **FR-003**.
- [X] **T021** [P] `src/ports/clock.ts`: `SimulationClock` (read-only) and the advance handle
      the run alone holds. **FR-004**.
- [X] **T022** [P] `src/ports/kernel.ts`: `ModelKernel` — state in, advanced state out;
      `isReference` flag (Principle VIII, FR-04). **FR-002**.
- [X] **T023** [P] `src/ports/truth-source.ts`: `TruthSource` — sample at position, depth,
      instant; `nativeResolutionDegrees` (review R-2 recorded from the first artefact).
- [X] **T024** `tests/ports/port-count.test.ts`: exactly four files, named; failure message
      cites constitution Principle VIII. **FR-002**, SC-005.
- [X] **T025** [P] `src/model/grid.ts` + `src/model/diffusion-kernel.ts`: typed-array state
      from the declared grid, and the trivial reference kernel that consumes a per-step draw.
- [X] **T026** [P] `tests/ports/constant-truth-source.ts`: the constant-field implementation
      the truth-source contract test exercises. It is a test double for this beat only; the
      real implementation over the committed format is beat 002.
- [X] **T027** [P] `tests/ports/kernel-contract.test.ts`: shape, dtype, determinism, and
      that different seeds give different states. **FR-002**.
- [X] **T028** [P] `tests/ports/rng-contract.test.ts`: stream independence of draw order;
      same name twice replays from the start; derived seeds recorded. **FR-003**.
- [X] **T029** [P] `tests/ports/clock-contract.test.ts`: every consumer sees the same instant;
      no consumer can advance it. **FR-004**.
- [X] **T030** [P] `tests/ports/truth-source-contract.test.ts`: constant field passes the
      contract; sampling is pure.

## Phase 4 — Run and manifest (FR-005, FR-006, FR-014)

- [X] **T040** `src/run/seeds.ts`: SplitMix64 derivation, `rootSeed ⊕ fnv1a64(name)`.
- [X] **T041** `src/run/manifest.ts`: the `RunManifest` type, `toJSON`/`fromJSON`, the
      generator-version and configuration-digest checks, the empty counterfactual slot.
      **FR-005**, spec edge case *newer manifest, older code*.
- [X] **T042** `src/run/run.ts`: `createRun({config, seed})` and `createRunFromManifest`;
      owns the clock's advance handle; `advance(n)`; `exportManifest()`. **FR-005**.
- [X] **T043** [P] `tests/run/manifest.test.ts`: every recorded field present; digest
      mismatch refuses and leaves no run; version mismatch names both versions.
- [X] **T044** [P] `tests/run/replay.test.ts`: 1,000 steps, byte-identical; different seeds
      differ. **FR-006**, SC-001.
- [X] **T045** [P] `tests/model/headless.test.ts`: a run advances with no DOM present.
      **FR-014**, SC-004.

## Phase 5 — Gates (FR-007, FR-008, FR-009, FR-010, PR-04)

- [X] **T050** `scripts/gates/gate-lib.ts`: file walk honouring `--root`, ignore rules,
      violation reporting with path and line, scanned-file count.
- [X] **T051** `scripts/gates/check-host-time.ts` (G-04): the six forbidden reads; the
      `j-ocean:allow-host-time` marker honoured only in the two named modules; every honoured
      marker listed. **FR-007**.
- [X] **T052** [P] `scripts/gates/check-model-imports.ts` (G-03): no import into `src/model/`
      from `src/harness/`, `react`, `react-dom`, or a WebGL/DOM-typed module. **FR-008**.
- [X] **T053** [P] `scripts/gates/check-vocabulary.ts` + `vocabulary.json`: plaintext terms
      with a reviewed exemption list, hashed terms with none; `track` on neither. **FR-009**.
- [X] **T054** [P] `scripts/gates/fixtures/**`: one planted violation per gate, mirroring the
      repository layout so `--root` swaps cleanly.
- [X] **T055** `scripts/gates/run-all.ts`: `pnpm gates`; runs every gate present, in order;
      prints *not yet landed* for G-01, G-02, G-05, G-06. **FR-010**, SC-002.
- [X] **T056** `tests/gates/gates.test.ts`: each gate exits non-zero against its fixture and
      zero against the tree; scanned-file count non-zero; the navigational use of `track`
      passes; the marker outside its two modules fails. **FR-010**, SC-002.
- [X] **T057** Watch each gate fail on its planted violation, remove it, watch it pass, and
      say so in the commit message. **PR-04** — a task that is done by a human eye, not by CI.

## Phase 6 — The shell (FR-012, FR-013, SC-003)

- [X] **T060** `src/harness/timing.ts`: exemption (a); `performance.now` behind the marker;
      the figure is typed as host time.
- [X] **T061** [P] `src/harness/seed-provisioning.ts`: exemption (b); entropy drawn exactly
      once, before a run exists. **FR-012**.
- [X] **T062** `src/harness/App.tsx` + `main.tsx` + `index.css`: the not-operational
      statement in the first viewport and not dismissable; the root seed; whether this is the
      recorded case; the three figure kinds typographically distinct; the configuration-failure
      path that provisions no run. **FR-013**, Principle V.
- [X] **T063** [P] `tests/shell/shell.spec.ts` (Playwright): loads from a static server with
      no external request; the statement is visible without scrolling; the seed is shown;
      new-run changes the seed and says the run is no longer the recorded case. **SC-003**.

## Phase 7 — Close the beat

- [X] **T070** `docs/development-plan.md` unchanged (the tree matches it); README updated with
      the commands. **PR-05**.
- [X] **T071** `pnpm check` — lint, typecheck, test, gates, build — green from a clean checkout.

---

## What landed, against what the plan said

Recorded here because the tree is the authority and this file is a claim about it (PR-05).

- **T003** grew a project-specific eslint rule beyond what the task named: `src/model/`
  also gets `no-restricted-imports` for the harness. It duplicates gate G-03 on purpose —
  the gate is the enforcement, the lint rule is the message a developer gets in the editor
  before they ever run it.
- **T014** declares `horizons`, `domains` and `budget`, which beat 001 only *displays*.
  They are here rather than in the beat that first computes with them because Principle X
  says no component holds a literal for them, and a value that arrives with its first
  consumer arrives as a literal first and is moved later.
- **T053** the word list has two halves, plaintext and hashed, which the task did not
  anticipate. A list of forbidden words cannot hold the customer names it forbids; the
  plan records the design and `check-vocabulary.ts` opens by stating the contradiction.
- **T057** each of the three gates was watched failing against its fixture, naming file
  and line, and passing against the tree and against `fixtures/clean` — which uses the
  navigational sense of a vessel's path and must pass. The commit says so.
- **T063** the shell test needs a Chromium; `J_OCEAN_CHROMIUM` points at one that already
  exists rather than requiring a second copy. All seven shell tests pass.
- **Not in this beat, and deliberately:** no ADR was owed by 001 (the ADR schedule places
  0001, 0002, 0004 and 0008 before beats 002 and 003), so `docs/adr/` does not yet exist.
  Beat 002's first task is to create it.
- **Added beyond the task list:** `.github/workflows/ci.yml`, because the constitution's
  Quality gates section requires these checks to run in CI and beat 001 is where CI starts.
