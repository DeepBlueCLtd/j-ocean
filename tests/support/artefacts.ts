import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FieldContainer } from '../../src/truth/container.js';
import { ArtefactTruthSource } from '../../src/truth/artefact-truth-source.js';
import { parseObservationRecord, type ObservationRecord } from '../../src/truth/observations.js';

const DATA = fileURLToPath(new URL('../../data/', import.meta.url));

const bytesOf = (relative: string): ArrayBuffer => {
  const buffer = readFileSync(`${DATA}${relative}`);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

export function truthContainer(domain: string): FieldContainer {
  return new FieldContainer(bytesOf(`truth/${domain}.jocean`));
}

export function climatologyContainer(domain: string): FieldContainer {
  return new FieldContainer(bytesOf(`clim/${domain}.jocean`));
}

export function truthSource(domain: string): ArtefactTruthSource {
  return new ArtefactTruthSource(truthContainer(domain));
}

export function observations(domain: string): ObservationRecord {
  return parseObservationRecord(readFileSync(`${DATA}obs/${domain}.json`, 'utf8'));
}
