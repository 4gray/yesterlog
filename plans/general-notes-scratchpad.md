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
- Keep the writing flow document-first: Enter inserts a new block, the editor
  uses the full content area, and changes save automatically after a short idle
  delay or immediately when leaving the surface.
- Use Lexical for a focused Notion-like editing layer. Markdown shortcuts turn
  `#`/`##`/`###`, `*`/`-`, `1.`, `>`, fenced code, and common inline Markdown
  into rich blocks as the user types; a compact toolbar exposes paragraph,
  headings, lists, bold, italic, underline, strikethrough, and code without
  requiring syntax knowledge.
- Persist both Markdown fallback text and Lexical's local editor state. Existing
  plain-text documents open unchanged, while rich-only marks such as underline
  survive reloads without a breaking IndexedDB migration.
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
- [x] Replace the textarea with the Lexical rich-text surface and accessible
      formatting toolbar.
- [x] Extend document persistence and tests for rich editor state while keeping
      old plain-text records compatible.
- [x] Verify Markdown shortcuts, toolbar formatting, autosave, reload, keyboard
      and responsive behavior in the rendered app.

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

- Rich-text follow-up: all 134 Vitest files and 918 tests passed.
- Rich-text renderer E2E: all 8 flows passed, including live `## ` heading and
  `* ` list conversion, underline, and rich-state restoration after switching
  surfaces.
- Rich-text production build passed. The existing large-chunk advisory remains
  informational.
- Rendered QA passed at 1320×840 and 390×844 with no document overflow; the
  toolbar, editor spacing, save state, rich blocks, and mobile wrapping were
  inspected directly.
- `npm audit` reports 9 existing transitive advisories (1 moderate, 7 high,
  1 critical) in Electron/build tooling paths; none resolve through Lexical.
