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

- Website: `https://github.com/4gray/time-bro`
- Source code: `https://github.com/4gray/time-bro`
- Contact/support: `https://github.com/4gray/time-bro/issues`
- Privacy information: `https://github.com/4gray/time-bro#data--privacy`

## Media

- Store icon: `build/icons/512x512.png`
- Recommended screenshots:
  - `docs/screenshots/v2.4.0/dark-week.png`
  - `docs/screenshots/v2.4.0/dark-today.png`
  - `docs/screenshots/v2.4.0/dark-recon.png`
  - `docs/screenshots/v2.4.0/dark-reports.png`
  - `docs/screenshots/v2.4.0/dark-settings.png`

The icon is 512×512 and below the Store's 256 KB limit. The listed screenshots
fit the Store's size and aspect-ratio limits. Re-capture or confirm them from
the final Snap on Ubuntu before submitting the stable listing.

## Final dashboard checklist

- [x] Register `timebro` with the intended publisher account.
- [x] Add the MIT license.
- [x] Configure restricted GitHub Actions Store credentials.
- [ ] Paste the title, summary, categories, description, and links.
- [ ] Upload the icon and up to five final Linux screenshots.
- [x] Upload the first revision to `edge` (version 2.7.2, revision 1).
- [ ] Install the Store revision on a clean Ubuntu system.
- [ ] Complete the Wayland and X11 smoke-test checklist in the README.
- [ ] Promote the tested revision to `candidate`, then `stable`.
