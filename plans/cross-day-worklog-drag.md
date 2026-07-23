# Cross-day worklog drag

## Goal

Allow an ordinary Jira worklog in Week → Timeline to be dragged from one editable
day column to another, preserving its duration and updating its Jira `started`
timestamp.

## Decisions

- Keep resize gestures and confirmed recurring-event moves within the original day;
  only whole Jira worklogs may cross days.
- Accept drops only on configured working days up to today that are not marked skipped.
- Reuse the existing Jira update and optimistic week-cache path, which already supports
  a changed date.
- Resolve collisions against the destination day's committed calendar items and show the
  destination column while dragging.
- Keep projected slices of bulk worklogs read-only because they are not independent Jira
  items.

## Completed

- Extended whole-worklog moves with destination-day targeting and collision fitting.
- Connected editable Week Timeline columns through a shared target registry.
- Added a destination preview while the original card remains faintly anchored.
- Added focused tests for cross-day commit/cancel behavior and protected targets.

## Verification

- `npm test` — 126 files, 825 tests passed.
- `npm run check:brand` — passed.
- `npm run e2e:renderer` — 8 scenarios passed.
- `npm run build` — passed.
- Playwright browser check on current `main` — dragged a three-hour worklog from
  Monday to Wednesday at 18:00; both day totals updated, and future/vacation
  columns stayed unavailable.
- Browser console — no runtime errors.
