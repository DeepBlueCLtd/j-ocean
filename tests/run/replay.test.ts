import { describe, expect, it } from 'vitest';
import { createRun, createRunFromManifest } from '../../src/run/run.js';
import { parseManifest, serialiseManifest } from '../../src/run/manifest.js';
import { stateBytes } from '../../src/model/grid.js';
import { declaredConfiguration } from '../support/config.js';

const { config, digest } = declaredConfiguration();

/**
 * SC-001, FR-006, AT-04 (headless half).
 *
 * This is the one property the SRD says cannot be retrofitted. It is tested at the
 * declared grid and at 1,000 steps, over a manifest that has been through JSON, because
 * that is the path a reader's exported manifest actually takes.
 */
describe('deterministic replay', () => {
  const STEPS = 1_000;

  it('rebuilds a run from its manifest byte-identically at 1,000 steps', () => {
    const original = createRun({ config, configDigest: digest });
    original.advance(STEPS);
    const exported = parseManifest(serialiseManifest(original.exportManifest()));

    const replayed = createRunFromManifest(exported, { config, configDigest: digest });

    expect(replayed.steps).toBe(STEPS);
    expect(stateBytes(replayed.state)).toEqual(stateBytes(original.state));
    expect(replayed.exportManifest()).toEqual(original.exportManifest());
  });

  it('replays a run that was itself started from a drawn seed', () => {
    const drawn = createRun({
      config,
      configDigest: digest,
      seed: 'fedcba9876543210',
      recordedCase: false,
    });
    drawn.advance(250);
    const replayed = createRunFromManifest(drawn.exportManifest(), { config, configDigest: digest });
    expect(stateBytes(replayed.state)).toEqual(stateBytes(drawn.state));
    expect(replayed.recordedCase).toBe(false);
  });

  /** The negative half: a test that could not fail would prove nothing. */
  it('does not replay a different seed into the same state', () => {
    const a = createRun({ config, configDigest: digest });
    const b = createRun({ config, configDigest: digest, seed: 'fedcba9876543210' });
    a.advance(100);
    b.advance(100);
    expect(stateBytes(a.state)).not.toEqual(stateBytes(b.state));
  });

  it('does not replay a different number of steps into the same state', () => {
    const a = createRun({ config, configDigest: digest });
    const b = createRun({ config, configDigest: digest });
    a.advance(100);
    b.advance(101);
    expect(stateBytes(a.state)).not.toEqual(stateBytes(b.state));
  });

  it('advances in pieces exactly as it advances in one call', () => {
    const whole = createRun({ config, configDigest: digest });
    const pieces = createRun({ config, configDigest: digest });
    whole.advance(60);
    for (let i = 0; i < 6; i += 1) pieces.advance(10);
    expect(stateBytes(pieces.state)).toEqual(stateBytes(whole.state));
    expect(pieces.clock.instantIso()).toBe(whole.clock.instantIso());
  });
});
