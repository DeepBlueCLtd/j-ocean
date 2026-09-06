import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ConfigurationError, loadConfiguration, validateConfiguration } from '../../src/config/load.js';
import { CONFIG_PATH, declaredConfiguration } from '../support/config.js';

const raw = (): Record<string, unknown> => JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

describe('the configuration loader', () => {
  it('loads the declared configuration and digests it', () => {
    const { config, digest } = declaredConfiguration();
    expect(config.schemaVersion).toBe(6);
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
        list: [
          {
            id: 'a',
            label: 'A',
            west: -70,
            east: -75,
            south: 34,
            north: 39,
            character: 'bland',
            nativeResolutionDegrees: 0.08,
            truthToModelResolutionRatio: 1.6,
          },
        ],
      },
    };
    expect(() => validateConfiguration(broken)).toThrow(/east must be greater than west/);
  });

  describe('the arithmetic the schema does rather than trusts', () => {
    it('rejects a truth period too short for the last issue time plus the longest horizon', () => {
      const current = raw()['truth'] as Record<string, unknown>;
      const broken = {
        ...raw(),
        truth: { ...current, period: { start: '2013-09-01T00:00:00Z', end: '2013-09-05T00:00:00Z', strideHours: 6 } },
      };
      expect(() => validateConfiguration(broken)).toThrow(/truth\.period is too short/);
    });

    it('rejects a first issue time inside spin-up', () => {
      const current = raw()['forecast'] as Record<string, unknown>;
      const broken = { ...raw(), forecast: { ...current, spinUpHours: 48 } };
      expect(() => validateConfiguration(broken)).toThrow(/at or after the end of spin-up/);
    });

    it('rejects a validity window shorter than the longest declared horizon', () => {
      // Otherwise the recorded case opens with a panel refusing itself, which is a
      // configuration mistake dressed up as a considered refusal.
      const current = raw()['forecast'] as Record<string, unknown>;
      const broken = { ...raw(), forecast: { ...current, validityWindowHours: 48 } };
      expect(() => validateConfiguration(broken)).toThrow(/shorter than the longest declared horizon/);
    });

    it('rejects a default issue time the issue-time control cannot reach', () => {
      const current = raw()['forecast'] as Record<string, unknown>;
      const broken = {
        ...raw(),
        forecast: {
          ...current,
          issueTimeControl: { earliestOffsetHours: 30, latestOffsetHours: 48, resolutionHours: 1 },
        },
      };
      expect(() => validateConfiguration(broken)).toThrow(/outside forecast.issueTimeControl/);
    });

    it('rejects a clock epoch that is not the start of the truth period', () => {
      const current = raw()['clock'] as Record<string, unknown>;
      const broken = { ...raw(), clock: { ...current, epoch: '2019-06-01T00:00:00Z' } };
      expect(() => validateConfiguration(broken)).toThrow(/clock epoch must be the instant/);
    });

    it('rejects a declared resolution ratio the box and grid do not imply (review R-2)', () => {
      const current = raw()['domains'] as { defaultId: string; list: Record<string, unknown>[] };
      const broken = {
        ...raw(),
        domains: {
          ...current,
          list: current.list.map((d, i) => (i === 0 ? { ...d, truthToModelResolutionRatio: 1 } : d)),
        },
      };
      expect(() => validateConfiguration(broken)).toThrow(/does not match the box, the grid/);
    });

    it('rejects a seventh horizon the declared reference width cannot show at once', () => {
      // FR-013 is a promise about geometry, and the promise is arithmetic: a horizon added
      // without widening the row is refused at load rather than found in a screenshot.
      const horizons = raw()['horizons'] as { leadHours: number[] };
      const broken = { ...raw(), horizons: { leadHours: [...horizons.leadHours, 120] } };
      expect(() => validateConfiguration(broken)).toThrow(/too narrow to show every declared horizon/);
    });

    it('rejects a stride the three-hourly source cannot supply', () => {
      const current = raw()['truth'] as { period: Record<string, unknown> };
      const broken = {
        ...raw(),
        truth: { ...current, period: { ...current.period, strideHours: 5 } },
      };
      expect(() => validateConfiguration(broken)).toThrow(/three-hourly/);
    });
  });

  it('rejects a schema version it does not know', () => {
    expect(() => validateConfiguration({ ...raw(), schemaVersion: 7 })).toThrow(/schemaVersion/);
  });
});
