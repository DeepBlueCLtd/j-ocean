import { describe, expect, it } from 'vitest';
import { interfaceFieldFromContainer, interfaceFieldFromTruth } from '../../src/instruments/interface-field.js';
import { scoreEveryHorizon } from '../../src/harness/scoring-run.js';
import { departureBrief, runForecast, type ForecastResult } from '../../src/run/forecast.js';
import { domainRegion, score } from '../../src/scoring/scorer.js';
import {
  climatologyContainer,
  observations as argoRecord,
  truthSource,
} from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();
const found = config.domains.list.find((d) => d.id === config.domains.defaultId);
if (found === undefined) throw new Error('no default domain');
const domain = found;

const truth = truthSource(domain.id);
const climatology = climatologyContainer(domain.id);
const issueInstantMs =
  Date.parse(config.truth.period.start) + config.forecast.spinUpHours * 3_600_000;

const inputs = {
  config,
  domain,
  truth,
  climatology,
  argo: argoRecord(domain.id),
  issueInstantMs,
  anchorInstantMs: issueInstantMs,
};
const forecast: ForecastResult = runForecast({ ...inputs, counterfactual: [] });
const brief = departureBrief(inputs);
const run = scoreEveryHorizon({ config, domain, forecast, truth, climatology, brief });

const horizons = [...config.horizons.leadHours].sort((a, b) => a - b);

/**
 * The row's scores, computed without a row (spec 013 T020, FR-011).
 *
 * This was `HorizonRow.scoreAll`: the only way to obtain the figures the surface shows was to
 * render the surface, and gate G-07 could therefore only digest a transcription of it. That
 * this file runs at all -- in Node, with no DOM, importing nothing that draws -- is half of
 * what the lift was for. The other half is that the figures below are the ones G-07 holds.
 */
describe('scoring every horizon, headlessly', () => {
  it('scores every declared horizon and refuses nothing in the recorded case', () => {
    expect(run.refusal).toBeNull();
    expect([...run.scores.keys()]).toEqual(horizons);
    expect([...run.briefScores.keys()]).toEqual(horizons);
    for (const leadHours of horizons) {
      expect(run.scores.get(leadHours)).not.toBeNull();
      expect(run.briefScores.get(leadHours)).not.toBeNull();
    }
    expect(run.issueInstantMs).toBe(forecast.issueInstantMs);
  });

  it('produces the recorded case\'s figures at the 24-hour horizon', () => {
    const at24 = run.scores.get(24);
    if (at24 == null) throw new Error('no score at the 24-hour horizon');
    expect(at24.forecastError.value).toBeCloseTo(74.78984927592177, 10);
    expect(at24.persistenceError.value).toBeCloseTo(82.07530091589655, 10);
    expect(at24.climatologyError.value).toBeCloseTo(27.634048391504347, 10);
    expect(at24.skillAgainstPersistence?.value).toBeCloseTo(0.0887654575575697, 12);
    expect(at24.skillAgainstClimatology?.value).toBeCloseTo(-1.706438384138993, 12);
    // Principle VI: the harness can lose, and says so in the scorer's own words.
    expect(at24.statement).toBe(
      'better than persistence by 8.9 per cent; worse than climatology by 170.6 per cent',
    );
    // The region is the domain less the sponge margin, which is what `domainRegion` gives and
    // what the row's panels are scored over -- not the whole 100 x 100 grid. Of its 7,744
    // cells, 7,558 carried a value in every field at this horizon and were scored.
    expect(at24.provenance.regionLabel).toBe('the domain less its 6-cell sponge margin');
    expect(at24.provenance.marginCells.value).toBe(6);
    expect(at24.provenance.cellsScored.value).toBe(7558);
  });

  it('holds the panel at lead zero against itself, so it has exactly no skill', () => {
    const at0 = run.scores.get(0);
    if (at0 == null) throw new Error('no score at the zero-hour horizon');
    expect(at0.forecastError.value).toBeCloseTo(at0.persistenceError.value, 12);
    expect(at0.skillAgainstPersistence?.value).toBeCloseTo(0, 12);
  });

  it('scores the departure brief against itself held, which is what the row asks of it', () => {
    // FR-026, and the one shape in `scoreAll` worth naming: the brief is passed as *both* the
    // forecast and the initial field, so its persistence reference is itself and its skill
    // against persistence is zero at every horizon by construction. What the brief is for is
    // the comparison against climatology, and that does move with the horizon.
    for (const leadHours of horizons) {
      const briefScore = run.briefScores.get(leadHours);
      if (briefScore == null) throw new Error(`no brief score at ${String(leadHours)} hours`);
      expect(briefScore.skillAgainstPersistence?.value).toBeCloseTo(0, 12);
      expect(briefScore.forecastError.value).toBeCloseTo(briefScore.persistenceError.value, 12);
    }
    expect(run.briefScores.get(24)?.skillAgainstClimatology?.value).toBeCloseTo(
      -1.943522791166561,
      12,
    );
  });

  it('reads each panel against truth at that panel\'s own valid instant', () => {
    // Not a tautology: it pins which inputs the producer reaches for. The climatology is the
    // interface field from the container and not the forecast's own copy, the persistence
    // reference is the issue analysis, and the truth is sampled at the panel's valid instant
    // rather than at the issue instant.
    const region = domainRegion(config, forecast.parameters.grid.nx, forecast.parameters.grid.ny);
    const climatologyField = interfaceFieldFromContainer(
      climatology,
      forecast.parameters.thermalStructure,
      forecast.box,
      forecast.parameters.grid,
    );
    for (const leadHours of horizons) {
      const panel = forecast.byHorizon.get(leadHours);
      if (panel?.field == null) throw new Error(`no field at ${String(leadHours)} hours`);
      const expected = score({
        config,
        domain,
        truth,
        forecast: panel.field,
        initial: forecast.initial,
        climatology: climatologyField,
        truthAtValidInstant: interfaceFieldFromTruth(
          truth,
          forecast.parameters.thermalStructure,
          forecast.box,
          forecast.parameters.grid,
          panel.validInstantMs,
        ),
        region,
        fromInstantMs: forecast.issueInstantMs,
        validInstantMs: panel.validInstantMs,
        externalObservationIds: forecast.externalObservationIds,
      });
      expect(run.scores.get(leadHours)).toEqual(expected);
    }
  });

  it('gives the skill curve one point per horizon, in horizon order', () => {
    expect(run.points.map((point) => point.leadHours)).toEqual(horizons);
    expect(run.points.map((point) => point.skill)).toEqual(
      horizons.map((leadHours) => run.scores.get(leadHours)?.skillAgainstPersistence?.value ?? null),
    );
    expect(run.points.map((point) => point.skill)).toEqual([
      0,
      -0.06707429799962394,
      0.0887654575575697,
      -0.06951046771612401,
      0.024273444032213876,
      -0.05692932618170121,
    ]);
  });

  it('is a function of its inputs and of nothing else', () => {
    // Principle I: no clock, no entropy. Called twice on the same inputs it is the same run,
    // which is what lets G-07 hold a digest of it.
    const again = scoreEveryHorizon({ config, domain, forecast, truth, climatology, brief });
    expect([...again.scores.entries()]).toEqual([...run.scores.entries()]);
    expect([...again.briefScores.entries()]).toEqual([...run.briefScores.entries()]);
    expect(again.points).toEqual(run.points);
  });
});
