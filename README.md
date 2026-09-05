# j-ocean

A browser-resident ocean forecast model and the harness that teaches with it. Not an
operational forecast system: its numerics are real but reduced, its domain small, and its
claims are about relative skill between references it computes itself.

- **Requirements:** [`j-ocean-srd.md`](j-ocean-srd.md)
- **Constitution:** [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
- **Development plan:** [`docs/development-plan.md`](docs/development-plan.md)
- **SRD review:** [`docs/srd-review.md`](docs/srd-review.md)
- **Feature specs:** [`specs/`](specs/), one directory per beat, in the order the plan
  names

Feature development follows [spec-kit](https://github.com/github/spec-kit):
constitution → specify → plan → tasks → analyze → implement.
