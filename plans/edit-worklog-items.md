# Edit Worklog Items

## Goal

Add editing and deletion for added Jira worklog items and personal notes from the existing time-entry UI.

## Decisions

- Keep Jira worklog network mutations in the Electron main process over IPC.
- Reuse the existing add-time dialog shape where practical, with edit/delete states added.
- Confirm before deleting a worklog or personal note.
- Preserve worklog IDs, issue keys, started timestamps, durations, and comments across API, IPC, storage, and UI summaries.
- Jira Cloud REST API v3 supports worklog update/delete. The edit form will update duration, start time, and comment on the current issue; moving a worklog to a different issue is outside the normal update endpoint.

## Pending Work

- Done.

## Verification

- `npm install` completed with 0 vulnerabilities reported by npm audit during install.
- `npm run test` passed: 7 files, 19 tests.
- `npm run build` passed.
- Rendered QA passed in in-app browser at `http://127.0.0.1:5175/` for Week view and add-time modal on desktop and mobile viewport.
