# Agent Development Guide

This project is a local Electron + React desktop app for personal Jira weekly time tracking. Follow these instructions when working as an agent in this repository.

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

## Development Rules

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
