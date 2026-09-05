# Planted violations

One directory per gate, laid out exactly like the repository so that
`--root scripts/gates/fixtures/<name>` runs the gate down the same path it takes over the
tree. Nothing here is compiled, linted or imported: it exists so that each gate can be
watched failing (PR-04) and so that `tests/gates/gates.test.ts` can keep watching it.

| Fixture | Gate | What is planted |
|---|---|---|
| `host-time/` | G-04 | `Date.now()` in `src/model/` |
| `host-time-marker/` | G-04 | the exemption marker outside the two modules that may carry it |
| `model-imports/` | G-03 | `import React` in `src/model/` |
| `vocabulary/` | vocabulary | a word from the plaintext list |
| `vocabulary-hashed/` | vocabulary | a word from the hashed list, which is why no plaintext list would have caught it |
| `clean/` | all three | no violation, and the navigational use of the word for a vessel's path, which must pass |
