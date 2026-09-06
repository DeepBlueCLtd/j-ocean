#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { runManifestSchema } from '../../src/run/manifest.js';

/**
 * The committed JSON Schema for a run manifest (beat 011, FR-001).
 *
 * There is one definition -- the zod schema in `src/run/manifest.ts` -- and this writes a
 * portable copy of it for anybody who wants to validate a manifest without this code. A test
 * regenerates it and compares, so the copy cannot drift from the definition; it is the same
 * arrangement gate G-01 makes for the data artefacts, for the same reason.
 */

export const SCHEMA_PATH = fileURLToPath(
  new URL('../../schemas/run-manifest.schema.json', import.meta.url),
);

export function manifestJsonSchema(): unknown {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://deepbluecltd.github.io/j-ocean/schemas/run-manifest.schema.json',
    title: 'j-ocean run manifest',
    description:
      'Everything needed to rebuild a run and nothing of its state. A manifest carrying a ' +
      'field, a score or an observation is invalid: replay is re-computation, not the ' +
      'restoration of a snapshot.',
    ...(z.toJSONSchema(runManifestSchema, { io: 'output' }) as Record<string, unknown>),
  };
}

export function serialiseSchema(): string {
  return `${JSON.stringify(manifestJsonSchema(), null, 2)}\n`;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  writeFileSync(SCHEMA_PATH, serialiseSchema());
  console.log(`run manifest JSON Schema -> ${SCHEMA_PATH}`);
}
