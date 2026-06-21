# TimeBro

<p align="center">
  <img src="./assets/app-icon.svg" alt="TimeBro app icon" width="112" height="112" />
</p>

Your manager has bravely decided that every minute is a tiny KPI waiting to be loved. If you are now searching for the perfect time-tracking instrument, TimeBro is your reliable desk buddy for keeping Jira worklogs tidy and making the manager suspiciously happy.

TimeBro is a small local desktop app for tracking weekly Jira work log item progress. It is built with React, TypeScript, Vite, Electron, and IndexedDB. There is no backend server.

The app helps answer one practical question: for the selected week, how many Jira work log item hours have I logged, and how much is still missing from my weekly target?

## Features

- Week dashboard with previous/current/next week navigation.
- Configurable weekly target hours, defaulting to `40h`.
- Monday-Friday day cards with target, tracked, missing, skipped/vacation state, and Jira issue lists.
- Vacation/skipped days are removed from the active working day count, and the weekly target is redistributed across the remaining active days.
- Jira Cloud REST API v3 connection test, work log item sync, and Add Time work log item creation.
- Jira issue rows show the issue key, logged hours, and a one-line ellipsized ticket title.
- Settings for Jira site, email, API token, weekly target, working days, reminder time, and reminder enablement.
- Local IndexedDB stores for settings, week overrides, and sync results.
- Native Electron reminder notifications while the app is running.

## Tech Stack

- React 18
- TypeScript
- Vite
- Electron
- Vitest
- IndexedDB
- Jira Cloud REST API v3

## Project Structure

```text
.
├── electron/          # Electron main process, preload bridge, Jira API calls, reminders
├── shared/            # Shared TypeScript types
├── src/               # React renderer app
├── plans/             # Agent-maintained implementation plans
├── design/            # Design and QA screenshots
├── AGENTS.md          # Agent development instructions
└── package.json       # Scripts, dependencies, Electron packaging config
```

## Getting Started

Install dependencies:

```bash
npm install
```

Start the full Electron app:

```bash
npm run dev
```

This starts:

- Vite renderer dev server on `http://127.0.0.1:5173/`
- Electron TypeScript watch build
- Electron desktop window pointed at the dev server

Start only the browser renderer preview:

```bash
npm run dev:renderer
```

Preview a production renderer build:

```bash
npm run build
npm run preview
```

Package the desktop app:

```bash
npm run dist
```

The packaged output is written to `release/`.

## Common Commands

```bash
npm run test      # Run Vitest tests
npm run lint      # Type-check renderer code
npm run build     # Type-check, build renderer, compile Electron files
npm run dist:mac  # Build macOS DMG and ZIP
npm run dist:win  # Build Windows NSIS installer and ZIP
npm run dist:linux # Build Linux AppImage, DEB, and tar.gz
npm run screenshots # Capture release/blog screenshots with demo data
npm audit         # Check dependency advisories
```

Regenerate app icons after editing `assets/app-icon.svg`:

```bash
npm run assets:icons
```

## Jira Sign-In: Token Or OAuth?

For a personal local desktop app, use your Atlassian account email plus a regular Atlassian API token. You do not need to be a Jira administrator.

The token acts as you, so Jira still enforces your normal permissions. Sync works when your user can browse the relevant projects and see the issues and work log items. If a project, issue security level, or work log visibility rule hides something from you in Jira, the app cannot read it either.

OAuth 2.0 3LO is better for a distributed product with a registered Atlassian integration, consent screen, client ID, client secret, redirect URL, and scopes. For this local MVP it is more setup, not less. Scoped API tokens also require the Atlassian API gateway URL with a Cloud ID, while this app uses the simpler direct Jira site URL. The app keeps the code open for OAuth or scoped-token gateway support later, but regular token auth is the simplest path right now.

## Create A Jira API Token

1. Open [Atlassian API tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Choose **Create API token**. For now, do not choose the scoped-token flow.
3. Give it a label such as `TimeBro`.
4. Copy the token once and paste it into the app Settings view with your Jira email.
5. Enter your Jira site as either `mycompany`, `mycompany.atlassian.net`, or `https://mycompany.atlassian.net`.

The MVP uses Basic auth with Jira email plus API token. Do not paste your Atlassian password.

If your organization requires scoped API tokens, the read-only scopes this app needs are:

- `read:jira-work` for JQL issue search and issue work log items.
- `read:jira-user` for `/rest/api/3/myself`, which identifies your Jira account ID so the app can keep only your work log items.

Scoped tokens use Atlassian's `api.atlassian.com/ex/jira/{cloudId}` gateway instead of the direct `https://company.atlassian.net` site URL, so gateway support would need to be added before scoped tokens are used in this MVP. No write, project-management, or Jira-admin scopes are needed for the current read-only sync.

## Data And Privacy

- Jira credentials are stored only in local IndexedDB.
- Credentials are sent only to the configured Jira Cloud site when testing the connection or syncing worklogs.
- No backend server is used.
- Sync results and skipped days remain local.
- Jira API calls are made by the Electron main process via IPC.

## Jira Work Log Item API

The app syncs Jira work log items, not issue discussion comments. Jira stores work log notes on the work log item itself under `worklogs[*].comment` as Atlassian Document Format (ADF). The app flattens that ADF comment with `shared/adf.ts` and keeps it on both the individual `JiraWorklog.comment` and summarized issue `comments` lists.

The app identifies the authenticated Jira account with:

```text
GET /rest/api/3/myself
```

It searches candidate issues with JQL:

```jql
worklogAuthor = currentUser()
AND worklogDate >= "<week-start-yyyy-mm-dd>"
AND worklogDate <= "<week-end-yyyy-mm-dd>"
ORDER BY updated DESC
```

It then fetches:

```text
GET /rest/api/3/issue/{issueIdOrKey}/worklog?startedAfter=<ms>&startedBefore=<ms>
```

For each returned work log item, the app:

- uses `worklog.started` as the tracking timestamp
- uses `timeSpentSeconds` for calculations
- filters by the authenticated user's Jira account ID
- includes only work log items where `started >= weekStart` and `started < weekEndExclusive`
- reads optional work log notes from `worklog.comment`
- sums tracked seconds by day and week

The Add Time flow intentionally writes a new Jira work log item with:

```text
POST /rest/api/3/issue/{issueIdOrKey}/worklog
```

That write sends Jira `started`, `timeSpentSeconds`, and an optional ADF `comment`. The app does not use `GET /rest/api/3/issue/{issueIdOrKey}/comment` for work log notes; that endpoint is for issue discussion comments, a different Jira object.

## Local Data Stores

IndexedDB stores:

- `settings`: Jira site, email, API token, weekly target, working days, reminder settings
- `weekOverrides`: skipped/vacation days by week
- `syncResults`: last calculated Jira worklog summary by week

## Agent Plans

Agentic development plans live in `/plans`. If a user changes the plan, update the relevant plan file so it stays current. See [AGENTS.md](./AGENTS.md) for agent-specific instructions.

## Release Automation

Releases are automated through [`.github/workflows/release.yml`](./.github/workflows/release.yml). Push a version tag and GitHub Actions will:

1. install dependencies
2. run tests
3. build the app
4. package macOS, Windows, and Linux builds on native runners
5. create or update a GitHub Release
6. upload the generated installers and archives

The workflow uses `gh release create` / `gh release upload` with the built-in `GITHUB_TOKEN`, so no extra release token is needed for normal same-repository releases.

## Release Screenshots

Generate deterministic light/dark screenshots for release notes, blog posts, and app store material:

```bash
npm run screenshots
```

On a fresh machine, install the Playwright browser once if the script asks for it:

```bash
npm run screenshots:install-browser
```

The script starts the renderer on a free local port, opens demo URLs such as
`?demo=1&view=week&theme=dark&seed=release&today=2026-06-17`, and writes PNGs to:

```text
design/release-screenshots/v0.1.0/
```

It captures `today`, `week`, `tickets`, `reports`, and `settings` in both dark and light themes. The data is in-memory only and does not write fake Jira settings, worklogs, tickets, or favorites into IndexedDB.

Useful overrides:

```bash
npm run screenshots -- --seed blog-1 --today 2026-06-17 --viewport 1600x1000
npm run screenshots -- --views week,reports --themes dark --out design/release-screenshots/blog-1
```

### One-Command Version Bumps

For the least manual release flow:

```bash
npm run release:dry-run
npm run release:patch
npm run release:push
```

Use `release:minor` or `release:major` instead of `release:patch` when appropriate.

`npm version` updates `package.json` and `package-lock.json`, commits the version bump, and creates a tag like `v0.1.1`. `npm run release:push` pushes both the commit and tags. The pushed tag starts the GitHub release workflow.

### Manual Tag Flow

If you want to tag manually:

```bash
git tag -a v0.1.1 -m "v0.1.1"
git push origin v0.1.1
```

Use semantic version tags in the `vX.Y.Z` format, for example `v0.2.0`.

### Local Packaging

You can build packages locally, but native CI builds are recommended for releases.

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

`npm run dist:all` asks electron-builder to build all configured targets from the current machine. That is convenient on machines with the right platform tooling installed, but the GitHub Actions matrix is more reliable because each OS builds its own native package.

### Code Signing

The current release workflow produces unsigned packages. That keeps release management low-friction for personal/internal distribution. For public distribution later, add Apple Developer ID signing/notarization and Windows code signing secrets to the workflow.
