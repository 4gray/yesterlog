# App Shell Refactor

## Goal

Reduce the size and coupling of `src/App.tsx` and `src/styles.css` without changing Jira, local-note, recurring-entry, or release behavior.

## Current Decision

Continue with feature-driven extractions only. `App.tsx` is now mostly orchestration and JSX wiring, shared loading surface, sidebar collapse state, visible week-state derivation, persisted week/bootstrap loading, month aggregation, settings connection actions and demo identity, settings update callbacks, review sync trigger, Jira worklog edit-state clearing, welcome gate flow, Add Time date/shortcut decisions and modal open/close action handlers, Add Time modal rendering, app navigation handlers, startup/reminder lifecycle effects, week skip/export actions, and sync button/status controls live behind focused helpers/hooks/components with coverage, and `src/styles.css` is a small import surface over domain-scoped style files.

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
12. Done: extract local-note action/import state into `usePersonalNotes` with storage, demo, move-between-weeks, import, and error coverage.
13. Done: extract recurring modal/action state into `useRecurringActions` with event definition, confirm, skip, delete, candidate, demo, storage, and error coverage.
14. Done: split `src/styles.css` mechanically into imported files under `src/styles/`.
15. Done: extract Bitbucket review sync state/action into `useBitbucketReviewSync` with demo, guard, merge, persistence, override-settings, and error coverage.
16. Done: extract month aggregation/loading into `useMonthState` with visible-week reuse, demo, persisted storage, idle, and error coverage.
17. Done: extract settings save, Jira test, Bitbucket test, and welcome-connect actions into `useSettingsActions` with normalization, demo, native, and failure coverage.
18. Done: extract initial and selected-week IndexedDB loading into `useWeekStorage` with bootstrap, recurring seed, week reload, demo idle, StrictMode, and error coverage.
19. Done: extract Add Time modal date selection and tracking-shortcut guard helpers with focused coverage.
20. Done: extract app navigation handlers and review fallback into a focused hook with coverage.
21. Done: extract startup sync and reminder scheduling effects into a focused lifecycle hook with coverage.
22. Done: extract week skip/export actions into a focused hook with coverage.
23. Done: extract Add Time modal open/edit/shortcut actions into a focused hook with coverage.
24. Done: extract sync button/status controls into a focused hook with coverage.
25. Done: extract welcome gate and enter-app flow into a focused hook with coverage.
26. Done: extract Add Time modal rendering layer into a focused component with coverage.
27. Done: move Settings update callbacks into `useReleaseUpdates` with coverage.
28. Done: move remaining modal/review inline callbacks into owning hooks with coverage.
29. Done: move remaining Jira/settings action ownership into hooks with coverage.
30. Done: extract visible week-state derivation into `useWeekState` with coverage.
31. Done: extract repeated loading view into a focused component with coverage.
32. Done: extract sidebar collapse state into a focused hook with coverage.
33. Next: avoid broad slicing for its own sake; future extractions should stay feature-driven.

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

Phase 11:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for demo local-note save, edit-modal hydration, and desktop/mobile overflow

Phase 12:

- Passed: `npm run test`
- Passed: `npm run release:dry-run`
- Passed: `agent-browser` smoke for demo recurring quick-log, edit-form hydration, and desktop/mobile overflow

Phase 13:

- Passed: exact concatenation diff of imported style files against the original `src/styles.css`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: browser smoke for demo week/settings views, Add Time modal, desktop/mobile overflow, and console health

Phase 14:

- Passed: `npm run test -- src/app/useBitbucketReviewSync.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: browser smoke for demo week sync refresh and review route rendering without document overflow or console issues

Phase 15:

- Passed: `npm run test -- src/app/useMonthState.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: browser/Playwright smoke for demo month view at desktop and mobile viewports without document overflow or console issues

Phase 16:

- Passed: `npm run test -- src/app/useSettingsActions.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo settings save, Jira test, Bitbucket test, and mobile settings layout without document overflow or console issues

Phase 17:

- Passed: `npm run test -- src/app/useWeekStorage.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for non-demo welcome bootstrap and demo mobile week switching without storage errors, document overflow, or console issues

Phase 18:

- Passed: `npm run test -- src/app/addTimeModalState.test.ts`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo Add Time open button, tracking shortcut, desktop/mobile modal overflow, and console health

Phase 19:

- Passed: `npm run test -- src/app/useAppNavigation.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo month-to-week navigation, tickets-to-today logging, mobile overflow, and console health

Phase 20:

- Passed: `npm run test -- src/app/useAppLifecycleEffects.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo week and non-demo welcome/bootstrap without document overflow or console warnings

Phase 21:

- Passed: `npm run test -- src/app/useWeekActions.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo vacation toggle, Settings Export CSV download, CSV header, document overflow, and console health

Phase 22:

- Passed: `npm run test -- src/app/useAddTimeModalActions.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo Add Time open button, tracking shortcut, edit-worklog modal, desktop/mobile modal overflow, and console health

Phase 23:

- Passed: `npm run test -- src/app/useSyncControls.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo week sync status/button, desktop/mobile overflow, and console health

Phase 24:

- Passed: `npm run test -- src/app/useWelcomeFlow.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for non-demo welcome bootstrap, demo week bypass, desktop/mobile overflow, and console health

Phase 25:

- Passed: `npm run test -- src/components/TimeEntryModalLayer.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo Add Time, edit-worklog, create/edit personal note, mobile modal overflow, and console health

Phase 27:

- Passed: `npm run test -- src/app/useReleaseUpdates.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo Settings update controls, release notes dialog, update snackbar, mobile overflow, and console health

Phase 28:

- Passed: `npm run test -- src/app/useAddTimeModalActions.test.tsx src/app/useBitbucketReviewSync.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo Add Time modal close, Review sync snackbar, mobile review overflow, and console health

Phase 29:

- Passed: `npm run test -- src/app/useJiraWorklogs.test.tsx src/app/useSettingsActions.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo Settings Jira test, demo worklog delete, mobile week overflow, and console health

Phase 30:

- Passed: `npm run test -- src/app/useWeekState.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo Week and Month views, mobile month overflow, and console health

Phase 31:

- Passed: `npm run test -- src/components/LoadingView.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo Week and Settings views, mobile settings overflow, and console health

Phase 32:

- Passed: `npm run test -- src/app/useSidebarState.test.tsx`
- Passed: `npm run test`
- Passed: `npm run build`
- Passed: `npm run release:dry-run`
- Passed: Playwright smoke for demo sidebar collapse/expand, desktop/mobile overflow, and console health
