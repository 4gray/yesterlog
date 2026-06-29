# Configurable Working Days

Goal: make the user's working days configurable from Monday through Sunday while keeping the default Monday-Friday behavior.

Decisions:
- Store working days as ISO weekdays `1..7`.
- Keep Jira and Bitbucket sync bounds Monday-local and seven calendar days wide.
- Treat unselected days as outside the working week for columns, targets, reminders, reports, and month aggregates.
- Preserve the existing Add Time write surface; no new batch/write behavior.

Implementation checklist:
- Done: add shared weekday constants and normalization.
- Done: build `WeekState.days` from configured working days instead of fixed Monday-Friday dates.
- Done: update settings, recurring day picker, week/report/month UI, reminders, and Today target behavior.
- Done: update tests for dynamic working-day schedules.
- Done: verify with unit/component tests, build, and rendered app QA.

Verification:
- `npm install` completed with 0 vulnerabilities.
- `npm run lint` passed.
- `npm run test` passed: 84 files, 432 tests.
- `npm run build` passed.
- Rendered QA passed in the browser-only renderer on `http://127.0.0.1:5174/?demo=1&view=settings&theme=dark&today=2026-06-17`:
  Settings shows seven working-day toggles and prevents zero selected days; Week, Reports, and Month render dynamic 3-day schedules; Week renders a 7-day schedule including Sat/Sun; Add Time includes weekend dates while excluding skipped days; mobile Week layout has no horizontal overflow or console warnings.
