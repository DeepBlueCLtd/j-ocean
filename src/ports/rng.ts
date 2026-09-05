/**
 * Port: pseudo-random number generation (constitution Principle VIII, SRD §2.1).
 *
 * The RNG is a port because more than one implementation is genuinely conceivable — a
 * different generator family, or a recorded stream replayed from a file. What is *not*
 * conceivable, and what this interface exists to make impossible, is a component reaching
 * for `Math.random`. Gate G-04 enforces that; this port is what makes obeying it easy.
 *
 * Two properties the implementation must have, both asserted by the contract test:
 *
 *  - **Streams are independent of one another's draw order.** Two components drawing from
 *    two named streams get the same values whichever of them draws first. A shared
 *    generator handed out to callers does not have this property, and a run whose
 *    determinism depends on call order is not reproducible in practice.
 *  - **A name is a construction, not a lookup.** Asking twice for the same name yields the
 *    same sequence from the start, never a continuation of the first.
 */

/** One named, independently seeded sequence. */
export interface RandomStream {
  /** The logical name the stream was derived from, recorded in the run manifest. */
  readonly name: string;
  /** The derived seed, sixteen lowercase hex characters, recorded in the run manifest. */
  readonly seed: string;
  /** The next value as an unsigned 32-bit integer. */
  nextU32(): number;
  /** The next value in [0, 1). */
  nextFloat(): number;
  /** The next standard normal deviate. */
  nextGaussian(): number;
}

export interface RngPort {
  /**
   * Identifies the generator family and its parameters. A manifest recording a different
   * version is refused rather than replayed wrongly (FR-005, spec Edge Cases).
   */
  readonly generatorVersion: string;
  /** The root seed every stream is derived from. */
  readonly rootSeed: string;
  /** Construct the named stream. Calling twice with one name returns two equal sequences. */
  stream(name: string): RandomStream;
  /** Every name asked for so far, with its derived seed, for the manifest (FR-003). */
  derivedSeeds(): Readonly<Record<string, string>>;
}
