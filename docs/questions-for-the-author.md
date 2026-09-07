# Questions for the author

Twelve beats produced a working harness and a short list of things only the author can settle;
beat 013 added two more, found by writing the gate that holds the surface refactor to changing no
number.
They are here in one place, most consequential first, each with the evidence that raised it and
what would change if it were answered one way or the other.

Nothing here is a defect in the code. Each is a disagreement between two declared values, or a
choice the specification left open and the implementation had to make provisionally.

---

## 1. Reduced gravity and the thermal structure disagree about amplitude

**The evidence.** The model maps sea-surface height to interface depth by `g/g' = 490`, so a
±0.5 m surface anomaly becomes ±245 m of interface displacement. The thermocline the declared
two-layer structure diagnoses from the truth record moves about ±50 m across the same front. The
model's anomaly is roughly **three times too large**, about a mean that is also too deep: at the
first XBT drop the probe's thermocline is near 300 m and the model's is near 590 m
(beat 008's note has the profile side by side).

**What it costs.** Almost everything unflattering this project reports:

- the model is worse than climatology at every horizon, by a factor of two to three;
- skill against persistence is roughly zero once the analysis is only shown observations that
  had happened (beat 009);
- AT-02's decline across the row is absent, because the error is dominated by a standing
  amplitude mismatch rather than by anything that decays;
- AT-06's decay is absent for the same reason;
- and therefore beat 012 stays deferred, since its trigger is that scoring be trusted.

**The question.** Which of `model.reducedGravityMetresPerSecondSquared` and
`model.thermalStructure` is the one to move, and to what? It is a configuration change and a
re-run, not a code change. `tests/run/deferral-trigger.test.ts` will fail when it is settled,
which is the signal to plan beat 012.

---

## 2. AT-02 expects skill to decline across the row. Should it?

**The evidence.** Forecast error is roughly constant across the row while persistence's error
grows slowly, so the *ratio* improves with lead time. The skill curve wanders rather than
declines.

**The question.** Is AT-02's expected decline a claim about this model, or about forecasting in
general? If the former, it is downstream of question 1. If the latter, the acceptance test needs
a different form — perhaps a claim about forecast *error* rather than skill.

---

## 3. Figures that exist only in the shell, and two of them change what is computed

**The evidence.** Beat 013's invariance gate had to enumerate everything the recorded case
computes, and enumerating it found sixteen numbers computed in `src/harness/` and drawn, with no
producer in the model, the analysis or the scorer. Most are honest presentation transforms and
want only naming. Four are new quantities invented at draw time, and three of those have
consequences beyond the picture.

*The drawn anomaly is not the scored anomaly.* Every panel draws `anomalies`
(`src/harness/HorizonRow.tsx:92`), which removes the mean over **every finite cell of the grid**.
The scorer removes the mean over `domainRegion` — the grid **less its six-cell sponge margin**
(`src/scoring/scorer.ts:98`, `:121`). On the declared 100 × 100 grid that is a mean over 10 000
cells against a mean over 7 744, and the 2 256 cells of difference are precisely the ones relaxed
toward the initial state. The row's own comment calls it "each panel's field as an
**anomaly** about its own regional mean" and justifies it on the ground that "a row that drew the
raw field beside a score computed on anomalies would be a picture and a number describing
different things" (`HorizonRow.tsx:81–91`). The comment says regional; the loop beneath it says
global. So it is two anomalies, off by a constant the surface never states, and the justification
written above the code is the argument against what the code does. The offset that the scorer
*did* remove is published a few centimetres away as `meanOffsets.forecast` (`App.tsx:896`).

*The counterfactual difference field has no producer.* `differences` (`HorizonRow.tsx:119`) and
`differenceMagnitudes` (`:135`) subtract the baseline run from the edited one inside a React
`useMemo`. `runForecast` publishes both runs (`App.tsx:463`, `:467`) and neither differences them;
the same subtraction is written a second time in `tests/run/counterfactuals.test.ts:172`. FR-029's
outlined region is a threshold on a field that exists nowhere but in the component that draws it.

*A shell literal decides how far the model integrates.* `ADVANCE_HOURS = 12` at `App.tsx:60` is a
bare literal in a component; `stepsPerAdvance` (`:339`) turns it into a step count and
`view.run.advance` consumes it (`:353`, `:386`). This is not a figure that is merely drawn — it
changes what is computed, from a number configuration never declared, which is the case
Principle X exists to forbid.

*A shell literal bounds an edit that enters the run.* The profile editor's temperature scale is
`min(measured) − 6` to `max(measured) + 6` (`src/harness/ObservationHover.tsx:249–250`), and
`valueAt` maps a pointer position back through that scale into the level value the reader commits
(`:255`, `:264`, `:277`). The undeclared ±6 °C is the admissible range of a counterfactual, not a
margin on a drawing.

The rest are presentation transforms, named here only so they are not mistaken for producers:
`observationsDominant` (`HorizonRow.tsx:150`) is an argmax over the published weights; a mark's
`intensity` is its place in the track's own min–max (`src/harness/footprint.ts:250`), reported to
the legend by `trackValueRange` (`:269`); `depthFraction` is `deepestMetres / volumeFloorMetres`
(`:260`); the elevation's depth axis is quartered in the component
(`src/harness/NeedleElevation.tsx:45`); the breakdown's percentages are the weights times a
hundred (`App.tsx:970`); and the skill inset's vertical scale is `[min(0, …), max(0.001, …)]`
(`src/harness/SkillInset.tsx:36–37`), where the `0.001` is an undeclared literal that sets the
drawn amplitude of every skill curve. Two more are genuinely new but correctly labelled:
`flagSummary` (`App.tsx:152`) tallies flags by code, which nothing outside the shell produces; and
the projected step time (`App.tsx:355–358`) is an extrapolation drawn as host time, which also
gates whether the model integrates at all (`:362`).

Two entanglements of presentation with computation, which is what FR-40 expects this refactor to
expose. **Scoring happens inside a component:** `scoreAll` (`HorizonRow.tsx:159–229`) builds the
region, the climatology field and a truth field per horizon and calls `score` twice per panel,
writing the results into React state. There is no headless equivalent — `score({` appears in
`src/` only there and at `App.tsx:419` — and `tests/run/shore-forecast.test.ts:196` re-implements
the loop, which is the duplication a producer would remove. **The footprint is built to be
drawn:** `footprintFor` runs three times per render, inline in JSX (`App.tsx:751`, `:817`,
`:934`), and because the prop at `:817` is a fresh object each render, `HorizonRow`'s `useMemo`
around `markersFrom` (`:251`) never hits; `marksOf` runs at least seven times per render
(`HorizonRow.tsx:244`, `:574`, and `Panel.tsx:113` once per panel).

**What it costs.** The two anomaly means are the one that matters: a reader comparing the colour
of a panel against the metres printed beneath it is comparing figures taken about different
references, and neither the panel nor the score says so. `ADVANCE_HOURS` and the ±6 °C are
undeclared numbers that change what is computed, so they sit outside the audit the whole method
rests on. The rest is cost of the ordinary kind, and beat 013 pays some of it by lifting `scoreAll`
onto a producer both the gate and the shell call.

**The question.** Two decisions, not one. First: should the drawn anomaly become the scorer's —
`withoutMean` over `domainRegion` as the single producer the row reads — so that the picture and
the number share a mean? It would change what is drawn, so under FR-011 it is a finding now and a
beat later, but it is the only item here that makes the surface disagree with itself. Second: are
`ADVANCE_HOURS = 12`, the ±6 °C editor margin and the skill axis's `0.001` values the author
intends to declare in configuration, or values the author intends to keep at the shell's
discretion? Everything else in this list is a naming exercise.

---

## 4. Should Argo be assimilated at all? (review R-3)

**Where it stands.** Admitted behind a toggle defaulting to true (ADR-0007), with an
independence caveat on every score whose window contains an assimilated Argo profile — because
the truth record itself assimilated those profiles.

**What beat 009 changed.** Once the analysis may only see observations that had happened by its
issue instant, **no Argo profile has arrived** by the recorded case's default issue time. The
caveat never fires. The toggle is doing nothing in the recorded case, and the independence
question is moot there.

**The question.** Leave the toggle at true (harmless, and meaningful at later issue times), or
set it false and simplify the story?

---

## 5. AT-06: negligible where?

**The evidence.** An edited profile moves the near horizon by 33 m and the far horizon by 30 m
inside the influence region, and by 32 m somewhere in the domain. The edit is advected, not
dissipated.

**The question.** Was "negligible at 96 h" a claim about the *neighbourhood* the edit was made
in — in which case a 10 per cent decay is arguably the wrong measure and something like a
centre-of-mass displacement would be better — or about the domain, in which case this model does
not do it and question 1 is where to look?

---

## 6. The recorded case's dates (review R-6)

**Where it stands.** The truth period is 2013-09-01 to 2013-09-12, from HYCOM GLBv0.08
expt_53.X, chosen because it is reanalysis rather than forecast and because Argo coverage over
the Gulf Stream is good in that window (ADR-0004).

**The question.** Is that the period the author intended, or was a particular event in mind?
Changing it is a configuration change and a re-fetch; the build step refuses gaps longer than the
declared maximum, so an arbitrary window may not be admissible.

---

## 7. SRD §4's summary bar

**Where it stands.** The SRD specified a per-panel attribution *summary bar*; review found that
attribution has to be a per-cell field derived from the analysis's own gain (FR-16, FR-17), and
gate G-06 now forbids any other producer. The summary survives only as an instrument of a
selected cell (FR-18).

**The question.** This is recorded as a correction to §4 rather than an implementation choice.
Does the author agree, and should the SRD be amended?

---

## 8. Quality control's role, given what beat 010 found

**The evidence.** For a warm bias, any bias large enough to trip the gross-range check is also
large enough that the observation operator cannot invert the profile — so the operator excludes
it first, identically whether or not quality control is running. Below that, the checks now
reject a profile when a declared fraction of its levels fail, which is what makes them exclude
anything at all.

**The question.** Is `instruments.qualityControl.profileRejectionFraction` = 0.1 the right bar?
It is the number that decides whether a suspect profile is dropped entirely, and it was chosen to
reject a 25-per-cent-flagged XBT while keeping an Argo profile with a handful of bad levels out
of five hundred.

---

## 9. Is the attribution that is *drawn* the analysis's own weights?

SRD-v2 §9 asked this and beat 013 answered it before changing anything, because FR-40 says a
finding is recorded before it is fixed. **The verdict is: derived** — with one display transform
that should be named, and one declared figure whose stated meaning no longer matches its role.

**The evidence.** The gain and the drawn field are produced by the same loop.
`src/analysis/optimal-interpolation.ts:265–274` walks the cells once and writes both
`field[i] = prior[i] + increment` and `observationWeight[i] = rowSum`, where `increment` is
`K·innovation` and `rowSum` is the row sum of the same `K`, computed once at `:247–254`. There is
no second pass and no second matrix. `makeAttribution` is handed those very arrays (`:291–298`,
the sole construction site at `src/analysis/attribution.ts:51`), and the field the panels draw is
the integration forward of `analysis.field` — the same object, adopted as the forecast's initial
condition at `src/run/forecast.ts:285`. The picture and the answer are not merely consistent; they
are the same arithmetic read twice.

The one renormalisation in the path happens **before** `makeAttribution`, inside the analysis, and
is counted: `optimal-interpolation.ts:279–289` clamps a weight outside [0, 1] and splits the
remainder by the declared prior blend, incrementing `clampedCells`, which the surface publishes
(`App.tsx:954`). Nothing on the drawing path recomputes, rescales or renormalises: `Panel.tsx:149`
passes the weight array straight through, `:162` sets `limit={1}` so the sequential palette's
`value / limit` (`src/harness/field-surface.ts:75`) is the identity on a weight, `weightsAt`
(`attribution.ts:56`) is three array reads, and `breakdownAt` (`optimal-interpolation.ts:308`)
reports the same weights and the per-observation shares from the same gain row.

Gate G-06 is doing what it claims and no more: it holds the construction site by brand and forbids
the harness naming `makeAttribution`. It cannot see whether the harness renormalises what it was
given. That the harness does not is a fact of the code, not of the gate — which is why this was
worth tracing rather than assuming.

**What it costs.** One declared figure is inert. `presentation.attributionHatchThreshold` is
declared as *a cell above this weight is hatched, not merely tinted* (`src/config/schema.ts:174`),
but what it is compared against (`field-surface.ts:77`) is not a weight: it is
`observationsDominant` (`HorizonRow.tsx:150–157`), a 0/1 flag per cell from an argmax over the
three published weights. At its configured 0.5 it hatches exactly the dominant cells; at any other
value in (0, 1) it does the same thing. The knob is declared as a weight and applied to a flag.
The argmax is a threshold on the field the analysis gave rather than a second derivation of it —
no weight is altered, and the tinted channel still carries the raw gain — but it is a derived
channel that the SRD does not name.

**The question.** Should `attributionHatchThreshold` be re-declared as what it now is, the
dominance-mask cut, or should the hatch be restored to a threshold on the observation weight
itself, which is what its declaration promises and which G-06 would equally permit? And should the
SRD name the dominance mask, so that a second channel derived from the weights is a declared
derivation rather than a component's decision?
