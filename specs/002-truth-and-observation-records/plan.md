# Implementation Plan: Truth and Observation Records

**Feature**: `002-truth-and-observation-records` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-05 | **Depends on**: beat 001 (the truth-source port)
**ADRs landed first**: [0004](../../docs/adr/0004-truth-source.md) (the truth source),
[0008](../../docs/adr/0008-climatology.md) (climatology)

## Summary

Two committed datasets that everything later samples and scores against, produced by two
Python scripts and held honest by a gate that regenerates them.

The shape of the beat is decided by one sentence in the constitution: *a record that cannot
be regenerated cannot be trusted*. So the network step and the conversion step are separate
programs, the raw input is committed with its digest, and G-01 re-runs the conversion and
compares byte for byte. The gate then tests the tree, which is what a drift gate is for. A
gate that re-fetched from a server would be testing the server.

## Technical Context

| | |
|---|---|
| **Build-step runtime** | Python 3.11 with `numpy`, `netCDF4` and `requests`, pinned in `data/scripts/requirements.txt`. Never imported or spawned by the application. |
| **Truth source** | HYCOM GOFS 3.1 GLBv0.08 expt_53.X reanalysis, 1/12°, 41 layers, three-hourly, 1994-01-01 to 2015-12-30, served from `tds.hycom.org` without registration |
| **Observations** | Argo core profiles from the Ifremer mirror, filtered through the global profile index |
| **Period** | 2013-09-01T00:00:00Z to 2013-09-15T00:00:00Z, sampled six-hourly: 56 instants |
| **Depth levels** | 0, 50, 100, 200, 400, 700 m — exact HYCOM levels, so the build step does no vertical interpolation |
| **Domains** | Gulf Stream front (-75..-70 E, 34..39 N) and open gyre (-45..-40 E, 25..30 N), five degrees square, 64 x 64 native cells |

### Two deviations from the spec, both measured rather than assumed

**1. The subset is taken with the NetCDF Subset Service, not with the DAP protocol.**
FR-002 says "over OPeNDAP ... so the subset is taken server-side". Both services are
THREDDS services and both take the subset server-side, which is what the requirement is
for; the difference is measured:

| Route | What it costs |
|---|---|
| DAP (`dodsC`), via `xarray` or `netCDF4` | The client must read the metadata of a 2884 x 40 x 3251 x 4500 aggregation before it can slice. Timed out at 120 s without returning, twice. |
| NCSS (`ncss`), one URL carrying box, period, level and stride | 273 KB for sea-surface elevation and 333 KB per temperature level, in 13 to 15 seconds, returned as compressed NetCDF-4. |

The requirement's intent — no whole-globe download, the server does the subsetting — is met
more completely by the route that works. The spec sentence is a claim about the tree and the
tree wins (PR-05); ADR-0004 records the decision and the measurement.

**2. Observations are committed as JSON, not as the binary container.** FR-009 describes a
binary layout for fields. Argo profiles are ragged — different floats report different
numbers of levels — and a ragged binary layout is a parser, which the same requirement says
the format must not need. Fields (truth, climatology) use the binary container; observations
use JSON with a documented schema. Both are loadable without a parsing library, which is
what the requirement is protecting.

### The committed field container

One file per domain, self-describing, little-endian, readable with `DataView`,
`TextDecoder` and a typed array:

```text
bytes 0..7      magic, ASCII "JOCEAN01"
bytes 8..11     uint32 little-endian: the header length in bytes
bytes 12..      the header, UTF-8 JSON, exactly that many bytes
                zero padding to the next multiple of 4
then            the payload: each variable in the order the header declares,
                at the byte offset the header declares
```

The header names the domain, the provenance, the coordinate arrays (time in milliseconds
since the Unix epoch, depth in metres, latitude and longitude in degrees), the native
resolution, and for each variable its dimensions, shape, dtype, scale factor, offset and
fill value.

**The payload is `int16` with a declared scale and offset, which is exactly how HYCOM stores
it.** Converting to `float32` would double the size in order to invent precision the source
does not have. The reader multiplies and adds; the fill value marks land and becomes `NaN`.

| Artefact | Size |
|---|---|
| Raw NetCDF, both domains | about 4.6 MB |
| Committed truth artefacts, both domains | about 6.4 MB |
| Committed climatology and observations | well under 1 MB |

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **I. Seeded streams, no wall-clock** | Yes | The build step is not operational code, but it takes no entropy and no host time into an artefact: every artefact is a function of its inputs. G-04 covers `src/`; the convert step's determinism is covered by G-01, which is the stronger check. |
| **II. Truth only through an instrument** | Prepared | The truth-source port gets its real implementation here. No `Observation` exists yet and nothing consumes truth; G-02 lands with the instruments in beat 004. Climatology is admitted as the one truth-derived quantity the analysis may consume directly, and ADR-0008 records what that costs. |
| **III. Model knows nothing about display** | Yes | `src/truth/` (see below) imports the truth-source port and the container reader. No rendering module, and the artefact loads identically in Node and in the browser. |
| **V. No figure without its provenance** | Yes | Every artefact carries a provenance record: source, request, digest, window. The climatology's provenance names its overlap in days with the run period, which beat 006 turns into an on-screen caveat. |
| **VI. The harness can lose** | Yes | The domain-contrast test prints both variance figures rather than asserting silently, so a bland domain that turns out not to be bland is visible rather than hidden by a passing test. |
| **IX. Derived artefacts, not fixtures** | Centrally | Two scripts, named inputs and outputs, digest-verified raw, G-01 regenerating and comparing. Python is the one permitted second runtime and is a build step. |
| **X. Declared in configuration** | Yes | Box, period, levels, stride, the variance factor and the climatology window are all declared. The schema enforces FR-011's period arithmetic rather than trusting it. |

**Result: PASS**, with one Complexity Tracking entry.

## Complexity Tracking

| What | Why it is necessary | The simpler alternative, and why it was rejected |
|---|---|---|
| About 4.6 MB of raw NetCDF committed to the repository | G-01 must regenerate every artefact from a verified input, on a fresh checkout, in CI, with no network and no credentials | Caching the raw subset outside the tree with only its digest committed. Rejected because it makes the drift gate depend on a server that has no obligation to this project, and a gate that cannot run is a gate that is not trusted. Revisitable: `convert.py` already takes a path. |

## Project Structure

```text
config/j-ocean.json           # domains gain box, period, levels, stride, climatology window
data/scripts/
  requirements.txt            # pinned; installed by CI for G-01 alone
  fetch.py                    # the only thing in the project that touches the network
  convert.py                  # pure: raw in, artefact out, digest verified first
  jocean_format.py            # the container writer, shared by convert and the gate
  README.md                   # how to re-run it, and what each file is
data/raw/                     # committed: the NetCDF subsets, the Argo profiles, digests.json
data/truth/<domain>.jocean    # committed: the field container
data/clim/<domain>.jocean     # committed: the climatology, with overlap in its provenance
data/obs/<domain>.json        # committed: Argo profiles with every flag carried through
src/truth/
  container.ts                # the container reader: DataView, TextDecoder, typed arrays
  artefact-truth-source.ts    # the TruthSource port over a committed container
  observations.ts             # the observation record reader (flags included)
scripts/gates/check-artefact-drift.ts   # G-01
tests/truth/                  # container round-trip, port sampling, flags, domain contrast
```

`src/truth/` is a new directory under `src/`, below the model in the dependency direction:
it implements a port and imports nothing but that port and the container reader. It is not
`src/model/` because the model must not know where truth comes from, and it is not
`src/instruments/` because beat 004 owns that and Principle II makes it the only consumer.

## Phasing

1. **The container**, in Python and in TypeScript, with a round-trip test. Everything else
   is downstream of the two agreeing.
2. **Configuration**: the domains gain their boxes, period, levels and climatology window,
   and the schema gains FR-011's arithmetic.
3. **fetch.py**, run once by a person, writing `data/raw/` and `digests.json`.
4. **convert.py**, pure, writing the truth, climatology and observation artefacts.
5. **G-01**, watched failing on a planted byte (PR-04).
6. **The port over the committed format**, with its contract test from beat 001 and the
   sampling tests of User Story 5.
7. **The domain contrast test**, printing both figures.

## Risks

1. **The chosen fortnight is not eventful enough.** Mitigated by the variance test, which
   prints both figures rather than only asserting; the probe already measured a
   sea-surface-height standard deviation of 0.43 m in the Gulf Stream box, which is a front.
2. **Argo density in a five-degree box over a fortnight is low** — single figures, not
   dozens. This is not a defect to engineer around: it is the fact the harness exists to
   teach, and beat 008 draws it. The simulated instruments of beat 004 provide the rest.
3. **A profile straddles the box over its drift.** Included on its reported position, and
   the position is recorded as reported.
4. **The upstream changes a value.** That is what the digest is for: `convert.py` refuses,
   names both digests, and the failure is attributed to the upstream rather than guessed at.

## Acceptance

- `pnpm gates` runs G-01 and it passes; a planted byte makes it fail, naming the artefact and
  the first differing offset.
- Every Argo flag in the raw profiles is present in the committed record, counted and
  compared.
- The Gulf Stream domain's sea-surface-height variance exceeds the open gyre's by the
  declared factor, with both figures printed.
- The truth-source port passes the beat 001 contract suite over the committed container.
