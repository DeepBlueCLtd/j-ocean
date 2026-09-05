import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { checkHostTime } from '../../scripts/gates/check-host-time.js';
import { checkModelImports } from '../../scripts/gates/check-model-imports.js';
import { checkVocabulary } from '../../scripts/gates/check-vocabulary.js';
import { REPO_ROOT } from '../../scripts/gates/gate-lib.js';

/**
 * FR-010 and SC-002, and the standing half of PR-04.
 *
 * The gates were watched failing by a person, on planted violations, and the commit that
 * introduced them says so. This is what keeps them watched: every gate is run against its
 * fixture and must exit non-zero, and against the tree and must exit zero. The gates are
 * spawned as programs rather than called as functions, because what CI runs is the program
 * and a test of the function would not notice an argument-parsing or exit-code mistake.
 */

const CLEAN = 'scripts/gates/fixtures/clean';

const spawnGate = (gate: string, root: string): { code: number; output: string } => {
  try {
    const output = execFileSync(
      'pnpm',
      ['exec', 'tsx', `scripts/gates/${gate}.ts`, '--root', root],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { code: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
};

describe('the gates fail on their planted violations', () => {
  it('G-04 catches a host-clock read in the model, naming the file and line', () => {
    const { code, output } = spawnGate('check-host-time', 'scripts/gates/fixtures/host-time');
    expect(code).not.toBe(0);
    expect(output).toContain('src/model/planted.ts:3');
    expect(output).toContain('Date.now');
  });

  it('G-04 catches the exemption marker outside the two modules that may carry it', () => {
    const { code, output } = spawnGate('check-host-time', 'scripts/gates/fixtures/host-time-marker');
    expect(code).not.toBe(0);
    expect(output).toContain('src/harness/timing.ts');
    expect(output).toContain('Principle I');
  });

  it('G-03 catches a rendering import in the model, naming the specifier', () => {
    const { code, output } = spawnGate('check-model-imports', 'scripts/gates/fixtures/model-imports');
    expect(code).not.toBe(0);
    expect(output).toContain('src/model/planted.ts:2');
    expect(output).toContain('react');
  });

  it('the vocabulary gate catches a word on the plaintext list', () => {
    const { code, output } = spawnGate('check-vocabulary', 'scripts/gates/fixtures/vocabulary');
    expect(code).not.toBe(0);
    expect(output).toContain('src/planted.md:3');
    expect(output).toContain('Principle VII');
  });

  it('the vocabulary gate catches a word on the hashed list, without quoting it back', () => {
    const { code, output } = spawnGate('check-vocabulary', 'scripts/gates/fixtures/vocabulary-hashed');
    expect(code).not.toBe(0);
    expect(output).toContain('hashed forbidden list');
    // The whole point of the hashed half: the word does not appear, not even in the report.
    expect(output).not.toContain('zzsynthetic');
  });
});

describe('the gates pass what they should pass', () => {
  it('lets the navigational use of a vessel path through, on every gate', () => {
    for (const gate of ['check-host-time', 'check-model-imports', 'check-vocabulary']) {
      const { code } = spawnGate(gate, CLEAN);
      expect(code, `${gate} must pass the clean fixture`).toBe(0);
    }
  });

  it('passes the tree', () => {
    for (const result of [
      checkHostTime(REPO_ROOT),
      checkModelImports(REPO_ROOT),
      checkVocabulary(REPO_ROOT),
    ]) {
      expect(result.violations, `${result.gate} must pass the tree`).toEqual([]);
    }
  });

  /** A gate that passes because its walk found nothing is the most comfortable kind of broken. */
  it('scans a non-zero number of files on the tree', () => {
    expect(checkHostTime(REPO_ROOT).scanned).toBeGreaterThan(0);
    expect(checkModelImports(REPO_ROOT).scanned).toBeGreaterThan(0);
    expect(checkVocabulary(REPO_ROOT).scanned).toBeGreaterThan(0);
  });

  it('lists every exemption marker it honoured, so that reviewing them is possible', () => {
    const honoured = checkHostTime(REPO_ROOT).honoured ?? [];
    expect(honoured.length).toBe(2);
    expect(honoured.join('\n')).toContain('src/harness/timing.ts');
    expect(honoured.join('\n')).toContain('src/harness/seed-provisioning.ts');
  });
});
