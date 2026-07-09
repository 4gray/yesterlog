# Today's view → calendar day-view redesign

Turn the Today screen's main block into a Google-Calendar-style single-day
timeline: worklogs and notes render as blocks on an hour grid, you drag on empty
space to create a worklog, drag/resize existing blocks to change their time, and a
faint "ghost" layer shows detected-but-unlogged activity you can promote in one
click.

## Locked decisions (from brainstorm)

1. **Strict timeline** — committed entries (Jira worklogs + personal notes) never
   overlap. On create/move/resize we clamp into free space; if it can't fit, reject
   with a toast. Ghost/detected items live in a separate background layer and may
   overlap the committed lane.
2. **Optimistic block** — click/drag on empty space instantly draws a provisional
   block; the popup anchors to it; cancel removes it.
3. **Ghost layer is a differentiator** — reuse the existing "touched today · not
   logged" tickets + reconstruct signals as faint blocks with a "promote" action.
   (Phase 3.)
4. **Drag from the start** — the shipped MVP includes drag-to-create + resize +
   move, not a drag-less interim.
5. **Remove the inline composer entirely** — the calendar + the existing
   `AddTimeModal` popup are the whole input flow. The "+ add time" manual path and
   the right rail stay.

## Stack reality

React 18 + Vite + Electron. Plain CSS with design tokens in
[base.css](../src/styles/base.css). No Angular/NgRx/Tailwind. State = hooks in
`App.tsx` + IndexedDB; worklogs live inside the cached weekly `SyncResult`, not
per-entry.

## What already exists (big reuse wins)

- `AddTimePrefill` = `{ ticket?, timeSpentSeconds?, startedISO?, comment? }`
  ([AddTimeModal.tsx:29](../src/components/AddTimeModal.tsx)). Click-to-create is
  just `openAddTime(today, { startedISO, timeSpentSeconds })` — no modal changes.
- `openAddTime(date, prefill)` / `openEditWorklog(worklog)` already exist
  ([useAddTimeModalActions.ts:44,105](../src/app/useAddTimeModalActions.ts)).
- `UpdateWorklogRequest` supports changing both `startedISO` and `timeSpentSeconds`
  ([types.ts:426](../shared/types.ts)) → move + resize are backed by the IPC today.
- `mergeCreatedWorklogIntoSyncResult` ([syncResult.ts:37](../src/domain/syncResult.ts))
  is the template for an optimistic, no-full-resync update merge.
- Ghost source: `touchedNotLogged: JiraTicket[]` (already a TodayView prop) +
  `ReconstructSignal` `{ startHour, durationMinutes, key, title, confidence }`
  ([reconstruct.ts](../src/domain/reconstruct.ts)). Note: signals are hour-granular.

## Main technical risk

`handleAddWorklog` / `handleUpdateWorklog`
([useJiraWorklogs.ts](../src/app/useJiraWorklogs.ts)) run a **full `runSync`** after
every write. That's fine for a one-off form submit, fatal for drag. We add an
optimistic update path: local geometry during drag → on drop, one debounced
`updateWorklog` IPC call → local `mergeUpdatedWorklogIntoSyncResult` → save to
IndexedDB → skip the full resync (or defer/coalesce it). Roll back local geometry
on IPC failure.

## New / changed files

New (pure, phase 1 first):
- `src/domain/dayCalendar.ts` — pure geometry + layout: minutes↔pixels, snap,
  clamp, overlap/gap-fit helpers, day-window fit, hour marks, worklog/note→item
  mappers. **No DOM.**
- `src/domain/dayCalendar.test.ts` — unit tests for all of the above.
- `src/domain/syncResult.ts` — add `mergeUpdatedWorklogIntoSyncResult`
  (+ tests in existing `syncResult.test.ts`).
- `src/components/DayCalendar.tsx` — the hour grid: gutter, lines, now-line,
  positioned blocks, empty-slot pointer target. Renders committed + ghost layers.
- `src/components/CalendarBlock.tsx` — one positioned block with resize handles.
- `src/components/useDayCalendarInteraction.ts` — pointer state machine
  (idle → creating | moving | resizing), emits provisional geometry + commit
  callbacks. Reference existing drag: [useActiveWorkDrag.ts](../src/components/useActiveWorkDrag.ts).
- `src/styles/calendar.css` — grid + block styles, `@import`ed from `styles.css`.

Changed:
- `src/components/TodayView.tsx` — delete the `.composer` block (275–514), render
  `<DayCalendar>` as the main column; keep header (223–272) and rail (516–558).
  Drop now-unused composer state/handlers.
- `src/app/AppTodayRoute.tsx` + wiring in `AppMainView`/`App.tsx` — thread new
  props: `onCreateAt(prefill)` → `openAddTime`, `onMoveWorklog(worklog, patch)` →
  new optimistic handler. `onEditWorklog` already wired.
- `src/styles/today.css` — remove composer-only rules; keep `.today-header`,
  `.today-rail`, `.entry*` (entries may stay as a rail/list toggle later).
- `src/components/TodayView.test.tsx` — rewrite around the calendar.

## Phases

### Phase 1 — Foundation + grid + click-to-create  ✅ DONE
- `dayCalendar.ts` + tests (geometry, overlap/gap-fit, day-window, mappers, plus
  `layoutColumns` for side-by-side overlap packing). 40 unit tests.
- `DayCalendar` + `CalendarBlock` render committed worklogs/notes as positioned,
  column-packed blocks; hour gutter, grid lines, "now" line (today only), window
  auto-fit + scroll-to-now.
- Composer removed; `DayCalendar` is the main column, rail kept. Click a block →
  `onEditWorklog`/`onEditPersonalNote`; click an empty slot → `onCreateAt` opens the
  existing `AddTimeModal` prefilled with the snapped start time + 30m default.
- Rail "+" now opens the modal prefilled with that ticket.
- `calendar.css` (+ a `<1100px` responsive fallback so the stacked layout keeps a
  bounded, scrollable calendar).
- Wiring: `onCreateAt` threaded App → AppMainView → AppTodayRoute → TodayView via
  `openAddTime(currentDate, prefill)`.
- Verified in demo preview: blocks render + column-pack, overlaps sit side-by-side,
  block-click opens edit modal, empty-slot click opens create modal at 08:15/30m.
  585/585 tests pass, `tsc --noEmit` clean.

Deferred cleanup: TodayView still lists composer-only props (`onLog`,
`onAddPersonalNote`, `ticketOptions`, etc.) in its interface but no longer uses them;
prune them + the AppTodayRoute/AppMainView mappings in a follow-up.

### Phase 2 — Interactions (create / move / resize)  ✅ DONE
- `useDayCalendarInteraction` pointer state machine (create / move / resize-start /
  resize-end) with 15-min snap, a click-vs-drag threshold, window pointer listeners,
  and a live `draft` preview. Gap-fit via `fitMove`/`fitResizeEnd`/`fitResizeStart`.
- Drag/click empty → live draft block → `onCreateAt({ startedISO, timeSpentSeconds })`
  opens `AddTimeModal` prefilled with the dragged span (plain click = 30m default).
- Move/resize a worklog → optimistic geometry → `onMoveWorklog` →
  `mergeUpdatedWorklogIntoSyncResult` (same-day + cross-midnight), persisted, **no full
  resync**, rollback on IPC failure. Notes stay click-to-edit (not draggable).
- `CalendarBlock` is now a `role="button"` div with top/bottom resize handles;
  `calendar.css` has grip/draft/dragging styles.
- Wiring: `handleMoveWorklog` threaded App → AppMainView → AppTodayRoute → TodayView →
  DayCalendar as `onMoveWorklog`.
- Verified in demo preview: drag-create opened the popup at 07:45/1h30m; moving
  FTDM-401 +1h relocated it 9:30→10:30 (duration kept); resizing its top +1h grew it to
  3h15m and bumped the header 8h→9h — all optimistic, no flash. 590/590 tests,
  `tsc --noEmit` clean.

### Phase 3 — Ghost layer + gaps  ✅ DONE
- Ghost layer: `buildDaySignals(todayKey, bitbucketReviewResult, jiraActivityResult)`
  (`src/domain/todaySignals.ts`, reuses the Reconstruct builders) → `buildGhostItems`
  (filters to placeable signals whose key isn't already logged) → faint dashed blocks
  in a right-side band (`GHOST_BAND_*` in DayCalendar). Placed on the hour from
  `signal.startHour`. Click → `onPromoteGhost` opens the popup prefilled with the
  detected ticket + start + duration + description; if the ticket isn't in the loaded
  options a minimal one is synthesized from the signal so promote never preselects a
  stale default.
- Signals threaded App → AppMainView → AppTodayRoute → TodayView as `detectedSignals`.
- Gap affordances: `findGaps`/`coveredMinutes` surface interior holes (≥30m) between
  the first and last block; a hover "+ Log this gap" button prefills a worklog for the
  whole gap. The zone lets a pointerdown bubble through so drag-create still works.
- No separate coverage meter — the header already shows logged-of-target; the visible
  gaps ARE the coverage story.
- Verified in demo: FTDM-410 review + commit (detected, unlogged) render as two
  column-packed ghosts; promoting one opened the popup at FTDM-410 / 09:00 / 2h05m with
  the detected description; gaps 11:45–12:45 and 14:30–15:00 detected. 601/601 tests,
  `tsc` clean.

## Post-review hardening (high-effort /code-review, all findings fixed)

A 8-angle multi-agent review surfaced 14 confirmed issues; all fixed + tests:
- Ghost layer window: `computeDayWindow` now includes ghosts so out-of-window detected
  activity isn't clamped to the grid edge.
- Notes/ghosts stop pointerdown propagation so clicking one no longer also starts a
  spurious empty-slot create.
- Create gesture rejects an anchor inside a committed block (wires `overlapsCommitted`).
- `fitResizeEnd`/`fitResizeStart` clamp the floor/ceiling so a sub-`MIN_ITEM_MINUTES`
  neighbor gap can't produce an overlap.
- Optimistic move failure reconciles via `runSync` instead of restoring a stale snapshot
  (fixes the concurrent-drag clobber race).
- Resize preserves the untouched edge's seconds (keeps `worklog.started` when the start
  didn't move) instead of rounding to the whole minute.
- Dragged block shows the live draft time/duration label (was stale during the gesture).
- `CalendarBlock` is `React.memo` with primitive props + stable callbacks; non-dragged
  blocks skip re-render during a drag; `ghosts`/`todayDate` memoized in TodayView.
- Gap-aware block min-height so a short block never covers an adjacent block's handle.
- `hourMarks` labels midnight as "00", not "24".
- `minuteToLabel` truncates seconds to match `formatHm24` (no cross-view drift).
- Shared `toReconstruct*` mappers in `reconstruct.ts` used by both `useReconstruct` and
  `todaySignals` (removed the duplicated mapping); deleted dead `coveredMinutes`.

Verified: `tsc` clean, 602 tests pass, and drag/create/promote/edit all re-checked in the
demo preview.

## Status: all three phases shipped + reviewed. Remaining follow-ups
- Prune the composer-only props still in `TodayView`'s interface (`onLog`,
  `onAddPersonalNote`, `ticketOptions` is now used, `onSelectTicket`, `onSearchTickets`,
  `isConfigured`, `isLogging`, `issueUrlsByKey`, `issueTypesByKey`, `selectedTicket`) and
  their AppTodayRoute/AppMainView mappings.
- Jira activity signals aren't seeded in demo (only review+commit); real accounts get them.
- Ghost promote synthesizes a placeholder ticket (id/url empty) when not in options —
  corrected on next sync; consider a lightweight fetch-by-key later.

## Open questions

- **Notes in the strict lane?** Resolved: worklogs + notes + **confirmed recurring
  rituals** share one committed lane (column-packed on overlap). A confirmed recurring
  occurrence maps via `recurringToItem` (`kind: "recurring"`, meeting color, `↻` glyph)
  and is threaded App → `useIssueMetadata.todayRecurringEntries` → TodayView →
  DayCalendar. (Earlier proposal to render *confirmed* recurring as ghosts was dropped:
  a confirmed ritual IS committed time.)
- **Pending recurring on Today?** Resolved (for Week parity): scheduled-but-unconfirmed
  rituals render as `recurring-pending` suggestion cards via `pendingRecurringToItem`
  (`layer: "ghost"`, not a committed obstacle), threaded through
  `useIssueMetadata.todayPendingRecurring`. They overlay the committed lane (opaque
  tinted card, dashed border) so they stay visible even when a worklog shares the slot.
  Click confirms with defaults (→ `handleConfirmRecurring`), corner ✗ skips
  (→ `handleSkipRecurring`) — mirroring the Week `PendingRecurringCard`. Duration/note
  editing stays in Week.
- **Ghost time precision** — reconstruct signals are `startHour` only; do we place
  them on the hour, or infer minutes later? (Phase 3.)
- **Off-hours** — collapse 0–7 / 20–24 or just scroll? Proposed: scroll, auto-fit to
  entries, scroll-to-now on mount.
- **Snap step** — default 15m; expose as a setting later?

## Test plan

- Unit: `dayCalendar.ts` (geometry, overlap, gap-fit, window, mappers),
  `mergeUpdatedWorklogIntoSyncResult`.
- Component: TodayView renders blocks for given worklogs; block click → edit;
  drag-create emits `onCreateAt` with snapped time; resize emits `onMoveWorklog`.
- Manual (preview): drag on empty opens prefilled modal; resize updates Jira without
  a full-page resync flash.
