# Move Jira worklogs

## Goal

Allow a user to move an existing Jira worklog to another issue from the edit-time modal while preserving the worklog and making Jira's estimate adjustment explicit.

## Decisions

- Use Jira Cloud's experimental server-side worklog move endpoint so the move is one Jira operation.
- Default `adjustEstimate` to `auto`; allow `leave` for teams that do not use remaining estimates.
- Keep edits on the existing issue as the current update flow; changing the selected issue turns Save into Move.
- Optimistically update the cached weekly result after success, then queue normal sync/ticket refresh for reconciliation.
- Surface Jira errors without changing the local cache; mention the `Delete all worklogs` permission when Jira rejects the move.

## Work

- Add shared move request/result contracts and bridge/IPC wiring.
- Implement the Jira move request and estimate-mode query parameter.
- Add local sync-result move merging and hook orchestration.
- Unlock target selection in edit mode, add the estimate preview/choice, and update modal actions.
- Guard keyboard submission so move mode cannot submit before a different destination is selected.
- Cover Jira, domain, hook, and component behavior with tests; run test, build, and rendered UI verification.

## Verification

- Focused move-worklog coverage: 57 tests passed across Jira, sync-result, hook, and modal suites.
- Full suite: 133 files and 910 tests passed, including the review-requested keyboard guard.
- Renderer E2E suite: 8 scenarios passed, including the mobile overflow check.
- Production build completed successfully.
- Rendered demo flow verified in a headed browser: destination selection, before/after preview, both estimate modes, move completion, layout, and console state.
