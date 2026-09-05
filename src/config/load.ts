import { configurationSchema, type Configuration } from './schema.js';
import { digestOf } from './digest.js';

/**
 * The one loader (constitution Principle X: "Configuration is loaded through one
 * module"). Nothing else in the tree parses a configuration file or validates one, and
 * nothing computes anything before this has returned.
 */

/** A startup failure with a readable message, as Principle X requires. */
export class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError';
  readonly problems: readonly string[];

  constructor(message: string, problems: readonly string[] = []) {
    super(problems.length > 0 ? `${message}\n${problems.map((p) => `  - ${p}`).join('\n')}` : message);
    this.problems = problems;
  }
}

export interface LoadedConfiguration {
  readonly config: Configuration;
  /** The digest a run manifest records, and refuses to load against a mismatch (FR-005). */
  readonly digest: string;
}

/**
 * Validate an already-parsed value. This is the whole of the checking; `loadConfiguration`
 * only adds the JSON parse in front of it, so a browser fetching the file and a test
 * passing a literal are validated by exactly the same code.
 */
export function validateConfiguration(value: unknown): LoadedConfiguration {
  const result = configurationSchema.safeParse(value);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${where}: ${issue.message}`;
    });
    throw new ConfigurationError('the configuration did not validate', problems);
  }
  return { config: result.data, digest: digestOf(result.data) };
}

/** Parse and validate configuration text. The source name appears in any failure. */
export function loadConfiguration(text: string, sourceName = 'configuration'): LoadedConfiguration {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new ConfigurationError(
      `${sourceName} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  try {
    return validateConfiguration(parsed);
  } catch (cause) {
    if (cause instanceof ConfigurationError) {
      throw new ConfigurationError(`${sourceName} did not validate`, cause.problems);
    }
    throw cause;
  }
}

/**
 * Fetch and validate the declared configuration. Used by the shell; the headless suite
 * reads the same file from disk and calls `loadConfiguration`, so the two agree by
 * construction.
 *
 * NFR-02: the URL is relative to the built site, so this is a request for one of the
 * site's own assets and not an external one.
 */
export async function fetchConfiguration(url: string): Promise<LoadedConfiguration> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ConfigurationError(`could not read ${url}: HTTP ${String(response.status)}`);
  }
  return loadConfiguration(await response.text(), url);
}
