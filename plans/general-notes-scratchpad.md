# General Notes Scratchpad

## Goal

Add a low-friction, multiline writing surface to `General notes` without
replacing the existing structured notes and to-dos. Everything remains local,
outside Jira worklogs, reporting totals, and AI briefing prompts.

## Product decisions

- Give `General notes` two explicit surfaces: `Scratchpad` and
  `Notes & to-dos`; do not present them as conversion modes.
- Open `Scratchpad` by default when General is selected. Jira tickets and
  notebooks keep their current item-first experience.
- Keep v1 intentionally plain-text: Enter inserts a line break, the editor uses
  the full content area, and changes save automatically after a short idle
  delay or immediately when leaving the surface.
- Show clear `Saving…`, `Saved locally`, and `Could not save` states. Never send
  scratchpad text to Jira, Bitbucket, telemetry, reports, or an AI provider.
- Store the document additively on the existing global General notes bucket so
  old IndexedDB records remain valid and a future release can expose the same
  document model for notebooks without another data migration.

## Implementation

- [x] Extend the workspace-note domain model with an optional text document and
      a pure update helper.
- [x] Add the General surface switcher, full-height scratchpad editor, local
      save status, debounced persistence, and immediate flush on navigation.
- [x] Preserve the existing General items composer, filters, archive, and counts
      under `Notes & to-dos`.
- [x] Add domain and component coverage for multiline persistence, debounce,
      surface switching, and save failures.
- [x] Update the Notes documentation and complete test/build/rendered QA.

## Verification

- Focused Vitest: 48 tests passed across the workspace-note domain, IndexedDB,
  and Notes component coverage.
- Full `npm run test`: 133 files and 915 tests passed.
- `npm run build`: TypeScript, Vite production build, and Electron TypeScript
  checks passed; the existing large-chunk advisory remains informational.
- `npm run e2e:renderer`: all 8 flows passed, including Scratchpad multiline
  input, surface switching, preserved text, and mobile overflow coverage.
- Rendered browser QA passed at 1320×840, 680×720, and 390×844. Multiline
  entry, save state, both General surfaces, responsive layout, and zero console
  errors were verified; document and textarea horizontal overflow were absent.
