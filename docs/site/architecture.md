---
title: Architecture
summary: The three rings, the four ports, and the seven gates that hold the boundaries between them.
order: 2
---

# Architecture

j-ocean is one TypeScript codebase, observable in one browser, with a single permitted
second runtime — Python, for data preparation, as a build step and never at run time.

## The dependency direction

The direction is one way and the gates are what keep it that way.

```
config  ->  ports  ->  model  ->  instruments  ->  analysis  ->  scoring  ->  harness
                          \__________ run __________/
```

- `src/model/` imports the ports and nothing above them. It runs under vitest in Node with
  no DOM present, and that is a test rather than a convention.
- `src/run/` owns determinism: the root seed, the RNG, the clock's advance handle and the
  kernel's stream. The model is handed a state and a step context and reaches for nothing.
- `src/harness/` reads published fields through a declared results interface. Enlarging a
  panel or hovering a cell changes what is shown and never what is computed.

## The four ports

A port is an interface with more than one *conceivable* implementation. There are four,
`src/ports/` holds exactly those four, and a test fails if a fifth appears.

| Port | State in, what out | Second implementation it is waiting for |
|---|---|---|
| **Model kernel** | A state and a step context; the state advanced in place | A GPU kernel, accepted against the CPU reference to a recorded tolerance |
| **RNG** | A name; an independently seeded stream | A different generator family, or a recorded stream replayed from a file |
| **Clock** | Nothing; the simulation instant | Any clock whose step is not a fixed interval |
| **Truth source** | A position, depth, instant and variable; a value | Another reanalysis beside the committed HYCOM subset |

Nothing else is dressed as a port. The analysis scheme, the renderer, the observation
record format and the manifest format are choices, not ports, and introducing an
abstraction over one of them requires an architecture decision record arguing why.

## Determinism, and the two exemptions

All stochastic behaviour derives from seeded streams recorded in a run manifest, and a run
reproduces from its manifest byte-identically for the same code version. Streams are named
and derived from the root seed, so a stream is independent of every other stream's draw
order, and asking twice for the same name replays it from the start rather than continuing
it.

The host clock is read in exactly two modules, each carrying an inline marker that the
host-time gate honours nowhere else:

| Module | Why | What is done with the figure |
|---|---|---|
| `src/harness/timing.ts` | Step-time measurement | Reported, typographically marked as host time, never integrated |
| `src/harness/seed-provisioning.ts` | One entropy draw, before any run exists | Written into a manifest; a run never reads entropy |

A third request is evidence the principle is being eroded and has to be argued on its own
merits, never by analogy.

## How truth reaches the model

Truth becomes an observation in exactly one module, and this is everything that module
produced. Every figure below is what a measurement was priced at, not what it turned out to be
worth — that is the analysis's question.

That sentence is the whole of Principle II, and gate G-02 is what keeps it true: the analysis
may not import the truth-source port, the model may not either, and there is one construction
site for an `Observation`. The application still reports what the instruments produced on this
visit, beside the toggles that change it; what left the application is the explanation of why
there is only one route.

Only here. One module turns the truth record into observations — ownship surface samples, XBT
drops, external Argo profiles — and the model has no other route to it. A build gate fails if
anything else imports truth, which is what makes the skill figures mean anything at all.

*Was on the application page, in the disclosure headed “What the instruments measured”
(beat 004). Moved here by beat 014, and joined by the walkthrough's eighth step when beat 016
retired it.*

## What the initialisation takes from the truth, and what it does not

The grid is laid over the truth record at the run's first instant and the layer thickness is
read from it. Velocity is put in geostrophic balance with that thickness rather than taken from
the truth, which carries motions this model has no layer for.

*Was on the application page, in the run disclosure (beat 003). Moved here by beat 014.*

## What the manifest carries, and what replay is

Everything needed to rebuild this run, and none of its state: replay is re-computation, not the
restoration of a snapshot. Nothing persists between visits — no storage, no cookie, no run in
the URL — so this file is the only thing that leaves and the only thing that comes back.

That is a statement about the run. Beat 018 made the surface a workspace, and a workspace
remembers how a reader arranged it: pane geometry and pane identity, under one declared key,
and nothing else. The line the constitution draws is that a stored run would be a second way to
bring a forecast back with none of the manifest's checks, while a stored pane width is a
preference about furniture. `tests/harness/workspace-state.test.ts` holds that line as a key
set, and refuses a planted `seed` by name.

The manifest itself, its digests and the controls that export and import one are still in the
application, because replay is something a reader drives. This paragraph is why they behave as
they do.

*Was on the application page, in the disclosure headed “The manifest this run replays from”
(beat 011). Moved here by beat 014.*

## What a link carries, and what it does not

A link to j-ocean carries a **selection** and never a run. Three keys, and no others: which
panel is enlarged, which cell is selected, and which observation. So a link means *“look at
cell 2431 of the +48 h panel”*, and what you see there depends on the run you are in — which
is the honest thing for it to mean, because a run is a seed and a manifest and a link is
neither.

That line is not a matter of taste. A URL carrying a seed would be a second way to bring a run
back with none of the manifest's checks: no code version, no configuration digest, and no
refusal when the tree has moved. The grammar is therefore three keys held by a test, and a
link carrying anything else — `seed=` most of all — is ignored and reported rather than
obeyed.

The cell key carries the grid it was written against, as `2431@100x100`. A cell is an index,
and an index into a different grid is a different place; without the dimensions an old link
would silently select a cell that merely shared a number. With them, a run on another grid
says so and selects nothing. The same applies to a horizon this configuration does not declare
and to an observation this run did not make: each is reported by name, because a near match
would be the surface pretending the link worked.

Selecting writes the address; **mounting does not**. A surface that wrote its own default on
mount would rewrite a reader's URL on any remount, and a citation would become whatever the
last render felt like. Writes replace rather than push, so poking at cells to learn the field
does not build a history to escape backwards through: the back button takes you to wherever
you were before j-ocean, not through your own selections.

*New in beat 017.*

## The attribution field is the analysis's own gain

Principle IV says attribution is derived and never authored, and the field the application
draws is the analysis's own weights read back out. This is not a picture computed to illustrate
the answer; it is the same arithmetic that produced it, exported beside it, which is why it
cannot disagree with it. There is no fixture behind this: it is the field the analysis produced
on this visit.

Gate G-06 holds the claim — one construction site for the weights, and no writer for them in
the harness.

*Was on the application page, in the caption under the analysed field (beat 005). Moved here by
beat 014.*

## The gates

Gates live in `scripts/gates/` and run with one command, `pnpm gates`. Gates that have not
yet landed are *named* by the runner rather than omitted, because a gate absent because its
beat has not happened is a known hole with a date on it, while a gate present but not run
is a hole that looks like a pass.

| Gate | What it holds | How |
|---|---|---|
| G-01 | Truth and observation artefacts regenerate identically | Build-step diff against a digest-verified raw subset |
| G-02 | No truth value reaches the analysis except through an instrument | Import boundary, single construction site, and a behavioural test |
| G-03 | The model imports no rendering module | Import scan over `src/model/` |
| G-04 | No host clock and no unseeded randomness in operational code | Source scan with a bounded exemption marker |
| G-05 | Every declared horizon is rendered, and no other | Playwright, against the running shell |
| G-06 | Attribution is read from the analysis's own weights | Single construction site, no writer in the harness |
| vocabulary | No tracked entities, no customer material | Word list beside the gate, half plaintext and half hashed |

Each has a directory of planted violations under `scripts/gates/fixtures/`, and the test
suite runs every gate against its fixture and requires it to fail.

## Why the word list has two halves

A list of words that must not appear in the repository cannot itself be a list of those
words. So the tracked-entity vocabulary is plaintext, with a reviewed exemption for the
documents whose subject *is* the prohibition; and customer, project or bid material is a
salted SHA-256 with no exemption anywhere, checked by hashing every word and adjacent word
pair of every scanned file. A hit on the hashed half is reported without quoting the line
back.
