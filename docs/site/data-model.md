---
title: Data model
summary: The types that cross the boundaries between the rings, and what each of them promises.
order: 3
---

# Data model

Every type here crosses a boundary between rings. Types internal to one module are not
listed: they are that module's business and may change without anybody being told.

## Configuration

Loaded by one module, validated against a schema before any computation, and digested into
every run manifest. Every number the requirements call <span class="declared">declared</span>
lives here, and no component in the tree holds a literal for one.

| Field | Meaning |
|---|---|
| `schemaVersion` | The shape of this file. A version this code does not know is a startup failure. |
| `run.defaultSeed` | Sixteen hex characters. The recorded case: the run a reader gets who does not ask for another. |
| `run.recordedCaseLabel` | What the surface calls that run. |
| `clock.epoch` | The instant step zero is valid for. |
| `clock.timestepSeconds` | The stated timestep. |
| `clock.stabilityCriterionCfl` | The stated stability criterion the kernel must satisfy. |
| `grid.nx`, `grid.ny`, `grid.cellSizeMetres` | The grid, configurable and starting at 100 x 100. |
| `horizons.leadHours` | Strictly increasing. Every one is rendered; no panel is drawn for anything else. |
| `budget.frameBudgetMs` | The frame budget, a number rather than a judgement made at review time. |
| `domains.list[]` | Extents in degrees, and a declared `character` of `eventful` or `bland`. |

The **configuration digest** is a SHA-256 over a canonical serialisation: object keys in
code-unit order, no insignificant whitespace, arrays in their own order. Reformatting the
file does not change it; changing any value always does. It is computed in pure TypeScript
so that the browser and Node agree, which they must, because a manifest exported from one
is imported by the other.

## RunManifest

Everything needed to rebuild a run, and none of its state.

| Field | Meaning |
|---|---|
| `formatVersion` | The manifest shape. A version this code cannot read is refused, naming both. |
| `generatorVersion` | The RNG family and parameters. A mismatch is refused: the same seed would not mean the same numbers. |
| `kernelId` | The kernel that ran. A mismatch is refused: the same seed would not mean the same fields. |
| `rootSeed` | Sixteen hex characters. |
| `derivedSeeds` | Every named stream the run asked for, with the seed derived for it. |
| `clock` | The epoch and timestep the run used. |
| `configDigest` | The digest above. A mismatch is refused, naming both digests. |
| `steps` | How far the run had got. |
| `recordedCase` | False once a reader has asked for a new run. |
| `counterfactual` | The reader's edits. Empty until the counterfactuals beat; present from the first beat so the shape never changes. |

**Replay is re-computation, not the restoration of a snapshot.** That is why the manifest
holds no state: a snapshot compared with itself would prove nothing, whereas a rebuilt run
compared byte for byte proves the property the whole system rests on.

Every refusal happens before anything is constructed, so a refused load leaves no run
behind.

## Ports

### `RandomStream`

`name`, `seed`, and `nextU32` / `nextFloat` / `nextGaussian`. Constructed, never looked up:
`stream(name)` twice returns two streams that both start at the beginning.

### `SimulationClock` and `ClockControl`

`SimulationClock` is what every consumer sees — `epochMs`, `timestepSeconds`, `step`,
`instantMs()`, `instantIso()` — and it has no method that moves it. `ClockControl`, which
carries `advance`, is held by the run and handed to nobody. That "no consumer can advance
the clock" is a fact about the types, not a convention to be remembered.

### `ModelState` and `StepContext`

`ModelState` is a `GridSpec` and a record of named `Float64Array` fields: typed arrays,
never arrays of objects. `StepContext` is the step index, the instant, the timestep and one
stream — everything a kernel is permitted to know about, and nothing else.

### `TruthSource`

`sample(query)` for a variable at a position, depth and instant; `coverage()` for the box
and window it covers; and `nativeResolutionDegrees`, recorded from the artefact rather than
inferred, because scoring refuses to make claims below it and a refusal cannot rest on a
number the code guessed.

## The committed field container

One file per field artefact — a domain's truth record, a domain's climatology. Deliberately
small enough to read with `DataView`, `TextDecoder` and a typed array, because an artefact
format that needs a parser is one a reader cannot check by hand.

```text
bytes 0..7      magic, ASCII "JOCEAN01"
bytes 8..11     uint32 little-endian: the header length in bytes
bytes 12..      the header, UTF-8 JSON, exactly that many bytes
                zero padding to the next multiple of 4
then            the payload: each variable at the byte offset the header declares
```

The header carries:

| Field | Meaning |
|---|---|
| `kind` | `truth` or `climatology` |
| `domain` | Which declared domain this is |
| `nativeResolutionDegrees` | The source's own resolution, recorded from the artefact and never inferred |
| `coordinates` | `timeMs` (absent for a climatology), `depthMetres`, `latDegrees`, `lonDegrees` |
| `variables[]` | Per variable: `dims`, `shape`, `dtype`, `scaleFactor`, `addOffset`, `fillValue`, `byteOffset`, `byteLength` |
| `provenance` | Source, service, every raw input with its digest and URL, and the window |

**The payload is `int16` with a declared scale and offset**, which is exactly how the source
product stores these fields. Widening to `float32` would double the artefact in order to
invent precision the source does not have. Land carries the declared fill value, and the
reader turns it into `NaN` rather than into a plausible number.

### What the truth record's provenance says about itself

Two things are recorded because they would otherwise be assumed:

- **The instants are not evenly spaced.** The reanalysis is missing occasional snapshots, so
  a six-hourly stride lands on a nine-hour step twice in a fortnight. The record carries the
  instants as the source has them, `instantSpacingHours` states which spacings occur, and the
  build refuses any gap larger than the declared maximum, naming the instants. Nothing is
  interpolated at build time.
- **The truth is coarser than the model.** At 1/12° on a five-degree box the record is about
  64 x 64 while the model grid is 100 x 100 — a ratio of 1.6, declared in configuration and
  checked by the schema against the box and the grid. Scoring declines to resolve below the
  truth's own resolution.

## The observation record

Argo profiles, as JSON rather than as the binary container: profiles are ragged, different
floats report different numbers of levels, and a ragged binary layout is a parser.

```jsonc
{
  "format": "j-ocean/observations",
  "domain": "gulf-stream-front",
  "provenance": { "source": "...", "flagNote": "...", "levelsInRaw": 9058, "temperatureFlagCountsInRaw": { "1": 5082, "4": 3976 } },
  "profiles": [
    {
      "platform": "1901584", "cycle": 54,
      "instant": "2013-09-02T...Z",       // as reported; a float drifts through its cycle
      "latDegrees": 36.1, "lonDegrees": -72.4,
      "levels": [ { "pressureDbar": 4.9, "pressureFlag": 1, "temperatureDegC": 26.3, "temperatureFlag": 1 } ]
    }
  ]
}
```

**A quality flag is carried through at every level and is never used to drop one.** A flagged
observation is drawn as flagged, not omitted — a reader who cannot see the flagged ones
cannot see what the analysis chose to ignore. The provenance carries a flag histogram
computed from the raw NetCDF arrays *before* conversion, so a test can count the same thing
from the committed record and compare: two independent computations of one fact.

## The model

### `ModelState`

Three prognostic fields, all `Float64Array` on the declared grid: `thickness` at cell
centres, `velocityU` on the eastern face, `velocityV` on the northern face. That is an
Arakawa C-grid, and the arrangement is the point — it puts the pressure gradient and the
divergence on adjacent points rather than averaged ones, which is what stops a
two-grid-interval checkerboard from being invisible to the scheme.

### `GridSpec`

`nx` and `ny` come from configuration; `cellSizeXMetres` and `cellSizeYMetres` are computed
from the declared domain box and reported as computed. **They differ.** A five-degree box at
36.5 °N is 4 474 m east–west and 5 529 m north–south, so there is no single declared cell
size — declaring one would be declaring something untrue, and the stability limit is set by
the smaller of the two.

### `StabilityAssessment`

| Field | Meaning |
|---|---|
| `gravityWaveSpeedMetresPerSecond` | `sqrt(g'H)`, 3.162 m/s as declared |
| `linearStabilityBoundarySeconds` | Where leapfrog on a C-grid becomes unstable: 549.9 s |
| `largestStableTimestepSeconds` | That boundary times the declared CFL: 275.0 s |
| `declaredTimestepSeconds` | 240 s, which also divides an hour so the hourly diagnosis is exact |
| `viscousNumber` | `A · 2Δt · (4/dx² + 4/dy²)`, stable below a half |

Initialisation fails with all of these figures if either criterion is missed. It has done so
twice.

### `ModelResults`

The published interface. Everything it hands out is a **copy**, so the integration buffers
are not reachable from the harness — a test asserts that writing into a published array
leaves the model unchanged. It carries the sea-surface height, the thickness, the two
velocity components, the sponge weight and its width in cells (the margin scoring must
exclude), the invariants, the outcrop count *and the volume those clamps added*, and the
diagnosed profile at any cell.

### `DiagnosedProfile`

Depth is displayed, never integrated. The profile is a warm upper layer over a cold deep one
joined by a `tanh` transition of declared thickness centred on the layer thickness, evaluated
at the declared display levels.

**A level's kind does not move.** The surface and the deepest declared level are the model's
own two layers and are `computed`; every level between them is `derived`, always, whatever
the interface is doing. A kind that tracked the interface would be a kind a reader could not
learn.

The relation inverts, which is what beat 004's observation operator needs — and the inverse
reports whether it **resolved** anything. A `tanh` saturates: a thermometer at 100 m in an
ocean whose interface is at 700 m reads the upper layer's own temperature and constrains the
interface hardly at all. An observation that constrains nothing must not be allowed to look
as though it did.

## Observations

The only currency the analysis accepts, and the only thing `src/instruments/` produces.

The type is **opaque**: it carries a brand keyed by a symbol that
`src/instruments/observation.ts` declares and never exports, so a module that cannot name the
key cannot construct one. Gate G-02 fails if that symbol's name appears anywhere else.

| Field | Meaning |
|---|---|
| `kind` | `surface`, `profile`, or `interface-depth` |
| `value`, `lonDeg`, `latDeg`, `depthMetres`, `instantMs` | What was measured, and where |
| `error` | Three declared parts, never one opaque figure — see below |
| `flags` | What each declared check found. A flag is carried; it never drops the observation |
| `external` | True for Argo: a real measurement the truth record itself assimilated |
| `streamName` | Which named RNG stream drew this observation's noise |
| `levels` | For a profile: the depth actually **reached**, the depth requested, the value, and per-level flags |
| `bound` | For an unresolved interface: *below 150 m*, say — a fact where a depth would not be |

### `ObservationError`

`instrumentNoiseSd` is what the device does. `representativenessSd` is what a point sample of
the real ocean cannot know about a 1/12-degree six-hourly record. `declaredBias` is what a
broken instrument adds (and it is added *after* noise and *before* the checks, or quality
control could never catch it). `totalSd` is the two random parts in quadrature; a bias is not
a variance and is not in it.

### The observation operator

A temperature profile in, an interface depth out — the same two-layer relation the model
draws a profile from, inverted. Levels are combined by inverse-variance weighting with the
depth error propagated from the temperature error:

    |dh/dT| = 2L / (|T_deep − T_upper| · (1 − f²))

That expression **diverges** as a measurement leaves the thermocline, so a level in the body
of a layer acquires an enormous depth error and weighs almost nothing. That is the reason the
operator was chosen (ADR-0005): the down-weighting happens through the arithmetic rather than
through a rule.

### Flags

`gross-range`, `climatology-departure` (measured in standard deviations of the climatology at
that depth — a scale the artefact can answer for), `vertical-inversion`, `argo-flagged`,
`unresolved`, and `outside-record` (the probe reached somewhere the truth record does not
cover). Each carries a `detail` good enough to draw and a `usable` boolean, so consumers
cannot disagree about what a flag means.

## The analysis

### `AnalysisRecord`

The analysed field, the attribution, which observations were used and which excluded and why,
and enough of the gain to answer a breakdown or an influence query.

### `Attribution`

Three weights per cell — observations, background, climatology — summing to one. It is
**branded** like `Observation`: the symbol lives in `src/analysis/attribution.ts` and is
exported from nowhere, and gate G-06 fails if its name appears elsewhere, or if anything under
`src/harness/` contains a function producing an attribution.

The weights are not estimated. Because `H` selects one cell per observation, `H·1 = 1`, and

    Σ_k (I − K H)_ik + Σ_j K_ij = 1

so the row sum of the gain *is* the observation weight. A test recomputes it independently and
asserts equality; the largest difference is zero.

`clampedCells` counts the cells whose row sum fell outside `[0, 1]` and was clamped and
renormalised. That happens: optimal interpolation with a Gaussian covariance and clustered
observations produces such row sums in the shadows between them. It is published rather than
hidden.

### `CellBreakdown` and `InfluenceRegion`

A row of the gain and a column of it. The breakdown names each contributing observation and
its share, summing to the cell's observation weight. The influence region is one observation's
weight in every cell, and its radius **above a declared threshold**.

> The radius is a property of the declared correlation length scale, not of the ocean. An
> observation across a front influences the far side exactly as much as its own, which the
> flow would not. The surface says so; beat 012's ensemble spread is the flow-dependent
> answer.

### What an observation is worth

Three numbers, and the third is the one that is easy to forget.

| | |
|---|---|
| The instrument's own noise | declared per instrument |
| Representativeness *in the measured quantity* | declared per instrument |
| Representativeness *in the state variable* | `analysis.interfaceRepresentativenessMetres` |

The operator propagates a formal interface-depth error under a metre. That is what the
instrument could not know, and it is a **lower bound** on what the observation is worth to a
4.5 km cell, which differs from a point sounding by tens of metres of mesoscale variability.
Using the formal error as the whole error tells the analysis to trust a measurement more than
it deserves — and it did, until this was declared.

## Scores

### `Figure`

A number that says what kind of number it is: `{ value, kind, unit }`. Scoring emits most of
the figures the surface draws, which is why the kind travels on the figure rather than being
decided where it is rendered — a value that arrived as `computed` cannot be re-typed on its
way to the screen. A test round-trips a whole score through JSON and asserts the kinds survive.

### `Score`

| Field | Meaning |
|---|---|
| `forecastError`, `persistenceError`, `climatologyError` | Root-mean-square difference of interface-depth **anomaly** |
| `skillAgainstPersistence`, `skillAgainstClimatology` | `1 − forecast/reference`; `null` where the reference is perfect |
| `statement` | In the SRD's own words. The surface prints it verbatim |
| `meanOffsets` | What was removed before comparing, published rather than absorbed |
| `provenance` | Below. A score cannot be constructed without one |

**Why anomalies.** A reduced-gravity model has no absolute reference for its free surface: only
departures from a mean carry information, which is why the mean is removed at initialisation.
Scoring uses the same convention or it measures an offset neither field claims to determine —
and it did, to the tune of a hundred metres out of the hundred and forty first reported.

### `ScoreProvenance`

Reference, region label, margin in cells, cells actually scored, the window's two instants, the
metric, the resolution floor **from the truth artefact**, the truth source's id, and the
independence caveat naming any external observation the analysis assimilated in the window.

A score without provenance is an assertion, so the type makes one impossible.

### What the scorer refuses

- A region finer than the truth record's own resolution: *scoring inside it would be scoring
  interpolation, not the ocean.*
- A valid instant outside the record — the refusal beat 009's validity statement rests on.
- A region with nothing left after the margin is removed.
- Division by a perfect reference: `null`, and *persistence is perfect here*.

## The figure kinds

Not a type but a discipline, and the surface enforces it typographically.

<dl class="entries">
<dt><span class="declared">Declared</span></dt>
<dd>A value from configuration. Dotted underline, blue.</dd>
<dt><span class="computed">Computed</span></dt>
<dd>Produced by the model or the analysis. Bold.</dd>
<dt><span class="derived">Derived</span></dt>
<dd>Diagnosed from computed state, such as the depth levels between the model's own. Dashed underline, italic.</dd>
<dt><span class="host-time">Host time</span></dt>
<dd>How long the machinery took. Never simulation time, and never enters a run or a manifest.</dd>
</dl>

A figure does not change kind between states.
