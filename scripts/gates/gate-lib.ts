import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared machinery for the gates (constitution, Quality gates).
 *
 * Two things every gate here has in common, and both are deliberate:
 *
 *  - **`--root` swaps the tree for a fixture.** Each gate's planted violation lives under
 *    `scripts/gates/fixtures/<gate>/`, laid out exactly like the repository, so that
 *    running the gate against the fixture runs the same code down the same path. A gate
 *    with a special "test mode" would be testing its test mode (PR-04).
 *  - **Every gate reports how many files it scanned.** A gate that passes because its walk
 *    found nothing is the most comfortable kind of broken, and the only defence is to make
 *    the number visible and to assert on it (plan 001, Risks).
 */

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const ALWAYS_IGNORED = new Set([
  '.git', 'node_modules', 'dist', 'coverage', 'test-results', 'playwright-report', '.vite',
]);

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
  readonly text: string;
  readonly message: string;
}

export interface GateResult {
  readonly gate: string;
  readonly scanned: number;
  readonly violations: readonly Violation[];
  /** Exemption markers the gate honoured. Every one is listed so it can be reviewed. */
  readonly honoured?: readonly string[];
  readonly notes?: readonly string[];
}

export interface WalkOptions {
  /** Directories, relative to the root, to walk. Missing ones are simply not walked. */
  readonly include: readonly string[];
  readonly extensions?: readonly string[];
  /** Path fragments, relative to the root, to skip. Compared with `/` separators. */
  readonly excludePrefixes?: readonly string[];
}

/** Every file under `include`, as paths relative to `root`, using `/` separators. */
export function walk(root: string, options: WalkOptions): string[] {
  const found: string[] = [];
  const exclude = options.excludePrefixes ?? [];

  const visit = (absolute: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(absolute);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      if (ALWAYS_IGNORED.has(entry)) continue;
      const child = join(absolute, entry);
      const rel = relative(root, child).split(sep).join('/');
      if (exclude.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue;
      if (statSync(child).isDirectory()) {
        visit(child);
      } else if (
        options.extensions === undefined ||
        options.extensions.some((ext) => entry.endsWith(ext))
      ) {
        found.push(rel);
      }
    }
  };

  for (const dir of options.include) visit(join(root, dir));
  return found;
}

/**
 * Blank out comments, keeping line count and column positions intact.
 *
 * A gate that reads comments flags the sentence explaining what it forbids, which trains
 * people to write around the gate rather than to obey it. So the source-scanning gates look
 * at code: `stripComments` replaces every comment character with a space, so that a match's
 * line and column still point at the real thing.
 *
 * String literals are tracked but not blanked. Tracking them stops `"https://example"` from
 * being read as the start of a comment; not blanking them means a forbidden name written
 * inside a string is still reported, which is the right way round for a gate. Where the
 * scanner is defeated — a regular expression literal containing an unbalanced quote — it
 * stops stripping and the gate becomes more suspicious, never less.
 */
export function stripComments(lines: readonly string[]): string[] {
  const out: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    let result = '';
    let quote: string | null = null;
    let i = 0;
    while (i < line.length) {
      const c = line[i] as string;
      const next = line[i + 1];

      if (inBlock) {
        if (c === '*' && next === '/') {
          inBlock = false;
          result += '  ';
          i += 2;
        } else {
          result += ' ';
          i += 1;
        }
        continue;
      }

      if (quote !== null) {
        result += c;
        if (c === '\\') {
          result += next ?? '';
          i += 2;
          continue;
        }
        if (c === quote) quote = null;
        i += 1;
        continue;
      }

      if (c === '"' || c === "'" || c === '`') {
        quote = c;
        result += c;
        i += 1;
        continue;
      }
      if (c === '/' && next === '/') {
        result += ' '.repeat(line.length - i);
        break;
      }
      if (c === '/' && next === '*') {
        inBlock = true;
        result += '  ';
        i += 2;
        continue;
      }
      result += c;
      i += 1;
    }
    out.push(result);
  }
  return out;
}

export function readLines(root: string, relativePath: string): string[] {
  return readFileSync(join(root, relativePath), 'utf8').split('\n');
}

/** Parse `--root <dir>` from a gate's own arguments. Defaults to the repository. */
export function rootFromArgv(argv: readonly string[]): string {
  const index = argv.indexOf('--root');
  if (index === -1) return REPO_ROOT;
  const value = argv[index + 1];
  if (value === undefined) throw new Error('--root needs a directory');
  return join(REPO_ROOT, value);
}

/** Print a result the way every gate prints it, and return the process exit code. */
export function report(result: GateResult): number {
  const ok = result.violations.length === 0;
  const headline = ok ? 'PASS' : 'FAIL';
  process.stdout.write(
    `${headline}  ${result.gate}  (${String(result.scanned)} file${result.scanned === 1 ? '' : 's'} scanned)\n`,
  );
  for (const violation of result.violations) {
    const where = violation.column === undefined
      ? `${violation.file}:${String(violation.line)}`
      : `${violation.file}:${String(violation.line)}:${String(violation.column)}`;
    process.stdout.write(`      ${where}  ${violation.message}\n`);
    process.stdout.write(`        ${violation.text.trim()}\n`);
  }
  for (const marker of result.honoured ?? []) {
    process.stdout.write(`      honoured exemption: ${marker}\n`);
  }
  for (const note of result.notes ?? []) {
    process.stdout.write(`      note: ${note}\n`);
  }
  if (result.scanned === 0) {
    process.stdout.write('      note: this gate scanned no files, which is itself suspect\n');
  }
  return ok ? 0 : 1;
}

/** Run a gate as a program: parse `--root`, report, exit. */
export function runAsMain(gate: (root: string) => GateResult): void {
  const code = report(gate(rootFromArgv(process.argv.slice(2))));
  process.exit(code);
}
