# App Shell Refactor

## Goal

Reduce the size and coupling of `src/App.tsx` and `src/styles.css` without changing Jira, local-note, recurring-entry, or release behavior.

## Current Decision

Continue with narrow hooks from `App.tsx` only when their behavior can be covered independently. Jira sync, Jira worklog writes, and Bitbucket review logging now have hook-level coverage; the next extraction should target local-note or recurring modal action state before splitting styles.

## Phases

1. Done: extract pure app helpers into `src/app/appHelpers.ts`.
2. Done: add unit coverage for URL normalization, ticket sorting, personal-note merging/grouping, and demo update metadata.
3. Done: extract `useSnackbars` from `App.tsx` with hook-level coverage.
4. Done: extract `useThemeMode` from `App.tsx` with storage, system preference, and demo-mode coverage.
5. Done: extract `useLiveDate` from `App.tsx` with fake-timer coverage for ticking, demo freeze, and cleanup.
6. Done: extract `useReleaseUpdates` from `App.tsx` with demo, cache, native success/error, and open-action coverage.
7. Done: extract `useTickets` from `App.tsx` with loading, search, favorite, and derived-list coverage.
8. Done: extract read-only issue metadata from `App.tsx` with visible-week scoping, issue maps, today worklog, and touched-ticket coverage.
9. Done: extract `useJiraSync` from `App.tsx` with queueing, persistence, demo, success, and error coverage.
10. Done: extract `useJiraWorklogs` from `App.tsx` with add/update/delete, optimistic merge, ticket refresh, edit modal state, and demo/error coverage.
11. Done: extract `useBitbucketReviewLogging` from `App.tsx` with demo, Jira target, review-bucket, persistence, no-target, and partial-failure coverage.
12. Next: extract local-note or recurring modal action state before splitting styles.
13. Later: split `src/styles.css` mechanically into imported files after UI behavior is protected.

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

Phase 5:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for demo update release notes dialog and overflow

Phase 6:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for demo tickets view, favorite toggle, and desktop/mobile overflow

Phase 7:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for demo today/week views, issue metadata, and desktop/mobile overflow

Phase 8:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for demo sync action, success notifications, and desktop/mobile week overflow

Phase 9:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for demo Add Time modal save, edit-worklog save, delete-worklog close, and desktop/mobile overflow

Phase 10:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for demo review logging modal, logged-state update, and desktop/mobile overflow
