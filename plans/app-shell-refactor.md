# App Shell Refactor

## Goal

Reduce the size and coupling of `src/App.tsx` and `src/styles.css` without changing Jira, local-note, recurring-entry, or release behavior.

## Current Decision

Start with low-risk pure helpers from `App.tsx`, add focused unit tests, and keep the end-to-end release gate green before extracting hooks or view composition.

## Phases

1. Done: extract pure app helpers into `src/app/appHelpers.ts`.
2. Done: add unit coverage for URL normalization, ticket sorting, personal-note merging/grouping, and demo update metadata.
3. Done: extract `useSnackbars` from `App.tsx` with hook-level coverage.
4. Done: extract `useThemeMode` from `App.tsx` with storage, system preference, and demo-mode coverage.
5. Done: extract `useLiveDate` from `App.tsx` with fake-timer coverage for ticking, demo freeze, and cleanup.
6. Next: extract update-check orchestration once its callback dependencies are mapped.
7. Later: split larger data/action orchestration only after the helper and hook seams are covered.
8. Later: split `src/styles.css` mechanically into imported files after UI behavior is protected.

## Verification

Phase 1:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke against demo week view at `http://127.0.0.1:5187/`

Phase 2:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for demo settings snackbar after saving settings

Phase 3:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for demo settings theme switching without demo localStorage writes

Phase 4:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for frozen demo week date (`WEEK 25 — JUN 15–21`) and overflow
