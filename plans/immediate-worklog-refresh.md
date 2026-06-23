# Immediate Worklog Refresh

## Goal

After adding Jira time to a ticket, show the new worklog in Today/Week views immediately instead of requiring a manual sync.

## Decisions

- Keep the existing Jira write and follow-up sync.
- Add an optimistic local merge for the created worklog because Jira worklog search can lag right after `POST /worklog`.
- Pass the selected ticket through the log payload so the local worklog preserves issue key, summary, URL, issue type, epic, started timestamp, duration, and comment.
- Persist the merged `SyncResult` for the affected week so the view remains correct after navigation.

## Pending Work

- User review.

## Completed Work

- Added helper logic to merge a created worklog into `SyncResult`.
- Included the selected ticket in Add Time submissions from Today and modal flows.
- Added focused tests for new-ticket merge, existing-ticket merge, and duplicate worklog handling.
- Kept the Jira write request free of renderer-only ticket metadata.

## Verification

- `npm run test` passed: 20 files, 66 tests.
- `npm run build` passed.
- `git diff --check` passed.
- Browser QA passed on `http://127.0.0.1:5173/?demo=1&view=week&theme=dark`: Week rendered, Add Time modal opened, demo submit closed the modal with success toast, no console warnings/errors, no Vite overlay.
