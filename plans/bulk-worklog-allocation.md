# Bulk worklog allocation

## Goal

Make Jira worklogs longer than a configured working day visible across the days and weeks they represent, without changing the original Jira worklog or inventing multiple Jira writes.

## Decisions

- Preserve each Jira worklog as the authoritative raw record, including its ID, issue, `started`, duration, comment, creation time, and update time.
- Build deterministic, local-only day allocations for bulk worklogs. Allocations count toward day/week/month/report totals but remain linked to one source worklog.
- Treat TimeBro's configured daily target as the allocation capacity; account for ordinary Jira worklogs already present on each day before filling bulk time.
- Imported bulk worklogs use `started` and `created` to choose a direction: explicitly backdated records allocate forward from `started` up to creation; same-day records allocate retrospectively backward.
- Never allocate into future dates, skipped dates, or non-working days. Preserve any residual duration exactly in the final allocation.
- Derived allocations are visibly marked as estimates and are not independently draggable/editable. Editing always targets the original Jira worklog.
- Place derived calendar slices in actual free ranges inside the working-day window, splitting a day's projection around ordinary Jira worklogs when needed.
- TimeBro continues to create one Jira worklog. Durations longer than a day are allowed and receive an exact deterministic local projection; creating multiple Jira worklogs remains out of scope until explicitly approved.
- Keep synchronization read-only. Expand the existing author/date search around the selected week, reconcile the returned IDs into a global local worklog ledger, and build other weeks from that ledger. Jira's updated/deleted feeds remain a future optimization if the bounded scan becomes too expensive in production.
- Scope ledger records by normalized Jira site plus account, and share one in-memory IndexedDB read across week loaders. Any reconciliation invalidates that read so already-cached weeks see newly synced worklogs without mixing Jira instances.

## Completed work

- Added the pure allocation model and cross-week tests.
- Added a 90-day read-only Jira discovery window plus a reconciled local raw-worklog ledger.
- Projected allocations into week, day, month, reports, ticket details, and reconstruction without double counting.
- Reused the complete local set of skipped/vacation dates so the same source worklog projects consistently across adjacent weeks and views.
- Added explicit end-date/start-date direction when TimeBro creates a bulk worklog; the preference stays local and Jira receives one worklog.
- Marked derived allocations in the calendar/week UI and disabled independent drag/resize.
- Made the Add Time modal scroll safely in short windows.

## Verification

- `npm run test`: 106 files, 657 tests passed after integrating the Week Timeline changes from current `origin/main`.
- `npm run e2e:renderer`: 7 renderer scenarios passed, including Timeline persistence and the mobile overflow check.
- `npm run build`: passed (TypeScript, Vite renderer, Electron TypeScript).
- `npm audit`: 0 vulnerabilities after adding the IndexedDB test runtime.
- Playwright visual check: 2-week custom duration at 560px width, no console errors or inaccessible modal controls. The original shared checkout was also checked at 1200px and 760px before the clean port.

## Pull request

- Build a clean `codex/bulk-worklog-allocation` branch from `origin/main`; do not include the unrelated uncommitted Today, Tickets, or Week Timeline work in the shared checkout.
- Reapply and verify only the bulk-worklog sync, storage, projection, and UI changes.
- Open a draft PR, wait for GitHub Actions and review feedback, address actionable failures/comments, then mark ready and merge after all required checks pass.
- Status: PR #17 is ready for review; eight automated review threads are addressed locally, current `origin/main` is integrated, and final commit, CI/re-review, plus merge remain.
