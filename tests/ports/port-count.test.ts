import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PORTS_DIR = fileURLToPath(new URL('../../src/ports/', import.meta.url));

/**
 * FR-002 and SC-005. Constitution Principle VIII names four ports and says that nothing
 * else is dressed as one; this is the test that notices a fifth arriving by drift.
 */
describe('src/ports/', () => {
  const EXPECTED = ['clock.ts', 'kernel.ts', 'rng.ts', 'truth-source.ts'];

  it('holds exactly the four ports the constitution names', () => {
    const found = readdirSync(PORTS_DIR).sort();
    expect(
      found,
      'constitution Principle VIII: the ports are the model kernel, the RNG, the clock and ' +
        'the truth source. Nothing else is dressed as a port; the analysis scheme, the ' +
        'renderer, the observation record format and the manifest format are choices, and ' +
        'introducing an abstraction over one of them requires an ADR arguing why.',
    ).toEqual(EXPECTED);
  });

  it('has no barrel file, so a port is imported by name', () => {
    expect(readdirSync(PORTS_DIR)).not.toContain('index.ts');
  });
});
