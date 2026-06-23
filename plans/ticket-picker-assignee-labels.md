# Ticket Picker Assignee Labels

## Goal

Show the assignee name in ticket picker rows when the `Assigned to me` filter is off, so broad Jira search/browse results are easier to scan before logging time.

## Decisions

- Add assignee display name to the shared `JiraTicket` contract.
- Request Jira `assignee` in ticket search fields and normalize `fields.assignee.displayName`.
- Keep assigned-only picker rows compact; show assignee metadata only when the picker filter is not active.
- Use existing TicketPicker row patterns and avoid adding a new card-like layout.
- Stack Jira issue type badges under the ticket key in picker rows to save horizontal space for summaries and assignees.

## Pending Work

- User review.

## Completed Work

- Updated shared/electron/demo ticket data with optional assignee display names.
- Rendered assignee metadata in TicketPicker rows when `assignedOnly` is false.
- Added focused tests for Jira field mapping and picker row markup.
- Stacked `SUB`/`EPIC` issue type badges under the ticket key inside picker rows.
- Added a focused markup test for the compact key/type stack.

## Verification

- `npm run test` passed: 20 files, 69 tests.
- `npm run build` passed.
- `git diff --check` passed.
- Browser QA passed on `http://127.0.0.1:5173/?demo=1&view=week&theme=dark`: Add Time picker broad list showed assignee names, `Assigned to me` hid assignee rows again, no console warnings/errors, no Vite overlay.
- Follow-up browser QA passed on `http://127.0.0.1:5173/?demo=1&view=week&theme=dark`: Add Time picker showed `SUB`/`EPIC` under ticket keys, assignee rows remained visible in broad browsing, row geometry showed no key/copy/status overlap, no console warnings/errors, no Vite overlay.
