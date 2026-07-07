# Reconstruct Log Duration Prefill

## Goal

Fix the Day Reconstruction flow so clicking `Log N entries in Jira` opens the existing Add Time modal with the reconstructed entry duration (for example 40m), not the modal's default 2h.

## Current Notes

- User reported a selected reconstructed ticket showing 40m, but the Add Time modal opens with 2h.
- Initial code search shows `AddTimeModal` defaults ticket duration to 2h when no edit/prefill state is supplied.
- Root cause confirmed: `AppReconRoute` opened the existing Add Time flow with only a date, so `AddTimeModal` used its default ticket duration.

## Plan

- Done: traced the Reconstruct View send action into the App/Add Time modal state.
- Done: added an Add Time prefill contract for reconstructed Jira entries: issue, date/time, duration, and draft note if available.
- Done: covered the behavior with focused tests.
- Done: verified with test/build and rendered UI inspection.

## Verification

- `npm run test -- --run src/components/AddTimeModal.test.tsx src/app/AppReconRoute.test.tsx src/app/useAddTimeModalActions.test.tsx src/components/TimeEntryModalLayer.test.tsx` passed.
- `npm run test` passed.
- `npm run build` passed.
- Rendered demo check passed for Reconstruct → Place everything → Log entries: Add Time opened with the reconstructed row duration (`2h 05m` in demo), ticket, start time, and description instead of the 2h default.
- Browser console showed an unrelated local IndexedDB version error in the in-app browser profile: requested version 7 is lower than existing version 8.

## Git Handoff

- Pending: commit the fix, push the feature branch, merge into `main`, and push `main`.
