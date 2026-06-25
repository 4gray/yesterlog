# Review logged state visibility

## Goal

Verify whether Review view actually shows logged review sessions after Jira worklog creation, and fix the row state if the UI fails to surface it clearly.

## Decisions

- Keep Review header drag-area consistency with the existing app shell headers.
- Preserve existing local review ledger behavior while investigating whether more logged metadata is needed.
- Store optional logged `timeSpentSeconds` and `estimatedSecondsAtLog` so old ledger rows remain readable and new rows can show actual logged duration and delta.
- Render logged rows with a visible green status and the logged Jira issue key, rather than recomputing the target from the current target mode.

## Pending work

- Done.

## Verification

- `npm run build` passed after adding Review header drag area.
- `npm run test -- src/app/useBitbucketReviewLogging.test.tsx src/components/ReviewView.test.tsx`
- `npm run test`
- `npm run build`
- Rendered Playwright check at `http://127.0.0.1:5173/?demo=1&view=review&theme=dark&today=2026-06-17&seed=release`: log one selected PR with `1h`; row shows `LOGGED`, disabled checkbox, `1h 00m logged`, and `suggested 45m · +15m`; no console warnings/errors.
