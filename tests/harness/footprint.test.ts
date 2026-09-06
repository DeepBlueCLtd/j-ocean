import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  argoObservations,
  sampleSurface,
  sampleXbtDrops,
} from '../../src/instruments/instruments.js';
import { footprintOf, markersFrom, marksOf, trackValueRange } from '../../src/harness/footprint.js';
import { observations as argoRecord } from '../support/artefacts.js';
import { samplingContext } from '../support/instruments.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();
const found = config.domains.list.find((d) => d.id === config.domains.defaultId);
if (found === undefined) throw new Error('no default domain');
const domain = found;

const levels = config.model.thermalStructure.displayLevelsMetres;
const FLOOR = levels[levels.length - 1] as number;

function builtFootprint(overrides: { initialisedFromMs?: number; qualityControl?: boolean } = {}) {
  const context = samplingContext();
  const surface = sampleSurface(context);
  const drops = sampleXbtDrops(context).map(({ profile }) => profile);
  const argo = argoObservations(argoRecord(domain.id), context).map(({ profile }) => profile);
  return {
    surface,
    drops,
    argo,
    footprint: footprintOf({
      surface,
      drops,
      argo,
      box: { west: domain.west, east: domain.east, south: domain.south, north: domain.north },
      grid: { nx: config.grid.nx, ny: config.grid.ny },
      initialisedFromMs: overrides.initialisedFromMs ?? context.startMs + 24 * 3_600_000,
      spongeWidthCells: config.model.sponge.widthCells,
      volumeFloorMetres: FLOOR,
      colocationToleranceDegrees: config.presentation.footprint.colocationToleranceDegrees,
      qualityControlEnabled: overrides.qualityControl ?? config.instruments.qualityControl.enabled,
      assimilateArgo: config.instruments.argo.assimilate,
    }),
    startMs: context.startMs,
  };
}

/**
 * The footprint (FR-23, FR-24, and FR-009 of this beat).
 *
 * What the harness rejected is part of what the harness did, and a drop flattened to the
 * surface discards the dimension it exists for. These are assertions that neither happens.
 */
describe('the observation footprint', () => {
  it('has exactly one mark per observation, and loses none of them', () => {
    const { surface, drops, argo, footprint } = builtFootprint();
    // SC-001: counted, not eyeballed. An omitted observation is the failure mode.
    expect(footprint.track).toHaveLength(surface.length);
    expect(footprint.needles).toHaveLength(drops.length + argo.length);
    expect(marksOf(footprint)).toHaveLength(surface.length + drops.length + argo.length);
    expect(markersFrom(footprint)).toHaveLength(marksOf(footprint).length);
  });

  it('draws flagged observations, never omits them, and keeps their checks', () => {
    const { footprint } = builtFootprint();
    const flagged = marksOf(footprint).filter((mark) => mark.flagged);
    // The recorded case has flagged levels in the Argo record; if it ever has none, this
    // test says so rather than passing vacuously.
    expect(flagged.length, 'the recorded case carries at least one flagged observation').toBeGreaterThan(0);
    for (const mark of flagged) {
      expect(marksOf(footprint)).toContain(mark);
    }
  });

  it('marks a profile that measured nothing as having measured nothing', () => {
    const { footprint } = builtFootprint();
    const nothing = footprint.needles.filter((needle) => needle.measuredNothing);

    /*
     * Five delayed-mode Argo profiles in the recorded case report a temperature at no level
     * at all -- every level null, with an Argo flag of 4. The derived interface observation
     * has always been flagged `unresolved` and excluded from the analysis, which is right.
     * The *profile* carried no flag at all, so the thing the footprint draws looked exactly
     * like one that measured everything. Beat 008 put the flag where the drawing is.
     */
    expect(nothing.length, 'the recorded case contains profiles that measured nothing').toBeGreaterThan(0);
    for (const needle of nothing) {
      expect(needle.flagged).toBe(true);
      expect(needle.deepestMetres).toBe(0);
      expect(needle.flags.map((flag) => flag.code)).toContain('unresolved');
    }
    // And every other needle measured something, so the flag means what it says.
    for (const needle of footprint.needles.filter((n) => !n.measuredNothing)) {
      expect(needle.deepestMetres).toBeGreaterThan(0);
    }
  });

  it('gives every needle the extent it actually sampled', () => {
    const { drops, footprint } = builtFootprint();
    for (const drop of drops) {
      const needle = footprint.needles.find((candidate) => candidate.id === drop.id);
      expect(needle).toBeDefined();
      const depths = (drop.levels ?? []).map((level) => level.depthMetres);
      // SC-002: the extent is the depth reached, which is not the depth asked for. An XBT
      // infers its depth from a fall-rate equation, so these differ by a declared fraction.
      expect(needle?.deepestMetres).toBeCloseTo(Math.max(...depths), 10);
      expect(needle?.shallowestMetres).toBeCloseTo(Math.min(...depths), 10);
      expect(needle?.levels).toHaveLength(depths.length);
    }
  });

  it('says when a probe went past the floor of the displayed volume', () => {
    const { footprint } = builtFootprint();
    for (const needle of footprint.needles) {
      expect(needle.continuesBelow).toBe(needle.deepestMetres > FLOOR);
    }
    // Argo profiles reach far past a 700 m display volume; the barb is not decoration.
    const deep = footprint.needles.filter((needle) => needle.continuesBelow);
    expect(deep.length, 'at least one profile reaches past the displayed volume').toBeGreaterThan(0);
    expect(deep.every((needle) => needle.kind === 'external')).toBe(true);
  });

  it('separates what informed a forecast from what came after it', () => {
    const { footprint, startMs } = builtFootprint();
    const initialisedFromMs = startMs + 24 * 3_600_000;
    for (const mark of marksOf(footprint)) {
      expect(mark.afterInitialisation).toBe(mark.instantMs > initialisedFromMs);
    }
    // FR-002 is only worth drawing if the recorded case has both kinds, and it does.
    const marks = marksOf(footprint);
    expect(marks.some((mark) => mark.afterInitialisation)).toBe(true);
    expect(marks.some((mark) => !mark.afterInitialisation)).toBe(true);
  });

  it('offsets co-located needles so two profiles are two needles', () => {
    const context = samplingContext();
    const drops = sampleXbtDrops(context).map(({ profile }) => profile);
    const first = drops[0];
    if (first === undefined) throw new Error('no drops');
    const footprint = footprintOf({
      surface: [],
      // The same position twice: the edge case the spec names.
      drops: [first, { ...first, id: `${first.id}-twin` }],
      argo: [],
      box: { west: domain.west, east: domain.east, south: domain.south, north: domain.north },
      grid: { nx: config.grid.nx, ny: config.grid.ny },
      initialisedFromMs: context.startMs,
      spongeWidthCells: config.model.sponge.widthCells,
      volumeFloorMetres: FLOOR,
      colocationToleranceDegrees: config.presentation.footprint.colocationToleranceDegrees,
      qualityControlEnabled: true,
      assimilateArgo: true,
    });
    expect(footprint.needles.map((needle) => needle.offsetIndex)).toEqual([0, 1]);
  });

  it('scales the track marks against the track own range, and reports it', () => {
    const { footprint } = builtFootprint();
    const range = trackValueRange(footprint);
    const intensities = markersFrom(footprint)
      .filter((marker) => marker.kind === 'track')
      .map((marker) => marker.intensity ?? -1);
    expect(Math.min(...intensities)).toBeCloseTo(0, 10);
    expect(Math.max(...intensities)).toBeCloseTo(1, 10);
    expect(range.high).toBeGreaterThan(range.low);
  });

  it('carries the quality-control state rather than inferring it from the flags', () => {
    // FR-007: a run with no flags because control was off is not a run that passed its checks,
    // and the two must not be indistinguishable.
    expect(builtFootprint({ qualityControl: false }).footprint.qualityControlEnabled).toBe(false);
    expect(builtFootprint({ qualityControl: true }).footprint.qualityControlEnabled).toBe(true);
  });

  /**
   * FR-009, checked the only way a claim about what a module *cannot* do can be checked: by
   * reading its imports. The footprint draws what was measured; a footprint that could reach
   * truth would be a picture of the answer instead.
   */
  it('imports nothing that could sample truth or run the model', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../src/harness/footprint.ts', import.meta.url)),
      'utf8',
    );
    const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1] as string);
    expect(specifiers.sort()).toEqual(['../instruments/observation.js', './FieldView.js']);
    for (const specifier of specifiers) {
      expect(specifier).not.toMatch(/truth|ports\/|model\/|analysis\//);
    }
  });
});
