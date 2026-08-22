# Background worklog reconciliation

## Goal

Close Jira write dialogs as soon as Jira confirms the mutation, then keep Jira data fresh without repeating the expanded worklog scan after every write.

## Decisions

- Treat the Jira mutation response as the success boundary for dialog state.
- Apply safe optimistic local updates before returning when the mutation result provides enough data.
- Run delta worklog sync and ticket refresh in a shared background helper.
- Never report a background refresh failure as a failed Jira write.
- Keep retry/reconciliation failures observable in the console.
- Coalesce repeated trailing refresh requests into one sync.
- Use Jira's updated/deleted/list worklog APIs after an initial baseline; reserve the expanded scan for a missing baseline and explicit full sync.
- Bound Jira requests with a timeout and honor `Retry-After` for safe retries.
- Record local sync diagnostics (mode, duration, request/worklog counts) without telemetry.

## Pending work

- None.

## Verification

- Targeted delta/resilience suite: 97 tests passed.
- Full regression suite: 134 files and 936 tests passed.
- Production build passed (with the existing Vite chunk-size warning).
- Renderer E2E suite: 8 tests passed.
- Headed browser inspection passed: the Log time dialog closes immediately after the write, the confirmation appears, and the console has no application errors.
