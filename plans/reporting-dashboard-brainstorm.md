# Reporting & Dashboard Brainstorm

> Ideation only (no implementation). Captured 2026-06-29 from a multi-lens brainstorm
> (5 ideation lenses → skeptic critique → art direction). Grounded in the actual data
> model and the current Reports view.

## Goal

Move TimeBro reporting from **"one week, pass/fail vs target"** to **"trend + self-vs-self
+ composition + behavioral shape"**. Surface metrics and patterns a *solo developer* finds
genuinely valuable, without vanity metrics, perverse incentives, or surveillance creep.

**North star:** *Time is a substance with a shape.* Every view answers either "how much"
(magnitude) or "what shape" (sequence / fragmentation). The second question is the one no
other tool answers — bias the design toward shape-revealing forms over yet another total.

## Data we can build on (no new tracking required)

- **Jira worklogs**: `issueKey`, `issueSummary`, `issueType` (subtask/hierarchy), `epic`,
  `started` (ISO), `timeSpentSeconds`, `comment`. Project derivable from key prefix.
- **Personal notes**: `title`, `text`, `timeSpentSeconds`, `startedISO` — the reactive/ad-hoc bucket.
- **Recurring events** (meetings/rituals): `title`, `daysOfWeek`, `durationMinutes`, confirmed|skipped per day.
- **Bitbucket review sessions**: repo, PR, `reviewStateLabel`, `commentCount`, `confidence`,
  `events[]` (timestamps), `isPullRequestAuthor` (own-PR coordination), `estimatedSeconds`.
- **Bitbucket commit groups**: repo, `branch`, `commitCount`, first/last commit ISO, `estimatedSeconds`, `confidence`.
- **Reconstruct timeline**: per-hour (00..23) placement of signals + `durationMinutes` — i.e. **when** work happened.
- **Aggregates already computed**: `WeekState` (tracked split into jira/personal/recurring),
  `MonthState` (trackedHours, targetHours, gapCount, weeksOnTarget, averageFullWeekHours, `weeks[]`),
  `DayTrackingSummary` (target/tracked/missing, issues, notes, recurring).

**We do NOT have** (don't propose metrics needing these): per-file/per-language tracking,
app/window focus, idle detection, keystroke or diff-line counts. Coding/review time is a
**heuristic estimate** from commit timestamps, carrying confidence scores.

## Current Reports view (baseline)

Weekly `ProgressRing` (target %), 4 KPIs (Daily Average, Days On Target, Tickets Touched,
Billable %), a CSS "Hours per day" bar chart, a "By ticket" breakdown with meter bars.
Week-scoped, prev/next nav. No charting library — hand-rolled CSS/SVG, Lucide icons. React + IndexedDB.

## The ~10 real builds (after merging 41 raw concepts)

### Tier 1 — extend Reports (ship first, near-zero risk, highest value/effort)

1. **Delta KPI chips** — append signed `+0.9h` / `−6pts` deltas (vs last week) to the existing
   4 KPIs. Pure arithmetic on two `WeekState`s, no new layout. *Ship first.*
2. **Week-over-week trend line** — multi-week sparkline of `trackedWeekHours` vs target from
   `MonthState.weeks[]`. Answers direction (up / down / oscillating), which the single-week ring can't.
3. **Composition stacked-area over weeks** — jira / review / meetings / notes per week, stacked
   across 8–12 weeks. 100%-normalized mode exposes **role drift** (review or meetings eating maker time).
4. **Signal confidence coverage** — high/med/low share of estimated hours per week. The honesty
   guardrail for every estimate-based chart; low-confidence items double as a Reconstruct worklist.

### Tier 2 — comparison / overlay (the explicit ask: compare days/weeks, overlay periods)

5. **Period-over-period ghost overlay** (merges last-week, typical-week, 4-week-band) — one
   ghost/eye toggle on the Hours-per-day chart. This week's solid bars inside a dashed ghost
   outline of a typical week; a cumulative **pace** line races you vs your typical self toward
   the weekly target. Baseline = rolling 4-week "normal-for-you" band, not just the fixed target (kinder).
6. **Day-of-week fingerprint** (merges single-week + quarter-averaged) — this Monday vs your
   *typical* Monday. Separates a real anomaly from "Monday is always like this".

### Tier 3 — new "Patterns" / "Rhythm" nav item (the novel behavioral layer)

7. **Hour-of-day × weekday punchcard** — circles sized by accumulated minutes, colored by kind,
   from Reconstruct hour data. The most behaviorally revealing view; "my maker mass is 9–11 and
   I keep booking meetings then". A working-hours band makes off-hours work leak past the edges.
8. **Year-in-pixels heatmap** — GitHub-style day grid, quantized fill by hours-vs-target. Macro
   consistency as texture (Friday dropoffs, under-logged stretches). The most motivating quantified-self artifact.
9. **Day rhythm ribbon** — one ribbon per day; solid runs = focus, speckle = fragmentation,
   hatched = untracked (not idle). The descriptive home for ALL fragmentation ideas (no synthetic score).
   Click a segment → jump to that day in Reconstruct.
10. **This-week-in-review digest** — 3–4 plain sentences + a week-archetype pill ("Review Crunch",
    "Maker Week" — no archetype is "bad") + a surprising-fact callout ("review was 31% of your week").
    Reframes accounting into reflection. Pure templated strings (optional Ollama polish).

## Metrics most unique to a developer (the "aha" signals)

- **Review-to-Build ratio** (merge of #1/#34) — review-of-others vs own coding vs own-PR
  coordination, trended. Detects the senior drift from maker → full-time reviewer. No IDE shows this.
- **Ceremony load** — % of week in rituals + per-ritual breakdown + scheduled-vs-attended. Calendar ammunition.
- **Planned vs reactive split** — Jira+recurring vs personal-notes. Rising reactive % = early scope-erosion/burnout signal.
- **Ticket aging** — the same ticket quietly drawing 3h/week for 6 weeks = an unscoped 18h sinkhole.
- **Recurring skip-rate** — a ritual you skip 70% of the time is a kill/async candidate.

## Design language (frontend-design)

Reads like an **instrument panel for one person**, not a stakeholder dashboard.

**Fixed activity colors by meaning** (never recycled):
- Coding (own build) = **blue** `#2a78d6` / dark `#3987e5`
- Code review (others' PRs) = **violet** `#4a3aa7` / dark `#9085e9`
- Own-PR coordination = violet, demoted (lower opacity) — never inflates the review story
- Meetings / recurring = **amber** `#eda100` / dark `#c98500`
- Personal notes (reactive) = **teal** `#1baf7a` / dark `#199e70`
- **Gap / untracked = NOT a hue** — negative space, rendered as hatch or hollow outline.
- **Confidence = texture/opacity, not a new hue** — a low-confidence coding block is hatched blue, not gray.

Two font weights (400/500); one serif hero figure per screen; hairline 0.5px borders; tabular
lining numerals on every figure that animates/compares; observational copy ("review was 31% of
your week"), never evaluative. Motion only on scrub/toggle/hover — no idle animation.

Three art directions explored: **Instrument** (extended Reports, strips in one column),
**Cartograph** (new Patterns: punchcard + ribbon + year-in-pixels), **Overlay** (ghost compare
mode on the existing bar chart). Interactive mockups of Cartograph and Overlay were produced in
the originating session.

### Anti-slop rules

- Gaps are never a colored category or pie slice — hatch/negative space only.
- No donut/pie charts. Part-to-whole = horizontal 100% stacked bar or meter.
- Two font weights only (no 600/700). No shadows/gradients/glow/glassmorphism.
- Color follows the entity, never its rank — filtering/sorting never repaints a segment.
- Delta green/coral ONLY where direction is genuinely good/bad (target progress). Neutral metrics
  (tickets touched, switch count) get an ink arrow — coloring them implies a judgment the tool shouldn't make.
- No bar where a stat tile fits; no stat tile where the *shape* is the story.

## Traps to avoid (skeptic verdicts)

- **Vanity metrics** — synthetic "context-switch / fragmentation index" (show raw distinct counts
  instead), Gini coefficient (use top-3 epic share), on-target **streaks** (gamify hours-logging,
  punish healthy light weeks — cut; keep only non-gameable records like best focus day),
  per-ticket estimation-drift % (divides one heuristic by another — fold into confidence coverage).
- **Surveillance creep** — after-hours/weekend, nudges, anomaly callouts must be observational,
  rate-limited (≤1/week), dismissible, default-off. Supportive colleague, not manager dashboard.
- **Data honesty** — anything from commit-timestamp heuristics is "your logged shape", never
  "measured focus / deep work". The confidence meter governs trust in everything else.

## Data gaps (what we'd need to add to unlock more, honestly)

- **True focus/deep-work**: needs an optional idle/active-window signal. Until then label "logged shape", not "focus".
- **Calendar ground truth**: a read-only calendar sync (accepted/declined/actual) turns ceremony scheduled-vs-attended from inference into fact.
- **Reactive completeness**: a one-tap "interruption" quick-log so reactive % isn't undercounted.
- **Effort vs hours**: Jira workflow state transitions would let ticket-aging separate "progressing" from "stalled".
- **History retention**: trend views assume many stored `WeekState`s — confirm/backfill weekly snapshots.

## Placement recommendation

- **Tier 1 + Tier 2** extend the existing **Reports** view (trend, composition, delta chips, overlay toggle).
- **Tier 3** becomes a new **"Patterns" / "Rhythm"** nav item below Reports — different scope
  (week/month/quarter) and a different question ("when & what shape", not "how much this week").

## Decision (2026-06-29) — build the Reports increment

Decided scope (implementation deferred): **one cohesive increment in the existing Reports view**
— delta KPI chips + week-over-week trend line + composition over weeks. Patterns view is a later
v2; standalone review-to-build and wellbeing/after-hours nudges are out for now.

### Grounded data facts (verified against the code)

- Composition reuses the product's **existing** 3-category model, not the brainstorm's invented
  coding/review/meetings/notes: `dayActivitySeconds(day)` in `src/domain/activity.ts` →
  `ticket` (Jira worklogs) / `meeting` (recurring) / `fire` (personal notes = firefighting),
  with color tokens `--ring-ticket` / `--ring-meeting` / `--ring-fire`. This is the same
  vocabulary as the day ring, so the strip is a multi-week extension of an established language.
- `buildMonthState(anchor, today, settings, weekStates: WeekState[])` already consumes an array
  of `WeekState`s (the Month view builds them) — reuse that machinery to feed Reports the history.
- `AppReportsRoute` currently passes only a single `weekState`. The increment must thread in a
  trailing `weekStates: WeekState[]` (~10 incl. current) and `prevWeekState`.
- **review-to-build is NOT in logged data** — a logged review becomes a Jira worklog (= `ticket`).
  The review/build split exists only in heuristic Bitbucket `estimatedSeconds`/`confidence`,
  stored per week in IndexedDB (`bitbucketReviewResults`). That's why it's deferred, not built now.

### Build-now spec (all in `src/components/ReportsView.tsx`)

1. **Delta KPI chips** — signed delta vs `prevWeekState` on the existing 4 KPIs.
   - Daily average: `w.trackedWeekHours / w.activeWorkingDates.length`
   - Billable %: `w.jiraTrackedWeekHours / w.trackedWeekHours * 100`
   - Tickets touched: `new Set(w.days.flatMap(d => d.issues.map(i => i.key))).size`
   - Days on target: `w.days.filter(d => d.isConfiguredWorkingDay && !d.isSkipped && d.trackedHours >= d.targetHours).length`
   - Delta color coral/teal only where direction is meaningful (billable, days-on-target);
     tickets/avg get a neutral ink arrow.
2. **Week-over-week trend** — `weekStates.map(w => ({ key: w.weekKey, y: w.trackedWeekHours, target: w.weeklyTargetHours }))`
   → SVG polyline + dashed target line; points colored on/under target.
3. **Composition over weeks** — per week `sumActivitySeconds(w.days.map(dayActivitySeconds))` →
   `{ticket, meeting, fire}` hours → stacked bars (absolute + 100% toggle), reusing
   `ACTIVITY_CATEGORIES` and `--ring-*` tokens.

### Wiring

- Thread `weekStates` + `prevWeekState` through `AppReportsRoute` → `ReportsView`, sourced from the
  same build that feeds Month view (reuse results, don't re-query IndexedDB).
- New multi-week aggregation in `src/domain/reportsTrend.ts`; new SVG/CSS in `src/styles/reports.css`.
- Empty/early state: with <3–4 weeks of history show a "building baseline" placeholder; the current
  week still renders its real composition.

### Deferred / dropped

- **Patterns view** (punchcard / ribbon): needs persisted per-day reconstruct hour data beyond the
  current ~14-day window — revisit as v2.
- **Year-in-pixels**: partly duplicates the Month grid's daily fill — dropped.
- **Review-to-build trend**: heaviest plumbing, most heuristic, vanity risk — composition strip
  already surfaces meeting/firefighting creep honestly. Dropped for now.
- **Wellbeing / after-hours nudges**: surveillance-creep risk on a personal logging tool — out.

Mockups produced this session (design references): "Cartograph" (Patterns), "Overlay" (compare
mode), "Instrument" (extended Reports strips).
