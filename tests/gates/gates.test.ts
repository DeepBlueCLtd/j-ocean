import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkArtefactDrift } from '../../scripts/gates/check-artefact-drift.js';
import { checkHelpCoverage } from '../../scripts/gates/check-help-coverage.js';
import { checkHostTime } from '../../scripts/gates/check-host-time.js';
import { checkModelImports } from '../../scripts/gates/check-model-imports.js';
import { checkAttributionSource } from '../../scripts/gates/check-attribution-source.js';
import { checkSurfaceInvariance } from '../../scripts/gates/check-surface-invariance.js';
import { checkTruthBoundary } from '../../scripts/gates/check-truth-boundary.js';
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

  it('G-02 catches the analysis importing the truth-source port', () => {
    const { code, output } = spawnGate('check-truth-boundary', 'scripts/gates/fixtures/truth-boundary-import');
    expect(code).not.toBe(0);
    expect(output).toContain('src/analysis/planted.ts:2');
    expect(output).toContain('Principle II');
  });

  /**
   * Not a hypothetical. Beat 003 put `initialiseFromTruth` under `src/model/`, where it held
   * the truth-source port, and writing this gate is what made that visible. It is in
   * `src/run/` now, which satisfies FR-013 and Principle II at once.
   */
  it('G-02 catches the model importing it, which is what beat 003 had done', () => {
    const { code, output } = spawnGate('check-truth-boundary', 'scripts/gates/fixtures/truth-boundary-model');
    expect(code).not.toBe(0);
    expect(output).toContain('src/model/planted.ts');
    expect(output).toContain('truth-source');
  });

  it('G-02 catches a second place that can forge an Observation', () => {
    const { code, output } = spawnGate(
      'check-truth-boundary',
      'scripts/gates/fixtures/truth-boundary-constructor',
    );
    expect(code).not.toBe(0);
    expect(output).toContain('OBSERVATION_BRAND appears outside');
    expect(output).toContain('src/instruments/observation.ts');
  });

  /**
   * G-06, and the reason it exists: a per-panel summary bar was specified before the
   * attribution field was, and it was wrong. A summary can be computed from something other
   * than the analysis; a field drawn from the gain cannot.
   */
  it('G-06 catches the harness painting an attribution of its own', () => {
    const { code, output } = spawnGate(
      'check-attribution-source',
      'scripts/gates/fixtures/attribution-source',
    );
    expect(code).not.toBe(0);
    expect(output).toContain('ATTRIBUTION_BRAND appears outside');
    expect(output).toContain('src/analysis/attribution.ts');
    expect(output).toContain('a function producing an attribution');
  });

  it('the vocabulary gate catches a word on the plaintext list', () => {
    const { code, output } = spawnGate('check-vocabulary', 'scripts/gates/fixtures/vocabulary');
    expect(code).not.toBe(0);
    expect(output).toContain('src/planted.md:3');
    expect(output).toContain('Principle VII');
  });

  /**
   * G-07, and the reason the plan puts it first: beat 013 rearranges a 1,301-line component
   * and claims it moves no number. The planted violation is one analysis coefficient in a
   * declared configuration, and what makes the gate worth having is not that it goes red but
   * that it says *which* quantity moved and what its two digests are.
   */
  it('G-07 catches one changed analysis coefficient, naming the quantities that moved', () => {
    const { code, output } = spawnGate(
      'check-surface-invariance',
      'scripts/gates/fixtures/surface-invariance',
    );
    expect(code).not.toBe(0);
    expect(output).toContain('analysis.field');
    expect(output).toContain('moved');
    // Both digests, because "something changed" is a report nobody can act on.
    expect(output).toMatch(/recorded [0-9a-f]{64}, current [0-9a-f]{64}/);
    // And the producer sentence, so the reader knows where to look (Principle V).
    expect(output).toContain('src/analysis/optimal-interpolation.ts');
  });

  /**
   * G-08, AT-14, and the pairing in both directions.
   *
   * The two failures the plan names are a panel that gained a layer and not an explanation,
   * and an explanation that outlived the panel it described. The first is the one people
   * expect; the second is the one that actually happens, because deleting a panel is a thing
   * somebody does deliberately and deleting its help is a thing they forget.
   */
  it('G-08 catches a panel declaring a region nothing explains, naming both', () => {
    const { code, output } = spawnGate(
      'check-help-coverage',
      'scripts/gates/fixtures/help-coverage-unexplained',
    );
    expect(code).not.toBe(0);
    expect(output).toContain('centre/attribution');
    expect(output).toContain('the hatched channel');
    expect(output).toContain('nothing explains it');
  });

  it('G-08 catches an explanation whose panel does not exist, naming the orphan', () => {
    const { code, output } = spawnGate(
      'check-help-coverage',
      'scripts/gates/fixtures/help-coverage-orphan',
    );
    expect(code).not.toBe(0);
    expect(output).toContain('src/harness/help/centre-horizon-row.tsx');
    expect(output).toContain('centre/horizon-row');
    expect(output).toContain('an explanation of something nobody can see');
  });

  /** FR-053 prefers absence to a stub, so an entry a reader would open and find empty fails. */
  it('G-08 catches an entry with nothing in it', () => {
    const { code, output } = spawnGate(
      'check-help-coverage',
      'scripts/gates/fixtures/help-coverage-stub',
    );
    expect(code).not.toBe(0);
    expect(output).toContain('is empty');
    expect(output).toContain('prefers no control at all to a stub');
  });

  /** The clause that stops the gate passing trivially on a list nobody has kept up. */
  it('G-08 catches the layout drawing a panel nothing declares', () => {
    const { code, output } = spawnGate(
      'check-help-coverage',
      'scripts/gates/fixtures/help-coverage-undeclared',
    );
    expect(code).not.toBe(0);
    expect(output).toContain('src/harness/Planted.tsx');
    expect(output).toContain('centre/horizon-panel');
    expect(output).toContain('does not declare');
  });

  /**
   * And the other half of that: a tree that declares nothing fails rather than passing. Every
   * pairing check above is satisfied by an empty list -- nothing declared is nothing
   * unexplained -- so the absence has to be the failure.
   */
  it('G-08 fails a tree with no declarations at all, rather than passing trivially', () => {
    const { code, output } = spawnGate('check-help-coverage', CLEAN);
    expect(code).not.toBe(0);
    expect(output).toContain('declares no panels at all');
  });

  it('the vocabulary gate catches a word on the hashed list, without quoting it back', () => {
    const { code, output } = spawnGate('check-vocabulary', 'scripts/gates/fixtures/vocabulary-hashed');
    expect(code).not.toBe(0);
    expect(output).toContain('hashed forbidden list');
    // The whole point of the hashed half: the word does not appear, not even in the report.
    expect(output).not.toContain('zzsynthetic');
  });
});

/**
 * G-01 (constitution Principle IX). Its planted violation is one changed byte in a committed
 * artefact, and the fixture is built here rather than committed: a second copy of ten
 * megabytes of derived data in the tree would be a fixture of a fixture, and the gate takes
 * the directory to compare against precisely so it does not need one.
 */
describe('G-01 fails on a planted byte in a committed artefact', () => {
  const planted = mkdtempSync(join(tmpdir(), 'j-ocean-planted-'));
  afterAll(() => {
    rmSync(planted, { recursive: true, force: true });
  });

  it('names the artefact and the first differing offset', () => {
    for (const directory of ['truth', 'clim', 'obs']) {
      cpSync(join(REPO_ROOT, 'data', directory), join(planted, directory), { recursive: true });
    }
    const victim = join(planted, 'truth/gulf-stream-front.jocean');
    const bytes = readFileSync(victim);
    const offset = Math.floor(bytes.length / 2);
    bytes[offset] = ((bytes[offset] as number) + 1) % 256;
    writeFileSync(victim, bytes);

    const result = checkArtefactDrift(['--committed', planted]);
    expect(result.violations.length).toBeGreaterThan(0);
    const reported = result.violations.map((v) => `${v.file} ${v.text} ${v.message}`).join('\n');
    expect(reported).toContain('truth/gulf-stream-front.jocean');
    expect(reported).toContain(`first difference at byte ${String(offset)}`);
    expect(reported).toMatch(/edited by hand/);
  });
});

describe('the gates pass what they should pass', () => {
  it('lets the navigational use of a vessel path through, on every gate', () => {
    for (const gate of [
      'check-host-time',
      'check-model-imports',
      'check-vocabulary',
      'check-truth-boundary',
      'check-attribution-source',
      // The clean fixture declares no configuration, so G-07 falls back to the repository's
      // and passes here for the same reason it passes over the tree.
      'check-surface-invariance',
    ]) {
      const { code } = spawnGate(gate, CLEAN);
      expect(code, `${gate} must pass the clean fixture`).toBe(0);
    }
  });

  it('G-07 passes the tree when spawned as the program CI runs', () => {
    const { code } = spawnGate('check-surface-invariance', '.');
    expect(code).toBe(0);
  });

  it('passes the tree', () => {
    for (const result of [
      checkHostTime(REPO_ROOT),
      checkModelImports(REPO_ROOT),
      checkVocabulary(REPO_ROOT),
      checkTruthBoundary(REPO_ROOT),
      checkAttributionSource(REPO_ROOT),
      checkSurfaceInvariance(REPO_ROOT),
      checkHelpCoverage(REPO_ROOT),
      checkArtefactDrift([]),
    ]) {
      expect(result.violations, `${result.gate} must pass the tree`).toEqual([]);
    }
  });

  /** A gate that passes because its walk found nothing is the most comfortable kind of broken. */
  it('scans a non-zero number of files on the tree', () => {
    expect(checkHostTime(REPO_ROOT).scanned).toBeGreaterThan(0);
    expect(checkModelImports(REPO_ROOT).scanned).toBeGreaterThan(0);
    expect(checkVocabulary(REPO_ROOT).scanned).toBeGreaterThan(0);
    expect(checkTruthBoundary(REPO_ROOT).scanned).toBeGreaterThan(0);
    expect(checkAttributionSource(REPO_ROOT).scanned).toBeGreaterThan(0);
    // For G-07 the number is quantities rather than files, and the reasoning is the same: a
    // record with nothing in it would compare nothing and pass.
    expect(checkSurfaceInvariance(REPO_ROOT).scanned).toBeGreaterThan(0);
    // For G-08 the number is panels and explanations, for the same reason: a tree that
    // declared nothing would compare nothing.
    expect(checkHelpCoverage(REPO_ROOT).scanned).toBeGreaterThan(0);
  });

  /**
   * The half of G-02 that is not here yet says so on every run, so that its absence is a hole
   * with a date on it rather than a hole nobody mentions.
   */
  /**
   * G-02's behavioural half arrived with the analysis in beat 005. The gate's own note still
   * names it, because the *gate* cannot run it -- only the analysis suite can, and it does:
   * `tests/analysis/analysis.test.ts` sets every observation error to 1e9 m and asserts the
   * analysis recovers nothing beyond the prior.
   */
  it('G-02 still names the behavioural half, which the analysis suite now runs', () => {
    const notes = (checkTruthBoundary(REPO_ROOT).notes ?? []).join('\n');
    expect(notes).toMatch(/behavioural half/);
  });

  it('lists every exemption marker it honoured, so that reviewing them is possible', () => {
    const honoured = checkHostTime(REPO_ROOT).honoured ?? [];
    expect(honoured.length).toBe(2);
    expect(honoured.join('\n')).toContain('src/harness/timing.ts');
    expect(honoured.join('\n')).toContain('src/harness/seed-provisioning.ts');
  });
});
