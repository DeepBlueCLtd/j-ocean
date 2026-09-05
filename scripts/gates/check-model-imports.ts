import { readLines, runAsMain, stripComments, walk, type GateResult, type Violation } from './gate-lib.js';

/**
 * Gate G-03 — the model imports no rendering module (constitution Principle III, FR-008).
 *
 * The dependency direction is one way: model ← analysis, scoring, instruments ← harness.
 * This gate holds the first arrow. It reads import specifiers rather than types, because
 * what it is protecting is the ability to run the model in a worker or on a GPU with no
 * harness present, and that is a question about what gets loaded.
 */
export const GATE = 'G-03 model imports no rendering module';

/** Every form by which a module can arrive: static, dynamic, and CommonJS. */
const SPECIFIER = /(?:^|[^\w$])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[^\w$])import\s*\(\s*['"]([^'"]+)['"]|(?:^|[^\w$])require\s*\(\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/;

const FORBIDDEN: readonly { test: (s: string) => boolean; why: string }[] = [
  {
    test: (s) => s === 'react' || s.startsWith('react/') || s === 'react-dom' || s.startsWith('react-dom/'),
    why: 'React is a rendering module',
  },
  {
    test: (s) => /(^|\/)harness(\/|$)/.test(s),
    why: 'the dependency direction is one way: the model does not import the harness',
  },
  {
    test: (s) => /(^|\/)(webgl|three|regl|gl-matrix|pixi\.js|canvas)(\/|$|-)/i.test(s),
    why: 'it is a rendering module',
  },
  {
    test: (s) => s === 'jsdom' || s === 'happy-dom',
    why: 'it is a DOM implementation, and the model runs where there is no DOM',
  },
];

export function checkModelImports(root: string): GateResult {
  const files = walk(root, { include: ['src/model'], extensions: ['.ts', '.tsx'] });
  const violations: Violation[] = [];

  for (const file of files) {
    stripComments(readLines(root, file)).forEach((text, index) => {
      const match = SPECIFIER.exec(text);
      if (!match) return;
      const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
      if (specifier === undefined) return;
      for (const { test, why } of FORBIDDEN) {
        if (test(specifier)) {
          violations.push({
            file,
            line: index + 1,
            text,
            message:
              `src/model/ imports "${specifier}": ${why}. Constitution Principle III: the ` +
              'model knows nothing about display.',
          });
          return;
        }
      }
    });
  }

  return {
    gate: GATE,
    scanned: files.length,
    violations,
    notes: ['the runtime half of Principle III is tests/model/headless.test.ts'],
  };
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) runAsMain(checkModelImports);
