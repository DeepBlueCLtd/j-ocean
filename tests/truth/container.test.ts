import { describe, expect, it } from 'vitest';
import { ContainerError, FieldContainer } from '../../src/truth/container.js';
import { climatologyContainer, truthContainer } from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();

/**
 * The committed container (FR-009). The point of these tests is that the TypeScript reader
 * and the Python writer agree about a file neither of them can renegotiate: the artefact is
 * committed, and G-01 will not let it change without the convert step changing first.
 */
describe('the committed field container', () => {
  for (const domain of config.domains.list) {
    describe(domain.id, () => {
      const container = truthContainer(domain.id);

      it('declares the shape the coordinates imply', () => {
        const times = container.coordinate('timeMs');
        const depths = container.coordinate('depthMetres');
        const lats = container.coordinate('latDegrees');
        const lons = container.coordinate('lonDegrees');

        expect(container.variable('surface_elevation').shape).toEqual([times.length, lats.length, lons.length]);
        expect(container.variable('water_temperature').shape).toEqual([
          times.length,
          depths.length,
          lats.length,
          lons.length,
        ]);
        expect([...depths]).toEqual(config.truth.depthLevelsMetres);
      });

      it('covers the declared period, and records the source own irregular spacing', () => {
        const times = container.coordinate('timeMs');
        expect(times[0]).toBe(Date.parse(config.truth.period.start));
        expect(times[times.length - 1]).toBe(Date.parse(config.truth.period.end));

        // The reanalysis is missing occasional snapshots, so the instants are not evenly
        // spaced and this test does not pretend they are. What it does insist on is that
        // every gap is within the declared maximum and that the spacing present is
        // recorded, so a reader can see the record's irregularity instead of inferring it.
        const maximum = config.truth.period.maxInstantGapHours ?? Number.POSITIVE_INFINITY;
        const observed = new Set<number>();
        for (let i = 1; i < times.length; i += 1) {
          const hours = ((times[i] as number) - (times[i - 1] as number)) / 3_600_000;
          expect(hours).toBeGreaterThanOrEqual(config.truth.period.strideHours);
          expect(hours).toBeLessThanOrEqual(maximum);
          observed.add(hours);
        }
        const provenance = container.header.provenance as Record<string, unknown>;
        expect(provenance['instantSpacingHours']).toEqual([...observed].sort((a, b) => a - b));
        expect(provenance['instantCount']).toBe(times.length);
        expect(String(provenance['gapNote'])).toMatch(/nothing is interpolated at build time/);
      });

      it('records the native resolution from the artefact rather than leaving it to be guessed', () => {
        expect(container.header.nativeResolutionDegrees).toBe(domain.nativeResolutionDegrees);
      });

      it('carries a provenance naming the source and every raw input', () => {
        const provenance = container.header.provenance as Record<string, unknown>;
        expect(provenance['source']).toBe(config.truth.source.id);
        expect(provenance['producedBy']).toBe('data/scripts/convert.py');
        expect(Array.isArray(provenance['rawInputs'])).toBe(true);
        for (const input of provenance['rawInputs'] as { sha256: string; url: string }[]) {
          expect(input.sha256).toMatch(/^[0-9a-f]{64}$/);
          expect(input.url).toMatch(/^https:/);
        }
      });

      it('decodes land as NaN rather than as a plausible number', () => {
        const values = container.decode('water_temperature');
        let finite = 0;
        let lowest = Number.POSITIVE_INFINITY;
        let highest = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < values.length; i += 1) {
          const value = values[i] as number;
          if (!Number.isFinite(value)) continue;
          finite += 1;
          if (value < lowest) lowest = value;
          if (value > highest) highest = value;
        }
        expect(finite).toBeGreaterThan(0);
        expect(lowest).toBeGreaterThan(-5);
        expect(highest).toBeLessThan(40);
      });

      it('is stored at the precision of the source and not at an invented one', () => {
        // int16 with a declared scale, exactly as the upstream product stores it.
        const variable = container.variable('water_temperature');
        expect(variable.dtype).toBe('int16');
        expect(variable.scaleFactor).toBeGreaterThan(0);
        expect(container.raw('water_temperature')).toBeInstanceOf(Int16Array);
      });
    });
  }

  /**
   * The fill value is not decoration: the Gulf Stream box reaches the continental shelf and
   * has land in it, while the open gyre box is all ocean. If the reader turned land into a
   * plausible number, the shelf would quietly become water at 700 m.
   */
  it('finds land where there is land, and none where there is not', () => {
    const countLand = (domain: string): number => {
      const values = truthContainer(domain).decode('water_temperature');
      let land = 0;
      for (let i = 0; i < values.length; i += 1) if (!Number.isFinite(values[i] as number)) land += 1;
      return land;
    };
    expect(countLand('gulf-stream-front')).toBeGreaterThan(0);
    expect(countLand('open-gyre')).toBe(0);
  });

  it('refuses something that is not a container', () => {
    const notAContainer = new TextEncoder().encode('this is not a container at all!!').buffer;
    expect(() => new FieldContainer(notAContainer as ArrayBuffer)).toThrow(ContainerError);
  });

  it('gives the climatology no time axis, because a climatology has no instant', () => {
    const container = climatologyContainer(config.domains.defaultId);
    expect(container.header.coordinates['timeMs']).toBeUndefined();
    expect(container.variable('water_temperature').dims).toEqual(['depth', 'lat', 'lon']);
  });

  /** ADR-0008: the dependency is recorded, and beat 006 turns it into an on-screen caveat. */
  it('records what computing the climatology from the same subset costs', () => {
    const provenance = climatologyContainer(config.domains.defaultId).header.provenance as Record<string, unknown>;
    expect(provenance['window']).toEqual(config.climatology.window);
    expect(typeof provenance['overlapWithRunPeriodDays']).toBe('number');
    expect(provenance['overlapWithRunPeriodDays']).toBeGreaterThan(0);
    expect(String(provenance['independenceNote'])).toMatch(/not a fully independent measure/);
  });
});
