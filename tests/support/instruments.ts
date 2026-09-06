import type { Configuration } from '../../src/config/schema.js';
import { parametersFor } from '../../src/model/parameters.js';
import { climatologyReferenceOver } from '../../src/instruments/climatology-reference.js';
import type { SamplingContext } from '../../src/instruments/instruments.js';
import { SeededRng } from '../../src/run/rng.js';
import { climatologyContainer, truthSource } from './artefacts.js';
import { declaredConfiguration } from './config.js';

export function samplingContext(overrides: Partial<Configuration> = {}): SamplingContext {
  const { config } = declaredConfiguration();
  const merged = { ...config, ...overrides } as Configuration;
  const domain = merged.domains.list.find((d) => d.id === merged.domains.defaultId);
  if (domain === undefined) throw new Error('no default domain');
  return {
    config: merged,
    truth: truthSource(domain.id),
    rng: new SeededRng(merged.run.defaultSeed),
    climatology: climatologyReferenceOver(climatologyContainer(domain.id)),
    structure: parametersFor(merged, domain).thermalStructure,
    startMs: Date.parse(merged.truth.period.start),
  };
}
