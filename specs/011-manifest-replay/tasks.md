# Tasks: Manifest Export and Replay

**Feature**: `011-manifest-replay` | **Plan**: [`plan.md`](./plan.md)

- [X] **T010** A strict zod schema is the one definition of a manifest, and `parseManifest`
      validates against it. Format version 4.
- [X] **T011** `codeVersion` (the build's commit, injected by the bundler) and `domainId` join
      what a manifest records.
- [X] **T012** `schemas/run-manifest.schema.json`, generated from that definition by
      `pnpm manifest-schema`, with a test that regenerates and compares.
- [X] **T013** The domain refusal, and `codeVersionWarning` — a sentence rather than a throw.
- [X] **T020** Export: the manifest on the surface, a download, and the build's commit beside it.
- [X] **T021** Import: paste or file, the four checks in order, and the one confirmation
      dialogue when edits would be discarded.
- [X] **T022** The results digest — the run's fields and its analysis — so "the same run" is
      something a reader can check by looking at two tabs.
- [X] **T030** The analysis background is taken before anything advances the state. See finding
      1; this is the defect replay found.
- [X] **T031** G-05 no longer reuses a preview server it did not start. See finding 2.
- [X] **T040** Shell tests: export and replay across two browser contexts; the digest, domain
      and schema refusals; the code-version warning; and a whole visit that writes nothing to
      storage.
- [X] **T050** The engineering note and the docs site.
- [X] **T060** `pnpm check` green: 241 tests, seven gates.

---

## What landed, against what the plan said

- **Replay found a real defect**: the shell's analysis depended on when it was computed, so a
  replayed run produced a different analysis from the one it exported. Nothing else in the suite
  could have found it.
- **A gate could have been lying**: G-05 was allowed to reuse a preview server serving a stale
  build, and did so once during this beat.
- **Nothing persists, and now that is measured** rather than asserted: the storage APIs are
  replaced before load and any write is recorded.
