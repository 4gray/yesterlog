# Jira Ticket Search

## Goal

Add Jira-wide ticket search to the time logging flow so a user can log work to tickets that are not assigned to them, while keeping the current TimeBro visual style.

## Decisions

- Keep existing assigned-ticket list as the default picker content.
- Remove the practical assigned-ticket blind spot by paginating assigned-ticket fetches instead of stopping at the first page.
- Add a separate read-only Jira search IPC path for ad hoc ticket lookup.
- Reuse the existing `JiraTicket` shape so searched tickets can be selected and logged through the existing worklog write path.
- Keep search UI compact and inline inside the existing ticket picker surfaces.

## Pending Work

- Done: added shared request/result types and native/preload/window API wiring.
- Done: implemented Jira JQL search with conservative result limits.
- Done: paginated assigned-ticket fetching beyond the old first-page limit.
- Done: updated Add time modal and Today composer picker UI.
- Done: added tests around picker grouping and search-result dedupe.
- Done: ran tests/build and inspected the rendered app.

## Verification

- `npm run test` passed: 12 files, 39 tests.
- `npm run build` passed.
- Browser QA passed on `http://127.0.0.1:5173/?demo=1&view=today&theme=dark&today=2026-06-17`.
- Verified Today composer search for `ops`: `OPS-77` appeared under `JIRA SEARCH`, selecting it changed submit target to `OPS-77`, console warnings/errors empty.
- Verified Add time modal search for `pay`: `PAY-142` appeared under `JIRA SEARCH`, selecting it changed submit target to `PAY-142`, console warnings/errors empty.
- Checked a narrow desktop viewport for the search UI. A 390px mobile viewport still exposes the app's pre-existing desktop/sidebar horizontal overflow, so the new picker was verified at a practical narrow desktop width instead.
- After the final stale-result cleanup, Browser runtime was stuck at 390px viewport after a CDP screenshot timeout, so final post-patch rendered smoke used regular Playwright fallback at 1280x720. It passed: `JIRA SEARCH` visible, one `OPS-77` result, no console warnings/errors, screenshot saved at `/tmp/timebro-final-search.png`.
