# Release Screenshot Workflow

## Goal

Create a repeatable local workflow that renders TimeBro with realistic demo Jira data and captures release/blog screenshots for every primary view in light and dark themes.

## Recommended Approach

Use an in-memory demo mode controlled by URL parameters, not a persistent IndexedDB seed. This keeps personal Jira settings and local worklog data untouched while making screenshots deterministic and easy to automate.

## Decisions

- Add a small demo fixture factory under `src/demo/` that builds deterministic `AppSettings`, `SyncResult`, `TicketsResult`, favorite keys, skipped days, and worklog notes from a seed.
- Drive demo mode from URL params such as `?demo=1&view=week&theme=dark&seed=release&today=2026-06-17`.
- Freeze the app clock in demo mode so Today, Week, Reports, and worklog ranges stay stable across machines and future dates.
- Keep fixture data fake and brand-safe: no real Jira hostnames, emails, issue keys, tokens, customer names, or private comments.
- Capture screenshots with a Node script using Playwright against the renderer app, not by manually clicking through the UI.
- Save screenshots to a versioned folder such as `design/release-screenshots/v0.1.0/`.
- Include the core views: `today`, `week`, `tickets`, `reports`, and `settings`, each in `light` and `dark`.
- Support optional named scenes later, for example `add-time-modal`, `empty-week`, `sync-error`, or `collapsed-sidebar`.
- Fail the screenshot script on console errors, page errors, missing ready markers, blank screenshots, or unexpected viewport dimensions.

## Work Items

- Add `src/demo/fixtures.ts` with a deterministic seeded scenario builder. Done.
- Add `src/demo/config.ts` to parse and validate demo URL params. Done.
- Update `src/App.tsx` to initialize demo state from fixtures and skip live Jira/native loading when demo mode is active. Done.
- Replace direct `new Date()` reads in App-level view selection with a demo-aware `now` value. Done for App and WeekView.
- Add a screenshot-ready marker to the app shell once demo data and fonts are loaded. Done via `data-screenshot-ready`, `data-view`, and `data-theme`.
- Add `scripts/capture-screenshots.mjs` to start Vite on a free local port, visit every view/theme URL, and save PNGs. Done.
- Add package scripts such as `screenshots`, `screenshots:release`, and `screenshots:install-browser`. Done.
- Document the command and output location in `README.md`. Done.
- Bump the IndexedDB version constant from 2 to 3 after rendered verification found an existing browser profile with `jira-week-tracker` version 3. Done.
- Optionally add a GitHub Actions workflow to generate screenshot artifacts on `workflow_dispatch` or release tags. Deferred.

## Verification

- `npm run test` passed.
- `npm run build` passed.
- `npm audit` reported 0 vulnerabilities after adding Playwright.
- `npm run screenshots` generated all 10 light/dark core view screenshots.
- Contact sheet inspected visually for dark/light Today, Week, Tickets, Reports, and Settings.
- Browser smoke-check passed for demo Week -> Tickets navigation with no console warnings or errors.
- Normal non-demo renderer path loaded from IndexedDB with `data-demo` absent and no console warnings or errors.
- Demo mode avoids writes to IndexedDB/localStorage for fake settings, tickets, worklogs, favorites, skipped days, and theme selection.

## Notes

- Browser renderer screenshots should be the default because they are fast, deterministic, and close to the actual app UI.
- Electron-window screenshots can be added later if release materials need native window chrome or packaged-app proof.
- A deterministic seed is better than true randomness for release assets; new visual variants can still be produced by changing the seed explicitly.
