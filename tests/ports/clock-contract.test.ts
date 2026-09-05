import { describe, expect, it } from 'vitest';
import { createClock } from '../../src/run/clock.js';
import type { SimulationClock } from '../../src/ports/clock.js';

/** The contract every clock port implementation must satisfy (FR-004). */
describe('the clock port contract', () => {
  const config = { epoch: '2019-06-01T00:00:00Z', timestepSeconds: 600 };

  it('starts at the declared epoch, at step zero', () => {
    const { clock } = createClock(config);
    expect(clock.step).toBe(0);
    expect(clock.instantIso()).toBe('2019-06-01T00:00:00.000Z');
  });

  it('advances by whole declared timesteps', () => {
    const control = createClock(config);
    control.advance(6);
    expect(control.clock.step).toBe(6);
    expect(control.clock.instantIso()).toBe('2019-06-01T01:00:00.000Z');
  });

  it('shows every consumer the same instant', () => {
    const control = createClock(config);
    const consumerA: SimulationClock = control.clock;
    const consumerB: SimulationClock = control.clock;
    control.advance(3);
    expect(consumerA.instantMs()).toBe(consumerB.instantMs());
    expect(consumerA.step).toBe(3);
  });

  /**
   * Not a convention but a fact about the types: what a consumer is handed has no advance
   * method to call. The cast below is what a determined consumer would have to write, and
   * it still finds nothing.
   */
  it('gives a consumer no way to advance it', () => {
    const control = createClock(config);
    const asConsumer: SimulationClock = control.clock;
    expect((asConsumer as unknown as Record<string, unknown>)['advance']).toBeUndefined();
    expect(Object.keys(asConsumer)).not.toContain('advance');
  });

  it('refuses an epoch that is not an instant, and a timestep that is not one', () => {
    expect(() => createClock({ epoch: 'yesterday', timestepSeconds: 600 })).toThrow(/not an instant/);
    expect(() => createClock({ ...config, timestepSeconds: 0 })).toThrow(/positive whole number/);
    expect(() => createClock({ ...config, timestepSeconds: 1.5 })).toThrow(/positive whole number/);
  });

  it('refuses to advance by a fraction of a step or backwards', () => {
    const control = createClock(config);
    expect(() => control.advance(-1)).toThrow(/whole, non-negative/);
    expect(() => control.advance(0.5)).toThrow(/whole, non-negative/);
  });
});
