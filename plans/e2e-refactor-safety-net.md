# E2E Refactor Safety Net

## Goal

Add a renderer E2E safety net before refactoring the large `App.tsx` and `src/styles.css` files. Keep this task limited to tests, scripts, CI, and documentation; no app refactor yet.

## Decisions

- Use the existing deterministic demo mode so E2E never touches real Jira, Bitbucket, credentials, or IndexedDB user data.
- Use Playwright through the installed `playwright` package plus Node's built-in `node:test` runner to avoid adding a new test dependency.
- Run E2E before release packaging in GitHub Actions, after unit tests and before `npm run build`.
- Treat the repository's primary branch as `main`; no remote `master` branch exists.

## Completed Work

- Added renderer E2E scenarios covering navigation, Add Time/personal notes, Today composer, Settings/update dialog, and mobile smoke.
- Added `npm run e2e:renderer` and wired `release:dry-run` to run unit tests, E2E, then build.
- Added GitHub Actions E2E gates to the release workflow and a regular push/PR CI workflow.
- Fixed a small interaction bug found by E2E: week-row edit buttons remain clickable and are visible on focus/touch.

## Pending Work

- Commit and push to `origin/main`.

## Verification Status

- Baseline `npm run test` passed before changes: 29 files, 121 tests.
- Existing screenshot smoke passed for `week/dark` before changes.
- `npm run e2e:renderer` passed: 5/5 renderer E2E scenarios.
- `npm run release:dry-run` passed: Vitest 121/121, E2E 5/5, production build.
- Screenshot smoke passed: `npm run screenshots -- --views week --themes dark --out /tmp/timebro-e2e-screenshot-smoke`.
- `agent-browser` smoke passed against `http://127.0.0.1:5187/?demo=1&view=week&theme=dark&seed=e2e&today=2026-06-17`.
