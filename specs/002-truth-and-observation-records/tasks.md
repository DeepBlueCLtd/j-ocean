# Tasks: Truth and Observation Records

**Feature**: `002-truth-and-observation-records` | **Plan**: [`plan.md`](./plan.md)

`[P]` marks tasks that touch disjoint files.

## Phase 0 — The ADRs this beat owed

- [X] **T000** [`docs/adr/0004-truth-source.md`](../../docs/adr/0004-truth-source.md): the
      product, the fetch/convert split, the period, and what committing the raw subset buys.
- [X] **T001** [P] [`docs/adr/0008-climatology.md`](../../docs/adr/0008-climatology.md):
      computed from the subset, with the overlap recorded and carried onto every score.

## Phase 1 — The container (FR-009)

- [X] **T010** `data/scripts/jocean_format.py`: the writer, and a reader for inspection.
- [X] **T011** `src/truth/container.ts`: the reader, using nothing but `DataView`,
      `TextDecoder` and a typed array.
- [X] **T012** [P] `tests/truth/container.test.ts`: shape against coordinates, period
      coverage, native resolution, provenance, land as NaN, int16 at the source's precision.

## Phase 2 — Configuration (FR-006, FR-011, Principle X)

- [X] **T020** `config/j-ocean.json`: the source, period, depth levels, climatology window,
      Argo source, the contrast factor, and per-domain native resolution and ratio.
- [X] **T021** `src/config/schema.ts`: schema version 2, and the arithmetic the schema *does*
      rather than trusts — the period covers the last issue time plus the longest horizon;
      the first issue time is at or after spin-up; the clock epoch is the period's start; the
      declared resolution ratio is the one the box and the grid imply (review R-2).
- [X] **T022** [P] `tests/config/load.test.ts`: one test per refusal above.

## Phase 3 — The build step (FR-001 to FR-005, FR-008)

- [X] **T030** `data/scripts/fetch.py`: the only thing that touches the network. One request
      per variable and depth level, box and period in the request, digest beside each file.
- [X] **T031** `data/scripts/convert.py`: pure. Verifies every digest first, reports
      *upstream changed* naming both, writes nothing on failure.
- [X] **T032** Truth artefact per domain, six-hourly over the declared period.
- [X] **T033** [P] Climatology per domain, with source, window, instants averaged and the
      overlap in days with the run period.
- [X] **T034** [P] Observations per domain: every Argo quality flag carried through at every
      level, and a flag histogram computed from the raw arrays for the test to check against.
- [X] **T035** [P] `data/scripts/README.md` and `requirements.txt`.
- [X] **T036** Verified reproducible: two runs of the convert step, six artefacts, identical
      digests (SC-005).

## Phase 4 — Gate G-01 (FR-004, FR-012, PR-04)

- [X] **T040** `scripts/gates/check-artefact-drift.ts`: regenerates into a temporary
      directory and compares byte for byte, naming the artefact and the first differing
      offset. Missing Python is a failure, not a skip.
- [X] **T041** Registered in `pnpm gates`; CI installs Python for this gate alone.
- [X] **T042** Watched failing on a planted byte, and kept watched by
      `tests/gates/gates.test.ts`, which builds the planted copy in a temporary directory
      rather than committing a second copy of ten megabytes of derived data.
- [X] **T043** The vocabulary gate excludes the gated artefact directories, and says so in
      its output. The two gates interlock: a hand-written file placed among the artefacts
      fails G-01 rather than hiding from the vocabulary scan.

## Phase 5 — The port over the committed format (FR-010)

- [X] **T050** `src/truth/artefact-truth-source.ts`: declared interpolation — linear in time,
      bilinear in space, linear in depth — with NaN over land rather than an average around it.
- [X] **T051** [P] `src/truth/observations.ts`: the record reader, the Argo flag scale, and
      the usable set. Flags are never spent on filtering.
- [X] **T052** The beat 001 contract suite now runs against **both** implementations, the
      test double and the committed artefact. That is what a port is for.
- [X] **T053** [P] `tests/truth/truth-source.test.ts`: exact at a stored node; linear between
      instants; bilinear between nodes; refuses outside its coverage; NaN over land.
- [X] **T054** [P] `tests/truth/observations.test.ts`: no level dropped, flag histogram equal
      to the one computed from the raw arrays, values retained whatever the flag says.

## Phase 6 — The contrast, and the surface (FR-007, SC-003)

- [X] **T060** `tests/truth/domain-contrast.test.ts`: prints both variances and the ratio.
- [X] **T061** `src/harness/artefacts.ts`: the artefacts as static assets, so a visit still
      makes no request that leaves the site.
- [X] **T062** The record panel in the shell: source, native resolution and the ratio, the
      instants and their irregularity, the depth levels, the Argo counts including the
      flagged ones, and the climatology overlap with its caveat.
- [X] **T063** [P] Shell test and screenshot.

## Phase 7 — Close the beat

- [X] **T070** Documentation site: the data model page gains the container and the
      observation record; an engineering note covers the beat.
- [X] **T071** `pnpm check` green.

---

## What landed, against what the plan said

Three deviations, each recorded rather than absorbed (PR-05).

- **T030, the subset service.** FR-002 says OPeNDAP. The DAP route requires the client to
  read the metadata of a 2884 x 40 x 3251 x 4500 aggregation before it can slice, and timed
  out at 120 s twice without returning. The NetCDF Subset Service takes box, period, stride
  and level in one URL and answers in 13 to 15 seconds. Both are THREDDS services and both
  subset server-side, which is what the requirement protects. Recorded in ADR-0004 and in
  the plan.

- **T032, the gaps.** The spec's edge case says the fetch step fails and names the missing
  instants. The reanalysis is missing about thirty-six snapshots a year, so a six-hourly
  stride lands on a nine-hour step twice in this fortnight and *every* period would fail.
  What the requirement protects is that a gap is never silently interpolated, so instead:
  the spacing is measured, recorded in the artefact's provenance, stated on the surface, and
  refused when it exceeds a **declared** maximum (`truth.period.maxInstantGapHours`, 12 h),
  naming the instants. A genuinely missing day still fails the build.

- **T034, the observation format.** FR-009 describes a binary layout. Argo profiles are
  ragged, and a ragged binary layout is a parser, which the same requirement forbids. Fields
  use the container; observations use JSON with a documented schema. Both are loadable
  without a parsing library.

Two figures worth recording because later beats will lean on them:

- The domain contrast is **55.7x** in sea-surface height variance (0.4317 m against 0.0579 m
  standard deviation), against a declared minimum of 4. The bland domain is genuinely bland.
- The Argo record is **25 profiles over 14 days** in the Gulf Stream box and 13 in the open
  gyre, of which 3 976 and 1 504 levels respectively carry a flag the analysis will not treat
  as usable. That sparsity is a fact about the ocean, not a shortfall to engineer around.
