# Resize local calendar items

## Goal

Let users change the duration of local meetings and personal notes as easily as Jira worklogs: by dragging either edge in Today and Week timeline views, and by editing the duration in the add/edit dialog.

## Decisions

- Reuse the existing calendar drag/resize interaction, collision limits, and visual handles.
- Keep local changes local: resizing a personal note updates IndexedDB; resizing a confirmed recurring meeting updates only that occurrence.
- Keep Jira worklog behavior unchanged and preserve click-to-edit for local items.
- Expose the same start-time and duration controls when creating or editing a local note/meeting.

## Work

- [x] Trace local note and recurring-occurrence update paths and modal state.
- [x] Extend calendar resize handling to supported local items in Today and Week.
- [x] Add or align duration editing in the local add/edit dialog.
- [x] Add focused domain/component/action tests.
- [x] Run tests, build, and visually inspect Today and Week timelines.

## Follow-up polish

- [x] Expose exact minutes for personal notes in the add/edit dialog.
- [x] Cover local-item resizing across an overlapping Jira worklog with a pointer interaction test.
- [x] Re-run focused tests, the full suite, the production build, and rendered UI inspection.

## Verification

- `npm run test`: 135 files / 948 tests passed.
- `npm run build`: passed (existing Vite chunk-size warning only).
- Browser QA at 1200×900 in dark demo mode:
  - Today note resized 35m → 75m through an overlapping worklog; Daily Standup resized 15m → 30m.
  - Week Timeline note resized 75m → 90m in its narrow overlap column.
  - The note editor reflected the dragged value in its exact-minute input; exact note and recurring duration controls are covered by component tests.
  - No timeline clipping or horizontal overflow and no console warnings/errors.
