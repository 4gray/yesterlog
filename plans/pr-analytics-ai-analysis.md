# Optional AI review-flow analysis

## Goal
Implement optional inline review-flow analysis, custom date periods and comparison of two repositories. v3.3.3 is published; this work targets the requested v3.3.4 patch release.

## Product decisions
- Existing deterministic metrics remain authoritative and available without AI.
- Compare equal calendar-day periods in the same repository/author scope, marking any period including today as provisional; distinguish first-response wait, response-to-merge time, and merge throughput.
- Present observations, linked supporting PRs and cautious suggestions, without productivity scores or causal claims from timestamps alone.
- Explicit Analyze action uses the configured provider. Default payload contains anonymized aggregates, never PR titles, comments, code, or author names. Local/cloud provider behavior must remain clear.
- Incomplete history or insufficient samples prevents a confident comparison. Provider failure preserves metrics; filter changes make the previous analysis stale.

## Exploration
- [x] Interactive synthetic mockups: inline analysis beside metrics vs. an analysis side panel.
- [x] Show evidence drill-down, data-sharing disclosure, and partial-data state; inspect responsive rendering.
- [x] User chose inline analysis and all three implementation features.

## Verification
Initial mockup exploration used synthetic data only. Implementation verification is recorded below.

Verified both layouts in a browser, including evidence reveal, simulated refresh, panel close/open, light/dark appearance and 318px content width. No JavaScript errors or horizontal overflow. All displayed values and PRs are synthetic.

## Implementation scope (approved)

User selected inline analysis and explicitly requested all three features now: AI, custom periods, and repository comparison.

- [x] Add inclusive local From/To dates with validation and a calendar popover; preserve Monday/month grouping and exclusive API bounds.
- [x] Compare two distinct connected repositories with shared dates/author, separate coverage and sample sizes, and refresh only the selected scope.
- [x] Add pure deterministic evidence/previous-period summaries and a strictly allowlisted aggregate-only AI prompt. Keep repository names, PR identities and titles on-device.
- [x] Explicit Analyze action through existing main-process provider IPC; compact collapsible output, linked evidence, failure fallback, stale/in-flight result invalidation.
- [x] Load prior-period history only on an explicit action; include equal calendar-day ranges and disclose current-day partial periods.
- [x] Synthetic unit/component tests, full test/build and rendered browser verification of all interactions and responsive states.

AI explains the primary selected repository (or pooled scope); repository comparison is a separate deterministic surface. The user subsequently requested the next release.

## Implementation verification

- 1010 tests across 145 files passed; 14 renderer E2E scenarios passed; production build passed (existing Vite chunk-size warning only).
- Browser QA covered dark/light, 390px layout, calendar popover, one-day/custom intervals, two-repository comparison, explicit analysis, evidence and collapse. No browser console errors.
- E2E caught a deferred details-toggle event overwriting edited dates; draft reset now happens synchronously when opening the calendar. The final calendar scenario and build pass.
- Request payload tests cover all three providers and exclude identifying/free-text fields. Disabled AI, incomplete history, small samples, provider failure and late responses after a scope change are covered.
- Calendar periods are capped at 366 days. The collector accepts up to two years for previous-period history while retaining its request budget and resumable sync behavior; ordinary Refresh preserves wider cached comparison checkpoints.
- No live model call or real-profile refresh was made. Existing provider IPC is reused; new functionality was exercised with synthetic fixtures and demo mode. No dependency changes. Release execution follows below.

## Release execution (v3.3.4)

- User requested the next release; follow the canonical release skill, leaving GitHub as a draft and Snap in edge pending Ubuntu runtime verification.
- [x] Release dry-run passed: brand audit, 1010 tests, 14 renderer E2E scenarios and production build. Dark/light Analytics screenshots use the synthetic release seed.
- [ ] Commit the feature, merge a PR after CI, then bump from current main using author 4gray.
- [ ] Require green CI for the exact version commit before pushing the release tag.
- [ ] Verify every platform artifact, signed/notarized macOS, updater manifests and Snap metadata.
- [ ] Curate draft notes from the PR release note and full v3.3.3 comparison.
