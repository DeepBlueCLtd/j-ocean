# Feature Specification: Manifest Export and Replay

**Feature Branch**: `011-manifest-replay`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Manifest export and import: a run, counterfactual state included, replays from its manifest"

**SRD coverage**: FR-08, NFR-02, AT-04

## Why this beat exists

Nothing persists between visits; the manifest is the only thing that leaves the browser
and the only thing that comes back. This beat gives a reader export and import of a run —
seed, configuration digest, issue time, every counterfactual edit — and proves that what
comes back is byte-identical to what left, counterfactual state included.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export a run, edits included (Priority: P1)

A reader who has made edits exports the run. They receive a JSON manifest containing
everything needed to reproduce the run and nothing else: no fields, no scores, no
observations — those are derived.

**Why this priority**: AT-04 in full: "a run reproduces from its exported manifest, the
counterfactual state included."

**Independent Test**: The exported manifest validates against its schema, contains the
edit list, and contains no field data.

**Acceptance Scenarios**:

1. **Given** a run with edits, **When** exported, **Then** a manifest is produced with
   root seed, derived seeds, generator version, code version, configuration digest,
   domain, issue time, quality-control state, and the ordered edit list.
2. **Given** the manifest, **When** its size is inspected, **Then** it contains no field,
   score or observation data, and a schema test rejects any manifest that does.
3. **Given** the recorded case with no edits, **When** exported, **Then** the manifest
   states it is the recorded case.

---

### User Story 2 - Import a manifest and get the same run (Priority: P1)

A reader imports a manifest, in a fresh visit, on another machine. The run that results
has byte-identical fields, attribution, scores and observations to the one exported,
including every edit, and the status reads exactly as it did.

**Why this priority**: The replay half of AT-04 in the shell rather than only headlessly
(feature 001).

**Independent Test**: A Playwright test exports from one browser context, imports in a
fresh context, and compares serialised results byte for byte.

**Acceptance Scenarios**:

1. **Given** a manifest, **When** imported, **Then** configuration digest and code version
   are checked before any run is provisioned.
2. **Given** a matching manifest, **When** the run is provisioned, **Then** every result
   is byte-identical to the exporting run's, and the status shows the same edit list.
3. **Given** the manifest contains a track edit, **When** replayed, **Then** the
   instruments resample truth at the edited positions with the same named streams and
   produce the same observations.

---

### User Story 3 - A mismatch says so (Priority: P2)

A manifest from a different code version, or against a different configuration digest,
is refused with a message naming both versions or digests, and no run is provisioned.

**Why this priority**: A replay that silently differs is worse than none; the constitution
says a run replays byte-identically for the same code version, and the harness must say
when that condition is not met.

**Independent Test**: A manifest with an altered code version is refused with both
versions named; one with an altered digest is refused with both digests.

**Acceptance Scenarios**:

1. **Given** a code-version mismatch, **When** imported, **Then** the message names both
   and offers to attempt the replay with a warning that identity is not guaranteed.
2. **Given** a configuration-digest mismatch, **When** imported, **Then** the import is
   refused outright, because the declared values differ.
3. **Given** a malformed manifest, **When** imported, **Then** schema validation reports
   the field at fault.

---

### Edge Cases

- The manifest names a domain not present in this build: refused, naming the domain.
- A manifest is imported over an edited run: the reader is asked whether to discard the
  current edits (the one confirmation dialogue this harness has), and export is offered
  first.
- The manifest is pasted rather than uploaded: both paths are accepted, since the site is
  static and a file picker is a convenience.
- Two imports of the same manifest in one visit: identical results both times, and the
  second says the run is already loaded.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Export MUST produce a JSON manifest validating against a committed schema
  and containing root seed, derived seeds, generator version, code version,
  configuration digest, domain, issue time, quality-control state, instrument biases, and
  the ordered edit list (FR-08, AT-04).
- **FR-002**: The manifest MUST NOT contain fields, scores or observations; the schema
  MUST reject any that does.
- **FR-003**: Import MUST validate schema, code version and configuration digest before
  provisioning a run.
- **FR-004**: A run provisioned from a manifest MUST produce byte-identical fields,
  attribution, scores and observations to the exporting run for the same code version,
  and this MUST be a Playwright test across two browser contexts (AT-04).
- **FR-005**: A code-version mismatch MUST be reported naming both and MAY proceed with a
  warning; a configuration-digest mismatch MUST refuse (constitution I).
- **FR-006**: Nothing MUST persist between visits: no local storage, no cookie, no URL
  state carrying a run (NFR-02).
- **FR-007**: Export MUST be offered before an import would discard edits.

### Key Entities

- **Manifest** (extends feature 001's RunManifest): the complete, field-free description
  of a run.
- **ManifestSchema**: committed JSON schema; the single definition.
- **ImportResult**: provisioned run, or refusal with reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Export-then-import across two browser contexts yields byte-identical
  serialised results, including with every edit type present.
- **SC-002**: A manifest with any field data is rejected by the schema test.
- **SC-003**: Version and digest mismatches are reported with both values named.
- **SC-004**: A Playwright test confirms no storage API is written during a visit.

## Assumptions

- The code version is the build's git commit, injected at build time; "same code version"
  is exact equality.
- Manifests are small enough to paste; a file picker is offered as a convenience.
