import { describe, expect, it } from 'vitest';
import { interfaceFieldFromTruth } from '../../src/instruments/interface-field.js';
import { runForecast } from '../../src/run/forecast.js';
import { discRegion, domainRegion, score } from '../../src/scoring/scorer.js';
import { climatologyContainer, observations as argoRecord, truthSource } from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();
const found = config.domains.list.find((d) => d.id === config.domains.defaultId);
if (found === undefined) throw new Error('no default domain');
const domain = found;

const truth = truthSource(domain.id);
const issueInstantMs = Date.parse(config.truth.period.start) + config.forecast.spinUpHours * 3_600_000;
const inputs = {
  config,
  domain,
  truth,
  climatology: climatologyContainer(domain.id),
  argo: argoRecord(domain.id),
  issueInstantMs,
  anchorInstantMs: issueInstantMs,
};

/**
 * The trigger for beat 012, measured (SRD §10, ADR-0011).
 *
 * Adaptive sampling is deferred until *scoring is trusted*, and the development plan says what
 * that means: **AT-02, AT-03 and AT-06 have passed**. This test measures each of them and
 * asserts the state they are actually in, so the deferral rests on evidence that is
 * re-measured on every run rather than on a decision somebody remembers making.
 *
 * **If this test fails because the figures improved, that is the signal it exists to give.**
 * Two of the three conditions are currently unmet for the same underlying reason, and the day
 * that reason is settled this test will say so by failing — at which point beat 012 should be
 * planned, not this test relaxed.
 */
describe('the beat 012 trigger', () => {
  const horizons = [...config.horizons.leadHours].sort((a, b) => a - b);
  const result = runForecast(inputs);
  const region = domainRegion(config, result.parameters.grid.nx, result.parameters.grid.ny);

  const skillAt = (leadHours: number, where = region): number | null => {
    const panel = result.byHorizon.get(leadHours);
    if (panel?.field == null) return null;
    return (
      score({
        config,
        domain,
        truth,
        forecast: panel.field,
        initial: result.initial,
        climatology: result.climatologyField,
        truthAtValidInstant: interfaceFieldFromTruth(
          truth,
          result.parameters.thermalStructure,
          result.box,
          result.parameters.grid,
          panel.validInstantMs,
        ),
        region: where,
        fromInstantMs: issueInstantMs,
        validInstantMs: panel.validInstantMs,
        externalObservationIds: result.externalObservationIds,
      }).skillAgainstPersistence?.value ?? null
    );
  };

  it('AT-02: skill does not decline across the row, so this condition is not met', () => {
    const curve = horizons.map((leadHours) => ({ leadHours, skill: skillAt(leadHours) }));
    console.log(
      `    AT-02  ${curve
        .map((point) => `+${String(point.leadHours)}h ${point.skill?.toFixed(3) ?? '—'}`)
        .join('  ')}`,
    );

    // The central claim -- positive skill against persistence at 24 h -- holds, and holds
    // narrowly. The decline the acceptance test expects does not.
    const at24 = curve.find((point) => point.leadHours === 24)?.skill ?? 0;
    expect(at24).toBeGreaterThan(0);

    const values = curve.map((point) => point.skill).filter((v): v is number => v !== null);
    const declines = values.every((value, index) => index === 0 || value <= (values[index - 1] as number));
    console.log(
      `    AT-02  non-increasing across the row: ${String(declines)} ` +
        `(the acceptance test expects true)`,
    );
    expect(declines, 'if this is now true, AT-02 may be met: see ADR-0011 and plan beat 012').toBe(
      false,
    );
  });

  it('AT-03: one measurement is worth something locally, so this condition is met', () => {
    const drop = result.observations.find((o) => !o.external);
    expect(drop).toBeDefined();
    if (drop === undefined) return;

    const withheld = runForecast({
      ...inputs,
      counterfactual: [{ kind: 'withhold', observationId: drop.id }],
    });
    const { nx, ny } = result.parameters.grid;
    const inside = discRegion(config, domain, nx, ny, drop.lonDeg, drop.latDeg, config.counterfactual.at03.regionRadiusKm);

    const before = skillAt(24, inside);
    const panel = withheld.byHorizon.get(24);
    const after =
      panel?.field == null
        ? null
        : (score({
            config,
            domain,
            truth,
            forecast: panel.field,
            initial: withheld.initial,
            climatology: withheld.climatologyField,
            truthAtValidInstant: interfaceFieldFromTruth(
              truth,
              withheld.parameters.thermalStructure,
              withheld.box,
              withheld.parameters.grid,
              panel.validInstantMs,
            ),
            region: inside,
            fromInstantMs: issueInstantMs,
            validInstantMs: panel.validInstantMs,
            externalObservationIds: withheld.externalObservationIds,
          }).skillAgainstPersistence?.value ?? null);

    console.log(
      `    AT-03  withholding one XBT takes local skill from ${before?.toFixed(3) ?? '—'} to ` +
        `${after?.toFixed(3) ?? '—'} — met`,
    );
    expect((before ?? 0) - (after ?? 0)).toBeGreaterThan(config.counterfactual.at03.minimumInsideSkillDrop);
  });

  it('AT-06: an edit does not decay by the far horizon, so this condition is not met', () => {
    const drop = result.profiles.find((p) => p.instantMs <= issueInstantMs);
    expect(drop).toBeDefined();
    if (drop === undefined) return;

    const edited = runForecast({
      ...inputs,
      counterfactual: [
        {
          kind: 'profile',
          observationId: drop.id,
          levels: (drop.levels ?? []).map((level) => ({
            depthMetres: level.depthMetres,
            value: level.value + 2,
          })),
        },
      ],
    });

    const change = (leadHours: number): number => {
      const a = result.byHorizon.get(leadHours)?.field;
      const b = edited.byHorizon.get(leadHours)?.field;
      if (a == null || b == null) return 0;
      let worst = 0;
      for (let i = 0; i < a.length; i += 1) {
        const difference = Math.abs((b[i] as number) - (a[i] as number));
        if (Number.isFinite(difference)) worst = Math.max(worst, difference);
      }
      return worst;
    };

    const near = change(config.counterfactual.at06.nearHorizonHours);
    const far = change(config.counterfactual.at06.farHorizonHours);
    console.log(
      `    AT-06  the edit moves the near horizon by ${near.toFixed(2)} m and the far one by ` +
        `${far.toFixed(2)} m (${((far / near) * 100).toFixed(0)} per cent) — not met`,
    );

    expect(near).toBeGreaterThan(config.counterfactual.at06.minimumNearChangeMetres);
    expect(
      far / near,
      'if this is now below the declared fraction, AT-06 may be met: see ADR-0011 and plan beat 012',
    ).toBeGreaterThan(config.counterfactual.at06.maximumFarFractionOfNear);
  });

  it('states the verdict in one place', () => {
    console.log(
      '    The beat 012 trigger is NOT met: AT-02 and AT-06 do not hold, and both fail for the\n' +
        '    same reason -- the declared reduced gravity and the declared thermal structure\n' +
        "    disagree about amplitude, so the model's interface anomaly is roughly three times\n" +
        '    the thermocline displacement the truth record carries, about a mean that is too\n' +
        '    deep. Adaptive sampling steered by a skill score in that state would be an\n' +
        '    advertisement. See ADR-0011 and docs/questions-for-the-author.md.',
    );
    expect(true).toBe(true);
  });
});
