# Bitbucket PR Analytics

## Goal and status

Build a Bitbucket Cloud analytics view for one or all configured repositories: PR
creation/merge throughput, review turnaround, comments, weekly/monthly grouping,
and a Me/All PR-author scope. Assessment and initial prototype are complete.
The user selected Overview; production implementation and local verification are complete.

## Implementation progress

- [x] Recheck live main: still `588b7fe` at implementation start.
- [x] Add shared analytics contracts and read-only collector with complete/partial coverage.
- [x] Add pure pooled metrics and account-scoped IndexedDB cache.
- [x] Add Overview report, Me/All and repository filters, ranges, charts and PR details.
- [x] Verify collector, calculations, storage, UI behavior, full tests and production build.
- [x] Inspect rendered light/dark and narrow layouts; record any live API limitation.

## Accepted scope refinement (2026-10-07)

- Use the Overview layout. Ledger is no longer an implementation alternative.
- Repository scope: All connected repositories or one configured repository.
- PR author scope: Me or All. Remove named-user selection and author search.
- Proposed initial defaults: All connected repositories + Me, last 12 weeks, weekly
  grouping; remember the user's subsequent selection per connection.
- All connected means the repositories configured in Yesterlog, not automatic
  discovery of every repository the Bitbucket account can access.
- Me selects PRs authored by the authenticated Bitbucket account. Peer review events
  and comments on those PRs still contribute to their metrics. It does not select
  every PR the user reviewed; that remains the existing personal Code review surface.
- The existing inline prototype still shows the earlier single-repository/named-user
  controls. These decisions supersede those controls for implementation.

## Prototype pass (2026-10-07)

- Scope: in-conversation prototype with clearly labeled sample data; existing Reports
  navigation and compact desktop product styling. No live API or production UI changes.
- Direction: preserve Yesterlog's report structure, restrained accent, tabular metrics.
  Design variance 3/10, motion 2/10, density 7/10. Dashboard-specific decisions take
  precedence over the invoked design-taste skill's marketing-page conventions.
- [x] Build overview-first and table-first alternatives with local repository/author/
  period filters, weekly/monthly grouping and PR drill-down.
- [x] Inspect both alternatives in light/dark and narrow widths; verify interactions.
- [x] Record the prototype result and leave production implementation pending.

Prototype outcome: two inline alternatives, Overview and Ledger, with deterministic
sample PRs. Repository/author/4-or-12-week filters, weekly/monthly grouping, bar-to-table
drill-down, pagination and PR timelines work locally. Host design controls offer padding
and ready/partial/empty/loading/error states. The product language is English, matching
existing reports. Example dates are fixed and explicitly labeled UTC/sample data.

Browser QA: checked desktop light/dark and 320/360px widths; no horizontal overflow or
console errors observed. Verified author isolation, month grouping, repository/range
changes, pagination and chart/table count agreement. Fixed widget-state restoration
resetting selected buckets. Preview screenshots are in the task visualization directory.
Carousel alternatives were inspected; the standalone preview's arrow activation was
unreliable under automated clicks, so variant selection was additionally checked by
dispatching the native button click. Production collector, real data and app integration
remain pending. App tests/build were skipped for this isolated mockup.

## Baseline

- 2026-10-07: local HEAD, origin/main, and live remote refs/heads/main all equal
  `588b7fe27c8f80edae3567ded4651f6725a727af` (v3.3.0).
- Working tree was clean. GitButler pull is unavailable in this unconfigured linked
  worktree; no setup or repository mutation was necessary because HEAD is current.

## Decisions

- Separate read-only `Reports → PR Analytics` page, sharing the optional Bitbucket connection.
- Keep existing personal review/time-estimation workflow separate from repository metrics.
- Local aggregation and IndexedDB cache; API access in Electron main; no AI required.
- Define elapsed review/merge timings explicitly; never treat them as reviewer labor hours.

## Assessment work

- [x] Verify latest main and inspect current Bitbucket integration.
- [x] Validate official API capabilities, scopes, pagination, and timing limitations.
- [x] Specify view, metric definitions, data flow, implementation phases, and estimates.
- [x] Review final plan against source code and record verification limitations.

## Recommended product scope

Choose All connected repositories or one repository configured in Settings. Default:
last 12 weeks, weekly grouping, Me across all connected repositories. Add calendar-month
grouping, 3/6/12-month presets and custom dates. Author choices are exactly Me and All;
no named-user selector or author directory is needed. Preserve both UUID and account
ID and compare against the authenticated Bitbucket identity; never match names.
Author filtering selects the PR owner, not the commenter or person who merged it.
In All mode, author names remain visible in rows, without a person filter or ranking.

Place a new `pr-analytics` report tab alongside the existing personal `Code review`
report. Give it an independent range and sync action, so it does not inherit the global
single-week navigation or require a weekly Jira sync. Keep ReportTab persistence and
Bitbucket availability guards consistent. No extra primary sidebar item is needed.

View composition:

- Toolbar: All connected/single repository, Me/All PR author, date range, Week/Month,
  Refresh and last-sync state.
- KPI row: created, merged, median time to merge, median first response, comments.
- Grouped created/merged bars; separate duration trend with median and optional p75.
- Drill-down table: repository, PR/title/link, author, state, created/merged dates, first response,
  review-to-merge interval, comment count. Selecting a chart bucket narrows the table
  to the matching metric cohort, with a visible clear-filter control.
- Metric tooltips, sample sizes and coverage labels; distinguish zero from unavailable.
  Mark the current incomplete week/month. Do not compare it directly to a full period.
- Cache-first/offline, loading/progress, empty repository, no matching author, partial
  history, expired credentials, denied repository access, retry and cancellation states.
  For aggregate scope, show repository coverage (for example, 3 of 4 synced) and name
  any failed/stale repository; never label an incomplete aggregate as complete.

Use existing report typography, KPI, table, theme and chart patterns. Start with simple
accessible SVG charts and a tabular equivalent; no new chart dependency is assumed.

## Metric contract (proposed MVP definitions)

All periods are local calendar intervals `[start, end)`; weeks start Monday, months
start on day 1. Persist UTC event timestamps, group in the displayed local timezone.
Durations are elapsed calendar hours including nights/weekends. These are process
turnaround metrics, not hours actively spent reviewing or Scrum story-point velocity.

Across repositories, pool normalized PRs before aggregation. Sum distinct PR/event
counts and calculate median/p75 over the pooled durations, never average repository
medians. PR identity is workspace + repository + PR ID, so equal numeric PR IDs in
different repositories are distinct. Apply the same date/author rules in both scopes.

| Metric | Definition and cohort |
| --- | --- |
| Created | Distinct PRs whose `created_on` falls inside the bucket, regardless of current state; includes drafts. |
| Merged / throughput | Distinct PRs whose verified merge transition falls inside the bucket, even if created before the selected range. |
| Time to merge | Merge timestamp minus creation timestamp; median/p75 over PRs merged in the bucket. |
| Time to first response | First observed non-author comment/approval/change request minus creation; cohort created in the bucket, observed through last sync. Show responded/eligible counts and unanswered PRs separately. |
| Review to merge | Merge minus first observed non-author review event, over merged PRs with both timestamps. Includes author rework and waiting; no implication of continuous review. |
| Comments in period | Published, non-deleted global/inline comments and replies by their creation timestamp, on PRs matching the author filter. Include author replies and resolved threads; edits do not create another comment. |
| Comments per PR | Current visible lifetime comment count in table, explicitly different from comments in the selected period. |

Choose the earliest valid MERGED transition from complete chronological activity,
not any later update that repeats MERGED. Missing/ambiguous history gives unknown
merge time, excluded from exact timing/bucket totals with coverage shown. Never use
PR `updated_on` or merge-commit date as a silent substitute. Missing review does not
mean zero seconds. Sort and deduplicate events before computing metrics.

First response is an observed-event proxy: the API cannot measure reading without
actions. Deleted comments, withdrawn approvals and inaccessible history can limit
historical accuracy. Show the sync timestamp; old response cohorts can mature on a
later refresh. Unknown actor identity is not assumed to be a peer. Bot responses are
included in MVP and disclosed; configurable bot exclusion is a follow-up. Creation
timings include time in draft; a reliable ready-for-review clock is deferred.

## API readiness and evidence

Official Bitbucket Cloud REST documentation checked on 2026-10-07:

- [PR endpoints](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/):
  list PRs via `/repositories/{workspace}/{repo_slug}/pullrequests`; explicitly request
  all relevant states because the default is OPEN. Supplies author, timestamps and
  comment count. Per-PR `/activity` supplies comments, approvals, change requests and
  dated updates with state. `/comments` includes inline/global comments and replies.
  Read scope: `read:pullrequest:bitbucket`.
- [Repository endpoints](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/):
  optional workspace repository discovery via `/repositories/{workspace}` with
  `read:repository:bitbucket`; defer discovery UI beyond configured repositories.
- [Filtering and pagination](https://developer.atlassian.com/cloud/bitbucket/rest/intro/):
  list filtering/sorting and paginated responses are available. Validate the exact
  timestamp query and fields projection on the target API before depending on them.
- [Rate limits](https://support.atlassian.com/bitbucket-cloud/docs/api-request-limits/):
  plan around the default 1,000 requests/hour; scaled allowances have additional
  eligibility requirements and must not be assumed for the current user API token.

Existing Settings already documents user/workspace/repository/PR read scopes, so no
new write permission is expected. Feasibility: creation counts and author filtering
are straightforward; merge and review timing require event normalization; exact
historical completeness remains an authenticated validation item. No aggregate
analytics response is assumed: metrics are calculated locally from these resources.

## Existing code: reuse and gaps

- `electron/bitbucket.ts`: reuse connection/auth/error conventions and PR requests.
  Current sync keeps only the authenticated user's events and estimates effort; it
  cannot be the repository analytics data source. `BitbucketActivityItem.update`
  currently omits state, and normalized events discard actor identity.
- PR/activity pagination currently stops after 8 pages of 50; detail pagination stops
  after 50 pages. Analytics must not silently reuse these truncating helpers.
- `normalizePullRequestComment` intentionally excludes replies/resolved threads for
  the existing detail UI. Analytics needs its own metadata normalizer.
- `src/domain/reportsReview.ts` and `ReportsReviews.tsx` measure personal estimated/
  logged effort; preserve that contract. `bitbucketReviewResults` stores weekly
  sessions, not repository history.
- Reuse IPC patterns in `electron/main.ts`, `electron/preload.ts`, `shared/types.ts`
  and `src/api/native.ts`; use separate analytics contracts and IPC handlers.
- Integrate through `ReportsView.tsx`, `AppReportsRoute.tsx`, `AppMainView.tsx`,
  `src/App.tsx`, `Sidebar.tsx` ReportTab definitions and `useReportTabState.ts`.

## Data and sync design

New modules: `electron/bitbucketAnalytics.ts`, a narrowly extracted shared Bitbucket
transport if needed, `src/domain/prAnalytics.ts`, `src/app/usePrAnalytics.ts`,
`src/components/PrAnalyticsView.tsx` and scoped styles. Keep calculations pure.

Persist normalized PRs, event/comment metadata and sync coverage in new IndexedDB
store (migration 15 → 16). Connection keys include email/workspace and a SHA-256
fingerprint of the token, preventing cache reuse after credential changes. Each
snapshot records the verified Bitbucket account ID/UUID; account changes atomically
replace its repository results. PR keys use workspace + configured repository slug +
PR ID. Store author IDs/names, state/draft, creation/update/merge/first-response times,
published comment IDs/dates/actors and completeness. Continuation checkpoints keep
only normalized metadata, never raw response bodies, comment text or credentials.
Repository rename/UUID migration is deferred; configured slugs define current scope.

Sync algorithm:

1. Snapshot account/repository-set/range and assign a request generation. Load matching
   cache immediately; discard stale responses after account/repository changes.
   Schedule selected repositories sequentially; share a two-request concurrency limiter
   with the existing personal-review client.
2. Page PR candidates in every supported state ordered by `-updated_on`, continuing
   until older than range start (or API equivalent filter). No upper updated-time
   cutoff: PRs merged/commented in an old range may have been updated yesterday.
   Do not filter candidates only by creation date or by current user involvement.
3. Read complete lifetime activity for candidate PRs to establish first response and
   merge transitions, including events before the range. Read paginated comment
   metadata to count published comments consistently, including replies and resolved
   threads. SUPERSEDED is verified in the official Cloud OpenAPI enum and scanned separately.
4. Upsert stable IDs, deduplicate and calculate event metrics for the selected range.
   Track list coverage, each PR's activity/comments completeness, failures and resume
   cursor independently. Label partial results; never turn request failure into zero.
5. Refresh rescans the selected range's candidate lists, reuses complete unchanged
   PR detail for up to 24 hours, and retries changed/incomplete histories. Both list
   and per-PR activity/comment pagination have continuation checkpoints. A wider
   range requires a backfill; a shorter cached range is not shown as complete.
   Timestamp-only incremental list cursors are deferred until updated_on behavior
   is verified against an authenticated repository.

Keep per-repository coverage/checkpoints so one failed repository does not discard
successful results. Aggregate cached records locally, exposing partial/stale coverage.
Switching Me/All or single/all repositories requires no refetch when matching coverage
is already cached. Loading multiple repositories scales with their combined PR history;
never start an unbounded independent sync for each repository.

Use low bounded concurrency (initially 2–3), abortable requests, bounded retry/backoff
for 429/transient failures, Retry-After when supplied, progress and resume. Follow
server pagination links only after validating HTTPS and the Bitbucket API origin
before attaching auth. Each repository analytics attempt is bounded to 450 requests;
personal review shares the concurrency limiter, while provider 429 responses govern
account quota. Long Retry-After responses stop the attempt and preserve progress. Do not fetch commits/diffs/tasks for this feature.

Illustrative cold-sync budget: 200 candidate PRs, one activity page and one comment
page each, plus 4 list pages at 50 items, is about 404 requests plus identity/repository
reads. Multi-page histories increase this; initial latency must be measured, not
promised. Subsequent author/grouping changes are local with no API calls. Repository-
wide `/pullrequests/activity` is a possible later optimization after validating its
ordering/filtering/coverage; it is not required for the first implementation.

## Implementation sequence and estimate

Estimate for one developer familiar with this repository: **6–9 working days** for
the revised MVP, including verification, assuming access to representative repositories.
This adds about one day to the original estimate for aggregate coverage and verification;
the Me/All-only selector simplifies the UI.

1. **API spike, 0.5–1 day.** Read-only checks against a small real repository: merge
   then comment, direct/squash/fast-forward merge, reopen/decline, draft, approval
   withdrawal, deleted/resolved/reply comments, scopes, state support, pagination and
   updated_on behavior. Save sanitized fixtures; decide where coverage is unknowable.
2. **Collector/contracts/cache, 2–2.5 days.** Independent analytics sync, shared rate limiting,
   per-repository coverage/resume/cancellation, IPC, migration and account isolation.
3. **Metric engine, 1 day.** Defined cohorts, buckets, stable identity, medians/p75,
   missing data handling and focused unit tests.
4. **Report page, 1–2 days.** Filters, charts/table, explanations, drill-down and all
   loading/error/cache states; demo fixtures and regression coverage.
5. **Integration and QA, 1.5–2.5 days.** Authenticated comparison with Bitbucket UI,
   cross-repository aggregation/partial-failure checks, request budget measurement,
   full tests/build and rendered browser/Electron verification.

Implementation is complete for the accepted Overview scope. Defaults are All connected
+ Me + last 12 weeks; ranges include today and explicitly mark the current week/month
as partial. Presets are 4/12 weeks and 6/12 months. Weekly/monthly grouping, throughput,
comment and timing charts, medians/p75, cohort drill-down, row details and pagination
share the same pure metric engine. The four summary tiles are created, merged, median
time to merge and comments; first-response and review-to-merge live in the timing panel.
No dependency changes. An authenticated production comparison remains an external
verification item; the UI discloses limitations of surviving API history.

Deferred: automatic workspace-wide discovery, named-author filtering, reviewer
filters, business-hour calendars, readiness/draft-cycle clocks, historical backlog,
CSV export, bot exclusion settings, webhooks and any AI summary. No Jira or Bitbucket
writes are introduced by analytics.

## Acceptance and implementation verification

- A PR created before the range but merged inside it is counted; post-merge edits do
  not move it into another merge bucket. PRs with no personal involvement are included.
- Monday/month/year boundaries and DST; repeated MERGED updates; missing dates and
  unknown actors; identical names with different IDs; missing review vs zero duration.
- All pagination pages or explicit partial state; duplicate/overlapping pages; 429;
  401/403; cancellation/retry; interrupted cache writes; stale response after switching
  account/repository; migration; offline; history expansion and reconciliation.
- Comments include replies/resolved threads, exclude unpublished/deleted records and
  count edits once. Missing historical records are disclosed as an API limitation.
- Changing PR author filters all metrics consistently; sample sizes and clicked
  metric drill-downs reconcile with displayed totals.
- All connected + Me, single repository + Me, single repository + All, and All
  connected + All reconcile with the same underlying records. Equal PR IDs across
  repositories never collide; pooled medians are tested with unequal sample sizes.
  One failed/stale repository yields explicitly partial aggregate coverage.
- `npm run test`, `npm run build`, and renderer E2E for new report navigation/filtering.
  Inspect rendered light/dark and narrow layouts, overflow, keyboard/chart access,
  empty/partial/error states and console. Run `npm audit` if dependencies change.

## Verification

- HEAD verified against live `origin/main`: `588b7fe` (v3.3.0), unchanged through implementation.
- Focused collector/domain tests cover pagination, same-ID records across repos, old PR
  merges, post-merge updates, stable author identity, replies/resolved/deleted/pending
  comments, 429/401/403, cancellation, continuation inside a 460-page comment history,
  account changes, daily reconciliation, pooled medians, half-open local ranges and DST.
- IndexedDB tests cover migration to v16, concurrent atomic writes and account isolation.
  Hook tests cover offline loading, credential rotation, stale response suppression,
  partial cancellation, per-repository failures and demo isolation. Component tests
  cover author/chart drill-down, empty/error/partial/loading states.
- Final full test run: 989 passing across 141 files.
  Date-boundary tests additionally passed with explicit `TZ=Europe/Berlin`.
- Renderer E2E: 12 passing, including the new analytics navigation/filter/drill-down test.
- Final production build passed. Existing Vite large-chunk warning remains.
- Rendered dark/light desktop and 390px layouts inspected; no document/filter overflow
  or app runtime errors. A separate local renderer harness verified empty, syncing,
  permission-error, partial-coverage and cached states using stubbed native responses. Native Bitbucket HTTP is mocked in tests. No authenticated
  Bitbucket call was made, so actual token permissions, merge-history fidelity and
  cold-sync latency still need validation on a representative live repository.
- Manual Refresh is intentional; large-history syncs are explicit and cancellable.
  No Jira/Bitbucket writes, AI calls, new backend, telemetry, commits, PR or release.

Rendered QA artifacts: `/Users/fourgray/.codex/visualizations/2026/10/07/01a11631-d046-7e72-97e7-b5412ed1d6d3/implementation-qa/`.

## Release execution (2026-10-07)

User authorized merging, triggering the release workflow, and preparing a **draft**
GitHub release with curated notes. Default patch bump: 3.3.0 → 3.3.1.

- [x] Capture release screenshots for PR Analytics and run release:dry-run.
- [ ] Commit feature, open PR with Release note, merge after CI and verify main CI.
- [ ] Run patch release scripts from an isolated main checkout and watch the tagged workflow.
- [ ] Verify all platform assets, curate notes from included PRs and compare range; keep draft.
- Snap edge is enabled in the existing workflow. Candidate/stable promotion requires
  a verified Ubuntu install per the release skill; this macOS host cannot perform that validation.
