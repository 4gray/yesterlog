# Per-review worklog date

## Goal

Let users change the Jira worklog date independently for every selected review session in the Review confirmation dialog.

## Decisions

- Add a native date input beside the existing start-time input on each dialog row.
- Preserve the row's local time when its date changes, and preserve its local date when its time changes.
- Continue using the existing per-session `startedISO` override passed to the Jira worklog request.
- Keep the established Review dialog styling and responsive behavior.

## Work

- [x] Implement local date editing in `ReviewView`.
- [x] Adjust Review dialog styles for date and time controls.
- [x] Extend component coverage for per-ticket date changes.
- [x] Run focused tests, the full test suite, build, and rendered UI verification.

## Verification

- Focused Review and logging tests: 11 passed.
- Full Vitest suite: 133 files, 902 tests passed.
- Production build: passed.
- Seeded Review dialog inspected at desktop and 680px widths: no horizontal overflow, no console errors, date/time controls remained readable and usable.
