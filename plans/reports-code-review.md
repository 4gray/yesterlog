# Reports code review analytics

## Goal

Add weekly Code review analytics to Reports without treating review evidence as
additional tracked time. Keep Reports read-only and preserve Review as the only
surface that creates Jira worklogs.

## Decisions

- Add a conditional `Code review` Reports sub-page and a compact Summary teaser.
- Separate reviews of other people's PRs from activity on the user's own PRs.
- Prefer saved Jira worklog duration for logged sessions; otherwise use the
  Bitbucket estimate and keep the origin visible.
- Aggregate multiple sessions by repository and PR number.
- Label `commentCount` as comments by the user and rank `Most involved`, not
  `Most discussed`.
- Keep the existing Bitbucket API, storage schema, estimation algorithm, weekly
  tracked totals, billable percentage, ticket breakdown, and Composition model.
- Prepare four separate horizontal UI reference frames before implementation.

## Work

- [x] Generate and inspect the four design-reference frames.
- [x] Add the pure review-report aggregation and focused tests.
- [x] Add conditional Reports routing and disabled-integration fallback.
- [x] Add the Summary teaser and Code review report UI.
- [x] Add responsive styling, fixtures, and component/routing coverage.
- [x] Run the full test suite and production build.
- [x] Verify the rendered demo in light/dark and narrow layouts.

## Verification

- `npm run test`: 129 files, 848 tests passed.
- `npm run build`: passed; Vite retained the existing chunk-size warning.
- Rendered demo: checked Code review and Summary teaser in light/dark at
  1440×960 and at 680×900. Week navigation, teaser navigation, mixed
  logged/estimated provenance, own-PR hatching, responsive PR rows, keyboard
  focus, empty week, overflow, clipping, and browser console all passed.
