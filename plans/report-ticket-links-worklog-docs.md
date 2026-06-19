# Report Ticket Links And Work Log Docs

## Goal

Document that the app syncs Jira work log items and the Jira APIs involved, then make ticket-key labels consistently offer a direct Jira link where the rendered label has URL data.

## Decisions

- Treat Jira "worklogs" as user-facing work log items in docs.
- Keep the by-ticket aggregation compact: ticket key plus external Jira icon on the first line, ticket title below it, hours/percentage unchanged.
- Reuse one ticket-key link component for static ticket labels so Week, Today, Tickets, and Reports keep the same external-link behavior.
- Use existing issue summary and ticket URLs so links open the configured Jira issue in the user's browser.
- Do not put Jira anchors inside ticket picker buttons; nested interactive controls would be invalid markup.
- Fetch Jira `issuetype` for synced worklog issues and assigned tickets, then show compact badges only for non-standard issue types: `EPIC` for epics and `SUB` for subtasks.

## Completed Work

- Updated `README.md` and `AGENTS.md`.
- Updated `ReportsView` by-ticket aggregation and rendering.
- Added the shared `TicketKeyLink` component and focused CSS for title/link layout.
- Extended the ticket-key Jira link pattern to Week, Today, Tickets, and the add-time modal selected ticket label.
- Added server-render coverage for Reports, Week, Today, and Tickets ticket-key link output.
- Added issue-type badges to the same ticket-key surfaces.

## Verification

- `npm run test` passed: 7 files, 19 tests.
- `npm run build` passed.
- Browser plugin smoke check loaded `http://127.0.0.1:5173/` with title `Sprintf` and no console warnings/errors.
- Electron/CDP rendered QA with copied local data showed 7 by-ticket rows; each row had a title, a Jira `browse/{key}` link, an accessible link label, and an icon. Console output was empty.
- Electron/CDP rendered QA with copied local data showed Week `FTDM-397` had 2 Jira links, Today had selected/touched Jira links for `FTDM-397`, Tickets had 7 rows with 7 Jira links, and the add-time modal selected-ticket label had a Jira link.
- `npm run test` passed after issue-type badges: 7 files, 19 tests.
- `npm run build` passed after issue-type badges.
- Browser plugin smoke check loaded `http://127.0.0.1:5173/` with title `Sprintf`, app shell present, and no framework overlay. Browser screenshot capture timed out, so rendered screenshot evidence used Electron/CDP.
- Electron/CDP rendered QA with a copied, seeded profile showed dark-theme `EPIC`/`SUB` badges in Week, Today entries, and Reports. Light-theme QA showed the blue `EPIC` badge styling, `SUB` styling, live Tickets row badges, Today selected-ticket badge, and Add Time modal selected-ticket badge.
- Dev-mode console output only showed expected Vite/React/Electron development warnings; no page errors were reported.
