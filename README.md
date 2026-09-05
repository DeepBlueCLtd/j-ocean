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

Beats **001** through **007** have landed: the four ports and their contract tests, seeded
streams, the run manifest and its byte-identical replay, the committed HYCOM and Argo
records with the drift gate over them, the one-and-a-half layer reduced-gravity model, the
simulated instruments that are the only way truth reaches it, optimal interpolation with the
attribution that is its own gain, skill against two references with provenance on every
figure, the horizon row that is the primary surface, and the observation footprint drawn over it.
**All seven gates now run**, each watched failing against a planted violation.

Two things the tree reports rather than hides: the model is **worse than climatology at
every horizon**, for a reason beat 006's note traces to two declared numbers that disagree;
and the attribution the row draws is **one analysis shown on six panels**, until beat 009
cycles the forecast. Beat 009, the shore forecast, is next.

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
| `pnpm site` | the documentation site, into `dist-site/` |
| `pnpm screenshots` | the documentation site's figures, captured from the real application |

The shell test needs a Chromium. `pnpm exec playwright install chromium` fetches one; on a
machine that already has one, set `J_OCEAN_CHROMIUM` to its executable instead.

Gate G-01 regenerates the committed data artefacts, so it needs the build step's Python:

```sh
python3 -m pip install -r data/scripts/requirements.txt
```

A machine without it sees G-01 **fail**, not skip, because a skipped gate is not a passed
gate. Set `J_OCEAN_PYTHON` if the interpreter is not `python3`. See
[`data/scripts/README.md`](data/scripts/README.md) for the pipeline itself.

## Published

Every push to `main` publishes to the `gh-pages` branch:

| Path | What is there |
|---|---|
| `/` | The [documentation site](https://deepbluecltd.github.io/j-ocean/): overview, architecture, data model, glossary, and one engineering note per beat |
| `/app/` | The application, built from `main` |
| `/pr-preview/pr-N/` | A static instance of the application for each open pull request, linked from the pull request itself |

The site's figures are captured from the real application by `pnpm screenshots`, so a
screenshot cannot show something the shell does not do.

## The gates

`pnpm gates` runs the gates that have landed and names the ones that have not, because a
gate that is absent because its beat has not happened is a known hole with a date on it,
while a gate that is present but did not run is a hole that looks like a pass.

| Gate | Holds | Landed |
|---|---|---|
| G-01 | artefacts regenerate identically | **002** |
| G-02 | truth reaches the analysis only through an instrument | **004** (behavioural half: 005) |
| G-03 | the model imports no rendering module | **001** |
| G-04 | no host clock, no unseeded randomness | **001** |
| G-05 | every declared horizon rendered, and no other | **007** (in a real browser) |
| G-06 | attribution read from the analysis own weights | **005** |
| vocabulary | no tracked entities, no customer material | **001** |

Each gate has a directory of planted violations under
[`scripts/gates/fixtures/`](scripts/gates/fixtures/), and
[`tests/gates/gates.test.ts`](tests/gates/gates.test.ts) runs every gate against its
fixture and requires it to fail. A check that has never been seen to fail is worth nothing
(PR-04).

## Layout

```text
config/            declared values, validated at startup (Principle X)
data/scripts/      the build step: fetch (network) and convert (pure), and nothing else
data/raw/          the committed raw subsets and their digests
data/truth,clim,obs/  the committed derived artefacts, held honest by gate G-01
src/config/        the one loader, the schema, the configuration digest
src/ports/         the four ports and nothing else (Principle VIII)
src/model/         kernel, grid, state; imports nothing above it (Principle III)
src/truth/         the truth-source port over the committed artefacts
src/instruments/   the only place a truth value becomes an observation (Principle II)
src/analysis/      optimal interpolation, and the attribution that is its own gain
src/run/           seeds, the manifest, the run that owns the clock (Principle I)
src/harness/       the React shell, and the two bounded host-time exemptions
scripts/gates/     the gates, their word list and their planted violations
tests/             headless, contract, gate and shell tests
```
