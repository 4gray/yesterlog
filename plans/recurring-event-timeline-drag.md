# Confirmed recurring event timeline drag

## Goal

Let confirmed recurring events move and resize in Today and Week timeline calendars with the same pointer interaction and collision rules as Jira worklogs.

## Decisions

- Persist a per-day `localTime` override on the recurring occurrence; never change the recurring event's global schedule.
- Keep the operation local-only and read/write no Jira worklogs.
- Reuse the existing calendar move/resize interaction and committed-lane collision checks.
- Preserve an occurrence's note, creation time, and existing override fields while moving it.

## Completed

- Extend recurring occurrence data and resolution.
- Add a dedicated recurring move handler and wire it through Today/Week routes.
- Enable recurring blocks in calendar drag/resize.
- Add domain, persistence-action, rendering, and route-wiring coverage.
- Preserve Week timeline scroll position when a moved item updates the layout data.
- Keep a usable move hit-area on compact 15-minute blocks.
- Serialize local occurrence mutations so rapid consecutive drags cannot overwrite an earlier IndexedDB write.
- Recheck the current visible week before reading or installing the result of a queued write.

## Verification

- `npm run test` — 118 files, 765 tests passed after both review fixes.
- `npm run build` — passed.
- Browser demo, Today — dragged Daily Standup from 09:15 to 08:30; duration stayed 15m.
- Browser demo, Week timeline — dragged Daily Standup from 09:15 to 08:45; scroll stayed at 393 and the event remained visible.
- Browser console — no warnings or errors.
- PR #20 Codex review P2 (concurrent persistence) — addressed in follow-up with a deferred-write regression test.
- PR #21 Codex review P2 (week navigation during queued writes) — addressed with a navigation regression test.
