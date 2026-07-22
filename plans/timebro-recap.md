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

## Product completion audit

### Goal

Turn Recap from a source-shaped ticket digest into a genuinely shareable narrative for manager updates, performance reviews, CV material, standups, and changelogs.

### Findings

- [x] Audit evidence aggregation, theme construction, deterministic copy, AI prompt and validation, detail levels, format-specific rendering, exports, and tests.
- [x] Confirm the current implementation treats `detailed` as the same bullet structure with the `long` field, not as a prose-oriented document mode.
- [x] Confirm weekly theme capping can collapse every cluster into a single `Other contributions` theme.
- [x] Confirm AI may rewrite supplied themes but cannot reorganize evidence into product or module narratives.
- [x] Confirm CV is a light wording transform over the same source lines rather than a distinct accomplishment model.
- [x] Confirm partial month and quarter coverage is disclosed in controls but does not qualify or block confident document claims.
- [x] Confirm the AI prompt omits repository, epic, role, source kind, date, coverage, and product context that the model needs for useful grouping.
- [x] Confirm repeated worklogs on one ticket retain only the first note while their durations are merged.
- [x] Confirm deterministic changelog tags rotate by line position rather than evidence.

### Decisions pending

- [x] Optimize Recap first for reusable review-ready memory. Manager updates, CV material, standups, and changelogs are format-specific views over the same grounded workstreams.
- [x] Use a format-aware document model: narrative sections for manager and performance review, accomplishment candidates for CV, terse bullets for standup, and evidence-backed change entries for changelog.
- Decide how product and module grouping should be inferred when Jira epic metadata is absent.
- [x] Group by Jira epic first, then Jira project or repository, then ticket or local-work category when richer context is absent.
- [x] Treat less than 80% of elapsed Jira weeks as partial. Keep generation available, but qualify the document and surface the gap prominently.

### Proposed work

- [x] Replace the one-shape-fits-all copy contract with format-specific output structures and explicit detail semantics.
- [x] Preserve product, epic, repository, and workstream context in a stable grouping layer before copy generation.
- [x] Preserve multiple evidence notes per ticket instead of flattening them into one title and one first note.
- [x] Rewrite the AI prompt around audience, document purpose, paragraph requirements, evidence rules, and safe uncertainty.
- [x] Improve the deterministic fallback so AI-off Recap remains useful and readable.
- [x] Redesign the document surface to render paragraphs, accomplishments, and changelog entries without forcing every format into identical bullets.
- [x] Add coverage gating and explicit partial-data language before generating month or quarter claims.
- [x] Add golden-output tests and rendered verification for representative week, month, and quarter datasets.

### Verification status

- Passed: `npm run test` (123 files, 791 tests).
- Passed: `npm run build`.
- Passed: `npm run e2e:renderer` (8 flows).
- Passed: Playwright inspection of Performance review, Manager update Standard/Detailed, and CV output at 1440×960 light and 1040×720 dark with no console errors or visible clipping.

## Controlled generation and CV impact enrichment

### Goal

Make Recap feel immediate and trustworthy: local reconstruction may happen automatically, while AI and source refreshes remain explicit, reversible user actions. Help users turn grounded CV candidates into stronger statements without inventing outcomes.

### Decisions

- Automatically load or create the local deterministic draft when the view opens; never start AI solely because the user opened Recap.
- Keep `Refresh activity` and `Rewrite with AI` as separate actions with separate progress language.
- Every explicit refresh or AI rewrite creates a new active version. Never replace an existing or manually edited version in place.
- Keep changing format and length instant and local. AI is applied only to the current selected format when explicitly requested.
- Treat user-entered CV outcomes as trusted personal evidence, preserve them on the line, and include them in exports and later AI rewrites.
- Use an inline guided impact editor rather than a modal wizard: one concrete question, examples, explicit Save/Cancel actions.

### Work

- [x] Remove automatic AI enhancement from initial and stored-draft loading.
- [x] Add explicit refresh and AI rewrite operations with independent loading states and immutable version creation.
- [x] Protect manual edits and user impact statements across versioning and AI parsing.
- [x] Preserve edits and version selection made while an AI rewrite is pending, and allow saved CV outcomes to be removed.
- [x] Preserve edits while activity refresh is pending and carry CV outcomes by stable source identity.
- [x] Assign each trusted CV outcome to at most one AI-generated accomplishment line.
- [x] Keep local impact carry one-to-one across regrouping and restore repository-qualified refs after cloud redaction.
- [x] Avoid repeated schema migration when a user browses a legacy draft version.
- [x] Add the guided CV impact editor and grounded export formatting.
- [x] Update the action row, status copy, responsive styles, and accessibility states.
- [x] Add lifecycle, version-protection, impact, component, export, and rendered UI verification.

### Verification status

- Passed: `npm run test` (123 files, 804 tests).
- Passed: `npm run build`.
- Passed: `npm run e2e:renderer` (8 flows), including refresh versioning and CV outcome entry.
- Passed: Playwright inspection at 1440×960 light and 1040×720 dark with no fresh-page console errors, broken action wrapping, or horizontal clipping.
