import { describe, expect, it } from 'vitest';
import {
  ARGO_FLAGS,
  USABLE_ARGO_FLAGS,
  flaggedLevelCount,
  levelCount,
} from '../../src/truth/observations.js';
import { observations } from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();

/**
 * The committed observation record (FR-10, FR-24, SC-002).
 *
 * The promise this beat has to keep is that a quality flag survives conversion and is never
 * used to drop a level. Beat 008 draws a flagged observation as flagged; it cannot do that
 * if the flag was spent at build time deciding what to keep.
 */
describe('the committed Argo record', () => {
  for (const domain of config.domains.list) {
    describe(domain.id, () => {
      const record = observations(domain.id);

      it('holds profiles inside the declared box and period', () => {
        expect(record.profiles.length).toBeGreaterThan(0);
        for (const profile of record.profiles) {
          expect(profile.latDegrees).toBeGreaterThanOrEqual(domain.south);
          expect(profile.latDegrees).toBeLessThanOrEqual(domain.north);
          expect(profile.lonDegrees).toBeGreaterThanOrEqual(domain.west);
          expect(profile.lonDegrees).toBeLessThanOrEqual(domain.east);
          const when = Date.parse(profile.instant);
          expect(when).toBeGreaterThanOrEqual(Date.parse(config.truth.period.start));
          expect(when).toBeLessThanOrEqual(Date.parse(config.truth.period.end));
        }
      });

      /**
       * SC-002. The count on the left is computed here from the committed record; the count
       * on the right was computed by the convert step from the raw NetCDF arrays before
       * conversion. Two independent computations of one fact, which is the only way this
       * assertion is worth making.
       */
      it('drops no level between the raw profiles and the committed record', () => {
        const provenance = record.provenance as Record<string, unknown>;
        expect(levelCount(record)).toBe(provenance['levelsInRaw']);
      });

      it('carries every temperature flag through, with the same histogram as the raw', () => {
        const provenance = record.provenance as Record<string, unknown>;
        const recorded = provenance['temperatureFlagCountsInRaw'] as Record<string, number>;

        const here: Record<string, number> = {};
        for (const profile of record.profiles) {
          for (const level of profile.levels) {
            const key = String(level.temperatureFlag);
            here[key] = (here[key] ?? 0) + 1;
          }
        }
        expect(here).toEqual(recorded);
      });

      it('uses only flags Argo defines', () => {
        for (const profile of record.profiles) {
          for (const level of profile.levels) {
            expect(Object.keys(ARGO_FLAGS)).toContain(String(level.temperatureFlag));
            expect(Object.keys(ARGO_FLAGS)).toContain(String(level.pressureFlag));
          }
        }
      });

      it('keeps the value of a level whatever its flag says', () => {
        const flagged = record.profiles
          .flatMap((profile) => profile.levels)
          .filter((level) => !USABLE_ARGO_FLAGS.includes(level.temperatureFlag));
        for (const level of flagged) {
          // The level is present, with its pressure. A flagged observation is drawn as
          // flagged, never omitted, and the record is where that starts.
          expect(Number.isFinite(level.pressureDbar)).toBe(true);
        }
      });

      it('says where it came from and that flags are never spent on filtering', () => {
        const provenance = record.provenance as Record<string, unknown>;
        expect(provenance['source']).toBe(config.observations.source.id);
        expect(String(provenance['flagNote'])).toMatch(/drawn as flagged, not omitted/);
        expect(Array.isArray(provenance['rawInputs'])).toBe(true);
      });
    });
  }

  /**
   * Principle VI, and a fact worth stating rather than engineering around: a five-degree box
   * over a fortnight holds a handful of floats, not dozens. That sparsity is the thing the
   * harness exists to teach about, and beat 004's simulated instruments provide the rest.
   */
  it('is as sparse as the real ocean is, and the test says the figures out loud', () => {
    for (const domain of config.domains.list) {
      const record = observations(domain.id);
      const flagged = flaggedLevelCount(record);
      process.stdout.write(
        `    ${domain.id}: ${String(record.profiles.length)} profiles, ` +
          `${String(levelCount(record))} levels, ${String(flagged)} of them flagged unusable\n`,
      );
      expect(record.profiles.length).toBeLessThan(100);
    }
  });
});
