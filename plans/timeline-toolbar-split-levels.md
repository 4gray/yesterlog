# Timeline Toolbar Redesign — "Split Levels" (V3)

## Goal

Split the single-row week toolbar into two levels, per the `design_handoff_toolbar_v3` handoff:

1. **Level 1 — actions row**: week identity (ring + hours) left; command bar (⌘K), icon-only sync, Add Time right.
2. **Level 2 — view strip**: week nav + period label + Today, sync status, Summary/Timeline segmented control.

Rationale from the handoff: view controls sit next to what they control; the header keeps a single accent (Add Time); sync is demoted to a quiet icon.

## Status

**Implemented, reviewed, and verified** (2026-07-17). `npm run test` 711 pass, `tsc --noEmit` clean,
`npm run build` passes, rendered-app verified in both themes at 1620 / 1500 / 1400 / 1100 / 375 px.

Pre-existing, unrelated: `src/storage/db.test.ts` fails to collect — `Cannot find package 'fake-indexeddb/auto'`
in this worktree. Confirmed failing on a clean tree (stash test); not touched by this change.

All three open questions decided by the user on 2026-07-17:

1. **Colours → tokens.** Structure stays pixel-exact; only colour hexes map to tokens. Light theme preserved.
2. **⌘K → command palette.** Retrospective add-time rebinds to ⌘⇧K and also becomes a palette command.
3. **Offline → 4 states.** Add `offline` via `navigator.onLine`; keep `stale` as never-synced.

## Decisions (resolved)

### 1. Colour palette: handoff hexes vs app tokens

The handoff hardcodes a **cool-grey** palette (`#0e0f13` panel, `#0c0d11` strip, `#23262e` border, `#67707e` muted, `#3d7bfd` accent) and calls colours "final / pixel-perfect".

The app is **fully tokenised** (`src/styles/base.css:1-60`) in a **warm sepia dark** palette (`--bg: #191816`, `--muted: #9d9b95`, `--blue: #4f7cff`) **and ships a real light theme** — both by system preference (`base.css:63`) and explicit toggle (`:root.theme-light`, `base.css:91`), stamped by `src/app/useThemeMode.ts`.

Hardcoding the handoff hexes would (a) leave the toolbar dark while the rest of the app goes light, and (b) make the toolbar cool-grey inside a warm-sepia app. AGENTS.md says "Use existing design tokens and component patterns".

**Recommendation:** keep every *structural* spec pixel-exact (sizes, spacing, radii, weights, letter-spacing, layout) and map only the **colours** onto existing tokens. Deviation is colour-family only; the redesign's actual point (two-level split) is unaffected.

Token mapping if approved:

| Handoff | Token |
|---|---|
| `#0e0f13` panel | `var(--bg)` |
| `#0c0d11` strip | `var(--bg-sunken)` |
| `#12141a` command bar | `var(--bg-raised)` |
| `#23262e` border | `var(--border)` |
| `#1c1f27` divider | `var(--line)` |
| `#2a2f3a` segmented border | `var(--border)` |
| `#f5f3f0` strong | `var(--text-bright)` |
| `#e9e7e3` default | `var(--text)` |
| `#9aa1ad` icons | `var(--text-strong)` |
| `#67707e` muted | `var(--dim)` |
| `#4d545f` faint | `var(--faint)` |
| `#3d7bfd` / `#5089ff` accent | `var(--blue)` + existing `filter: brightness(1.08)` hover |
| `#5d8bff` Today | `var(--blue-soft)` |
| `#55c78f` / `#e8a13f` / `#e05d5d` | `var(--green)` / `var(--amber)` / new `--red` |
| `#1a1d25` / `#141824` hover | `var(--bg-hover)` / `var(--bg-active)` |
| `#262c38` segmented active | `var(--bg-active)` |

Note: there is **no `--red` token** — status red must be added to both theme blocks.

### 2. ⌘K is already bound

`src/app/useAddTimeModalActions.ts:95-107` binds Cmd/Ctrl+K globally to `openTrackingShortcut()` — jump to current week + open AddTimeModal in retrospective mode. It calls `preventDefault()` **before** its own guard, so it swallows ⌘K unconditionally.

**Recommendation:** command palette takes ⌘K (the handoff renders a `⌘K` chip); rebind the retrospective add-time to **⌘⇧K** and *also* expose it as a palette command — the palette subsumes it as a discovery surface.

### 3. `offline` state does not exist

App has `AppSyncState = "synced" | "stale" | "syncing"` (`src/app/useSyncControls.ts:6`). The handoff wants `synced | syncing | offline`. There is **no connectivity detection anywhere** — zero `navigator.onLine` hits in production code. `isConfigured` is credential config, not connectivity (`useAppConnectionState.ts`).

**Recommendation:** add `offline` via a small `navigator.onLine` + `online`/`offline` listener hook, and keep `stale`. Four states:

| State | Dot | Label |
|---|---|---|
| `synced` | green | `SYNCED 2M AGO` |
| `syncing` | amber | `SYNCING…` |
| `stale` | dim | `NOT SYNCED` |
| `offline` | red | `OFFLINE` |

Caveat: `AppSyncState` is imported properly only by `AppShellFrame.tsx`; `AppMainView.tsx:119`, `AppReconRoute.tsx:31`, `Sidebar.tsx:43`, `ReconstructView.tsx:67` hardcode the union literal — each needs editing when the union grows.

## Components reused (extended, not duplicated)

There is **no UI primitive layer** — no `Button`, `Tooltip`, `SegmentedControl`, or `Kbd` component exists anywhere. 156 raw `<button>` elements, zero `<Button>`. Tooltips are `title=""` attributes only. "Reuse existing components" therefore means reusing the four real reusable components plus CSS class conventions.

| Component | Reuse |
|---|---|
| `ProgressRing.tsx` | Reuse at `size={52} radius={22} stroke={4}`. **Needs a `className` prop** — `.ring` hardcodes `width/height: 78px` (`week.css:18-23`), so the size props alone won't resize the box. |
| `WeekNavigator.tsx` | **Extend** with optional `rangeLabel` / `showToday` / `onToday` props. Defaults preserve today's behaviour so the **6 other call sites** (Reports ×4, Review, WeekHeader) are untouched. |
| `.week-view-switch` | **Extend** the existing segmented-control CSS (`week.css:1303-1344`) — already 28px, mono, `is-active`, `:focus-visible`. Only padding/font-size/letter-spacing shift to the handoff's 0 12px / 10px / .12em. |
| `TimeSplit.tsx` | Unchanged; stays in the identity block. |
| `formatRelativeTime` (`activeWork.ts:62`) | **Reuse for "2M AGO"** — already produces `12m ago` / `3d ago`, takes an injectable `now`, returns `just now` under 45s. |
| `useLiveDate.ts` | Reuse as the clock for the relative label. Use a **separate instance** at ~15s (`useLiveDate(undefined, 15_000)`); its docblock warns that speeding up the shared tick rebuilds derived week state. |
| `useWeekViewMode.ts` | **Already exactly right** — `'summary' \| 'timeline'`, localStorage `timebro-week-view-mode`. No change needed. |
| `AppOverlays.tsx` | Mount the command palette here alongside the existing dialogs. |
| Icons | lucide-react: `Search`, `RefreshCw`, `Plus`, `ChevronLeft`, `ChevronRight`, `Loader2`. |

## Files touched

**New**
- `src/components/WeekViewStrip.tsx` — level 2 (nav + Today + sync status + segmented control)
- `src/components/WeekViewStrip.test.tsx`
- `src/components/CommandBar.tsx` — level 1 ⌘K trigger (button, not an input)
- `src/components/CommandPalette.tsx` — stub overlay; commands listed, TODOs for NL parsing
- `src/components/CommandPalette.test.tsx`
- `src/app/useCommandPalette.ts` — `commandPaletteOpen` + ⌘K/Esc
- `src/app/useCommandPalette.test.tsx`
- `src/app/useOnlineStatus.ts` (+ test) — `navigator.onLine` + listeners

**Modified**
- `src/components/WeekHeader.tsx` — becomes the actions row: identity + CommandBar + icon-only sync + Add Time. Loses the segmented control, `.week-divider`, and `WeekNavigator`.
- `src/components/WeekHeader.test.tsx` — existing tests assert `.sync-button` text, `THIS WEEK`, and the switch; they will need rewriting.
- `src/components/WeekView.tsx` — render `WeekHeader` → `WeekViewStrip` → grid; pass `viewMode` (owned here at `:586`) to the strip instead of the header.
- `src/components/WeekNavigator.tsx` — additive optional props.
- `src/components/ProgressRing.tsx` — add `className`.
- `src/app/useSyncControls.ts` — add `offline`; relative label.
- `src/app/appHelpers.ts` — relative sync formatter taking a `now`.
- `src/app/useAddTimeModalActions.ts` — rebind ⌘K → ⌘⇧K.
- `src/app/AppOverlays.tsx` + `src/App.tsx` — mount + wire the palette.
- `src/app/AppMainView.tsx`, `AppReconRoute.tsx`, `Sidebar.tsx`, `ReconstructView.tsx` — widen the hardcoded sync-state union.
- `src/styles/week.css` — two-level toolbar CSS.
- `src/styles/base.css` — add `--red` (both themes).
- `src/styles/responsive.css` — 4 toolbar breakpoints assume a one-row header (`:14`, `:19`, `:86`, `:265`) and one hides segmented-control labels at ≤1260px (`:3-11`) — that rule relies on icons the handoff removes.

## Decisions taken during implementation

- **`viewMode` was lifted to `App.tsx`, not left in `WeekView`.** The plan assumed the strip could read it
  in place, but the README requires "Switch to Summary/Timeline" as a *palette* command, and the palette is
  global. `useWeekViewMode` now lives in `App.tsx` and threads
  `App → AppMainView → AppWeekRoute → WeekView → WeekViewStrip`. Same localStorage key, same behaviour.
- **No new clock instance.** The plan called for a second `useLiveDate(undefined, 15_000)`. Unnecessary:
  `currentDate` already ticks at 60s via `useDemoScenario` → `useLiveDate` and is frozen in demo, and a
  relative label only changes on minute boundaries anyway. The strip takes `now` from `WeekView`.
- **`formatRelativeSyncTime` clamps future timestamps.** Caught in the rendered app: seeded demo data stamps
  `syncedAt` ahead of `now`, and `formatRelativeTime` signs the duration, so the strip read `SYNCED IN 38M`.
  Anything not in the past now collapses to "just now". Guards real clock skew too.
- **The identity block diverges from `--figure-standard` (48px), scoped to `.week-header`.** The handoff
  re-scales it (ring 78→52, figure 48→30, mono not display). Month/Review/Reports keep the shared header
  scale, so Week's toolbar is now visibly more compact than its sibling views. Intentional per the handoff,
  but it is a real cross-view inconsistency worth a second look.
- **`AppSyncState` replaced the hardcoded union in all 4 files** rather than widening each literal.
  Fixed a latent bug on the way: `Sidebar.tsx` rendered its dot via a ternary that fell through to the
  green "synced" style for any unknown state, so `offline` would have shown green.
- **`responsive.css` mobile block was rewritten, not just tweaked.** It was written for the old toolbar
  (`.sync-button` flex 1 1 132px sized a *text* button; `.week-view-switch`/`.week-nav` lived in
  `.week-actions`). Left alone it starved the command bar to 42px with its icon and placeholder at 0 width.
  `.week-nav`/`.pill` rules stay for Reports/Review; `.week-nav.is-strip` opts out.

## Review findings fixed (adversarial pass, 2026-07-17)

A multi-agent review raised 32 findings; 14 survived independent refutation. All fixed:

| # | Issue | Fix |
|---|---|---|
| 1 | **`.sync-button` restyled to a 38×38 square broke ReviewView**, which renders it *with a `SYNC` label*: the icon collapsed to 0px and the text overflowed at every width >700px. | Base `.sync-button` restored to the labelled variant; icon-only rules scoped to `.week-actions .sync-button`. |
| 2 | **`.week-divider` rule deleted** while `MonthView.tsx:71` and `ReviewView.tsx:516` still render it → hairline silently vanished from both headers. | Rule restored in `week.css` (+ its ≤700px `display: none`). |
| 3 | **Sidebar's offline dot rendered green** — `Sidebar` emitted `sb-dot is-offline` but no such rule existed, so it fell back to the base green "healthy" dot. | Added `.sb-dot.is-offline` to `shell.css`. |
| 4 | **`offline` pre-empted `stale`**, so a never-synced offline user broke `ReconstructView`'s `syncState === "stale"` branches (told them "all signals placed"). | `resolveSyncState` now returns `stale` before `offline`; `offline` means "has data, can't refresh". |
| 5 | **⌘K stacked the palette on top of AddTimeModal**, and one Esc closed both — losing an in-progress entry. | Palette disabled while any time-entry modal is open. |
| 6 | **`WeekView.tsx:442` day CTA still advertised `⌘K`** for the add-time flow after the rebind, hardcoded to the Mac glyph. | Now `formatShortcut("K", { shift: true })`. |
| 7 | **`formatShortcut("⇧K")` rendered `Ctrl+⇧K` on Windows/Linux** — a Mac glyph beside a spelled-out Ctrl. | Reworked to `formatShortcut(key, { shift })` → `⌘⇧K` / `Ctrl+Shift+K`; `platform.test.ts` added. |
| 8 | **Palette week-nav silently blanked** when run from Today/Reports — it moved offscreen state. | Those commands now switch to the week view first. |
| 9 | **Esc stopped closing the palette** once focus left the input (handler was on the overlay div). | Moved to a window listener, matching `ReleaseNotesDialog`. |
| 10 | **No `aria-activedescendant`** — arrow navigation was silent to screen readers. | Input is now a proper `combobox` with `aria-controls` / `aria-activedescendant`; options carry ids. |

Notable refutations (deliberately **not** changed): the `SYNC_DOT_STATE` triplication (the third targets a
different element, `.sb-dot`, and maps `synced → ""`); the "two sources of truth" sync label (they are two
*different* labels — absolute for the sidebar, relative for the strip); `.command-bar`'s border-only focus
style (it is field-shaped, not button-shaped).

## Notes / smaller decisions

- **Segmented control loses its icons.** The handoff is text-only (`SUMMARY` / `TIMELINE`). The ≤1260px breakpoint currently collapses to icon-only; with no icons that rule must change to keep text.
- **Sync status appears twice.** `Sidebar.tsx:122` already renders a sync label globally. The handoff adds a second in the strip as "a second entry point for force-sync". Intentional per the handoff; flagged as duplication.
- **Period label never says "THIS WEEK"** — handoff is explicit. Today's `WeekNavigator` pill always says it. Hence the `rangeLabel` prop.
- **Command bar is a trigger, not an input** — render a `<button>`, not `<input>`, per the handoff.
- `visibleWeekStart` lives at `useAppCalendarState.ts:19` (not `useWeekState.ts`, which is derive-only); nav actions in `useAppNavigation.ts`.

## Verification

- `npm run test` (AGENTS.md requires it for rendering/behaviour changes)
- `npm run lint` (`tsc --noEmit`)
- Rendered-app check in **both themes** and at the 4 toolbar breakpoints — clipping, overflow, console errors.
- Preview: `?demo=1&view=week&seed=release`.
