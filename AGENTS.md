# Agent Development Guide

This project is Yesterlog, a local Electron + React desktop app for personal Jira weekly time tracking. Follow these instructions when working as an agent in this repository.

## Planning

- Store implementation plans in `/plans`.
- Create or update a plan before multi-step work, architectural changes, or anything that spans more than one file.
- If the user changes direction, update the existing plan instead of leaving stale notes behind.
- Keep plans concise and current: record the goal, decisions made, pending work, and verification status.
- Prefer one plan per task or feature, named with a short kebab-case description, for example `/plans/jira-oauth-support.md`.
- Do not treat a plan as completion. Update the plan as work changes, then verify the implementation with the relevant commands.

## Project Shape

- Renderer app: `src/`
- Electron main/preload process: `electron/`
- Shared TypeScript contracts: `shared/`
- Tests: colocated with the code they cover, using Vitest.
- Local persistent data: browser IndexedDB, accessed from the renderer.
- Jira network calls: Electron main process over IPC, not directly from renderer components.
- Jira time entries are treated as Jira work log items. Preserve work log item IDs, issue keys, started timestamps, durations, and work log comments across API, IPC, storage, and UI summaries.

## Day Reconstruction & optional AI

- **Day Reconstruction** rebuilds one forgotten workday from signals Yesterlog already syncs (Bitbucket commits + PR reviews) plus the Jira worklogs already logged, on a 09:00–18:00 timeline.
- **Two cleanly separated layers.** The deterministic core is the product and must work with **no model and no network**: `src/domain/reconstruct.ts` (pure engine: signals, placement, gaps, totals, confidence, day-kind, auto-distribute). The **optional** AI layer (`src/domain/enhancePrompt.ts` pure prompt/parse + `electron/aiProvider.ts` IPC) only polishes drafts and is **off by default**; on any failure it returns empty drafts so the core is preserved. Never make the view require an AI provider.
- AI calls go through the Electron **main** process only. Ollama runs fully on-device. The Claude and Codex CLI providers send best-effort-redacted prompts to Anthropic or OpenAI using the user's existing CLI authentication; never describe those providers as local or private. Yesterlog has no hosted AI proxy or telemetry.
- The view is a **review surface**: placements (drag/drop), duration overrides, and AI drafts are per-day drafts cached in IndexedDB (`reconstructDrafts`, `reconstructAiDrafts`). It does **not** bulk-write to Jira — "Log entries" opens the existing Add Time write flow. A real batch worklog write is a write-surface change that needs explicit sign-off (see the read-only rule below).
- Today never reconstructs future hours: the engine takes an hour-bucketed `nowMinutes` and measures the gap against elapsed working time.
- Key files: `src/components/ReconstructView.tsx`, `src/app/useReconstruct.ts`, `src/app/AppReconRoute.tsx`, `src/styles/reconstruct.css`; provider dispatch lives in `electron/aiProvider.ts`, `electron/ollama.ts`, `electron/claude.ts`, and `electron/codex.ts`; cloud prompt redaction lives in `src/domain/redaction.ts`; settings live in the `reconstruct` (AI) section of `SettingsView.tsx`. Keep the pure domain logic unit-tested.

## Development Rules

- When the user explicitly asks for before/after commits, create a checkpoint commit before starting the new work and a final commit after verification.
- Keep credentials local. Do not add telemetry, backend calls, or credential transmission outside the configured Jira site.
- Keep Jira API access read-only unless the user explicitly asks for write behavior. The existing Add Time flow is the intentional write surface and only creates Jira work log items.
- Use regular Atlassian API token auth for the MVP. OAuth and scoped-token gateway support are future architecture paths, not the default setup.
- Preserve Monday-local week calculations and the `[weekStart, weekEndExclusive)` worklog filter.
- Use existing design tokens and component patterns in `src/styles.css`.
- For UI changes, verify the rendered app, not only TypeScript compilation.

## Jira API Contracts

- Identify the user with `GET /rest/api/3/myself`.
- Find candidate issues for a week with `GET /rest/api/3/search/jql` and JQL `worklogAuthor = currentUser()` plus Monday-local `worklogDate` bounds.
- Fetch work log items from `GET /rest/api/3/issue/{issueIdOrKey}/worklog` with `startedAfter` and `startedBefore`; then filter again by authenticated account ID and `[weekStart, weekEndExclusive)`.
- Work log item notes come from `worklogs[*].comment` as Atlassian Document Format and are flattened with `shared/adf.ts`. Do not use the issue comments endpoint for work log notes.
- Creating a time entry uses `POST /rest/api/3/issue/{issueIdOrKey}/worklog` with Jira `started`, `timeSpentSeconds`, and optional ADF `comment`.
- Assigned/recent tickets use Jira search over `GET /rest/api/3/search/jql`; those ticket searches are separate from weekly work log item sync.

## Commands

```bash
npm install
npm run dev
npm run dev:renderer
npm run test
npm run build
npm run dist
```

Use `npm run dev` for the full Electron app. Use `npm run dev:renderer` for a browser-only renderer preview.

## Verification Expectations

- Run `npm run test` for calculation, rendering, and component behavior changes.
- Run `npm run build` before handing off production-affecting changes.
- Run `npm audit` after dependency changes.
- For frontend work, inspect the app in a browser or Electron window and check for clipping, overflow, console errors, and broken interaction states.
- Document any intentionally skipped verification in the final response.

## Pull Requests & Release Notes

- When drafting or updating a pull request, keep its `## Release note` section current with the final scope.
- For a user-visible change, write one concise sentence about the user benefit or behavior change. Do not use a raw commit subject, implementation detail, or test summary as the release note.
- Write exactly `None` when the change is internal-only and should not appear in release notes. Do not invent user impact for tests, refactors, maintenance, or documentation-only work.
- Treat the pull request release note as input to release curation, not as permission to publish or as the final release copy.

## Releasing

- Use the `/release` skill to cut a release; it is the canonical, end-to-end flow.
- During release curation, use merged pull requests' `## Release note` sections as the primary source, then verify them against GitHub's generated notes and the full tag comparison so direct commits and stale descriptions are not missed.
- Commit your change first (`npm version` aborts on a dirty tree), then bump with `npm run release:patch` (or `release:minor` / `release:major`).
- Push the release commit and the `vX.Y.Z` tag with `npm run release:push` (= `git push && git push --tags`).
- Pushing a `v*.*.*` tag triggers `.github/workflows/release.yml`, which tests, builds, packages macOS/Windows/Linux, and creates a DRAFT GitHub Release; leave it as a draft unless the user asks to publish.
- Run `npm run release:dry-run` before tagging to confirm `test`, renderer E2E, and the build pass.
- Generate release media with `npm run screenshots` (or `screenshots:release`); PNGs land in `screenshots/v<package-version>/`.
- See the README `## Release Automation` section for the full pipeline, local packaging (`npm run dist:*`), and code-signing secrets.
