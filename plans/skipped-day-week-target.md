# Skipped Day Week Target

## Goal

Make skipped working days reduce the effective weekly target and all remaining/percentage calculations instead of redistributing the full weekly target across the remaining days.

## Decisions

- Daily target is `weeklyTargetHours / configuredWorkingDays.length`.
- Effective weekly target is `dailyTargetHours * active non-skipped configured working days`.
- Skipped days keep `targetHours: 0`; remaining active days keep the original daily target.
- Header, reports, reminders, and weekly percentages should use the effective weekly target through `WeekState.weeklyTargetHours`.
- Add the requested before/after commit guidance to `AGENTS.md`.

## Pending Work

- Done.

## Verification

- `npm run test` passed: 7 files, 20 tests.
- `npm run build` passed.
- Rendered QA passed in in-app browser at `http://127.0.0.1:5176/`: Week view started at `40h left / 40h`; clicking `+ Mark vacation` changed it to `32h left / 32h` and showed `OFF · VACATION`.
