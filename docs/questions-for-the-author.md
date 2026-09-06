# Questions for the author

Twelve beats produced a working harness and a short list of things only the author can settle.
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

## 3. Should Argo be assimilated at all? (review R-3)

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

## 4. AT-06: negligible where?

**The evidence.** An edited profile moves the near horizon by 33 m and the far horizon by 30 m
inside the influence region, and by 32 m somewhere in the domain. The edit is advected, not
dissipated.

**The question.** Was "negligible at 96 h" a claim about the *neighbourhood* the edit was made
in — in which case a 10 per cent decay is arguably the wrong measure and something like a
centre-of-mass displacement would be better — or about the domain, in which case this model does
not do it and question 1 is where to look?

---

## 5. The recorded case's dates (review R-6)

**Where it stands.** The truth period is 2013-09-01 to 2013-09-12, from HYCOM GLBv0.08
expt_53.X, chosen because it is reanalysis rather than forecast and because Argo coverage over
the Gulf Stream is good in that window (ADR-0004).

**The question.** Is that the period the author intended, or was a particular event in mind?
Changing it is a configuration change and a re-fetch; the build step refuses gaps longer than the
declared maximum, so an arbitrary window may not be admissible.

---

## 6. SRD §4's summary bar

**Where it stands.** The SRD specified a per-panel attribution *summary bar*; review found that
attribution has to be a per-cell field derived from the analysis's own gain (FR-16, FR-17), and
gate G-06 now forbids any other producer. The summary survives only as an instrument of a
selected cell (FR-18).

**The question.** This is recorded as a correction to §4 rather than an implementation choice.
Does the author agree, and should the SRD be amended?

---

## 7. Quality control's role, given what beat 010 found

**The evidence.** For a warm bias, any bias large enough to trip the gross-range check is also
large enough that the observation operator cannot invert the profile — so the operator excludes
it first, identically whether or not quality control is running. Below that, the checks now
reject a profile when a declared fraction of its levels fail, which is what makes them exclude
anything at all.

**The question.** Is `instruments.qualityControl.profileRejectionFraction` = 0.1 the right bar?
It is the number that decides whether a suspect profile is dropped entirely, and it was chosen to
reject a 25-per-cent-flagged XBT while keeping an Argo profile with a handful of bad levels out
of five hundred.
