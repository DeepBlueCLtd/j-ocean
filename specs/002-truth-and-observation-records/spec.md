# Feature Specification: Truth and Observation Records

**Feature Branch**: `002-truth-and-observation-records`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Truth and observation records: HYCOM subset and Argo profiles as gated derived artefacts, two domains"

**SRD coverage**: FR-09, FR-10, FR-11, NFR-01, NFR-03 (build-step runtime), G-01, §11 (climatology)

## Why this beat exists

The harness's claims are worth what its truth record is worth. This beat produces the two
committed datasets everything else samples and scores against, as derived artefacts with a
drift gate, and declares the two domains — one with genuine mesoscale structure and one
deliberately bland — that FR-11 requires as a contrast.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The truth artefact regenerates identically (Priority: P1)

A maintainer runs the conversion step against the checksummed raw HYCOM subset and
obtains the committed truth artefact byte for byte. When they plant a one-value change in
the committed artefact, gate G-01 fails and names the artefact.

**Why this priority**: G-01 is what makes the truth a derived output rather than a
fixture (FR-09). Without it every later score is scored against a file someone once
saved.

**Independent Test**: Run `pnpm gates:drift` on a clean checkout (passes); modify one byte
of `data/truth/gulf-stream.bin`; run again (fails, names the file); restore; passes.

**Acceptance Scenarios**:

1. **Given** the raw subset is present and its digest matches the recorded digest, **When**
   the convert step runs, **Then** it writes the truth artefact and the artefact matches
   the committed one byte for byte.
2. **Given** the raw subset's digest does not match the recorded digest, **When** the
   convert step runs, **Then** it fails with "upstream changed", names both digests, and
   does not write an artefact, so the failure is attributed to the upstream and not the
   tree.
3. **Given** a committed artefact differing from the regenerated one, **When** G-01 runs,
   **Then** it fails and names the artefact and the first differing offset.
4. **Given** the fetch step is run against the OPeNDAP server, **When** the request
   completes, **Then** the subset is taken server-side (the request carries the domain,
   period and depth constraints) and the raw file is written with its digest recorded
   beside it.

---

### User Story 2 - Argo profiles arrive with their flags (Priority: P1)

A maintainer runs the Argo step. It filters the global profile index by the domain box
and period before downloading anything, downloads only the matching profiles from the
Ifremer mirror, and converts them to the committed format with every Argo quality flag
carried through.

**Why this priority**: FR-10, and FR-24's promise to draw flagged observations as flagged
depends on the flags surviving conversion.

**Independent Test**: A converted profile with a known flagged level shows the flag in the
committed format; the count of profiles equals the count of index rows inside the box and
period.

**Acceptance Scenarios**:

1. **Given** the global index, **When** the filter runs, **Then** it selects rows inside
   the declared box and period and downloads those files only.
2. **Given** a profile whose temperature at one level carries Argo flag 4 (bad), **When**
   it is converted, **Then** the committed record carries flag 4 at that level, and the
   level's value is retained.
3. **Given** the observation artefact, **When** G-01 runs, **Then** it regenerates it from
   the checksummed raw profiles and fails on any difference, as for truth.

---

### User Story 3 - Two domains, declared (Priority: P2)

A reader chooses between the Gulf Stream domain and the bland open-gyre domain. Each is
declared in configuration with its box, its period, its truth resolution and its grid,
and each has its own gated truth and observation artefacts.

**Why this priority**: FR-11 makes the contrast a requirement, not a bonus. Adaptive
sampling in a uniform ocean demonstrates an artefact of configuration.

**Independent Test**: Load each domain's artefact and compute the standard deviation of
the sea-surface height field; the Gulf Stream domain's exceeds the bland domain's by a
declared factor.

**Acceptance Scenarios**:

1. **Given** the domain configuration, **When** the fetch step runs for each domain,
   **Then** each produces its own raw subset, digest, and artefacts.
2. **Given** both artefacts, **When** their sea-surface height variance is compared,
   **Then** the Gulf Stream domain's exceeds the bland domain's by at least the factor
   declared in configuration, and the test states the two figures.
3. **Given** a domain declares a five-degree box at 100 × 100, **When** the truth
   artefact's native resolution is compared to the model grid, **Then** the artefact
   records its native resolution, and the configuration records the truth-to-model
   resolution ratio (review R-2).

---

### User Story 4 - Climatology with its provenance (Priority: P2)

The build step computes a climatology field for each domain — the mean over a declared
window — and records what it was computed from and over what window, so that its
independence from the truth window it will later score against is visible.

**Why this priority**: Climatology is a scoring reference (FR-20) and an analysis source
(FR-16), and §11 asks whether computing it from the same subset costs independence. The
answer is recorded, not hidden (constitution II).

**Independent Test**: The climatology artefact carries a provenance record naming source,
window start, window end and the overlap in days with the run period.

**Acceptance Scenarios**:

1. **Given** a declared climatology window, **When** the build step runs, **Then** it
   writes a climatology field and a provenance record.
2. **Given** the run period overlaps the climatology window, **When** the provenance is
   inspected, **Then** the overlap is stated in days and is available to feature 006 for
   its caveat.

---

### User Story 5 - The truth-source port over the committed format (Priority: P3)

A developer asks the truth-source port for the truth field at a position, depth and
instant, and receives an interpolated value together with the native resolution the
value was interpolated from.

**Why this priority**: The port exists from feature 001; this is its real implementation.
Instruments (004) and scoring (006) both consume it.

**Independent Test**: Sampling at a grid node and instant present in the artefact returns
the stored value exactly; sampling between nodes returns the declared interpolation.

**Acceptance Scenarios**:

1. **Given** a committed artefact, **When** the port loads it in the browser, **Then** the
   load is from a static asset and no network request other than the asset itself occurs.
2. **Given** a query between stored instants, **When** the port answers, **Then** the
   answer is a declared interpolation (linear in time, bilinear in space, linear in depth)
   and the port exposes the native resolution alongside.

---

### Edge Cases

- The OPeNDAP server is unreachable: the fetch step fails with a network error and writes
  nothing; G-01 is unaffected because it runs from the raw subset, not from the server.
- An Argo profile straddles the box boundary over its drift: it is included if its
  reported position is inside the box; the position is recorded as reported.
- The declared period contains a gap in the HYCOM record: the fetch step fails and names
  the missing instants; a gap is never silently interpolated at build time.
- Two profiles share a position and instant: both are kept; de-duplication is the
  analysis's business, not the record's.
- The raw subset is larger than the repository is willing to carry: the raw subset is
  cached outside the tree with its digest committed; the plan decides which, and G-01 in
  CI must be able to obtain it either way.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The data pipeline MUST be exactly two Python scripts under `data/scripts/` —
  a fetch step (network) and a convert step (no network) — each naming its inputs and
  outputs on invocation (NFR-03, review R-5).
- **FR-002**: The fetch step MUST obtain the HYCOM subset over OPeNDAP with the domain,
  period and depth constraints in the request so the subset is taken server-side, and
  MUST write a digest beside the raw file (FR-09).
- **FR-003**: The convert step MUST refuse to run when the raw digest does not match the
  recorded digest, reporting "upstream changed" with both digests.
- **FR-004**: Gate G-01 MUST regenerate every committed artefact from the digest-verified
  raw inputs and fail on any byte difference, naming the artefact and first differing
  offset (G-01).
- **FR-005**: The Argo step MUST filter the global profile index by box and period before
  any download, MUST download from the open Ifremer mirror, and MUST carry every Argo
  quality flag through conversion at every level (FR-10).
- **FR-006**: Two domains MUST be declared in configuration — Gulf Stream front and bland
  open gyre — each with box, period, native truth resolution, model grid and the
  truth-to-model resolution ratio (FR-11, review R-2).
- **FR-007**: A test MUST assert the Gulf Stream domain's sea-surface height variance
  exceeds the bland domain's by a declared factor, and MUST print both figures.
- **FR-008**: The build step MUST compute a climatology per domain over a declared window
  and MUST record source, window and overlap-in-days with the run period (§11).
- **FR-009**: The committed format MUST be a documented binary layout (typed-array
  friendly, little-endian, with a JSON header naming dimensions, units, native resolution
  and provenance), loadable without a parsing library.
- **FR-010**: The truth-source port implementation MUST expose sampling at (position,
  depth, instant) with declared interpolation and MUST expose the native resolution.
- **FR-011**: The declared period MUST be long enough to cover spin-up, the full
  issue-time range of feature 009, and the 96 h horizon from the latest issue time; the
  configuration schema MUST enforce this arithmetic (review R-6).
- **FR-012**: No file under `data/truth/` or `data/obs/` MAY be edited by hand; a
  commit touching them without a corresponding convert-step run fails G-01 by
  construction.

### Key Entities

- **RawSubset**: the NetCDF file from HYCOM, or the set of Argo NetCDF profiles, with a
  recorded digest. Input to convert; never read by the application.
- **TruthArtefact**: the committed 4-D field (x, y, z, t) in the harness's format with
  header, per domain.
- **ObservationArtefact**: the committed Argo profiles with positions, instants, levels,
  values and flags, per domain.
- **ClimatologyArtefact**: a committed 3-D field (x, y, z) with a provenance record.
- **Domain**: a declared configuration: box, period, native resolution, grid, ratio.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: G-01 passes on a clean checkout and fails within one run on a single planted
  byte change in any committed artefact.
- **SC-002**: Every Argo flag present in the raw profiles is present in the committed
  record; a test counts flagged levels in both and asserts equality.
- **SC-003**: The Gulf Stream domain's sea-surface height variance exceeds the bland
  domain's by the declared factor, and the figures are printed by the test.
- **SC-004**: The application's built assets include the committed artefacts and load
  with zero requests beyond the static assets.
- **SC-005**: The convert step is reproducible on two machines: same raw digest in, same
  artefact digest out.

## Assumptions

- **R-5 resolved**: fetch and convert are separate; the gate regenerates from the
  digest-verified raw subset; a digest mismatch is reported as an upstream change.
- **R-2 resolved**: the native HYCOM resolution (1/12°) is coarser than the 100 × 100
  model grid on a five-degree box; the artefact records native resolution and feature 006
  declines to score below it. The SRD §4 note is to be corrected by its author.
- **R-6 recommendation**: use the HYCOM GLBv0.08 reanalysis (expt 53.X) for a period
  between 1994 and 2015 chosen for Argo coverage (post-2005) and a well-developed meander,
  of at least fourteen days: seven for spin-up and issue-time range, seven for horizons.
  The author chooses the dates; the schema enforces the arithmetic.
- Python 3.11 with `xarray`, `netCDF4` and `numpy` is the build-step runtime, pinned in
  `data/scripts/requirements.txt`, and CI installs it for G-01 only.
- The bland domain is an open-gyre box in the subtropical North Atlantic away from the
  Gulf Stream and its recirculation, at the same size and grid, so that the only
  difference is the ocean.
