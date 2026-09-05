# ADR-0002: The kernel port, and the CPU kernel as the permanent reference

- **Status:** Accepted
- **Date:** 2026-09-05
- **Owed by:** SRD PR-03, FR-04, §2.1
- **Written before:** beat 003

## Context

The model kernel is one of the four ports, because a GPU implementation is genuinely
conceivable and is recorded as deferred (ADR-0010). A port that exists for one
implementation is interface-for-its-own-sake, which the constitution calls a violation; a
port that exists for a second implementation nobody has written yet is a bet that the
second one will fit. The bet is only safe if the interface is narrow and the acceptance
criterion for the second implementation is written down *before* anybody is invested in it.

There is a second, quieter question. When a faster kernel lands and disagrees with the
slower one, which is right?

## Decision

**The kernel port is `createState(grid, stream)` and `step(state, context)`, and nothing
else. The CPU kernel is the reference implementation and remains so after any faster kernel
lands.**

The port hands the kernel everything it may know about — the state, the step index, the
instant, the timestep and one stream — and the kernel reaches for nothing: not a seed, not
a clock, not configuration. Anything a kernel would need that is not in `StepContext` is a
change to the port, argued on its own merits.

**A second kernel is accepted only against the reference's output, to a tolerance recorded
in the accepting test and in this ADR's successor, never assumed.** The proposed tolerance
for a GPU kernel is a relative L∞ difference of 1e-5 on every prognostic field after 576
steps from the same seed, which is loose enough to admit single-precision arithmetic and
tight enough that a real disagreement shows. The figure is a proposal until a second kernel
exists to test it against; the rule that it must be *recorded* is not.

## Consequences

**Good.** The reference never moves, so "the GPU kernel is wrong" is always a meaningful
sentence. The narrow interface is what lets the kernel run in a worker, and what makes beat
003 able to *replace* beat 001's placeholder rather than extend it.

**Accepted costs.** The reference kernel must stay maintained even once it is the slow
path, and every change to it is a change to what every other kernel is measured against. A
bug fix in the reference is therefore a bug fix in the acceptance criterion, and its commit
says so.

**What would change this.** A kernel that cannot be expressed through `step(state,
context)` — a spectral method, say, or one that needs the whole trajectory. That is a new
ADR replacing this one, not an extra argument to the port.
