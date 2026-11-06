# Yesterlog Snap Store listing

Use this copy and media checklist when completing the Snap Store dashboard.

## Package identity

- Snap name: `yesterlog`
- Title: `Yesterlog`
- Summary: `Local-first work memory for developers who use Jira`
- Primary category: Productivity
- Secondary category: Development
- License: MIT

The public `yesterlog` name was registered on 2026-07-23 by the intended
long-term publisher.

## Description

Yesterlog is a local-first work memory for developers who use Jira.

Connect your Jira Cloud account with a regular Atlassian API token and Yesterlog
turns the work evidence you already leave behind into a record you can use.
Review and complete worklogs without living in Jira's timesheet screens, find
missing days, and keep Monday-local totals, daily targets, ticket history,
recurring events, reports, and personal notes in one focused desktop workspace.

Day Reconstruction can rebuild a forgotten workday from Jira worklogs and
optional Bitbucket commits and pull-request review activity. Its deterministic
core works without AI. Recap uses the same grounded local history to draft a
standup, manager update, performance review, CV candidate, or changelog for a
week, month, or quarter, with links back to the supporting sources and a local
brag doc for saved snapshots.

If you enable the optional AI layer, choose Ollama for fully local processing,
Anthropic through the Claude CLI, or OpenAI through the Codex CLI. The cloud
options use your existing CLI authentication and receive best-effort-redacted
signals. Yesterlog has no hosted backend or telemetry.

Highlights:

- Reconstruct forgotten days from Jira and optional Bitbucket activity.
- Add, edit, and delete Jira worklogs from the intentional time-entry flow.
- Turn a week, month, or quarter into a grounded recap for standups, managers,
  performance reviews, CV drafts, or changelogs.
- Inspect recap sources, compare versions, export drafts, and save a local brag doc.
- Search Jira tickets and keep frequently used work close at hand.
- Review reports, daily targets, recurring events, and local personal notes.
- Move all saved data between computers with portable backups; import older CSV notes.
- Keep credentials and synced data on your own device.
- No Yesterlog account, hosted backend, telemetry, or cloud AI requirement.

Yesterlog is an independent application and is not affiliated with or endorsed
by Atlassian.

## Links

- Website: `https://4gray.github.io/yesterlog/`
- Source code: `https://github.com/4gray/yesterlog`
- Contact/support: `https://github.com/4gray/yesterlog/issues`
- Privacy information: `https://github.com/4gray/yesterlog#data--privacy`

## Media

- Store icon: `build/icons/512x512.png`
- Featured banner: `docs/media/yesterlog-snap-featured-banner.png`
  - 2160×720 (3:1), 584 KB; Store limit: 720×240-4320×1440, 2 MB.
- GitHub social preview: `docs/media/yesterlog-github-social-preview.png`
  - 1280×640 (2:1), 253 KB; GitHub limit: below 1 MB.
- Release screenshots:
  - `docs/screenshots/v3.0.0/dark-today.png`
  - `docs/screenshots/v3.0.0/dark-week.png`
  - `docs/screenshots/v3.0.0/dark-month.png`
  - `docs/screenshots/v3.0.0/dark-reports.png`
  - `docs/screenshots/v3.0.0/dark-settings.png`

The icon is 512×512 and below the Store's 256 KB limit. Version 3.0.0 is the
latest repository media set containing all five requested views. The listed
screenshots fit the Store's size and aspect-ratio limits. Re-capture or confirm
them from the final Snap on Ubuntu before promoting the snap to stable.

## Final dashboard checklist

- [x] Register `yesterlog` with the intended publisher account.
- [x] Add the MIT license.
- [x] Configure restricted GitHub Actions Store credentials for `yesterlog`/`edge`.
- [x] Paste the title, summary, primary and secondary categories, description, and links.
- [x] Upload the icon and five Linux screenshots.
- [x] Upload the featured banner to the Snap Store.
- [ ] Configure the GitHub repository social preview.
- [x] Upload the first `v3.0.0` revision to `edge`.
- [x] Install the Store revision on a clean Ubuntu system.
- [x] Complete the automated clean-Ubuntu/X11 launch and integration smoke test.
- [x] Promote the tested revision to `candidate`, then `stable`.

Revision `1` is the tested artifact in all three release channels. The public
Snap Store page now includes the final Yesterlog metadata, Productivity and
Development categories, license, links, icon, five version 3.0.0 screenshots,
and featured banner. The GitHub repository social preview remains a separate
optional follow-up.
