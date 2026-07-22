# TimeBro Recap

## Goal

Ship the production Recap workspace from the supplied handoff: cached real-data aggregation, deterministic and optional AI drafts, editable version history, immutable local brag-doc saves, exports, deep links, and calendar/report discovery.

## Decisions

- Use cached local Jira, Bitbucket, activity, reconstruction, note, and recurring data only; changing intervals never syncs.
- Keep the existing Today `RecapCard` separate.
- Use file-safe hash routes and the existing configured AI provider/redaction path.
- Store draft histories and immutable saved snapshots in IndexedDB.
- Reuse the current shell, tokens, Lucide icons, snackbar system, and app icon asset.

## Work

- [x] Add domain contracts, interval/evidence aggregation, deterministic generation, serializers, and AI validation.
- [x] Add IndexedDB stores and Recap state hook.
- [x] Add the three-column view, controls, editing, sources drawer, history, save, and export.
- [x] Add navigation, deep links, entry points, and saved markers.
- [x] Add tests, demo data, responsive styling, and visual verification.

## Verification

- Passed: `npm run lint`
- Passed: `npm run test` (122 files, 780 tests)
- Passed: `npm run e2e:renderer` (8 flows)
- Passed: `npm run build`
- Passed: dark/light, expanded/collapsed sidebar, source/brag drawers, 1440×960 and 1040×720 visual inspection with no console errors or document overflow
