# Tasks: The Reduced-Gravity Model

**Feature**: `003-reduced-gravity-model` | **Plan**: [`plan.md`](./plan.md)

## Phase 0 — ADRs

- [X] **T000** ADR-0001 (model tier), ADR-0002 (kernel port and reference tolerance),
      ADR-0009 (dynamic depth, deferred), ADR-0010 (GPU kernel, deferred).

## Phase 1 — Parameters and the grid (FR-002, FR-003)

- [X] **T010** `config/j-ocean.json` gains a `model` block: every physical constant, the
      sponge, the chunk size, the thermal structure and the tolerances.
- [X] **T011** `GridSpec` gains separate x and y cell sizes; `grid.cellSizeMetres` is removed
      from configuration, because a five-degree box has two cell sizes and declaring one
      would be declaring something untrue.
- [X] **T012** `src/model/parameters.ts`: the grid and the beta-plane computed from the
      declared box; `assessStability` computes the scheme's linear boundary, the limit the
      declared criterion admits, and the viscous number, and refuses a configuration that
      misses either.

## Phase 2 — The kernel (FR-001, FR-004, FR-012)

- [X] **T020** `src/model/reduced-gravity.ts`: C-grid, vector-invariant momentum, leapfrog
      with a Robert-Asselin filter, sponge, outcrop clamp with its volume accounted for.
- [X] **T021** Working buffers and neighbour tables allocated once. A step that allocated
      would allocate half a megabyte, and a thousand-step replay would spend its time in the
      collector rather than in the ocean.
- [X] **T022** Viscosity and drag lagged one time level. Leapfrog is unconditionally unstable
      for diffusion at the current level; the first version was, and blew up in 200 steps.
- [X] **T023** The placeholder diffusion kernel is **removed**, not extended, as spec 001 said
      it would be. The kernel contract and replay tests now exercise the kernel that ships.

## Phase 3 — Initialisation from truth (FR-013)

- [X] **T030** `src/model/initialise.ts`: thickness from sea-surface height by the
      reduced-gravity relation with the domain mean removed; velocity in geostrophic balance.
- [X] **T031** The model's cells are laid over the record's actual coverage, which the source
      snapped to its own grid; the shortfall is reported and asserted to be inside one native cell.
- [X] **T032** `geostrophicAgreement`: what the truth's own velocity is used *for*.

## Phase 4 — Diagnostics and the published interface (FR-005, FR-006, FR-010)

- [X] **T040** `src/model/profile.ts`: the two-layer thermal structure, its inverse, and the
      kind of every level — static by construction, because NFR-05 says a kind does not move.
- [X] **T041** The inverse reports whether it *resolved* anything: a thermometer in the body
      of a layer constrains the interface hardly at all, and beat 004 has to know.
- [X] **T042** `src/model/results.ts`: copies, not buffers; invariants; the excluded margin;
      the outcrop count and the volume it added.

## Phase 5 — Tests (SC-001 to SC-005)

- [X] **T050** `tests/model/at-01.test.ts`: 96 h over both domains, every figure printed.
- [X] **T051** `tests/model/conservation.test.ts`: the scheme's own conservation, in a setting
      where the ocean cannot confound it.
- [X] **T052** `tests/model/profile-and-results.test.ts`: profile kinds, inversion and its
      saturation, the results boundary, and kernel acceptance reporting *reference only*.
- [X] **T053** The beat 001 headless and replay tests still pass with the real kernel.

## Phase 6 — The surface (FR-007, FR-008, FR-009)

- [X] **T060** `src/harness/FieldView.tsx`: a diverging palette legible in greyscale.
- [X] **T061** The shell integrates in declared chunks and yields between them.
- [X] **T062** The over-budget path: both figures, no integration, and an explicit
      "integrate anyway".
- [X] **T063** Shell tests and screenshots.

## Phase 7 — Close

- [X] **T070** Documentation site and the engineering note.
- [X] **T071** `pnpm check` green.

---

## What landed, against what the plan said

- **FR-003, the timestep.** The spec asks for the timestep to be *computed* from the
  criterion. It is declared and the criterion is computed and enforced against it, because a
  timestep that came out of a floating-point evaluation would enter the run manifest and make
  byte-identical replay depend on that evaluation being identical everywhere. The criterion
  keeps its teeth — it refused two configurations during this beat — and replay keeps its.
- **FR-013, the velocity.** Mapped through geostrophy rather than imposed, and the truth's
  own velocity used to check the result. See the plan.
- **The WebGL surface.** Deferred to beat 007 with one Complexity Tracking entry.
- **The spec's second edge case** ("layer thickness goes to zero or negative") is not
  hypothetical: it happens in the Gulf Stream domain with a closed boundary, 28 times in 12
  hours. The clamp counts it, the results publish the count and the volume, and the sponge is
  why the shipping configuration does not do it.
