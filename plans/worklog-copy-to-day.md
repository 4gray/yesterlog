# Copy a worklog to another day — Phase 1

Brainstorm and UX rationale: `plans/worklog-copy-to-day-brainstorm.md`.

## Goal

From Week → Summary, copy an existing Jira worklog (issue, duration, comment) to another day of
the visible week in three actions: hover the card → `Copy to…` icon → day chip → confirm in the
prefilled Quick Log sheet. Add a second entry point in the Edit worklog modal footer. No new write
surface: every copy is one `POST /worklog` through the existing `handleAddWorklog` path.

## Scope

In: Summary card hover action, day-chip popover, Quick Log sheet in "copy" mode, Edit modal footer
button, start-time placement helper, tests, styles, rendered verification.

Out (Phase 2/3): Option-drag copy in Timeline, right-click menu, multi-day copy, command palette entry.

## Decisions

- **Reuse `QuickLogSheet` as the confirm step.** It already handles duration chips, comment,
  overlap validation and ⌘⏎. Add a `mode: "copy"` affordance (title "Copy time", confirm label
  "Copy to {day}") instead of building a new sheet.
- **Ticket comes from the worklog, not the dock.** `quickLogTicket` is currently looked up in
  `dockTickets`; a copied ticket may not be there. `QuickLogContext` gains an optional `ticket`
  that wins over the dock lookup. A pure helper `ticketFromWorklog(worklog): JiraTicket` fills
  `id/key/summary/url/issueType/epic/projectKey/projectName`, `statusCategory: "unknown"`,
  `statusName: ""`, `loggedSecondsTotal: 0`.
- **Eligible target days** = `dropDayMeta.droppable` (configured working day, not skipped,
  ≤ today) minus the source day. Same rule as dock drops and cross-day drag.
- **Start time on the target day**, pure helper `copyStartMinutes(source, targetCommitted, window)`:
  1. source clock minutes if the interval is free on the target day,
  2. else the first free slot of the same length after the day's last committed item inside the
     working window (`findGaps` from `src/domain/dayCalendar.ts`),
  3. else `undefined` → existing retrospective default in `quickLogStartedAt`.
- **Bulk slices are not copyable.** Hide the icon when any log of the row has `allocation`.
- **Multi-worklog rows.** A Summary row aggregates several worklogs of one issue. The Edit pencil
  already hides when `logs.length > 1`; the Copy icon stays visible and copies the aggregate:
  total duration, comment = the single distinct comment if there is exactly one, otherwise empty.
  Start-time rule uses the earliest log's clock time.
- **Comment is flattened text.** Source `comment` is already flattened from ADF; formatting loss
  is acceptable and documented.
- **Edit modal entry point** closes the edit modal and opens Add Time prefilled
  (`ticket`, `timeSpentSeconds`, `comment`, `retrospective: true`) for the next eligible day before
  the source day, with the modal's existing date selector for choosing another. This reuses
  `openAddTime(date, prefill)` and avoids a second popover inside a modal.
- **Popover is a fixed portal** like `.wl-pop-fixed`, anchored to the card, closes on Escape,
  outside click, or scroll. Chips are focusable buttons in weekday order; the first eligible chip
  takes focus on open; arrow keys move between chips.

## Work

### Domain / pure helpers (`src/domain/worklogCopy.ts`, new, with tests)

- [ ] `ticketFromWorklog(worklog: JiraWorklog): JiraTicket`.
- [ ] `copyStartMinutes({ sourceStartMinutes, durationMinutes, committed, windowStartMin, windowEndMin })`.
- [ ] `buildCopyTargets({ days, sourceDateKey, todayKey })` → `{ dateKey, label, shortLabel, enabled,
      disabledReason, trackedHours, targetHours, sameIssueHours }[]`, with `sameIssueHours` from
      `day.issues.find(i => i.key === issueKey)?.loggedSeconds`.
- [ ] `copyContextFromWorklogs(logs, targetDay, startedMinutes)` → `QuickLogContext` (aggregate
      duration, single distinct comment, `mode: "copy"`, `ticket`).

### Week view (`src/components/WeekView.tsx`, `src/styles/week.css`)

- [ ] `QuickLogContext`: add `ticket?: JiraTicket` and `mode?: "log" | "copy"`.
- [ ] `DayColumn`: new prop `onCopyWorklogs?(logs: JiraWorklog[], anchor: HTMLElement)`; render
      `<button class="day-log-copy">` with lucide `CopyPlus` in `.day-log-action-slot` next to the
      pencil when `logs.length >= 1` and no log has `allocation`. `aria-label="Copy worklog for {key}
      to another day"`, `title="Copy to another day"`.
- [ ] `WeekView`: state `copyPicker: { logs, anchorRect } | null`; render `<CopyToDayPopover>`
      via `createPortal` with `buildCopyTargets`; chip click → `setQuickLog(copyContextFromWorklogs(...))`
      and close the popover.
- [ ] `quickLogTicket = quickLog?.ticket ?? dockTickets.find(...)`; `quickLogColor` falls back to
      `colorOf(ticketKey)` when the key is not in the dock map.
- [ ] Render `QuickLogSheet` whenever `quickLog` is set and `onDockLog` exists (currently the sheet
      renders regardless of dock size, keep that; only the dock itself is gated).
- [ ] Styles: `.day-log-copy` mirrors `.day-log-edit` hover/focus-within reveal; `.copy-pop`
      reuses `.wl-pop-fixed` surface tokens; chips reuse `.quicklog-chip` with a two-line layout
      (`Tue` / `6h/8h`), `.is-disabled` state and `.has-same-issue` hint text.

### Quick Log sheet (`src/components/QuickLogSheet.tsx`, `src/styles/quicklog.css`)

- [ ] Read `context.mode`; when `"copy"`: title "Copy time", day label "→ {dayLabel}", confirm
      button "Copy to {weekday}", keep hour chips preselected on the source duration (custom mode
      when it is not a preset).
- [ ] Show the resolved interval line under the duration row in Summary mode
      ("14:00–16:00 · same time as Monday" / "· after your last entry") using `startedMinutes`.

### Edit modal (`src/components/AddTimeModal.tsx`, `src/components/TimeEntryModalLayer.tsx`, `src/app/`)

- [ ] `AddTimeModalProps.onCopyToAnotherDay?: (worklog: JiraWorklog) => void`; footer renders a
      secondary `Copy to…` button (lucide `CopyPlus`) left of Delete when `isEditingWorklog &&
      !isMovingWorklog && !editingWorklog.allocation`.
- [ ] `TimeEntryModalLayer` threads `onCopyWorklogToAnotherDay`; `AppOverlays`/`AppMainView` wire
      it to a new `openCopyFromWorklog(worklog)` in `useAddTimeModalActions`: `setEditingWorklog(undefined)`,
      then `openAddTime(selectAddTimeDate({ requestedDate: previousEligibleDay, ... }), { ticket:
      ticketFromWorklog(w), timeSpentSeconds, comment, retrospective: true })`.

### Tests

- [ ] `worklogCopy.test.ts`: ticket mapping, start-time precedence (free same slot / after last
      item / fallback), target eligibility (future, skipped, non-working, source day), aggregate
      context (duration sum, single vs. multiple comments).
- [ ] `WeekView.test.tsx`: copy icon rendered for a normal row, hidden for BULK rows; popover lists
      days with disabled reasons; chip click opens the sheet with the source ticket, duration and
      comment; confirm calls `onDockLog` with the expected `startedISO` and the worklog ticket even
      when `dockTickets` is empty.
- [ ] `QuickLogSheet.test.tsx`: copy-mode labels and confirm text.
- [ ] `AddTimeModal.test.tsx`: footer button present for a worklog edit, absent for notes, moves
      and bulk slices; click calls `onCopyToAnotherDay` with the worklog.
- [ ] `useAddTimeModalActions.test.tsx`: `openCopyFromWorklog` closes edit state and opens Add
      Time with the prefill and an eligible date.

### Verification

- [x] `npm run test`: 137 files, 967 tests passed (13 new domain tests, 4 Week copy interaction
      tests, plus sheet, modal and actions-hook cases).
- [x] `npm run build`: passed (tsc, Vite renderer, Electron tsc).
- [x] `npm run e2e:renderer`: 8 scenarios passed; no copy scenario added because the demo seed
      is what the browser check below exercised.
- [x] Rendered check in the renderer preview with the release demo seed, dark and light themes:
      hover reveal next to the pencil, picker with Mon/Tue/Wed/Thu/Fri chips showing totals,
      `has 1.5h` hint, source/vacation/future chips disabled, Escape closes the picker, the copy
      sheet opens titled "Copy time" with the source comment, "18:40–20:55 · after your last entry"
      placement on a full Tuesday and a "Copy 2h 15m to Tuesday" confirm; Edit modal footer shows
      Delete + Copy to…, and Copy to… opens Add Time on Monday prefilled with OPS-77, 3h 15m and the
      comment. Browser console: no errors.
- [x] Keyboard: first eligible chip takes focus on open (covered by the jsdom test); arrow keys
      cycle chips; Escape closes.
- [ ] Not verified: compact grid (`.week-grid.is-compact`, 6–7 working days) and a picker anchored
      near the right window edge; the demo seed has five columns with logs on Mon–Wed only.

## Release note

Copy a logged ticket to another day of the week straight from the Week view: hover a worklog,
pick the day, confirm the prefilled duration and comment.

## Review follow-up (2026-10-02)

- User-facing name is **Book on another day** (icon `CalendarPlus`, popover "Book on another day",
  sheet "Book time", confirm "Book 2h on Tuesday", edit footer "Book on…"). Code identifiers keep
  the `copy*` names.
- Day chips overflowed at 51px (measured: "has 3.3h" needed 48px plus padding). Chips are now 62px
  with explicit gap math, totals read `9.7/8h`, the same-issue hint is `+3.3h` and renders only when
  present, and the text spans have overflow guards. Re-measured: widest span 36px in a 56px inner
  width, no overflow.
- Adjusting the time before booking: the sheet already embeds the Day Map (`AddTimeTimelineEditor`)
  with drag-to-move and resize handles plus the duration chips; the footer hint now says so.

## Phase 2 (2026-10-02)

- **Option/Alt-drag in Timeline books a duplicate.** `useDayCalendarInteraction` re-reads `altKey` on
  every pointer event (`canDuplicate` gate), keeps the original as a blocker, refuses to commit a
  same-day duplicate that still overlaps its source, and passes `{ duplicate }` to `onCommitMove`.
  `DayCalendar` renders a dashed "+ BOOK" preview (local when the pointer is over the source column,
  via `externalMovePreview` on the destination) and calls `onBookWorklog`; `WeekView.bookWorklogAt`
  opens the booking sheet at the exact dropped slot. Cursor switches to `copy` via `body.cal-duplicating`.
- **Right-click menu** (`ContextMenu.tsx`): one delegated handler on the Week root reads
  `data-worklog-ids` (Summary rows) or `data-worklog-id` (Timeline blocks). Items: "Edit worklog"
  (single, non-bulk) and "Book on another day", which opens the day picker anchored at the pointer.
  Delete is intentionally not in the menu: the edit modal keeps the only confirmed delete path.
- Verification: `npm run test` 137 files / 971 tests; `npm run build`; `npm run e2e:renderer` 8/8.
  Browser (demo seed, dark): synthetic right-click opens the menu with both items, "Book on another
  day" opens the picker at the pointer; synthetic Option-drag of UX-31 from Monday to Wednesday
  19:00 shows exactly one "+ BOOK" preview in the destination column, leaves the original opaque,
  and opens "Book 3h on Wednesday"; a drop onto occupied Wednesday time is refused like a move.
  The browser pane's automated right-click and drag do not emit `contextmenu`/pointer events, so
  those two gestures were driven with dispatched DOM events; the Electron app delivers real ones.

## Status

Phase 1 committed as 2238297; Phase 2 implemented 2026-10-02 on `claude/worklog-copy-between-days-175511`. Known limit: the
Edit-modal path uses Add Time's retrospective default start, so on a busy target day it may show the
existing overlap warning until the user moves the slot; the Week picker path places the copy itself.
