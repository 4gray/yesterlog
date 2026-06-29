# Reconstruction Local Context

## Goal

Make Day Reconstruction account for local-only time that TimeBro already knows about:
private notes and confirmed recurring local events/meetings.

## Decisions

- Treat private notes and confirmed recurring entries as locked local timeline rows.
- Count locked local rows toward accounted time and gap reduction.
- Keep Jira worklogs distinct from local rows so the UI does not imply private notes were synced to Jira.
- Do not make local rows Jira-sendable; only reconstructed signal rows remain loggable.
- Include local rows as AI gap context, but do not ask the model to draft entries from private notes or meetings.

## Pending Work

- Commit, push, open PR, inspect checks/review, and merge if green.

## Verification

- `npm run test -- src/domain/reconstruct.test.ts src/domain/enhancePrompt.test.ts src/components/ReconstructView.test.tsx src/app/AppReconRoute.test.tsx src/app/AppMainView.test.tsx` passed.
- `npm run test` passed.
- `npm run build` passed.
- Rendered demo QA passed on `http://127.0.0.1:5173/?demo=1&view=week&today=2026-06-18&seed=local-context-qa`:
  confirmed a recurring local event, opened Reconstruction, stepped to the day, and verified the row renders as `local event · 15m` with a `local` badge and `15m local/private` in the accounted-time notice.
