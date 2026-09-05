import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ConfigurationError, loadConfiguration, validateConfiguration } from '../../src/config/load.js';
import { CONFIG_PATH, declaredConfiguration } from '../support/config.js';

const raw = (): Record<string, unknown> => JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

describe('the configuration loader', () => {
  it('loads the declared configuration and digests it', () => {
    const { config, digest } = declaredConfiguration();
    expect(config.schemaVersion).toBe(1);
    expect(config.grid.nx).toBe(100);
    expect(config.grid.ny).toBe(100);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('declares every value beat 001 would otherwise have hard-coded', () => {
    const { config } = declaredConfiguration();
    expect(config.run.defaultSeed).toMatch(/^[0-9a-f]{16}$/);
    expect(config.clock.timestepSeconds).toBeGreaterThan(0);
    expect(config.budget.frameBudgetMs).toBeGreaterThan(0);
    expect(config.horizons.leadHours.length).toBeGreaterThan(0);
    expect(config.domains.list.some((d) => d.character === 'bland')).toBe(true);
    expect(config.domains.list.some((d) => d.character === 'eventful')).toBe(true);
  });

  it('fails readably, naming the field, and returns nothing usable', () => {
    const broken = { ...raw(), grid: { nx: 1, ny: 100, cellSizeMetres: 5500 } };
    expect(() => validateConfiguration(broken)).toThrow(ConfigurationError);
    try {
      validateConfiguration(broken);
      expect.unreachable('an invalid configuration must not validate');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).message).toMatch(/grid\.nx/);
    }
  });

  it('names the source file when the text is not JSON', () => {
    expect(() => loadConfiguration('{ nope', 'config/j-ocean.json')).toThrow(
      /config\/j-ocean\.json is not valid JSON/,
    );
  });

  it('rejects a seed that is not sixteen lowercase hex characters', () => {
    const broken = { ...raw(), run: { defaultSeed: 'NOTASEED', recordedCaseLabel: 'x' } };
    expect(() => validateConfiguration(broken)).toThrow(/run\.defaultSeed/);
  });

  it('rejects horizons that are not strictly increasing', () => {
    const broken = { ...raw(), horizons: { leadHours: [0, 24, 24] } };
    expect(() => validateConfiguration(broken)).toThrow(/strictly increasing/);
  });

  it('rejects a default domain that names nothing in the list', () => {
    const current = raw()['domains'] as Record<string, unknown>;
    const broken = { ...raw(), domains: { ...current, defaultId: 'nowhere' } };
    expect(() => validateConfiguration(broken)).toThrow(/domains\.defaultId/);
  });

  it('rejects a domain whose extents are inside out', () => {
    const broken = {
      ...raw(),
      domains: {
        defaultId: 'a',
        list: [{ id: 'a', label: 'A', west: -70, east: -75, south: 34, north: 39, character: 'bland' }],
      },
    };
    expect(() => validateConfiguration(broken)).toThrow(/east must be greater than west/);
  });

  it('rejects a schema version it does not know', () => {
    expect(() => validateConfiguration({ ...raw(), schemaVersion: 2 })).toThrow(/schemaVersion/);
  });
});
