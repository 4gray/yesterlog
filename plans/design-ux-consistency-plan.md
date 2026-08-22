# Design & UX Consistency Plan

Audit date: 2026-08-22, against `main` @ v3.2.0 (`bcb7d1a`).
Goal: make the app consistent, less marketing-toned, and simpler — without changing what any screen does.

Full audit context: all 10 views + welcome + Add Time modal + command palette were reviewed
visually (demo mode, dark + light) and the styling/component layer was mapped in code.

## Direction

Yesterlog currently wears two outfits: a terminal-utility skin (mono caps, dense stats)
and a marketing-dashboard skin (hero numbers, insight banners, promo copy). The plan
commits fully to the **utility identity** and builds the missing component system under it.

Keep (identity, do not regress):

- Warm sepia dark palette (`src/styles/base.css`), mono-caps eyebrow language on calendar views.
- Information design: Week day columns, Reconstruct drag-to-place, Add Time day-map, command palette.
- lucide-react as the only icon source; demo/screenshot pipeline as audit harness.

## Phase 1 — Token foundation (cheap, unblocks everything)

Problems:

- No spacing/radius/shadow/focus tokens. 24 distinct border-radius values (accidental
  5–11px cluster), ~45 unique box-shadows (4 near-identical modal elevations), 2 focus-ring recipes.
- 126 one-off hex literals in CSS outside `base.css` (58 in `notes-workspace.css`),
  many literal copies of existing tokens; 33 hex literals in TSX.
- Two different hand-rolled 6-color ticket palettes (`WeekView.tsx:160`,
  `NotesWorkspace.tsx:180`) + `ActiveWorkDock.tsx:209` — all theme-blind (identical in light mode).

Work:

1. Add to `base.css`: radius scale (`--radius-xs/sm/md/lg/xl/pill`), elevation scale
   (`--shadow-card/raised/modal`), `--focus-ring`, spacing scale (`--space-1..8`, adopted
   incrementally — new/edited rules only, no mass padding rewrite).
2. Normalize the radius cluster: 2–4→xs(4), 5–7→sm(6), 8–9→md(8), 10–12→lg(12), 13–16→xl(16), 999/pill→pill.
3. Collapse duplicate modal/panel shadows onto `--shadow-modal`, focus rings onto `--focus-ring`.
4. Replace token-copy hexes in CSS with `var(--…)` (`#4f7cff`, `#e0a44a`, `#edc488`,
   `#bda6f5`, `#6bd0c2`, `#9d9b95`, `#cfccc6`, `#f5f3f0`, `#e9e7e3`, `#3b63d6`, `#9a6a16`, bare `#fff`…).
5. One theme-aware ticket palette: `--ticket-1..6` (+ `-text` pairs) in `base.css` with light
   overrides; `WeekView`, `NotesWorkspace`, `ActiveWorkDock` consume `var()` strings instead of hex.
6. Promote recurring near-token hexes (`#ff8b84`, `#e8917e`, `#d65a52`, `#7c9dff`, `#101218`)
   into tokens or replace with existing ones.

Acceptance: zero visual regressions intended except deliberate radius normalization;
light + dark screenshots of all 10 views compared; `npm test` green; hex count outside
`base.css` reduced to charting/one-off legitimate cases only.

## Phase 2 — Primitives

- `Button` (primary / secondary / ghost / icon; replaces 26 button classes, 4 bespoke icon buttons).
- `Modal` (portal, focus trap, single Escape handler — currently duplicated 5×; folds in
  QuickLogSheet overlay, Recap scrims, Notes modal backdrop).
- `EmptyState` (icon + title + hint + optional CTA; replaces 24 ad-hoc classes).
- `Tooltip` (replaces 92 native `title=""`).
- `Card` (folds `.recap-card`, `.welcome-card`, `.ai-card`, `.dock-card`, `.reminder-card`).
- Standardize lucide size/stroke: 16px / 1.75 default, 12–14px in dense rows; kill the
  inline duplicate alert/info SVG paths in Reports files.

Migrate view-by-view; no big-bang rewrite.

## Phase 3 — One-voice copy pass

Register: functional, sentence case, neutral American English, `…` everywhere, contractions allowed.

- Rewrite Welcome promo copy (`WelcomeView.tsx:92-146`): drop "Hey there", "faff",
  "Pop in your details…", "ready to watch your hours".
- Recap: replace "Turn a stretch of real work into review-ready highlights" and
  "Your promotion material remains ready" (`RecapView.tsx:228,263`) with plain statements.
- Delete the Reports self-restating banners ("16% of your week was invisible work.",
  "the shape of the hours, not the sum") — the header number already says it.
- Fix "LOGGED OF 8h" (Today) and "+100%vslast" spacing (Trends).
- Unify ALL-CAPS CTAs vs sentence-case buttons (pick per component tier, apply everywhere).

## Phase 4 — Header simplification

- Hero-number headers only on Today / Week / Month (the number is the answer there).
- Tickets, Review, Reports subtabs, Recon: compact one-line header (~120px reclaimed each).
- Keep eyebrow + period navigation; drop restated qualifiers.

## Phase 5 — Structure & details

- Notes back into standard chrome (regular sidebar + view header; it currently has
  icon-rail + centered titlebar — the largest structural outlier). `NotesWorkspace.tsx` (2757 lines)
  wants splitting anyway.
- Reports subnav out of the sidebar nav list into in-view tabs (only two-level nav today).
- Settings: all 8 sections same save model (currently 4 saveable / 4 instant).
- Fix Active Work card truncation ("IN PROGRE…", clipped project names) and Today timeline
  overlaps (cards over hour labels, now-line striking through events).
- Real skeleton loading state (replace literal `LOADING…` in `LoadingView.tsx`).
- Add ⌘1–⌘9 view shortcuts; surface theme toggle in command palette.
- Review nav-side-effects: silent week reset on today/tickets/recon (`useAppNavigation.ts:70-79`),
  review→week force-redirect (`:27-31`).

## Phase 6 — Theme reconciliation

- Derive light mode from the same warm hue family as dark (today: warm sepia dark vs cool
  grey light = two different products).
- Decide deliberately: dark sidebar in light mode — keep (make it look intentional) or drop.
- De-duplicate the double light-override blocks (`base.css`, `rings.css`, `week.css`) —
  single `.theme-light`-scoped block + a tiny script/lint to enforce, or generate one from the other.
- Tokenize `week.css` light badge overrides (18 raw hexes for 3 badge variants).

## Status

- [x] Audit complete (2026-08-22)
- [x] Phase 1 — token foundation (2026-08-22). Done: radius/spacing/elevation/focus tokens;
  335 border-radius declarations normalized onto 7 tokens; modal/raised/card shadows and
  focus rings tokenized; `--red-soft/--red-strong/--on-accent` introduced; token-copy hexes
  swapped for `var()` (68 → 27 outside base/notes); one theme-aware `--ticket-1..6` palette
  replacing the WeekView/activeWork duplicates (fixes pale ticket text + wrong fire color in
  light mode). Deliberately left: `notes-workspace.css` colors (fixed-graphite by design →
  Phase 5), `week.css` light badge hexes (→ Phase 6), a handful of contextual one-offs
  (`today.css #c7a663/#7a818d`, `review.css` on-accent darks, `week.css #2a3550`).
  Verified: tsc clean, 918/918 tests, dark+light screenshots (Week/Month/Modal/Recap).
- [~] Phase 2 — primitives (started 2026-08-22). Done: `Modal` (Escape + backdrop close,
  Tab focus trap, focus restore; window-level keys; renders in place since .modal-overlay is
  fixed) adopted by AddTimeModal, TicketDetailsDialog, ReleaseNotesDialog, CommandPalette,
  ReviewDialogFrame — Escape now works on the two dialogs that lacked it, and Escape in the
  ticket-picker search no longer dismisses the whole modal; `Button`
  (primary/secondary/ghost/icon, type="button" default) adopted at all 19 primary/secondary
  <button> call sites (anchors styled as .secondary-button stay anchors); `EmptyState`
  adopted in ReviewView (4 states) and ReportsSummary; button styles moved from settings.css
  to new `styles/primitives.css`; QuickLogSheet folded onto Modal (its overlay/scrim CSS
  deleted). Decision: no generic `Card` primitive — the five *-card classes are distinct
  components (dock card is draggable, welcome card is a landing tile), folding them would be
  artificial. Also done: `Tooltip` primitive (display:contents host + fixed-position bubble,
  escapes overflow clipping) adopted on the collapsed sidebar rail (nav/settings/collapse,
  replacing their native titles); rec-icon-btn/recap-icon-btn retagged to Button
  variant="icon" (local CSS still wins on size — trim overrides when touching those views);
  Reconstruct rail empties on EmptyState (rail CSS repointed at shared inner classes).
  Decision: Recap source drawer + brag scrim are drawer/click-away patterns, not modals —
  they stay off Modal; Notes scrims wait for Phase 5. Remaining: broader Tooltip adoption
  (~85 native title="" left, migrate as views are touched), bespoke view-local button
  classes, remaining *-empty classes (many are inline placeholders where the centered
  EmptyState would be wrong — migrate judiciously).
- [ ] Phase 3 — copy pass
- [ ] Phase 4 — header simplification
- [ ] Phase 5 — structure & details
- [ ] Phase 6 — theme reconciliation
