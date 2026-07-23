# Review worklog time slots

## Goal

- Show the exact local day and time range for every selected PR-review worklog.
- Let people change a review's local start time before creating the Jira worklog.

## Decisions

- Keep the review on its detected day and edit only the start time.
- Derive the displayed end from the selected duration so both controls stay synchronized.
- Send the edited `startedISO` through the existing Review route into Jira worklog creation.
- Keep timing controls exclusive to the final worklog confirmation dialog.

## Work

- [x] Add the editable schedule preview and responsive styling.
- [x] Carry start-time overrides into the Jira request.
- [x] Add component, route, and logging-hook coverage.
- [x] Run the full test suite, production build, and rendered UI verification.

## Verification

- Focused component, route, and logging tests: 13/13 passing.
- Full Vitest suite: 822/822 passing.
- Production build passed.
- Browser-checked the four-review confirmation dialog at desktop and 700px widths.
- Confirmed start-time and duration edits update the end time and Review list immediately.
- No browser warnings, errors, or schedule clipping found.
