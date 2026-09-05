import { describe, expect, it } from 'vitest';
import { SURFACE_ELEVATION, WATER_TEMPERATURE } from '../../src/truth/artefact-truth-source.js';
import { truthContainer, truthSource } from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();
const DOMAIN = config.domains.defaultId;

/**
 * The truth-source port over the committed artefact (FR-010, User Story 5).
 *
 * The interpolation is declared, so these tests check it against the artefact rather than
 * against themselves: sampling at a stored node returns the stored value, and a reader can
 * check one number by hand.
 */
describe('the truth source over a committed artefact', () => {
  const source = truthSource(DOMAIN);
  const container = truthContainer(DOMAIN);
  const lats = container.coordinate('latDegrees');
  const lons = container.coordinate('lonDegrees');
  const times = container.coordinate('timeMs');
  const depths = container.coordinate('depthMetres');

  const oceanCell = (): { latIndex: number; lonIndex: number } => {
    const shape = container.variable(WATER_TEMPERATURE).shape;
    const [, depthCount, latCount, lonCount] = shape as [number, number, number, number];
    for (let y = 0; y < latCount; y += 1) {
      for (let x = 0; x < lonCount; x += 1) {
        const deepest = depthCount - 1;
        const index = deepest * latCount * lonCount + y * lonCount + x;
        if (Number.isFinite(container.at(WATER_TEMPERATURE, index))) return { latIndex: y, lonIndex: x };
      }
    }
    throw new Error('this artefact is entirely land, which cannot be right');
  };

  it('reports the artefact own native resolution, not one it inferred', () => {
    expect(source.nativeResolutionDegrees).toBe(config.truth.source.nativeResolutionDegrees);
  });

  it('covers the declared box and period', () => {
    const coverage = source.coverage();
    const domain = config.domains.list.find((d) => d.id === DOMAIN);
    expect(coverage.west).toBeCloseTo(domain?.west ?? 0, 1);
    expect(coverage.east).toBeCloseTo(domain?.east ?? 0, 1);
    expect(coverage.fromMs).toBe(Date.parse(config.truth.period.start));
    expect(coverage.toMs).toBe(Date.parse(config.truth.period.end));
  });

  it('returns the stored value exactly at a stored node, depth and instant', () => {
    const { latIndex, lonIndex } = oceanCell();
    const depthIndex = 2;
    const timeIndex = 5;
    const flat =
      timeIndex * depths.length * lats.length * lons.length +
      depthIndex * lats.length * lons.length +
      latIndex * lons.length +
      lonIndex;
    const stored = container.at(WATER_TEMPERATURE, flat);

    const sampled = source.sample({
      variable: WATER_TEMPERATURE,
      lonDeg: lons[lonIndex] as number,
      latDeg: lats[latIndex] as number,
      depthMetres: depths[depthIndex] as number,
      instantMs: times[timeIndex] as number,
    });
    expect(sampled).toBe(stored);
  });

  it('interpolates linearly between two stored instants, and says it is doing so', () => {
    const { latIndex, lonIndex } = oceanCell();
    const at = (timeIndex: number): number =>
      source.sample({
        variable: SURFACE_ELEVATION,
        lonDeg: lons[lonIndex] as number,
        latDeg: lats[latIndex] as number,
        depthMetres: 0,
        instantMs: times[timeIndex] as number,
      });
    const before = at(3);
    const after = at(4);
    const halfway = source.sample({
      variable: SURFACE_ELEVATION,
      lonDeg: lons[lonIndex] as number,
      latDeg: lats[latIndex] as number,
      depthMetres: 0,
      instantMs: ((times[3] as number) + (times[4] as number)) / 2,
    });
    expect(halfway).toBeCloseTo((before + after) / 2, 10);
  });

  it('interpolates bilinearly between four stored nodes', () => {
    const { latIndex, lonIndex } = oceanCell();
    const corner = (dy: number, dx: number): number =>
      source.sample({
        variable: SURFACE_ELEVATION,
        lonDeg: lons[lonIndex + dx] as number,
        latDeg: lats[latIndex + dy] as number,
        depthMetres: 0,
        instantMs: times[0] as number,
      });
    const middle = source.sample({
      variable: SURFACE_ELEVATION,
      lonDeg: ((lons[lonIndex] as number) + (lons[lonIndex + 1] as number)) / 2,
      latDeg: ((lats[latIndex] as number) + (lats[latIndex + 1] as number)) / 2,
      depthMetres: 0,
      instantMs: times[0] as number,
    });
    const mean = (corner(0, 0) + corner(0, 1) + corner(1, 0) + corner(1, 1)) / 4;
    expect(middle).toBeCloseTo(mean, 10);
  });

  it('refuses a query outside the artefact rather than extrapolating', () => {
    const outside = {
      variable: SURFACE_ELEVATION,
      lonDeg: 0,
      latDeg: 0,
      depthMetres: 0,
      instantMs: times[0] as number,
    };
    expect(() => source.sample(outside)).toThrow(/outside this artefact/);
    expect(() =>
      source.sample({ ...outside, lonDeg: lons[0] as number, latDeg: lats[0] as number, instantMs: 0 }),
    ).toThrow(/outside this artefact/);
  });

  it('refuses a variable the artefact does not carry', () => {
    expect(() =>
      source.sample({
        variable: 'salinity',
        lonDeg: lons[0] as number,
        latDeg: lats[0] as number,
        depthMetres: 0,
        instantMs: times[0] as number,
      }),
    ).toThrow(/has no variable salinity/);
  });

  it('says NaN over land rather than averaging around it into invented ocean', () => {
    // The deepest level of the Gulf Stream box has shelf in it. Find a land cell and ask.
    const shape = container.variable(WATER_TEMPERATURE).shape as [number, number, number, number];
    const [, depthCount, latCount, lonCount] = shape;
    const deepest = depthCount - 1;
    let found: { y: number; x: number } | null = null;
    for (let y = 0; y < latCount && found === null; y += 1) {
      for (let x = 0; x < lonCount; x += 1) {
        if (!Number.isFinite(container.at(WATER_TEMPERATURE, deepest * latCount * lonCount + y * lonCount + x))) {
          found = { y, x };
          break;
        }
      }
    }
    expect(found).not.toBeNull();
    const value = source.sample({
      variable: WATER_TEMPERATURE,
      lonDeg: lons[found?.x ?? 0] as number,
      latDeg: lats[found?.y ?? 0] as number,
      depthMetres: depths[deepest] as number,
      instantMs: times[0] as number,
    });
    expect(Number.isNaN(value)).toBe(true);
  });

  it('carries the artefact provenance, so a figure drawn from it can say where it came from', () => {
    expect(source.provenance()['source']).toBe(config.truth.source.id);
  });
});
