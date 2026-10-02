# Copy a worklog to another day (brainstorm)

Status: ideation, no implementation yet. Date: 2026-10-02.

## Problem

In Week view a user has logged ticket X on one day and now wants the same ticket logged on another
day of the week. Today the only paths are: Add Time (Shift+K) → search the ticket → duration →
comment → confirm, or drag the ticket from the Active Work Dock onto a day → Quick Log sheet. Both
restart from zero even though a perfect template (issue, duration, comment) is already on screen.
"Same ticket, different day" is the dominant pattern in weekly time tracking, so the interaction
cost is paid many times per week.

## Verdict

High value, low cost. Every building block already exists:

- `QuickLogSheet` (ticket + day + hour chips + comment + overlap validation) is the natural confirm step.
- `onDockLog` / `handleAddWorklog` already creates a worklog for `{ticket, dateKey, hours, startedMinutes, comment}`.
- Summary cards (`.day-log`) already have a hover action slot with the Edit pencil.
- Timeline already supports cross-day drag (move) with a destination preview and target registry.
- `SnackbarStack` exists for confirmation / undo messaging.

The convention is also well established elsewhere, so there is nothing to invent: Google Calendar
and Tempo use Option/Alt-drag to duplicate and a right-click "Duplicate"; Toggl has "Continue";
Harvest copies rows from the previous week; Clockify has "Duplicate".

## UX principles applied

1. **Recognition over recall.** The target set is tiny (up to 4 eligible days of the visible week),
   so offer them as chips, not a date picker. A date picker in a dialog is the heaviest option for
   the smallest decision.
2. **Stay in the spatial context.** The week grid is the whole point of the view; a popover anchored
   to the card beats a modal that hides the week.
3. **Discoverable primary path, hidden accelerators.** Hover icon on the card is the visible entry.
   Option-drag and right-click are accelerators for people who already know the convention.
4. **One confirm, no typing.** Prefill everything and let Enter confirm. Do not silently write to
   Jira: the copied comment is often day-specific and the duration often differs. The sheet also
   surfaces conflicts (day already has this ticket, overlap on the timeline).
5. **Show the consequence before the click.** Each day chip shows what is already logged for that
   ticket on that day and the day's total vs. target, so double-logging is a conscious choice.
6. **Never log the future.** Eligible targets = configured working days ≤ today, not skipped, not
   the source day. Same rule as cross-day drag and the dock.

## Proposed design

### Entry points

| # | Where | Interaction | Phase |
|---|-------|-------------|-------|
| 1 | Summary card hover action slot | second icon next to the pencil: `CopyPlus` "Copy to another day" → day-chip popover | 1 |
| 2 | Edit worklog modal footer | secondary button "Copy to…" next to Delete → same popover | 1 |
| 3 | Timeline card | Option/Alt + drag duplicates instead of moves; ghost gets a "+" badge and copy cursor; drop at exact time | 2 |
| 4 | Both card kinds | right-click context menu: Edit · Copy to → (days) · Delete | 2 |
| 5 | Command palette | "Copy worklog to…" for the focused/selected card | 3 |

### Day-chip popover

- Anchored to the card, same visual family as `QuickLogSheet` hour chips.
- One chip per weekday of the visible week, in Mon→Fri(…Sun) order so position = calendar position.
- Chip content: `Tue · 6h/8h` (day total vs. target). If the ticket is already logged that day,
  add `· has 2h` in the dim style; still enabled.
- Disabled with tooltip: future day, skipped/vacation day, non-working day, source day.
- Click → opens `QuickLogSheet` prefilled from the source worklog: ticket, hours, comment
  (ADF flattened to text, formatting is lost and that is acceptable). Enter / Cmd+Enter confirms.
- Optional in Phase 3: multi-select chips → "Copy to 3 days" writes sequentially and reports
  `3 of 3 copied` or the first failure in a snackbar.

### Start time for the copy

Summary mode has no explicit time. Pick, in order:

1. The source worklog's own clock time if that interval is free on the target day.
2. Otherwise the first free slot after the target day's last committed item inside the working window.
3. Otherwise the existing retrospective default (ends at the modal clock time).

The sheet shows the resulting interval so the user can drag it on the mini timeline editor as today.

### Guardrails

- Bulk worklogs (`BULK` slices) are projections of one Jira item; disable Copy on them with a tooltip.
- Reuse `isQuickLogIntervalAvailable` for overlap validation; the sheet already blocks confirm.
- After success: snackbar "Copied 2h of ABC-123 to Tuesday" with the existing optimistic week refresh.
  Undo (delete the new worklog) is a nice-to-have, not required because the sheet is the confirm.
- Jira write surface stays the same: one `POST /worklog` per copy through the existing Add Time path.

## Alternatives considered

- **Right-click only.** Invisible; the app has no context-menu pattern yet. Keep as a secondary path.
- **Clone button → modal with date picker.** Heaviest option for a ≤4-choice decision; hides the week.
- **Silent copy + Undo snackbar (Gmail pattern).** Fastest, but copies day-specific comments and
  durations blindly and pairs every copy with a potential Jira delete. Revisit only if the sheet
  feels slow in practice.
- **Submenu "Copy to → Monday / Tuesday…" in a context menu.** Fine on desktop, but a flat chip
  popover shows day totals and is easier to hit.

## Interaction cost

Today: 5–7 actions with typing (open Add Time, search ticket, pick duration, type comment, confirm).
Proposed: 3 actions, no typing (hover card → Copy icon → day chip → Enter).

## Open questions

- Should the popover also offer "previous week"/"next week" days? Recommendation: no, the visible
  week is the unit; navigate first.
- Multi-day copy in Phase 1 or Phase 3? Recommendation: Phase 3, after single-copy is validated.
- Keyboard shortcut on a focused card (e.g. `D` for duplicate)? Check `useViewShortcuts` for
  collisions before deciding.

## Key files for implementation

- `src/components/WeekView.tsx` (card action slot, QuickLog wiring, `handleDrop`)
- `src/components/QuickLogSheet.tsx` (prefill from a worklog)
- `src/components/AddTimeModal.tsx` (footer "Copy to…")
- `src/components/WeekTimeline.tsx`, `src/components/useDayCalendarInteraction.ts` (Option-drag copy)
- `src/app/AppWeekRoute.tsx` (`handleAddWorklog`)
- `src/styles.css` (chip popover using existing tokens)
