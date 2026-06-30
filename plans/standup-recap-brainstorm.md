# Standup recap ("what did I do yesterday") — brainstorm & recommendation

_Brainstorm 2026-06-30. Status: proposal, implementation deferred pending buy-in._

## TL;DR

**Build it — but tightly scoped to a read-only "what I did yesterday" recap, personal-only,
deterministic-first.** It is the natural read-side twin of Day Reconstruction over data TimeBro
*already* holds, surfaced at the exact moment the user opens the app for standup. The line that
keeps it "standup prep" and not "a team async-standup tool": **no new forward-looking data capture
(no stored plan/blockers fields), no posting/sharing integrations, no multi-person, no persisted
recap history.** Sharing = a Copy-to-clipboard button, nothing more.

## Q1 — Useful, or scope creep?

Genuinely useful, and *not* scope creep, for three structural reasons:

1. **Zero new data.** The recap is a pure derivation over `DayTrackingSummary` —
   `issues[]` (tickets), `personalNotes[]` (now `category`-tagged), `recurringEntries[]`, and
   optional Bitbucket signals. No schema change, no new IPC, no new storage. It is the cheapest
   possible feature on the data axis.
2. **Same justification as reconstruction.** TimeBro exists because developers *don't* remember how
   their day went — that premise is the whole reason Day Reconstruction exists. The recap is just the
   *verbalized* form of the reconstructed day. If reconstruction is justified, the recap is justified
   by identical logic. It's reconstruction's natural read-side twin.
3. **It pulls toward the core job, not away from it.** "I can't fill yesterday's recap, there's a 3h
   hole" → reconstruct yesterday → log to Jira. The recap becomes a *reason to keep the day honest*,
   complementary to the rings: the ring shows a day's **shape**, the recap shows its **narrative**.

The honest tension: standup prep is a *workflow* concern, and workflow features drift. Plan → blockers
→ sharing → history are each individually reasonable but collectively a different product (a developer
daily-journal / async-standup tool). The discipline is to ship the read-only "what I did" and **stop**.

## Q2 — Part of the product? Where's the line?

Yes. The line between "adjacent output of data we already have" and "a different product":

| In scope (personal standup prep) | Out of scope (becomes a team / journaling tool) |
| --- | --- |
| Read-only assembly of yesterday's logged/noted work | Editable **"today's plan"** stored as new data |
| Grouped by the existing ticket / meeting / firefighting categories | A free-text **blockers journal** |
| Copy-to-clipboard as plain text | Posting / sharing to Slack / Teams / email |
| Optional local-AI **phrasing** of the same facts (degrades to a list) | A persisted **archive/history** of past recaps |
| Auto-surfaced low-confidence "still open" tickets (read-only, derived) | Anything **multi-person** |

Two specific calls:

- **Format = "what I did," not the done/plan/blockers template.** Done/plan/blockers is a *team
  async-standup* convention; TimeBro only authoritatively holds "done." "Plan" is forward-looking —
  the opposite of a reconstruction tool — and would require new capture. Leave it out. (The
  `touched-not-logged` rail already partially answers "what I'm on.")
- **Blockers = at most a derived, low-confidence chip, not a field.** There's a cheap in-scope version
  (list in-progress tickets whose `statusName` matches "block*") and an out-of-scope version (a
  free-text blocker journal). The cheap version is fuzzy (`statusCategory` is only new/indeterminate/done,
  so "Blocked" only shows in `statusName`) — treat it as an *optional stretch*, not core. Core = "what I did."

## Q3 — How to integrate

### Sketch 1 (recommended) — a "Yesterday" recap card in the Today view

A collapsible card in `TodayView`, collapsed by default, that:

- Resolves the **previous working day** (Mon → last Fri via `workingDays`, never Sunday).
- Groups entries by the three activity categories, reusing `ACTIVITY_CATEGORIES` ordering and the
  `--ring-*` colour tokens so it reads as visually continuous with the rings:
  - **Tickets** — key + summary + duration, one line each (reuse `naiveDescription`-style phrasing).
  - **Meetings** — `recurringEntries` + meeting-tagged notes.
  - **Firefighting** — the remaining notes.
- Optionally renders yesterday's `DayRing` beside the text — shape + narrative together.
- A **Copy** button → a plain-text block ready to paste into chat or read aloud.
- If `aiEnabled`: a **Polish** toggle that runs the existing Ollama path (same contract as
  reconstruction) to turn the list into 2–3 spoken sentences — always degrading to the list.

Why Today: the user already opens the app each morning to log; `rec-daily` ("Daily Standup") is at
09:15. The recap lands at the exact moment it's needed.

### Sketch 2 (lighter alternative) — emerge from the `rec-daily` recurring event

Instead of a new card, attach the recap to the **Daily Standup** pending recurring occurrence: when
that chip surfaces, its expanded body *is* the recap. Most defensible "we didn't add a new product
surface" framing — the feature emerges from an existing object. Downside: less discoverable, and
rec-daily lives in Week/recon flows rather than being the first thing seen in the morning.

**Recommendation: Sketch 1**, because discoverability + timing matter more than surface-count purity.

### Don't build a third view of yesterday

`ReconstructView` already assembles a day's signals on a timeline (the *edit* frame); the rings show
the *shape* frame. The recap must be the deliberately-lightest **text formatter** over the same
`DayTrackingSummary` — not a second reconstruction engine. Share the factual-phrasing helpers with
`reconstruct.ts`; don't duplicate placement logic.

## Implementation cost (from code reading)

- The Today route (`AppTodayRoute`) currently receives only *today's* slice (`todayWorklogs`,
  `todayPersonalNotes`, `todayTrackedHours`) built in `useIssueMetadata` via
  `weekState.days.find(d => d.dateKey === todayKey)`.
- The recap needs **yesterday's `DayTrackingSummary`**:
  - Tue–Fri: a sibling `find` in the current `weekState.days[]` — trivial.
  - **Monday edge:** previous working day = last Friday, living in the *previous* week's state. The
    Reports work already threads `weekStates: WeekState[]` / `prevWeekState` — reuse that to reach
    across the week boundary.
- New: a `previousWorkingDay(dateKey, workingDays)` helper; a thin `buildRecap(day)` text formatter
  reusing `dayActivitySeconds` + the `naiveDescription` phrasing; a `RecapCard` component.
- Demo: the seeded fixtures already span Mon–Wed of 2026-06-15 with category-tagged notes — open
  `?demo=1&view=today&seed=release&today=2026-06-17` and the recap reads Tuesday's work.

## Explicit scope boundary (the one paragraph to hold the line)

The standup recap is a **read-only, single-developer, on-device formatting of work TimeBro already
recorded for the previous working day**, copyable as text. It captures no new data, stores no plan or
blockers, keeps no recap history, and integrates with no chat tool. The moment any of those is added,
it has stopped being standup *prep* and started becoming a standup *tool* — a different product with
different privacy and multi-user concerns. Ship the recap; treat everything in the right-hand column
above as out of scope unless repeated real demand proves otherwise.
