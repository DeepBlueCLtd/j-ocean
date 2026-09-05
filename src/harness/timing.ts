/**
 * Step-time measurement (constitution Principle I, exemption (a); NFR-04).
 *
 * This is one of the two places in the tree where the host clock may be read, and the gate
 * honours the marker here and in `seed-provisioning.ts` alone. The figure it returns is
 * host time: it says how long the machinery took, it is marked as such wherever it is
 * drawn (Principle V), and it never enters a run, a manifest or any simulation-time
 * quantity. There is no simulation-time answer to "how long did that take", even in
 * principle, which is why the exemption is bounded rather than general.
 */

/** The one host-clock read in this module. */
function hostNowMs(): number {
  return performance.now(); // j-ocean:allow-host-time exemption (a): step-time measurement, NFR-04
}

export interface HostTiming<T> {
  readonly value: T;
  /** Milliseconds of host time. Never simulation time. */
  readonly elapsedMs: number;
}

/** Measure how long a piece of machinery took. The result is reported, never integrated. */
export function measure<T>(work: () => T): HostTiming<T> {
  const start = hostNowMs();
  const value = work();
  return { value, elapsedMs: hostNowMs() - start };
}

/**
 * NFR-04: a run that would exceed the declared budget says so rather than freezing the
 * page. The budget is a number in configuration, not a judgement made at review time.
 */
export function overBudget(elapsedMs: number, frameBudgetMs: number): boolean {
  return elapsedMs > frameBudgetMs;
}
