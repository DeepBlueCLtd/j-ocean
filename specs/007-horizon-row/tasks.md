# Tasks: The Horizon Row

**Feature**: `007-horizon-row` | **Plan**: [`plan.md`](./plan.md)

- [X] **T010** `src/harness/field-surface.ts`: the one rendering module (FR-010). Palettes,
      shaders, the hatch as a second channel, and a canvas2d fallback that reports itself.
- [X] **T011** `src/harness/FieldView.tsx` rebuilt on top of it: geometry, markers, legend and
      the click target, and nothing about how a field is painted.
- [X] **T012** `src/harness/Panel.tsx`: one horizon. Absolute instants stacked date over time
      with the full instant on the element, both skill figures, the statement verbatim, and
      the provenance one disclosure away.
- [X] **T013** `src/harness/HorizonRow.tsx`: the row, the enlarge state, the attribution
      toggle, and scoring every horizon on demand.
- [X] **T020** `presentation` in configuration: reference width, minimum panel width, gap,
      gutter, anomaly limit and hatch threshold. Schema version 3.
- [X] **T021** The schema refinement that refuses a row too narrow for its declared horizons,
      with a test that adds a seventh and watches it fail.
- [X] **T022** The stylesheet reads the declared geometry as custom properties; the row breaks
      out of the prose column. No width is a literal in CSS.
- [X] **T030** Gate G-05 (`scripts/gates/check-declared-horizons.ts`, Playwright project
      `gate-g05`), with a planted violation that plants something. See finding 2.
- [X] **T031** CI installs a browser for the headless job, because a skipped gate is not a
      passed gate.
- [X] **T040** Shell tests: row order and absolute instants; per-panel scores and provenance;
      enlarge in place asserted by result identity; greyscale legibility measured against a
      declared margin; the declared-width geometry measured; the canvas2d fallback made to run.
- [X] **T041** The legend states that the attribution is one analysis shown on six panels, and
      a test asserts the statement. See finding 3.
- [X] **T050** ADR-0003: the row, and why not a slider and not a grid.
- [X] **T051** Screenshots at the declared reference width, the site's data model and glossary,
      and the beat's engineering note.
- [X] **T060** `pnpm check` green, seven gates, nothing deferred.

---

## What landed, against what the plan said

- **The row did not fit and the tests said it did.** Finding 1. The geometry is now declared,
  refused by the schema when it cannot work, and measured in a browser at the declared width.
- **The canvas2d fallback now runs in a test.** It had never been executed: headless Chromium
  has WebGL2 here, so every test took the fast path and the fallback was code nobody had run.
- **User Story 3's third scenario is not met**, and the surface says why rather than
  synthesising a per-horizon attribution that no analysis produced. It becomes testable when
  beat 009 cycles the forecast.
