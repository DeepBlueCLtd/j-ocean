import { describe, expect, it } from 'vitest';
import { createRun, createRunFromManifest, INITIAL_STATE_STREAM, KERNEL_STREAM } from '../../src/run/run.js';
import { parseManifest, serialiseManifest, MANIFEST_FORMAT_VERSION } from '../../src/run/manifest.js';
import { declaredConfiguration } from '../support/config.js';

const { config, digest } = declaredConfiguration();

describe('the run manifest', () => {
  it('records everything FR-005 names', () => {
    const run = createRun({ config, configDigest: digest });
    run.advance(10);
    const manifest = run.exportManifest();

    expect(manifest.formatVersion).toBe(MANIFEST_FORMAT_VERSION);
    expect(manifest.rootSeed).toBe(config.run.defaultSeed);
    expect(Object.keys(manifest.derivedSeeds).sort()).toEqual(
      [INITIAL_STATE_STREAM, KERNEL_STREAM].sort(),
    );
    for (const seed of Object.values(manifest.derivedSeeds)) {
      expect(seed).toMatch(/^[0-9a-f]{16}$/);
    }
    expect(manifest.generatorVersion).toMatch(/\S/);
    expect(manifest.clock).toEqual({
      epoch: config.clock.epoch,
      timestepSeconds: config.clock.timestepSeconds,
    });
    expect(manifest.configDigest).toBe(digest);
    expect(manifest.steps).toBe(10);
    expect(manifest.recordedCase).toBe(true);
    // FR-34: the slot exists from the first beat, so beat 010 changes what a manifest
    // means and not what shape it has.
    expect(manifest.counterfactual).toBeNull();
  });

  it('round-trips through JSON unchanged', () => {
    const run = createRun({ config, configDigest: digest });
    run.advance(3);
    const manifest = run.exportManifest();
    expect(parseManifest(serialiseManifest(manifest))).toEqual(manifest);
  });

  it('says the run is no longer the recorded case once a seed has been drawn', () => {
    const run = createRun({
      config,
      configDigest: digest,
      seed: '0123456789abcdef',
      recordedCase: false,
    });
    expect(run.exportManifest().recordedCase).toBe(false);
  });

  describe('refusals', () => {
    const manifestOf = (steps = 5) => {
      const run = createRun({ config, configDigest: digest });
      run.advance(steps);
      return run.exportManifest();
    };

    it('refuses a configuration digest mismatch, naming both digests, leaving no run', () => {
      const manifest = manifestOf();
      let created: unknown = 'nothing was created';
      expect(() => {
        created = createRunFromManifest(manifest, { config, configDigest: 'a'.repeat(64) });
      }).toThrow(/digest mismatch/);
      expect(() => createRunFromManifest(manifest, { config, configDigest: 'a'.repeat(64) }))
        .toThrow(new RegExp(manifest.configDigest));
      expect(created).toBe('nothing was created');
    });

    it('refuses a generator-version mismatch, naming both versions', () => {
      const manifest = { ...manifestOf(), generatorVersion: 'someone-elses-generator/9' };
      expect(() => createRunFromManifest(manifest, { config, configDigest: digest })).toThrow(
        /someone-elses-generator\/9/,
      );
    });

    it('refuses a kernel it was not run with', () => {
      const manifest = { ...manifestOf(), kernelId: 'reduced-gravity/1' };
      expect(() => createRunFromManifest(manifest, { config, configDigest: digest })).toThrow(
        /reduced-gravity\/1/,
      );
    });

    it('refuses a clock that is not the configured clock', () => {
      const manifest = {
        ...manifestOf(),
        clock: { epoch: '2020-01-01T00:00:00Z', timestepSeconds: 600 },
      };
      expect(() => createRunFromManifest(manifest, { config, configDigest: digest })).toThrow(
        /is not the configured clock/,
      );
    });

    it('refuses a manifest format it cannot read, naming both versions', () => {
      const text = serialiseManifest({ ...manifestOf(), formatVersion: 99 });
      expect(() => parseManifest(text)).toThrow(/99/);
      expect(() => parseManifest(text)).toThrow(new RegExp(String(MANIFEST_FORMAT_VERSION)));
    });

    it('refuses a manifest carrying a counterfactual no code here can honour', () => {
      const text = JSON.stringify({ ...manifestOf(), counterfactual: { edits: [] } });
      expect(() => parseManifest(text)).toThrow(/feature 010/);
    });

    it('refuses something that is not a manifest at all', () => {
      expect(() => parseManifest('{')).toThrow(/not valid JSON/);
      expect(() => parseManifest('[]')).toThrow(/not an object/);
      expect(() => parseManifest('{"formatVersion":1}')).toThrow(/missing: /);
    });
  });
});
