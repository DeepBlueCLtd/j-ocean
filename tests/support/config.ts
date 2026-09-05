import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfiguration, type LoadedConfiguration } from '../../src/config/load.js';

export const CONFIG_PATH = fileURLToPath(new URL('../../config/j-ocean.json', import.meta.url));

/** The declared configuration, loaded through the one loader the shell uses (Principle X). */
export function declaredConfiguration(): LoadedConfiguration {
  return loadConfiguration(readFileSync(CONFIG_PATH, 'utf8'), CONFIG_PATH);
}
