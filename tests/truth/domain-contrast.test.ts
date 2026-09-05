import { describe, expect, it } from 'vitest';
import { SURFACE_ELEVATION } from '../../src/truth/artefact-truth-source.js';
import { truthContainer } from '../support/artefacts.js';
import { declaredConfiguration } from '../support/config.js';

const { config } = declaredConfiguration();

/** Population variance over the finite values, land excluded rather than counted as zero. */
function varianceOf(values: Float64Array): { variance: number; n: number } {
  let n = 0;
  let mean = 0;
  let sumSquares = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] as number;
    if (!Number.isFinite(value)) continue;
    n += 1;
    const delta = value - mean;
    mean += delta / n;
    sumSquares += delta * (value - mean);
  }
  return { variance: n > 1 ? sumSquares / (n - 1) : 0, n };
}

/**
 * FR-11 and SC-003: the two domains exist so that the harness has a contrast, and the
 * contrast has to be a measured fact rather than a label. A bland domain that turned out not
 * to be bland would make beat 012's whole demonstration meaningless -- adaptive sampling in
 * a uniform ocean is supposed to buy nothing, and if the "uniform" ocean has a front in it
 * the harness would appear to win for the wrong reason.
 *
 * The figures are printed, not merely asserted (Principle VI): a passing test that hides its
 * numbers cannot tell you that the margin has been shrinking.
 */
describe('the two domains contrast', () => {
  it('has more sea-surface height variance in the eventful domain than in the bland one', () => {
    const measured = config.domains.list.map((domain) => ({
      domain,
      ...varianceOf(truthContainer(domain.id).decode(SURFACE_ELEVATION)),
    }));

    for (const row of measured) {
      process.stdout.write(
        `    ${row.domain.id} (${row.domain.character}): ` +
          `sea-surface height variance ${row.variance.toExponential(3)} m^2, ` +
          `standard deviation ${Math.sqrt(row.variance).toFixed(4)} m, over ${String(row.n)} values\n`,
      );
    }

    const eventful = measured.find((row) => row.domain.character === 'eventful');
    const bland = measured.find((row) => row.domain.character === 'bland');
    expect(eventful).toBeDefined();
    expect(bland).toBeDefined();

    const ratio = (eventful?.variance ?? 0) / (bland?.variance ?? 1);
    process.stdout.write(
      `    ratio ${ratio.toFixed(2)}, declared minimum ` +
        `${String(config.truth.contrast.minimumEventfulToBlandVarianceRatio)}\n`,
    );
    expect(ratio).toBeGreaterThanOrEqual(config.truth.contrast.minimumEventfulToBlandVarianceRatio);
  });
});
