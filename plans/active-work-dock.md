# Active Work Dock (My Active Work panel)

## Goal
Implement the "MY ACTIVE WORK" dock from the Claude Design handoff
(`Stint - Editorial.dc.html`) as a real feature in the React/TS app. It is a
collapsible panel at the bottom of the Week view showing a horizontal row of
"active work" ticket cards that the user can **drag onto a day to log time**.

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

## Files
- `src/components/ActiveWorkDock.tsx` — presentational dock (collapsed bar +
  expanded panel, cards, load more).
- `src/components/QuickLogSheet.tsx` — compact confirm sheet (duration chips +
  comment) shown on drop in confirm mode.
- `src/components/useActiveWorkDrag.ts` — drag state machine (pointer threshold,
  ghost move, day/lane hit-testing, drop → confirm).
- `src/components/WeekView.tsx` — render dock + overlays, `data-drop-day` on
  columns, new props.
- `src/App.tsx` — pass dock tickets + onLog into WeekView.
- `src/styles.css` — dock / card / lane / ghost / sheet styles via tokens.

## Verification
- agent-browser in demo mode (`?demo=1&view=week`): dock renders, collapse,
  load-more, drag a card onto a day → lanes + confirm sheet → log fires.
- `npm run test`, `npm run build`.

## Status
- Done. Shipped `ActiveWorkDock`, `QuickLogSheet`, `useActiveWorkDrag`,
  `activeWork` helpers (+ unit tests), wired into `WeekView`/`App`, styled in
  `styles.css`.
- Verified in browser (demo, dark + light): dock renders with real ticket data,
  collapse persists, load-more pages, full drag → lanes → confirm sheet →
  `handleAddWorklog` logs (snackbar), future/skipped days are blocked.
- `npm run test` (76 passed) and `npm run build` green; no console errors.
