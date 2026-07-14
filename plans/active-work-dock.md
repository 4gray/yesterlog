# Active Work Dock (My Active Work panel)

## Goal
Keep the "MY ACTIVE WORK" dock available in both Week and Today. Week supports
drag-to-log onto a day; Today reuses the same collapsible dock and opens the
existing Add Time flow for the selected active ticket on the current day.

## Source design
- File: handoff `project/Stint - Editorial.dc.html`, lines ~227-331 (dock,
  drag overlays, quick-log confirm sheet).
- Dark warm-sepia aesthetic — already the app's design system in `src/styles.css`.

## Decisions / data mapping (prototype → real data)
- Dock list = `tickets.inProgress` first, then `tickets.recentlyClosed`.
  Count badge = number of in-progress (active) tickets.
- Card accent color: stable per-key palette (same PALETTE as WeekView), built
  across the dock list so colors are consistent.
- Status pill tone from real Jira status:
  - `statusCategory === "done"` → DONE (green)
  - statusName matches /review|qa|verif/i → IN REVIEW (amber)
  - `statusCategory === "new"` → neutral/blue-soft, label = real statusName
  - else → IN PROGRESS (blue), label = real statusName
- Badge: reuse `getIssueTypeBadgeLabel` (SUB / EPIC).
- Project line: EpicPill when `epic` present, else `projectName` with diamond.
- Right meta: relative created time (`createdAt` → "3d ago"); logged total
  (`loggedSecondsTotal`) shown when > 0.
- Drag-to-log writes via the **existing** `handleAddWorklog` write surface
  (AGENTS.md: Add Time is the intentional write path). Only "confirm" mode is
  shipped (the seg toggle / instant-undo path is not present in this design view
  and would need delete semantics — out of scope).
- Droppable days = configured working, non-skipped, not in the future.
- `started` for a dropped log = day at the current time-of-day.
- Dock open/closed persisted in localStorage `timebro-active-dock`.
- Week and Today share that saved open/closed preference and dock paging logic.
- Today uses a view-specific hint and card activation copy so the reused dock
  remains accurate outside the Week drag surface.

## Files
- `src/components/ActiveWorkDock.tsx` — presentational dock (collapsed bar +
  expanded panel, cards, load more).
- `src/components/QuickLogSheet.tsx` — compact confirm sheet (duration chips +
  comment) shown on drop in confirm mode.
- `src/components/useActiveWorkDrag.ts` — drag state machine (pointer threshold,
  ghost move, day/lane hit-testing, drop → confirm).
- `src/components/WeekView.tsx` — render dock + overlays, `data-drop-day` on
  columns, new props.
- `src/components/TodayView.tsx` — render the dock below the Today body and
  hand ticket activation to the existing `onCreateAt` Add Time prefill.
- `src/components/useActiveWorkDock.ts` — shared saved open state and paging.
- `src/app/AppTodayRoute.tsx` / `src/app/AppMainView.tsx` — pass dock tickets and
  the active count into Today.
- `src/App.tsx` — pass dock tickets + onLog into WeekView.
- `src/styles.css` — dock / card / lane / ghost / sheet styles via tokens.

## Verification
- agent-browser in demo mode (`?demo=1&view=week`): dock renders, collapse,
  load-more, drag a card onto a day → lanes + confirm sheet → log fires.
- `npm run test`, `npm run build`.

## Status
- Complete. Today now receives the active ticket list, renders the shared dock,
  and opens Add Time with the selected ticket and current day prefilled.
- The collapse preference is shared across Today and Week; the responsive Today
  layout keeps the dock visible while its calendar/rail region scrolls.
- Verified in the demo renderer at 1440×1000 and 1024×768 (expanded, collapsed,
  Add Time handoff, cross-view persistence, no console errors).
- `npm run test` (618 passed), `npm run e2e:renderer` (6 passed), and
  `npm run build` are green.
