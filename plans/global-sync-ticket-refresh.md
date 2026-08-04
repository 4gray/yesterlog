# Global sync ticket refresh

## Goal

Make every existing global sync affordance refresh the assigned Jira ticket pool that powers the bottom active-work dock.

## Decisions

- Keep one global refresh action instead of adding a second dock-only button.
- Refresh tickets with the same saved Jira settings after the weekly worklog sync and before the remaining activity syncs.
- Preserve seeded demo behavior without making a Jira ticket request.
- Cover orchestration order and failure behavior in the sync-controls hook tests.

## Pending work

- [x] Wire ticket refresh into `useSyncControls` and `App`.
- [x] Add regression tests.
- [x] Run targeted tests, the full suite, build, and rendered UI verification.
- [x] Prepare the verified change set for commit and pull-request publication.

## Verification

- `npm run test -- --run src/app/useSyncControls.test.tsx` — 8 tests passed.
- `npm run test` — 133 files and 902 tests passed.
- `npm run build` — passed; Vite reported only the existing large-chunk advisory.
- Browser demo check at 1280×720 — global refresh completed, the active-work dock retained 17 items, no page/main/dock overflow was detected, and the console had no errors.
