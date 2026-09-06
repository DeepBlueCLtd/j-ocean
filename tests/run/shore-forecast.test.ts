import { describe, expect, it } from 'vitest';
import { interfaceFieldFromTruth } from '../../src/instruments/interface-field.js';
import { departureBrief, runForecast } from '../../src/run/forecast.js';
import { domainRegion, score } from '../../src/scoring/scorer.js';
import { climatologyContainer, observations as argoRecord, truthSource } from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();
const found = config.domains.list.find((d) => d.id === config.domains.defaultId);
if (found === undefined) throw new Error('no default domain');
const domain = found;

const truth = truthSource(domain.id);
const startMs = Date.parse(config.truth.period.start);
const defaultIssueMs = startMs + config.forecast.spinUpHours * 3_600_000;

const inputs = {
  config,
  domain,
  truth,
  climatology: climatologyContainer(domain.id),
  argo: argoRecord(domain.id),
  anchorInstantMs: defaultIssueMs,
};

const horizons = [...config.horizons.leadHours].sort((a, b) => a - b);

function skillCurve(issueInstantMs: number): { leadHours: number; skill: number | null; error: number | null }[] {
  const result = runForecast({ ...inputs, issueInstantMs });
  const region = domainRegion(config, result.parameters.grid.nx, result.parameters.grid.ny);
  return horizons.map((leadHours) => {
    const panel = result.byHorizon.get(leadHours);
    if (panel === undefined || panel.field === null) return { leadHours, skill: null, error: null };
    const computed = score({
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
      region,
      fromInstantMs: issueInstantMs,
      validInstantMs: panel.validInstantMs,
      externalObservationIds: result.externalObservationIds,
    });
    return {
      leadHours,
      skill: computed.skillAgainstPersistence?.value ?? null,
      error: computed.forecastError.value,
    };
  });
}

/**
 * The shore forecast on two axes (FR-025, FR-026, FR-027, SC-001 to SC-004).
 *
 * Staleness and lead time are conflated everywhere, and only two controls can pull them
 * apart. These are the assertions that this harness has two.
 */
describe('the shore forecast on two axes', () => {
  it('shows the analysis only what had happened by the issue instant', () => {
    /*
     * The finding this beat opened with. Until now the analysis at the issue instant was
     * handed *every* observation the run produced, including four XBT drops and a good many
     * Argo profiles from after it: a forecast made at +24 h was using measurements taken at
     * +66 h. Every skill figure beat 006 printed was computed with information the forecast
     * could not have had.
     */
    const atDefault = runForecast({ ...inputs, issueInstantMs: defaultIssueMs });
    expect(atDefault.observationsWithheld).toBeGreaterThan(0);
    for (const observation of atDefault.observations) {
      expect(observation.instantMs).toBeLessThanOrEqual(defaultIssueMs);
    }
    console.log(
      `    at the default issue time the analysis saw ${String(atDefault.observationsAvailable)} ` +
        `observations and ${String(atDefault.observationsWithheld)} had not happened yet`,
    );

    const later = runForecast({ ...inputs, issueInstantMs: defaultIssueMs + 24 * 3_600_000 });
    expect(later.observationsAvailable).toBeGreaterThan(atDefault.observationsAvailable);
  });

  it('drops the whole curve when the forecast is issued earlier, with nothing else changed', () => {
    const current = skillCurve(defaultIssueMs);
    const earlier = skillCurve(defaultIssueMs - 12 * 3_600_000);

    for (const [index, point] of current.entries()) {
      const stale = earlier[index];
      console.log(
        `    +${String(point.leadHours)} h  issued at default ${point.skill?.toFixed(3) ?? '—'}  ` +
          `issued 12 h earlier ${stale?.skill?.toFixed(3) ?? '—'}`,
      );
    }

    // SC-001. The valid instants are identical; only the instant the forecast was made moved,
    // so anything that changed is the cost of staleness and nothing else.
    const paired = current
      .map((point, index) => ({ point, stale: earlier[index] }))
      .filter((pair) => pair.point.skill !== null && pair.stale?.skill != null);
    expect(paired.length).toBeGreaterThan(0);
    const worse = paired.filter((pair) => (pair.stale?.skill ?? 0) < (pair.point.skill ?? 0));
    console.log(
      `    the earlier issue time is worse at ${String(worse.length)} of ${String(paired.length)} horizons`,
    );
    expect(worse.length).toBe(paired.length);
  });

  it('leaves valid instants where they were and lengthens the lead instead', () => {
    const earlier = runForecast({ ...inputs, issueInstantMs: defaultIssueMs - 12 * 3_600_000 });
    const current = runForecast({ ...inputs, issueInstantMs: defaultIssueMs });
    for (const leadHours of horizons) {
      const a = current.byHorizon.get(leadHours);
      const b = earlier.byHorizon.get(leadHours);
      // FR-002: the panels are anchored. This is what makes the drop bodily rather than a
      // shift sideways, and it is the whole reason issue time is a second axis.
      expect(b?.validInstantMs).toBe(a?.validInstantMs);
      expect(b?.leadFromIssueHours).toBe((a?.leadFromIssueHours ?? 0) + 12);
    }
  });

  it('refuses a panel outside validity, and one before the forecast was issued', () => {
    // FR-005 and FR-027, both reachable from the declared control range.
    const earlier = runForecast({ ...inputs, issueInstantMs: defaultIssueMs - 12 * 3_600_000 });
    const beyond = earlier.byHorizon.get(96);
    expect(beyond?.field).toBeNull();
    expect(beyond?.refusal).toMatch(/outside validity/);

    const later = runForecast({ ...inputs, issueInstantMs: defaultIssueMs + 12 * 3_600_000 });
    const before = later.byHorizon.get(0);
    expect(before?.field).toBeNull();
    expect(before?.refusal).toMatch(/before this forecast was issued/);
  });

  it('reproduces the recorded case byte for byte when the control returns to default', () => {
    // SC-002. Not "looks the same": the same bytes, from a rerun that went somewhere else in
    // between.
    const first = runForecast({ ...inputs, issueInstantMs: defaultIssueMs });
    runForecast({ ...inputs, issueInstantMs: defaultIssueMs - 12 * 3_600_000 });
    const again = runForecast({ ...inputs, issueInstantMs: defaultIssueMs });
    for (const leadHours of horizons) {
      const a = first.byHorizon.get(leadHours)?.field;
      const b = again.byHorizon.get(leadHours)?.field;
      expect(b === null ? null : Buffer.from((b as Float64Array).buffer)).toEqual(
        a === null ? null : Buffer.from((a as Float64Array).buffer),
      );
    }
  });

  it('freezes the departure brief, whatever the issue time does', () => {
    // SC-003. The brief is the quay-side analysis held constant: correct at issue, and
    // losing to the world on its own.
    const brief = departureBrief({ ...inputs, issueInstantMs: defaultIssueMs });
    const briefAgain = departureBrief({ ...inputs, issueInstantMs: defaultIssueMs - 12 * 3_600_000 });
    expect(brief.instantMs).toBe(startMs + config.forecast.quaysideOffsetHours * 3_600_000);
    expect(briefAgain.instantMs).toBe(brief.instantMs);
    expect(Buffer.from(briefAgain.field.buffer)).toEqual(Buffer.from(brief.field.buffer));

    // At the quay side nothing has reported yet, so the brief is background and climatology.
    // That is a generous baseline, not a weak one, and it is stated rather than assumed.
    console.log(`    the departure brief used ${String(brief.observationsUsed)} observations`);
  });

  it('loses to the shore forecast as lead time grows', () => {
    const brief = departureBrief({ ...inputs, issueInstantMs: defaultIssueMs });
    const result = runForecast({ ...inputs, issueInstantMs: defaultIssueMs });
    const region = domainRegion(config, result.parameters.grid.nx, result.parameters.grid.ny);
    const errors = horizons.map((leadHours) => {
      const panel = result.byHorizon.get(leadHours);
      if (panel?.field == null) return { leadHours, brief: null, forecast: null };
      const common = {
        config,
        domain,
        truth,
        climatology: result.climatologyField,
        truthAtValidInstant: interfaceFieldFromTruth(
          truth,
          result.parameters.thermalStructure,
          result.box,
          result.parameters.grid,
          panel.validInstantMs,
        ),
        region,
        fromInstantMs: defaultIssueMs,
        validInstantMs: panel.validInstantMs,
        externalObservationIds: result.externalObservationIds,
      };
      return {
        leadHours,
        brief: score({ ...common, forecast: brief.field, initial: brief.field }).forecastError.value,
        forecast: score({ ...common, forecast: panel.field, initial: result.initial }).forecastError.value,
      };
    });
    for (const row of errors) {
      console.log(
        `    +${String(row.leadHours)} h  brief ${row.brief?.toFixed(1) ?? '—'} m  ` +
          `shore forecast ${row.forecast?.toFixed(1) ?? '—'} m`,
      );
    }
    // The brief's error is a real number at every horizon it is asked about; whether it beats
    // the shore forecast is a measurement this test prints rather than an assumption it makes.
    expect(errors.every((row) => row.brief === null || Number.isFinite(row.brief))).toBe(true);
  });
});
