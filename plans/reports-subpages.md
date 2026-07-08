# Reports sub-pages

## Goal

Extend the single Reports view into a parent section with insight sub-pages,
per the Claude Design handoff (`Stint - Editorial.dc.html` +
`design_handoff_reports/README.md`): a sidebar sub-nav under **REPORTS** with
**Summary · Composition · Focus · Trends**, each a first-class page built from
the app's existing tokens and the data it already reconstructs.

## Decisions

- **Estimates page: deferred.** The prototype has a 5th page (Estimates =
  reconstructed time vs Jira original estimates). The app does not sync Jira
  original estimates today (only logged time), so Estimates is intentionally
  left out of the sub-nav until estimate sync is prioritized. `REPORT_TABS` in
  `Sidebar.tsx` is the single source of truth — adding `estimates` there is the
  first step when it lands.
- **Data model reuse.** All insights are computed from the three activity
  buckets the day rings already use — `ticket` (visible/billable), `meeting`,
  `fire` (both invisible). "Invisible work" = tracked − Jira-tracked. No new
  visual language: everything uses `src/styles/base.css` tokens and tracks light
  + dark.
- **Focus is a documented heuristic.** The app logs time per ticket per day, not
  per intraday session, so each ticket-day is treated as one "block": deep if
  ≥ 45 min, context switches ≈ blocks-per-day beyond the first, timeline =
  proportional segments (deep / shallow / trailing gap vs the daily target).
  Honest approximation, unit-tested, commented in `reportsInsights.ts`.
- **Trends** compares the visible week to a baseline chosen by a `vs last week`
  / `4-week` segmented toggle; overlay bars are always this-vs-last-week and the
  sparklines always show the trailing 4-week window. The existing 12-week
  tracked-vs-target line is reused below the fold, gated on `hasBaseline`.
- **Summary** keeps its richer existing header (day-ring meter, time split, ring
  legend) but the inline trend/composition panels graduated to the Trends tab.

## Files

- Routing/state: `src/app/useReportTabState.ts` (localStorage persistence),
  `src/demo/config.ts` (`reportTab` deep-link param), threaded through
  `App.tsx` → `AppShellFrame` → `Sidebar` and `AppMainView` → `AppReportsRoute`
  → `ReportsView`.
- Sub-nav: `src/components/Sidebar.tsx` (`REPORT_TABS`, `.report-subnav`).
- Aggregators: `src/domain/reportsInsights.ts` (+ `.test.ts`). Multi-week
  history still comes from `src/domain/reportsTrend.ts`.
- Pages: `src/components/ReportsView.tsx` (tab container), `ReportsSummary.tsx`,
  `ReportsComposition.tsx`, `ReportsFocus.tsx`, `ReportsTrends.tsx`, shared
  primitives in `reportsShared.tsx`.
- Styles: appended to `src/styles/reports.css`.

## Verification status

- `npx tsc --noEmit` clean; `npm run test` 550 passed (incl. new
  `reportsInsights` + rewritten `ReportsView` tests).
- Previewed each tab in demo mode (`?demo=1&view=reports&reportTab=…`) in dark
  and light, sidebar expanded and collapsed; sub-nav navigation and the Trends
  comparison toggle exercised in-app. No console errors.
