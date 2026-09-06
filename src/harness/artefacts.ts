import gulfTruthUrl from '../../data/truth/gulf-stream-front.jocean?url';
import openGyreTruthUrl from '../../data/truth/open-gyre.jocean?url';
import gulfClimUrl from '../../data/clim/gulf-stream-front.jocean?url';
import openGyreClimUrl from '../../data/clim/open-gyre.jocean?url';
import gulfObsUrl from '../../data/obs/gulf-stream-front.json?url';
import openGyreObsUrl from '../../data/obs/open-gyre.json?url';
import { FieldContainer } from '../truth/container.js';
import { ArtefactTruthSource } from '../truth/artefact-truth-source.js';
import { parseObservationRecord, type ObservationRecord } from '../truth/observations.js';

/**
 * Where the committed artefacts live once the site is built.
 *
 * This module is the only place that knows the application is bundled, which is why it is in
 * the harness ring: `src/truth/` reads bytes and knows nothing about how they arrived, so the
 * same reader serves the browser and the headless suite. The URLs are emitted as static
 * assets, so loading one is a request for the site's own asset and nothing leaves the site
 * (NFR-02, SC-004).
 */
const TRUTH: Readonly<Record<string, string>> = {
  'gulf-stream-front': gulfTruthUrl,
  'open-gyre': openGyreTruthUrl,
};

const CLIMATOLOGY: Readonly<Record<string, string>> = {
  'gulf-stream-front': gulfClimUrl,
  'open-gyre': openGyreClimUrl,
};

const OBSERVATIONS: Readonly<Record<string, string>> = {
  'gulf-stream-front': gulfObsUrl,
  'open-gyre': openGyreObsUrl,
};

export class ArtefactError extends Error {
  override readonly name = 'ArtefactError';
}

async function bytesOf(url: string | undefined, what: string): Promise<ArrayBuffer> {
  if (url === undefined) throw new ArtefactError(`no committed artefact for ${what}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new ArtefactError(`could not read ${what}: HTTP ${String(response.status)}`);
  }
  return response.arrayBuffer();
}

export async function loadTruth(domainId: string): Promise<ArtefactTruthSource> {
  return new ArtefactTruthSource(new FieldContainer(await bytesOf(TRUTH[domainId], `truth for ${domainId}`)));
}

export async function loadClimatology(domainId: string): Promise<FieldContainer> {
  return new FieldContainer(await bytesOf(CLIMATOLOGY[domainId], `climatology for ${domainId}`));
}

export async function loadObservations(domainId: string): Promise<ObservationRecord> {
  const url = OBSERVATIONS[domainId];
  if (url === undefined) throw new ArtefactError(`no committed observations for ${domainId}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new ArtefactError(`could not read observations for ${domainId}: HTTP ${String(response.status)}`);
  }
  return parseObservationRecord(await response.text());
}
