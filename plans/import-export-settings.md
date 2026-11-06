# Full application backup and restore

## Goal and decisions

- Replaced visible-week CSV export with one portable, versioned JSON backup of all 18 IndexedDB stores and allowlisted UI preferences.
- Backups exclude Jira/Bitbucket tokens and CLI paths; restore disables AI. IDs, account scopes, timestamps, worklog comments and rich-text documents remain unchanged.
- Restore replaces all local data after preview and confirmation; users can export current data first. Legacy weekly CSV note import remains available.
- Restore is available in Settings and before Jira connection on Welcome. Reconnect Jira after restore; import is offline and never writes to Jira.
- Validate the entire file, including nested/optional fields, duplicate keys, account scopes and JSON preferences, before replacing stores atomically. Unsupported format/schema versions fail without changing data.
- Stage UI preferences in the same IndexedDB transaction, apply before rendering, and retry after failure. Quiesce writes, native sync and note autosaves during transfers.
- Reuse analytics under a new token only after verifying the same Bitbucket account and connection; choose the latest cached snapshot per repository.

## Completed

- Added backup contract, validation, raw snapshot/atomic restore and transfer coordination without dependencies.
- Replaced weekly export wiring with full backup/restore in Settings; added Welcome restore and confirmation with per-category counts, current-data export and explicit discard of dirty settings.
- Removed unused weekly CSV encoder and action; retained CSV parsing, compatibility fixtures and import behavior.
- Added round-trip coverage of all stores, multiple weeks/accounts, token removal, repeated imports, rollback, preference retry, synchronization/autosave drain and analytics identity isolation.
- Added UI/hook tests for preview, cancellation, invalid files, dirty settings, demo restrictions, waiting and export/restore failures.
- Added renderer E2E transfer between isolated profiles in Europe/Berlin and America/New_York, including current-data export, cancellation, invalid input, reauthentication fields, legacy CSV and repeated restore with dirty settings.
- Updated README, feature, privacy and Snap listing documentation.

## Verification

- `npm run test`: passed, 149 files / 1076 tests.
- Backup suite: 26 tests passed within the full run, including credential exclusion, parallel-sync writes and empty reminder-time round trips.
- `npm run e2e:renderer`: passed, 15 tests. Focused full-transfer E2E also passed after transfer-coordination cleanup.
- `npm run build`: passed (existing large-chunk warning remains).
- `git diff --check`: passed.
- Browser QA: Settings Data and restore preview at desktop and 390×844; actions reachable by scroll/keyboard, no document overflow, console errors or warnings.

## Remaining manual verification

- Real packaged Linux → macOS/Windows transfer and Electron native download/reload behavior were not exercised in this macOS renderer environment. Cross-platform data behavior was checked using isolated browser profiles and different time zones.
- Backups are unencrypted and contain work history and notes. Replacement is destructive only after explicit confirmation; credentials must be entered again.

## Local review and pull request

- Reviewed storage, synchronization, autosave, identity, import validation and startup flows for one local desktop profile.
- Found and reproduced a parallel-write race: a failed weekly sync write could leave the Jira ledger update running past transfer preparation. Fixed by awaiting all sync writes before propagating errors, with a regression test.
- Final review: no unresolved blocking findings. Full test suite, renderer E2E, build and diff checks passed after the fix; ready for pull-request review.


## PR #50 feedback and merge

- CI passed on the original head. Review identified P2: a saved empty reminder time blocked full backup validation.
- Decision: accept the existing empty-string settings representation and preserve it on restore; do not change reminder scheduling or normalize the user's saved preference.
- Fixed the validator in one line. Round-trip tests with reminders enabled and disabled reproduced the failure before the fix and passed afterward; malformed non-empty times remain rejected.
- Local verification passed: 149 files / 1076 tests, 15 renderer E2E scenarios, production build, brand audit and diff checks.
- Remote checks, review-thread resolution and merge status are tracked in [PR #50](https://github.com/4gray/yesterlog/pull/50); merge requires green CI on the exact latest head.
