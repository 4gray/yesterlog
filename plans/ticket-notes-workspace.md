# Ticket Notes & Notes Workspace

## Goal

Implement the final Notes Workspace handoff as a dedicated Yesterlog
route. Notes remain device-only and are never Jira worklogs; Jira issues are referenced,
Bitbucket PR items stay live, and AI briefings stay in memory until the user explicitly
copies a suggestion into a local to-do.

## Data model and storage

- Add an additive IndexedDB migration with two stores:
  - note buckets keyed by `GENERAL`, a namespaced notebook id, or an uppercase Jira key;
    each bucket owns flat text/to-do items plus an optional Jira snapshot.
  - a separately persisted flat notebook list; `GENERAL` is implicit and undeletable.
- Keep workspace notes separate from the existing timed `PersonalNote` model.
- Persist create/edit/check/archive/move/delete actions through a serialized mutation
  queue. Archived items stay in their bucket and are excluded from counts/progress.
- Build Today/Week/All ticket scopes from the local Jira worklog ledger's last-started
  timestamp, joined with current Jira ticket metadata and saved issue snapshots.

## Components and integrations

- Add a `notes` app route and nav item. Inside the existing shell, render the handoff's
  300px collapsible notes rail and centered 720px editor; use scoped graphite tokens so
  the workspace is not remapped to Yesterlog's warmer global surfaces.
- Implement sidebar scopes/notebooks/ticket rows, note filters, inline CRUD/archive,
  mark-all-done, composer, empty states, and the new-note modal. Reuse the existing Jira
  search handler and issue/type metadata.
- Extend the existing Bitbucket main-process client with typed PR-detail/task/comment
  reads and task resolution. The renderer prefetches linked PR detail, opens the panel
  instantly once present, and copies comments locally only through `+ to-do`.
- Add a pure AI briefing prompt/parser and a provider facade that reuses current
  Ollama/Claude/Codex IPC plus cloud redaction. Cache results in memory by ticket; never
  include local notes in the prompt and persist only explicit `+ to-do` actions.

## Incremental work

- [x] Storage, note containers, local activity index, and pure selectors/reducers.
- [x] Route, 300px rail, Today/Week/All scopes, and notebook creation.
- [x] Note CRUD, inline edit, archive/restore, filters, counts, and composer.
- [x] New-note modal with existing Jira search.
- [x] Live Bitbucket PR panel and task resolution.
- [x] Ephemeral AI briefing and explicit suggestion-to-to-do flow.
- [x] Pixel/state QA for default, hover, empty, archive, loading, PR, AI, collapsed,
      and narrow-window states.

## Verification

- `npm run test` — 133 files and 891 tests passed after rebasing onto the latest
  `main`.
- `npm run build` — renderer and Electron TypeScript checks plus the production Vite
  build passed; the existing large-chunk advisory remains informational.
- `npm run e2e:renderer` — all 8 renderer flows passed, including Notes navigation and
  local-only messaging.
- Browser inspection passed at 1320×840, 1040×720, and 680×720 for default, hover,
  empty, archive, loading, PR, AI, modal, collapsed-rail, and narrow-editor states.
  No clipping, document overflow, or console warnings/errors were found.
- `git diff --check` passed.
