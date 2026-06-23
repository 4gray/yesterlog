# Bitbucket Review Ledger

## Goal

Add an optional Bitbucket Cloud integration that unlocks a Review screen for PR review sessions. Jira-only usage must keep working unchanged.

## Decisions

- Bitbucket is optional and configured from Settings.
- The Review nav item appears only when Bitbucket settings are complete.
- Initial review time is an estimate from PR review activity; users can review and log sessions before anything is written to Jira.
- The integration is read-only for Bitbucket. Jira worklog creation remains the only write path.
- MVP supports read/test/sync with Bitbucket API and demo fixtures for rendered UI verification without real credentials.
- Settings must explicitly tell users to create a Bitbucket Cloud scoped API token and select only read scopes.

## Work

- [x] Add shared Bitbucket settings, review activity/session types, and IPC contracts.
- [x] Add Bitbucket client in Electron main and preload bridge.
- [x] Persist Bitbucket review sync results in IndexedDB.
- [x] Add optional Bitbucket configuration and connection test to Settings.
- [x] Clarify Bitbucket token creation steps and exact scopes in Settings.
- [x] Add conditional Review navigation and Review screen.
- [x] Wire review sync, demo data, and batch Jira logging.
- [x] Fix Review empty-state selection loop that caused React maximum update depth warnings.
- [x] Add confirmation dialogs for review logging and target-mode changes.
- [x] Show review estimate explanation, PR author, and author/reviewer filter.
- [x] Add bulk duration editing to review confirmation dialogs.
- [x] Add focused tests and run verification.

## Verification

- `npm run test` passes.
- `npm run build` passes.
- Rendered QA completed in demo Review and Settings views on desktop and mobile-width viewport.
- Rendered QA rechecked Settings after adding the scoped Bitbucket token guide.
- Review selection loop fix verified with `npm run test`, `npm run build`, and rendered Review sync QA with clean console.
- Review confirmation dialogs, estimate info, PR author display, and ownership filter verified in rendered demo QA with clean console.
- Review duration overrides verified in both confirmation dialogs with presets and custom minutes; overrides carry into log preview.
