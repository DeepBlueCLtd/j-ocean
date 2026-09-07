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
| `grid.nx`, `grid.ny` | The grid, configurable and starting at 100 x 100. There is no declared cell size: a five-degree box is not square in kilometres at Gulf Stream latitudes, so `dx` and `dy` are computed from the box and the grid and reported as computed figures. |
| `horizons.leadHours` | Strictly increasing. Every one is rendered; no panel is drawn for anything else. |
| `budget.frameBudgetMs` | The frame budget, a number rather than a judgement made at review time. |
| `presentation.referenceViewportWidthPx` | The window width at which *all six visible at once* is a promise. The schema refuses a value too narrow for the declared horizons; a browser test measures the rendered geometry at it. |
| `presentation.minimumPanelWidthPx` | Below this a panel stops being legible, so the row stops shrinking panels. Neither the row nor the page scrolls: below the declared floor the application says the size it needs and shows one panel at a time. |
| `presentation.minimumViewportWidthPx`, `minimumViewportHeightPx` | The smallest viewport the four regions hold, **measured from the built layout** rather than chosen, and in CSS pixels — so a large window at 200 % zoom is below it and gets the same answer. The schema refuses a floor that cannot hold every declared horizon at the minimum panel width beside the two columns and the gutter, and prints the arithmetic. |
| `presentation.controlsWidthPx`, `presentation.detailWidthPx` | The two flanking columns, fixed rather than fitted: selecting something may not move any region by a pixel (FR-47), and a column sized to its contents moves whenever its contents change. 390 px is two panels and the gap between them, which is what the detail region needs to draw a profile editor whole. |
| `presentation.panelGapPx`, `presentation.pageGutterPx` | The rest of the row's arithmetic, so that no width is a literal in the stylesheet. |
| `presentation.anomalyLimitMetres` | The half-range the panels draw interface-depth anomalies against. |
| `presentation.attributionHatchThreshold` | The weight above which a cell is hatched rather than merely tinted — the second channel that makes the layer readable without colour. |
| `presentation.footprint.colocationToleranceDegrees` | Two profiles this close are the same place as far as the drawing is concerned, and are offset so both are visible. |
| `presentation.footprint.needleOffsetPx`, `elevationHeightPx` | The offset applied to co-located needles, and the height of the enlarged panel's depth elevation. |
| `forecast.validityWindowHours` | How far past its issue instant a forecast claims to be valid. A panel beyond it says so and draws nothing. |
| `forecast.quaysideOffsetHours` | The departure brief's instant: the analysis there, held constant and never refreshed. |
| `forecast.issueTimeControl` | The range and step of the one issue-time control. The schema refuses a default issue time it cannot reach. |
| `presentation.footprint.levelTickLimit` | Above this many levels a needle draws its ticks only while hovered. An Argo profile carries five hundred; drawn always they are a solid bar. |
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
| `codeVersion` | The build's own commit, injected at build time. "Byte-identical" is a promise about the same code, so the manifest says which code. A difference is a warning beside the run, not a refusal. |
| `domainId` | The domain the run was made in. A manifest naming one this build lacks is refused, naming both. |
| `issueInstantMs` | The instant the shore forecast was issued. A reader's choice rather than a property of the integration, so a manifest that did not record it could not rebuild the fields it describes. |
| `recordedCase` | False once a reader has asked for a new run. |
| `counterfactual` | The reader's edits, in order. Empty for the recorded case; the slot was present from beat 001, so a manifest exported before the counterfactuals existed and one after have the same shape. |

**Replay is re-computation, not the restoration of a snapshot.** That is why the manifest
holds no state: a snapshot compared with itself would prove nothing, whereas a rebuilt run
compared byte for byte proves the property the whole system rests on.

Every refusal happens before anything is constructed, so a refused load leaves no run
behind. In order: the **schema** (strict, so a manifest carrying a field, a score or an
observation is rejected for carrying a key that does not belong), the **format version**
(before the shape, so a manifest from another version is told what it is), the
**configuration digest**, and the **domain**. The **code version** is the one difference that
warns rather than refuses.

The committed [`schemas/run-manifest.schema.json`](https://github.com/DeepBlueCLtd/j-ocean/blob/main/schemas/run-manifest.schema.json)
is generated from the same definition by `pnpm manifest-schema`, and a test regenerates and
compares it, so the portable copy cannot drift from the code.

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

## The row

The primary surface, and the only place the six horizons appear together. ADR-0003 records
why it is a row and not a slider or a grid.

| Field | Meaning |
|---|---|
| `Panel.leadHours` | The <span class="declared">declared</span> horizon. One panel per horizon and no others; gate G-05 checks that in a running browser. |
| `Panel.validInstant`, `Panel.initialisedFrom` | Absolute instants in the run's clock, not only a lead time, so that no reader has to do arithmetic to find out whether two panels are comparable. |
| `Panel.field` | The forecast interface depth as an **anomaly** about its own regional mean — the same convention the scorer uses, so the picture and the number describe the same thing. |
| `Panel.observationWeight` | The analysis's own weights, read through `weightsAt` and computed nowhere else. |
| `Panel.observationsDominant` | Where observations lead both other sources: the hatch, and the second channel of FR-019. |
| `Panel.score` | The `Score` of the section above, or `null` before the row has been scored. Scoring is on demand because it costs a second and the interface does not freeze. |
| `Panel.enlarged` | A class on an element. Enlargement changes what is shown and never what is computed; the test asserts it by object identity. |

**The attribution is one field.** The recorded case runs a single analysis, at the issue
instant, and the row draws it on every panel. Six identical fields side by side would imply
six analyses, so the legend states the instant and says that attribution becomes per horizon
once the forecast cycles.

## Where a field is painted

One module, `field-surface.ts`, owns every palette and shader. It reports the surface it got
— `webgl2` where the browser has it, `canvas2d` where it does not — on the canvas itself, and
both paths are exercised by tests: headless Chromium here has WebGL2, so a test refuses it in
an init script to make the fallback actually run.

## The counterfactuals

An edit is a value, not a mutation: it lives in the manifest, it is applied in order to a fresh
run, and reverting is removing it. That is why byte-identical revert is structural.

| Edit | What it changes | Applied |
|---|---|---|
| `withhold` | One observation leaves the analysis and stays in the record, drawn struck through. | after sampling |
| `profile` | A measured profile's values, through the **same** observation operator, with the measurement kept as a ghost. | after sampling |
| `bias` | An instrument's declared bias, added after noise and before the checks. | to the configuration |
| `quality-control` | Whether the declared checks run at all. | to the configuration |
| `track` | The waypoints. The instruments resample truth where the reader put them, through the same instruments and named streams. | to the configuration |

A track edit is checked against `instruments.track.vesselSpeedKnots`, and the declared rule is
to **stretch** the instants rather than refuse the edit — a reader dragging a waypoint is asking
what if we had gone there, not whether we could have got there by Tuesday. The stretch is
stated.

Two things a reader should know about the checks, both measured in beat 010:

- A profile more than `instruments.qualityControl.profileRejectionFraction` of whose levels
  failed a check is not trusted at any depth, and the interface derived from it is flagged.
  Before this the flags stopped at the levels and the observation the analysis consumed never
  learned it was suspect.
- A bias large enough to trip the gross-range check is also large enough for the observation
  operator to refuse the profile, so for a warm bias the operator, not the check, is what
  excludes it — identically whether or not quality control is running.

## The forecast, on two axes

`runForecast` produces one entry per declared horizon. The declared horizons are measured from
the **default** issue instant, so moving the issue time leaves every panel valid at the same
moment and makes each of them a longer forecast of it.

| Field | Meaning |
|---|---|
| `HorizonForecast.leadHours` | The declared horizon. It names the panel and fixes the valid instant. |
| `HorizonForecast.leadFromIssueHours` | What was actually asked of the model: the valid instant less the issue instant. The two differ the moment issue time moves, and conflating them is the confusion the second axis exists to remove. |
| `HorizonForecast.field` | Absent where the panel is outside validity or before its issue instant. |
| `HorizonForecast.refusal` | Present exactly when the field is absent, and says which of the two it is. |
| `ForecastResult.observationsAvailable` | How many observations the analysis was allowed to see: those with instants **at or before** the issue instant. |
| `ForecastResult.observationsWithheld` | How many had not happened yet. Until beat 009 this was zero because the analysis was handed all of them, which is the correction that beat records. |
| `DepartureBrief` | The analysis at the declared quay-side instant, held constant and never refreshed (FR-026). At the quay side of the recorded case nothing has reported, so it is background blended with climatology — a generous baseline, not a straw man. |

## The observation footprint

What the instruments did, as marks. Built from the run's observations and from nothing else:
the footprint does not sample truth and does not compute, and a test asserts that by reading
the module's own imports.

| Field | Meaning |
|---|---|
| `TrackMark.value` | The surface measurement itself. Its place in the track's own range drives the mark's size and fill, so the encoding survives having its colour removed. |
| `FootprintMark.afterInitialisation` | Measured after the instant a forecast was initialised from, so it did not inform it. Drawn distinctly, because a mark that did not inform a forecast must not look like one that did. |
| `FootprintMark.insideMargin` | Inside the sponge margin. The analysis used it; scoring excludes the region, and the hover says so. |
| `FootprintMark.flagged` | Failed a declared check, or carries an Argo flag. Drawn as flagged, never omitted, and distinguishable by luminance rather than hue. |
| `Needle.deepestMetres` | The depth **actually reached**, which is not the depth asked for: an XBT infers its depth from a fall-rate equation. The needle's extent is this and nothing else. |
| `Needle.continuesBelow` | The probe went past the floor of the displayed volume. The needle says so rather than stopping as though the profile had. |
| `Needle.measuredNothing` | The profile reports no value at any level. Five delayed-mode Argo profiles in the recorded case are like this; they are drawn as a cross at the surface, not as a needle of zero length. |
| `Needle.assimilated` | ADR-0007: Argo is drawn either way, and the hover says which. |

The **elevation** is a side elevation, not a scene: it shares the field's horizontal axis and
puts depth downward, so latitude is not shown and position is read from the plan view above. A
perspective volume would imply a viewpoint and a set of distances the harness does not have.

Every panel also carries a visually hidden **list** of its marks, one entry per observation. A
canvas says nothing to a reader who cannot see it, and nothing to a test either.

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
