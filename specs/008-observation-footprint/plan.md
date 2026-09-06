# Implementation Plan: The Observation Footprint

**Feature**: `008-observation-footprint` | **Spec**: [`spec.md`](./spec.md)
**Date**: 2026-09-11 | **Depends on**: 004 (the observations), 007 (the row to draw them on)
**Milestone**: **M3, the surface**, second beat.

## Summary

Where the vessel has been and what it measured, drawn: the track as a line whose marks carry
their own values, XBT drops as glyphs whose length is the depth they reached, needles through
a depth elevation when a panel is enlarged, the measured profile beside the model's derived
one, and everything that was flagged drawn as flagged.

The footprint reads the run's observations and computes nothing. That is FR-009, and a test
asserts it by reading the module's own imports: a footprint that could reach truth would be a
picture of the answer rather than a picture of what was measured.

## Three findings

### 1. Five profiles measured nothing, and were drawn as though they had

The recorded case contains twenty-five Argo profiles. **Five of them report a temperature at
no level at all** — every level null, with an Argo quality flag of 4. They are delayed-mode
files from one float, they have real positions and real instants, and they carry no usable
measurement.

Beat 004 handled them correctly where it mattered: the *derived* interface observation is
flagged `unresolved`, is not usable, and is excluded from the analysis and recorded as
excluded. Nothing downstream was wrong.

But the flag was on the derived observation, and the thing the footprint draws is the
**profile**, which carried no flag at all. So a profile that measured nothing would have been
drawn exactly like one that measured everything — and its needle would have had zero extent,
which reads as a probe that reached the surface and stopped.

The flag now goes where the drawing is: any profile with no usable level carries `unresolved`
in its own right, and the footprint marks it `measuredNothing` and draws it as a cross at the
surface. Nothing about the analysis changed, which is the point — this was a defect in what
the harness *said*, not in what it computed.

### 2. The derived profile and the measurement disagree, visibly

FR-07 asks for the measured profile beside the model's derived one, with every level's kind
on it. Here it is, at the first drop:

| Depth | Measured | Model |
|---|---|---|
| 0 m | 27.99 °C at 0 m | 26.00 °C *(computed)* |
| 200 m | 19.83 °C at 196 m | 26.00 °C *(derived)* |
| 400 m | 16.68 °C at 394 m | 25.43 °C *(derived)* |
| 600 m | 14.20 °C at 613 m | 11.05 °C *(derived)* |
| 700 m | 13.96 °C at 665 m | 8.30 °C *(computed)* |

The probe's thermocline is near 300 m; the model's is near 590 m. **The reader sees the
disagreement, and it is a finding rather than a defect because every derived level says it is
derived** — which is exactly the posture SRD §10 asked for.

It is *not* ADR-0009's trigger. That trigger is a question about vertical structure evolving
in time, and this is a static offset: the interface is in the wrong place, not resolved at the
wrong number of levels, and advected vertical structure would not move it. The cause is beat
006's finding 2 — the declared reduced gravity and the declared thermal structure disagree
about amplitude — and settling it is a configuration change. ADR-0009 now records the
observation and says the deferral stands for a reason that is evidence rather than assumption.

### 3. The projection had to lose something, and says which

An enlarged panel gains a depth axis. The choice was between a perspective volume and a side
elevation, and the elevation won: a perspective view would imply a viewpoint and a set of
distances the harness does not have, and would make the length of a needle a function of where
the reader is standing rather than of how deep the probe went.

The elevation shares the field's horizontal axis and puts depth downward, so **latitude is not
shown**. Two floats at nearby longitudes are two needles a few pixels apart, and where they
overlap the pointer reaches whichever is on top. The caption says position is read from the
field above, which is where it can be read exactly.

## Constitution Check

| Principle | Touched | How this beat complies |
|---|---|---|
| **II. Truth only through an instrument** | Yes | The footprint imports `observation.js` and nothing else from the model rings. The test that asserts it reads the file. |
| **III. The model knows nothing about display** | Yes | The profile drawn beside an XBT comes from the model's own `profileFromInterfaceDepth`; the harness draws what it is given. A second copy of the tanh in the surface would have been a profile the model never claimed. |
| **V. No figure without its provenance** | Yes | Every level in the comparison carries `computed` or `derived`; the hover names the failing check; a mark says whether it informed the forecast. |
| **VI. The harness can lose** | Yes | Finding 1 is a defect this beat found in its own predecessor's *drawing*, reported rather than quietly patched, and finding 2 is the model disagreeing with a measurement in public. |
| **X. Declared in configuration** | Yes | The co-location tolerance, the needle offset, the elevation height and the level-tick limit are declared. |

**Result: PASS.** No Complexity Tracking entry.

## Decisions this plan made

- **The marks are a list as well as a drawing.** A canvas says nothing to a reader who cannot
  see it, and nothing to a test either. Every panel carries a visually-hidden list, one entry
  per observation, with kind, flag state and position. It is the accessible equivalent of the
  overlay and the thing the counts are asserted against.
- **A click pins a mark.** Hover previews; a click keeps the panel open, for the same reason
  beat 007's cell breakdown persists — a reader reading a twelve-level profile has to be able
  to look away from the needle they are reading it from.
- **Dense needles draw their ticks only when hovered.** An Argo profile carries five hundred
  levels; drawn always, they are a solid bar that says less than the extent line already does.
  The threshold is declared.
- **Levels are matched to display levels by depth, not by index.** An XBT's declared depths and
  the model's declared display levels happen to be nearly the same list; an Argo profile's are
  neither. Lining them up by position would have invented a correspondence.

## Measured

- 217 headless tests, 23 shell tests, 7 gates.
- 25 surface measurements, 6 XBT drops and 25 Argo profiles drawn on every panel, of which 11
  carry a flag; every panel agrees on the count, and the test asserts they do.
- Flagged versus unflagged mark luminance: **218.4** of 255, against a declared margin of 40.
