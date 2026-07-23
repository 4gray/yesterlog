# Add Time timeline editor

## Goal

Add a compact day-timeline editor to the Add Time dialog so the selected start, end, and nearby entries are visible, and the draft interval can be moved or resized in 15-minute increments.

## Decisions

- Keep the existing duration and start controls as the canonical form state; the timeline is a synchronized visual editor for the same values.
- Show Jira worklogs and local personal notes for the selected day as read-only context, excluding the item currently being edited.
- Let the draft block move from its body and resize from its lower handle, clamped to the selected day and a useful visible window.
- Preserve bulk/multi-day allocation behavior by hiding the visual editor when a duration cannot be represented as one day interval.
- Use the dialog's available width: keep the form in the left column and place a tall day cut-out in the right column; stack it below the form only on narrow windows.
- Align the right timeline with the mode tabs directly below the modal header, so ticket selection and all form controls sit entirely in the left column and the timeline gains the full content height.
- Match the established Today calendar tokens and interaction language in the modal-specific layout.
- Use the neutral `YLOG-*` project prefix in demo fixtures, test fixtures, and example UI copy instead of `FTDM-*`.

## Work

- [x] Thread selected-week worklogs, personal notes, and recurring entries into the modal.
- [x] Build the compact timeline editor on the existing day-calendar geometry and interactions.
- [x] Synchronize timeline move/resize with start and duration form state.
- [x] Add focused unit, integration, and renderer-E2E coverage.
- [x] Verify tests, production build, and the rendered dialog.
- [x] Replace the old ticket prefix consistently across demo/test data and re-run verification.

## Verification

- `npm run test` — 119 files / 769 tests passed.
- `npm run e2e:renderer` — 7 renderer flows passed.
- `npm run build` — passed (existing Vite chunk-size warning only).
- Prefix regression — demo E2E asserts that no `FTDM-*` ticket appears; demo fixtures and example copy now use `YLOG-*` / `Yesterlog Product`.
- Browser preview — inspected the two-column dark-theme dialog at desktop and narrow widths; confirmed the timeline begins level with the mode buttons, opens around the selected slot, keeps nearby entries visible, does not clip the footer, and stacks below the form without horizontal overflow.

## Follow-up: dock drag quick log

### Goal

Bring the same editable day map into the quick-log dialog opened by dragging an
Active Work item from the dock onto Week.

### Decisions

- Reuse `AddTimeTimelineEditor` instead of introducing a second timeline implementation.
- Seed the draft from the exact Timeline drop time or the existing retrospective
  Summary-drop calculation.
- Keep the quick-log duration chips and timeline range synchronized; moving or
  resizing the timeline turns the draft into an explicit start time.
- Show the selected day's Jira worklogs, personal notes, and recurring entries as context.
- Preserve the compact one-column fallback when a custom duration cannot fit in
  one calendar day, and stack the editor below the form on narrow windows.

### Work

- [x] Thread the dropped ticket and selected-day context into `QuickLogSheet`.
- [x] Add the synchronized timeline and responsive two-column layout.
- [x] Add regression coverage and verify tests, build, and the rendered dialog.

### Verification

- `npm run test` — 126 files / 834 tests passed.
- `npm run e2e:renderer` — 8 renderer flows passed.
- `npm run build` — passed (existing Vite chunk-size warning only).
- Browser demo — dragged an Active Work card into Week and confirmed the day
  map, contextual worklogs/notes/events, conflict state, move/resize
  synchronization, and enabled submit after moving into a free slot.
- Responsive browser check at 760×850 — the timeline stacked below the form,
  footer remained reachable, and document/content horizontal overflow stayed at 0.
- Browser console — no runtime errors.
