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
