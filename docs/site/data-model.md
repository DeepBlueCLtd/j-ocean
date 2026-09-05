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
