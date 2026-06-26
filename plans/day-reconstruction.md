# Plan: Day Reconstruction (with optional local AI)

Implements the `Stint - Day Reconstruction` design handoff into TimeBro.

## Goal
A new **Reconstruct** view that rebuilds one forgotten/untracked workday from the
signals TimeBro already syncs (Bitbucket PR reviews + existing Jira worklogs), proposes
worklog entries, and lets the user review and (future) send them. Plus a **Local AI ·
Ollama** settings subpage.

## Hard requirement (from the user)
- The new view/feature **works fully without any LLM** — the deterministic core is the
  product. The LLM (local Ollama) is a strictly **optional** polish layer, **off by
  default**.
- The view must visibly **mention that connecting a local LLM unlocks extra features**
  (the AI-off banner + AI pill + "Set up local AI" CTA → Settings).

## Architecture (two layers, cleanly separable)
- **Core (always on, deterministic, pure):** `src/domain/reconstruct.ts`
  - Input: a `dateKey`, that day's Jira worklogs (already logged), that day's Bitbucket
    review sessions (signals), settings, and the day "kind".
  - Output: `ReconstructDay` — signals[], timeline rows[], totals, gap, send count,
    confidence, day kind. Naive/factual descriptions only.
- **AI (optional, isolated, identity-on-failure):**
  - `src/domain/enhancePrompt.ts` — pure: build prompt from `ReconstructDay`, parse the
    model's JSON back into a `ReconstructDay`. Malformed output ⇒ return input unchanged.
  - `src/api/ollama.ts` — renderer client; routes through the Electron main process
    (`electron/ollama.ts` + IPC) to avoid renderer CORS. Disabled/unreachable/error ⇒
    returns the input day unchanged.

The AI contract is `ReconstructDay -> ReconstructDay`. The UI never has a broken state:
worst case it shows the deterministic reconstruction.

## Data source (v1)
Window = the **visible week** (Mon … min(today, Sun)), all in-memory from `weekState`,
`syncResult.daySummaries`, and the week's `bitbucketReviewResult.sessions`. No new async
storage plumbing. The date stepper is bounded: back arrow disabled at window start,
forward arrow disabled at today (never the future).
- Follow-up (noted, not v1): widen the window to ~2 weeks by reading adjacent week
  buckets from `db.ts`, and add commit/CI/Jira-changelog signal collection in `native`.

## Work items
- `src/styles/base.css` — add `--teal` + `--ai` accent tokens (dark + both light blocks).
- `shared/types.ts` — extend `AppSettings` (`aiEnabled` default false, `ollamaEndpoint`,
  `ollamaModel`); add Ollama IPC request/result types.
- `src/domain/week.ts` — extend `DEFAULT_SETTINGS`.
- `src/domain/reconstruct.ts` (+ `.test.ts`) — pure engine + types.
- `src/domain/enhancePrompt.ts` (+ `.test.ts`) — AI prompt build + parse (identity fallback).
- `electron/ollama.ts`, `electron/main.ts`, `electron/preload.ts`, `src/vite-env.d.ts`,
  `src/api/native.ts`, `src/api/ollama.ts` — optional Ollama IPC channel + client.
- `src/components/ReconstructView.tsx` (+ `.test.tsx`) + `src/styles/reconstruct.css`.
- `src/components/Sidebar.tsx` — `AppView` add `"recon"`; NAV entry.
- `src/app/useReconstruct.ts` — selected-day state + core day + optional AI enhancement.
- `src/app/AppReconRoute.tsx` (+ `.test.tsx`), `src/app/AppMainView.tsx`, `src/App.tsx`,
  `src/app/useAppNavigation.ts` — wire the route.
- `src/components/SettingsView.tsx` — new `"reconstruct"` (Local AI) section/subpage.
- `README.md` — short feature + privacy note.

## Verification
- `npm run test` (engine, prompt parse, view/route, settings section).
- `npm run build` (tsc + vite + electron tsc).
- Ollama runtime call is unverifiable here (no local model); the identity-fallback path
  is unit-tested.

## Review fixes (adversarial multi-agent review, 16 findings)
Fixed: date stepper now spans a trailing ~14-day window (db-backed for prior weeks);
engine never silently drops rows on a busy day and totals match the timeline; the optional
AI effect no longer re-fires every 60s (coreDay identity stabilised on primitives); a
fully-logged *today* is tagged TODAY not PAST DAY; **auto-distribute is now a real
deterministic core feature** (the AI-off primary/rail button); removed the extra plain-gap
"Add" button; restored the `localhost:11434` banner tag; recon borders repointed to the
mock's `--border`; Settings model field gained the AI dot; relabeled "Send N entries to
Jira" → "Log N entries in Jira" (opens the sanctioned Add Time flow) and removed the
unbacked "SAVE DRAFT"; gap CTA relabeled to a generic "Add".

Deferred (need explicit go-ahead — AGENTS.md write-surface caution / larger scope):
- Real batch Jira write + draft persistence for the footer action.
- Weekend exact-date logging: the shared Add Time flow coerces to working days at two
  points; "Log time anyway" opens Add Time (the day selector shows the chosen working day,
  not silent). Reworking that flow is out of this feature's scope.
- CI-run and Jira-changelog signal collection (commits now land; engine accepts the rest).

## Follow-ups shipped
- Own-PR activity is reclassified as low-confidence "On your PR" work, not "Review".
- Bitbucket **commit** signals: `syncBitbucketReviewSessions` now also collects the user's
  own commits (per authored PR), grouped by branch/ticket/day, and the engine renders them
  as blue "commit" work entries. This closes the "my coding work is invisible" gap.

## Status
Implemented and verified. `npm run test` (382 passing, incl. new engine/prompt/view/route/
settings tests), `npm run build`, and renderer/electron `tsc --noEmit` all pass. Verified
both themes in the browser preview (`?demo=1&view=recon`). Adversarial multi-agent review
of the new code completed; findings triaged.

Notes / deliberate v1 scope:
- Reconstruct window = the visible week (Mon..today), all in-memory. Widening to ~2 weeks
  and adding commit/CI/Jira-changelog signal collection are noted follow-ups.
- Commit translation/POST-to-Jira bulk send is not added; "Send"/"Add"/gap CTAs open the
  existing Add Time modal (the established write surface).
- AI-off primary actions ("Auto-distribute"/"Distribute everything") perform the core
  log-by-hand path; the "connect a local model" mention lives on the AI banner + pill +
  "SET UP LOCAL AI" CTA (all → Settings).
