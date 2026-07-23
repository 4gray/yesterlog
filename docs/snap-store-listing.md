# TimeBro Snap Store listing

Use this copy and media checklist when completing the Snap Store dashboard.

## Package identity

- Snap name: `timebro`
- Title: `TimeBro`
- Summary: `Local weekly Jira time tracking for your desktop`
- Primary category: Productivity
- Secondary category: Development
- License: MIT

The public `timebro` name was registered on 2026-07-22 by the intended
long-term publisher.

## Description

TimeBro is a private, local-first desktop companion for weekly Jira time
tracking.

Connect your Jira Cloud account with a regular Atlassian API token, review the
worklogs you have already recorded, and log new work without living in Jira's
timesheet screens. TimeBro keeps Monday-local weekly totals, daily targets,
vacation adjustments, ticket history, reports, recurring events, and personal
notes together in one focused desktop workspace.

Day Reconstruction can rebuild a forgotten workday from Jira worklogs and
optional Bitbucket commits and pull-request review activity. Its deterministic
core works offline. If you enable the optional AI layer, TimeBro talks only to
your own Ollama server on `localhost`; no cloud model or TimeBro backend is
involved.

Highlights:

- Sync and review your Jira worklogs by day, week, and month.
- Add, edit, and delete Jira worklogs from the intentional time-entry flow.
- Search Jira tickets and keep frequently used work close at hand.
- Reconstruct missed days from Jira and optional Bitbucket activity.
- Review reporting, daily targets, recurring events, and local personal notes.
- Import and export weekly CSV data.
- Keep credentials and synced data on your own device.
- No TimeBro account, hosted backend, telemetry, or cloud AI requirement.

TimeBro is an independent application and is not affiliated with or endorsed
by Atlassian.

## Links

- Website: `https://4gray.github.io/time-bro/`
- Source code: `https://github.com/4gray/time-bro`
- Contact/support: `https://github.com/4gray/time-bro/issues`
- Privacy information: `https://github.com/4gray/time-bro#data--privacy`

## Media

- Store icon: `build/icons/512x512.png`
- Featured banner: `docs/media/timebro-snap-featured-banner.png`
  - 2160×720 (3:1), 562 KB; Store limit: 720×240-4320×1440, 2 MB.
- GitHub social preview: `docs/media/timebro-github-social-preview.png`
  - 1280×640 (2:1), 253 KB; GitHub limit: below 1 MB.
- Uploaded screenshots:
  - `docs/screenshots/v2.4.0/dark-today.png`
  - `docs/screenshots/v2.4.0/dark-week.png`
  - `docs/screenshots/v2.4.0/dark-month.png`
  - `docs/screenshots/v2.4.0/dark-reports.png`
  - `docs/screenshots/v2.4.0/dark-settings.png`

The icon is 512×512 and below the Store's 256 KB limit. Version 2.4.0 is the
latest repository media set containing all five requested views. The listed
screenshots fit the Store's size and aspect-ratio limits. Re-capture or confirm
them from the final Snap on Ubuntu before promoting the snap to stable.

## Final dashboard checklist

- [x] Register `timebro` with the intended publisher account.
- [x] Add the MIT license.
- [x] Configure restricted GitHub Actions Store credentials.
- [x] Paste the title, summary, primary category, description, and links.
- [x] Upload the icon and five Linux screenshots.
- [x] Upload the featured banner to the Snap Store.
- [ ] Configure the GitHub repository social preview.
- [x] Upload the first revision to `edge` (version 2.7.2, revision 1).
- [ ] Install the Store revision on a clean Ubuntu system.
- [ ] Complete the Wayland and X11 smoke-test checklist in the README.
- [ ] Promote the tested revision to `candidate`, then `stable`.
