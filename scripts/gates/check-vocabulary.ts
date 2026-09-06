import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../../src/config/digest.js';
import {
  readLines,
  REPO_ROOT,
  report,
  rootFromArgv,
  walk,
  type GateResult,
  type Violation,
} from './gate-lib.js';

/**
 * The forbidden-vocabulary gate (constitution Principle VII, FR-009).
 *
 * There is a contradiction at the heart of this gate and it is worth stating rather than
 * quietly working around: a list of words that must not appear in the repository cannot
 * itself be a list of those words, written in the repository. So the list has two halves.
 *
 *  - `terms` -- plaintext. The tracked-entity vocabulary: words j-ocean does not use
 *    because it holds no entity whose position it infers rather than knows. These are
 *    ordinary English and there is nothing to conceal about them, but the documents whose
 *    subject is the prohibition have to be able to name what they prohibit, so those
 *    documents are exempt and the exemption is listed in the word list and reviewed with it.
 *  - `hashedTerms` -- salted SHA-256. Customer, project and bid material, which must appear
 *    nowhere. No exemption applies to these: such a name is as forbidden in the constitution
 *    as it is in a source file. The gate hashes each word and each pair of adjacent words in
 *    every scanned file and looks the hashes up.
 *
 * The word for the path a vessel has travelled is on neither list. It is ordinary
 * navigational English, and tests/gates/gates.test.ts asserts that a sentence using it
 * passes.
 *
 * Adding a term: `pnpm exec tsx scripts/gates/check-vocabulary.ts --hash "<term>"` prints
 * the entry to paste, so that adding one never requires writing it down.
 */
export const GATE = 'forbidden vocabulary';

interface WordList {
  readonly reviewed: string;
  readonly salt: string;
  readonly terms: readonly { readonly term: string; readonly why: string }[];
  readonly hashedTerms: readonly { readonly sha256: string; readonly why: string }[];
  /** Paths exempt from `terms` only. Never from `hashedTerms`. */
  readonly plaintextExemptPaths: readonly string[];
  /**
   * Build outputs, excluded from both halves. They are not writing: gate G-01 regenerates
   * each one from digest-verified public inputs and fails on any byte difference, so a
   * hand-written file placed among them fails *that* gate rather than hiding from this one.
   * The two gates interlock; neither is weakened.
   */
  readonly derivedArtefactPaths: readonly string[];
}

const WORD_LIST_PATH = 'scripts/gates/vocabulary.json';

/** Structural, not an exemption: the fixtures are planted violations by definition. */
const NEVER_SCANNED = ['scripts/gates/fixtures', 'pnpm-lock.yaml', 'LICENSE'];

const SCANNED_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', '.css', '.yaml', '.yml', '.txt', '.sh',
];

export function loadWordList(): WordList {
  // The word list is read from the repository even when scanning a fixture: a fixture
  // proves the gate works, and it would prove nothing against a word list of its own.
  return JSON.parse(readFileSync(join(REPO_ROOT, WORD_LIST_PATH), 'utf8')) as WordList;
}

export function hashTerm(salt: string, term: string): string {
  return sha256(`${salt} ${term.trim().toLowerCase()}`);
}

const WORD = /[a-z][a-z0-9'-]*/g;

export function checkVocabulary(root: string): GateResult {
  const list = loadWordList();
  const hashed = new Map(list.hashedTerms.map((entry) => [entry.sha256, entry.why]));

  const files = walk(root, {
    include: ['.'],
    extensions: SCANNED_EXTENSIONS,
    excludePrefixes: [
      ...NEVER_SCANNED,
      ...list.derivedArtefactPaths,
      WORD_LIST_PATH,
      'scripts/gates/check-vocabulary.ts',
    ],
  });

  const violations: Violation[] = [];
  const patterns = list.terms.map((entry) => ({
    ...entry,
    pattern: new RegExp(`\\b${entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }));

  for (const file of files) {
    const exemptFromPlaintext = list.plaintextExemptPaths.some(
      (prefix) => file === prefix || file.startsWith(`${prefix}/`),
    );

    readLines(root, file).forEach((text, index) => {
      const line = index + 1;

      if (!exemptFromPlaintext) {
        for (const entry of patterns) {
          if (entry.pattern.test(text)) {
            violations.push({
              file,
              line,
              text,
              message: `"${entry.term}" is on the forbidden list: ${entry.why} (constitution Principle VII)`,
            });
            return;
          }
        }
      }

      // The hashed half runs everywhere, exemptions included. Words and adjacent pairs, so
      // that a two-word name is caught as well as a one-word one.
      const words = text.toLowerCase().match(WORD) ?? [];
      const candidates: string[] = [...words];
      for (let i = 0; i + 1 < words.length; i += 1) {
        candidates.push(`${words[i] as string} ${words[i + 1] as string}`);
      }
      for (const candidate of candidates) {
        const why = hashed.get(hashTerm(list.salt, candidate));
        if (why !== undefined) {
          violations.push({
            file,
            line,
            // The offending word is not echoed back into the log: it is on the hashed list
            // precisely because it must not be written down.
            text: '(the line is not quoted, because the word on it must not be)',
            message: `a term on the hashed forbidden list appears here: ${why} (constitution Principle VII)`,
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
    notes: [
      `word list reviewed ${list.reviewed}: ${String(list.terms.length)} plaintext, ` +
        `${String(list.hashedTerms.length)} hashed`,
      `${String(list.derivedArtefactPaths.length)} derived-artefact paths excluded; gate G-01 holds those`,
    ],
  };
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const argv = process.argv.slice(2);
  const hashIndex = argv.indexOf('--hash');
  if (hashIndex !== -1) {
    const term = argv[hashIndex + 1];
    if (term === undefined) throw new Error('--hash needs a term');
    process.stdout.write(
      `${JSON.stringify({ sha256: hashTerm(loadWordList().salt, term), why: 'describe the term here' }, null, 2)}\n`,
    );
    process.exit(0);
  }
  process.exit(report(checkVocabulary(rootFromArgv(argv))));
}
