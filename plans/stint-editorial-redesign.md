# Stint – Editorial redesign

## Goal
Align the app UI with the "Stint – Editorial" Claude Design (file
`Stint - Editorial.dc.html`).

## Source
The authoritative `.dc.html` was delivered as a Claude Design handoff bundle
and implemented directly from the source markup (not screenshots). The design
is a four-view, dark "editorial" app shell rather than the prior
sidebar+dashboard layout.

## Confirmed scope (asked up front)
- **Full 4-view reshell** — macOS titlebar, top nav, and TODAY / WEEK /
  TICKETS / REPORTS in the dark editorial theme.
- **Wire real data where it exists** — WEEK + REPORTS read the real
  `weekState` / sync data; TODAY + TICKETS are pixel-faithful static
  recreations of the design's sample content (no backing log-time / assigned-
  ticket APIs yet).
- **Settings kept off-nav** — reachable via the gear button beside the SYNCED
  status; the status chip itself triggers a Jira sync.

## What was built
- `index.html`: Bricolage Grotesque + Space Mono web fonts; title → "Stint".
- `src/styles.css`: full rewrite to the dark theme (`#0a0b0e` bg, blue/green/
  amber accents, mono labels + display numerals) with semantic classes for the
  shell and every view.
- `src/components/TopNav.tsx`: wordmark, four tabs, SYNCED-time status (synced/
  stale/syncing dot) → sync, gear → settings.
- `src/components/WeekView.tsx`: "Xh left", ISO week + compact range, weekly
  meter, prev/this/next nav, 5 day columns from `weekState.days`
  (tracked/target colours, meters, top-2 worklogs, today CTA, upcoming).
- `src/components/ReportsView.tsx`: KPI row (daily avg, days on target, tickets
  touched, billable), hours-per-day bar chart, by-ticket breakdown — all
  aggregated from `weekState`; EXPORT CSV downloads the week's worklogs.
- `src/components/TodayView.tsx`, `TicketsView.tsx`: static editorial
  recreations of the design's sample composer / ticket list.
- `src/components/SettingsView.tsx`: re-themed to the dark editorial look;
  logic and props unchanged.
- `src/App.tsx`: new `app-shell` (titlebar + TopNav + active view), view state
  `today|week|tickets|reports|settings`, default `week`. Sync/settings/test
  logic preserved.
- `src/utils/date.ts`: added `getIsoWeekNumber` + `formatWeekRangeCompact`
  (unit-tested).
- Removed obsolete `Sidebar`, `WeekDashboard`, `DayCard` (+ test),
  `ProgressRing`.

## Intentionally not carried over
- Vacation / skip-day toggle had no surface in the editorial design; the
  `weekOverride` data path is still read by `buildWeekState` but no longer has
  a UI control.
- TODAY/TICKETS sample data is static — wiring them to real Jira data needs
  new backend (log-time write, assigned-ticket fetch) that doesn't exist yet.

## Verification
- `tsc --noEmit` clean; `vitest run` 11/11 pass; `npm run build` succeeds.
- Verified all four views + settings in the browser preview at 1320×840 (the
  design canvas); no console errors. Real "today" (Fri 19 Jun 2026) highlights
  correctly; empty states show when nothing is synced.

## Follow-ups — DONE (wired to real Jira backend)
Implemented step by step, each typechecked + preview-verified:

- **Step 1 — TICKETS → real assigned issues.** `electron/jira.ts`
  `fetchAssignedTickets` (open via `statusCategory != Done`; recently closed via
  `statusCategory = Done AND resolved >= -14d`) + IPC `jira:fetch-tickets`,
  preload, `native.fetchAssignedTickets`, window typings. `TicketsView` renders
  real grouped tickets with this-week hours from sync; local ★ favorites store
  (IndexedDB `favorites`, DB v2); LOG selects the issue and opens TODAY.
- **Step 2 — TODAY → real worklogs.** `electron/jira.ts` `addWorklog` (POST
  `/worklog`, plain-text→ADF comment, Jira `started` format) + IPC
  `jira:add-worklog`. `TodayView` is now interactive: today's entries from the
  synced bucket, ticket picker, duration presets + free-text Jira-format input,
  date/time chips, note → submit writes to Jira then re-syncs. Touched-not-
  logged rail derived from in-progress tickets without a worklog today.
  Reminder card reads real settings.
- **Step 3 — skip/vacation days.** Per-day-column "Mark vacation / Restore day"
  affordance in `WeekView`, wired to the existing `weekOverride` store +
  `buildWeekState` (skipped days drop to 0h and the weekly target redistributes
  across remaining active days).

New helpers in `src/utils/date.ts`: `formatClock`, `parseDurationToSeconds`,
`formatHm24` (unit-tested). `vitest` 15/15 pass; `tsc` (renderer + electron) and
`npm run build` clean. Browser-preview verification used a mock Jira bridge
(renderer has no Electron preload), exercising fetch → render, log → sync →
entry, favorites, picker, and vacation redistribution with no console errors.

## v2 — extended prototype (sidebar, columns, comments, ring)
Second handoff bundle extended the Editorial design. TODAY / TICKETS / REPORTS
were unchanged; applied the four deltas:

- **Sidebar** (`src/components/Sidebar.tsx`, owns `AppView`) replaces the top
  nav: collapsible 218↔64px, "Sprintf" wordmark + blue "%d" mark (per user:
  adopt the prototype branding), nav icons, SETTINGS, COLLAPSE, and a clickable
  SYNCED status (triggers sync). `App.tsx` shell is now titlebar (no traffic
  lights) + horizontal sidebar/main; `sidebarCollapsed` state.
- **Ring diagram** — WEEK header uses an SVG progress ring (tracked/target %)
  + "{remaining}h left · tracked/target" + an ADD TIME button.
- **Columns view** — each WEEK day column: per-day "+" button, a multi-segment
  colored bar (one segment per ticket + empty remainder), entry rows with a
  per-ticket color dot + comment icon + hours + 2-line summary. Stable per-week
  color palette assigned by first appearance.
- **Comments view** — hover popover (`.wl-pop`) on entries that have a comment:
  shows ticket, summary, worklog time range (from synced worklogs), and the
  comment. Wired to real `syncResult.daySummaries[].worklogs`.
- **Add-time modal** (`src/components/AddTimeModal.tsx`) — opened by ADD TIME
  (today) and per-day "+" (prefills that day). Ticket picker, duration presets
  + free-text, started date/time, work description; ⌘⏎ saves / Esc cancels;
  submits via the existing `handleAddWorklog` (real Jira write → re-sync).

`tsc` (renderer + electron) clean; `vitest` 15/15; `npm run build` clean.
Preview-verified with a mock bridge at 1320×840: ring 45%, "22h left · 18h/40h",
segmented bars, comment popover (range + text), add-time modal save→close,
sidebar collapse to 64px — no console errors.

## v3 — light/dark theming
Third handoff bundle tokenized every colour and added a light theme + toggle.
All views were structurally unchanged (just `var(--token)` colours); applied:

- **Theme tokens** (`src/styles.css`) — the existing semantic CSS variables now
  have light overrides via `@media (prefers-color-scheme: light)
  :root:not(.theme-dark)` and an explicit `:root.theme-light`; `:root.theme-dark`
  forces dark over a light system. Added surface tokens (`--bg-raised/sunken/
  card/active/hover`, `--leader`) and replaced the remaining hardcoded dark
  literals with them. `color-scheme` flips per theme so native date/time inputs
  follow.
- **Theme toggle** — `Sidebar` gained a sun/moon item ("LIGHT MODE" / "DARK
  MODE") above COLLAPSE. `App` holds `theme: light|dark|null`, persisted to
  `localStorage['sprintf-theme']`; null = follow system via a `matchMedia`
  listener. `effectiveTheme` drives the label; an effect toggles the
  `theme-light`/`theme-dark` class on `<html>`.
- The accent blue/green/amber hold across themes (matching the design); the
  ticket text tokens (`--blue-soft` etc.) darken in light mode.

`tsc` (renderer + electron) clean; `vitest` 15/15; `npm run build` clean.
Preview-verified: toggle cycles dark↔light, persists, applies the right
`<html>` class, and themes WEEK / SETTINGS / add-time modal correctly — no
console errors.

## v4 — system fonts + warm sepia restyle
Fourth bundle was a pure restyle (no new structure/logic). Applied:

- **System fonts** — dropped the Google Fonts link from `index.html`; updated
  `--font-display` / `--font-sans` / `--font-mono` to the design's SF Pro /
  system-ui / SF Mono stacks. (The app no longer depends on remote fonts.)
- **Warm sepia palette** — re-valued every dark token to the warm browns
  (`--bg #191816`, raised/card/active/hover, warm borders, warm-tinted text)
  and updated the light tokens to the new cooler-gray values. Accent
  blue/green/amber and the `--tk-*` ticket colours are unchanged.
- **`--bg-sidebar`** — new token (dark `#131210` / light `#e7e9ee`); the
  sidebar now sits on a distinct surface from the page.
- **Settings → APPEARANCE card** — `SettingsView` gained a Theme card with
  LIGHT/DARK segmented chips (sun/moon), active per `effectiveTheme`, wired to
  `App.selectTheme` (persists to `localStorage`). The sidebar toggle remains;
  both paths share the same state.
- Window title → "Sprintf".

`tsc` (renderer + electron) clean; `vitest` 15/15; `npm run build` clean
(index.html shrank — no font links). Preview-verified: warm dark + system
fonts + distinct sidebar; APPEARANCE chips reflect and switch the theme
app-wide and persist; light + dark both correct — no console errors.

## v5b — header SYNC button (fix: missed in v4)
The WEEK header's **SYNC button** (before ADD TIME, refresh icon, secondary
style) was actually added back in the v4 design but was overlooked then because
that diff was dominated by colour-token changes. Added it:
- `WeekView` header now renders a `.sync-button` (RotateCw icon, spins while
  syncing) before `.add-time-button`, wired to `handleSync` via new
  `onSync`/`isSyncing` props. ADD TIME also got the design's white text + blue
  glow (`box-shadow 0 2px 14px rgba(79,124,255,.45)`).
- The sidebar `.sb-synced` is now a status `<div>` (not a button), matching the
  design — sync is triggered from the header. (Sync is WEEK-only, as designed.)
- Verified in preview: order is SYNC → ADD TIME → ‹ THIS WEEK ›; clicking SYNC
  fires `handleSync`. `tsc`/`vitest` 15/15/`build` clean.

## v5 — theme toggle consolidated to Settings (user request)
The v5 bundle's design file was byte-identical to v4. Two user asks:
- **Sync button** — confirmed present: the sidebar `.sb-synced` "SYNCED …" row
  is a button wired to `handleSync` (`title="Sync Jira worklogs"`, dot reflects
  synced/stale/syncing). The design has no separate sync button; the status
  indicator is the trigger.
- **Theme only in Settings** — removed the sidebar theme-toggle nav item (and
  its `effectiveTheme`/`onToggleTheme` props + `toggleTheme` in `App`). Theme is
  now changed solely via the Settings → APPEARANCE LIGHT/DARK chips
  (`selectTheme`, persisted). Sidebar bottom is now SETTINGS · COLLAPSE ·
  SYNCED. `tsc`/`vitest` 15/15/`build` clean; preview-verified no theme item in
  the sidebar, sync present, theme still switches from Settings — no console
  errors.

## Pending / follow-ups
- Live end-to-end test against a real Jira Cloud site (preview can only mock the
  bridge; the Electron path is typechecked but unrun here).
- Optional: a ⌘K command palette for the ticket picker / search.
- Optional: persist the sidebar collapsed state (currently in-memory; theme is
  already persisted).
- Optional: theme the JS-driven WEEK ticket palette (segment dots/text) per
  theme — currently fixed vivid colours that read on both backgrounds.
