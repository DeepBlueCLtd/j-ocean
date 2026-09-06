import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifestJsonSchema, SCHEMA_PATH, serialiseSchema } from '../../scripts/docs/build-manifest-schema.js';
import { runManifestSchema } from '../../src/run/manifest.js';

/**
 * The committed JSON Schema (FR-001, FR-002).
 *
 * One definition, one portable copy, and a test that they agree — the same arrangement gate
 * G-01 makes for the data artefacts, for the same reason: a copy nobody regenerates is a
 * document about what the code used to do.
 */
describe('the run manifest JSON Schema', () => {
  it('is the committed file, regenerated', () => {
    expect(readFileSync(SCHEMA_PATH, 'utf8')).toBe(serialiseSchema());
  });

  it('closes the object, which is what makes "no field data" true', () => {
    const schema = manifestJsonSchema() as { additionalProperties?: unknown; required?: string[] };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain('rootSeed');
    expect(schema.required).toContain('counterfactual');
    expect(schema.required).toContain('codeVersion');
  });

  it('rejects a manifest carrying a field, a score or an observation', () => {
    const valid = {
      formatVersion: 4,
      generatorVersion: 'xoshiro128starstar+splitmix64/1',
      kernelId: 'reduced-gravity/1',
      rootSeed: '6a09e667f3bcc908',
      derivedSeeds: { 'model/kernel': '0123456789abcdef' },
      clock: { epoch: '2013-09-01T00:00:00Z', timestepSeconds: 240 },
      configDigest: 'abc',
      steps: 0,
      issueInstantMs: 0,
      codeVersion: 'test',
      domainId: 'gulf-stream-front',
      recordedCase: true,
      counterfactual: [],
    };
    expect(runManifestSchema.safeParse(valid).success).toBe(true);
    expect(runManifestSchema.safeParse({ ...valid, fields: { thickness: [1, 2] } }).success).toBe(false);
    expect(runManifestSchema.safeParse({ ...valid, scores: [{ skill: 1 }] }).success).toBe(false);
    expect(runManifestSchema.safeParse({ ...valid, observations: [] }).success).toBe(false);
  });
});
