# Week timeline view

## Goal

Add a timeline mode to Week that makes every day directly editable like Today, while preserving the current compact summary as an equal, easy-to-return-to mode.

## Decisions

- Put a two-option `Summary` / `Timeline` segmented control in the Week header and persist the preference locally.
- Use one shared vertical time scale for the full week, with aligned day columns and horizontal overflow on narrow windows.
- Keep the Week hero, navigation, active-work dock, vacation state, recurring suggestions, and existing Summary mode intact.
- Reuse the Today calendar interaction rules: drag empty time to create, drag a worklog to move it, resize either edge, and click to edit.
- Keep future and skipped days visible but read-only in Timeline mode.
- Treat new Week logs as completed work: their start defaults to the selected day's current clock time minus the duration, while explicit Timeline starts remain unchanged.

## Work

- [x] Produce and inspect a TimeBro-aligned visual concept.
- [x] Implement the mode control and week timeline surface.
- [x] Connect Add Time prefills and worklog move/resize actions through the Week route.
- [x] Add component and route coverage for the new behavior.
- [x] Make implicit Week logs retrospective and keep the start aligned when the duration changes.
- [x] Run tests and build, then inspect the rendered dark/light layouts and interactions.

## Verification

- `npm run test`: 104 files, 631 tests passed on the rebased PR branch, including retrospective Add Time and quick-log coverage.
- `npm run e2e:renderer`: 7 renderer scenarios passed, including mode switching and persistence.
- `npm run build`: passed; Vite retains its existing large-chunk advisory.
- Browser QA: inspected dark desktop and light compact layouts; checked shared alignment, sticky headers, scrolling, exact-time dock drops, add/move interactions, future/vacation read-only states, and responsive overflow.
- Browser console: no application errors or warnings.
- Review follow-up: exact-time dock drops are clamped to the visible window, blocked when they overlap committed work, and revalidated after Quick Log duration changes, with regression coverage for each guard.
- Retrospective follow-up: new implicit logs end at the modal clock time, duration changes keep that end fixed, manual start edits win, and explicit Timeline starts are preserved.
