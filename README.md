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

## Where the tree is

Beat **001, foundation and ports**, has landed: the toolchain, the four ports and their
contract tests, seeded streams, the run manifest and its byte-identical replay, the static
shell, and three of the seven gates. There is no ocean in it yet. Beat 002 (truth and
observation records) and beat 003 (the reduced-gravity model) are next and may proceed in
parallel — see the plan.

## Running it

Node 22 and pnpm 10.

```sh
pnpm install
pnpm dev        # the shell, on a dev server
pnpm build      # static assets in dist/; the demo is a URL
pnpm check      # lint, typecheck, tests, gates, build — what CI runs
```

Individually:

| Command | What it does |
|---|---|
| `pnpm lint` | eslint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | vitest: ports, run, replay, headless model, gates |
| `pnpm test:shell` | Playwright against the built static site |
| `pnpm gates` | every gate that has landed, and the name of every one that has not |

The shell test needs a Chromium. `pnpm exec playwright install chromium` fetches one; on a
machine that already has one, set `J_OCEAN_CHROMIUM` to its executable instead.

## The gates

`pnpm gates` runs the gates that have landed and names the ones that have not, because a
gate that is absent because its beat has not happened is a known hole with a date on it,
while a gate that is present but did not run is a hole that looks like a pass.

| Gate | Holds | Landed |
|---|---|---|
| G-01 | artefacts regenerate identically | beat 002 |
| G-02 | truth reaches the analysis only through an instrument | beat 004 |
| G-03 | the model imports no rendering module | **001** |
| G-04 | no host clock, no unseeded randomness | **001** |
| G-05 | every declared horizon rendered, and no other | beat 007 |
| G-06 | attribution read from the analysis own weights | beat 005 |
| vocabulary | no tracked entities, no customer material | **001** |

Each gate has a directory of planted violations under
[`scripts/gates/fixtures/`](scripts/gates/fixtures/), and
[`tests/gates/gates.test.ts`](tests/gates/gates.test.ts) runs every gate against its
fixture and requires it to fail. A check that has never been seen to fail is worth nothing
(PR-04).

## Layout

```text
config/            declared values, validated at startup (Principle X)
src/config/        the one loader, the schema, the configuration digest
src/ports/         the four ports and nothing else (Principle VIII)
src/model/         kernel, grid, state; imports nothing above it (Principle III)
src/run/           seeds, the manifest, the run that owns the clock (Principle I)
src/harness/       the React shell, and the two bounded host-time exemptions
scripts/gates/     the gates, their word list and their planted violations
tests/             headless, contract, gate and shell tests
```
