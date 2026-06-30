# Cursor session tracking → bind to ticket (time + tokens) — feasibility analysis

**Status:** Idea, deferred. Researched & verified 2026-06-30. Not scheduled.
**Origin:** Follow-up to the shipped "Open in Cursor" deeplink feature ([ticket-details-dialog.md], `shared/cursorDeeplink.ts`). Question: since TimeBro is a tracking app, can we track a Cursor coding session, bind it to a Jira ticket afterward, and capture time (and maybe tokens)?

## TL;DR

There is **no single Cursor surface that passively gives time + tokens + a session id you can bind to a ticket.** Per-session *token* attribution is the wall. So split the idea:

- **Time-on-ticket = strong, on-mission fit.** Build it. Best surface: **Cursor Hooks** (official, passive, stable `conversation_id`, clean `sessionStart`/`sessionEnd` + `duration_ms`). Pairs naturally with the deeplink we already ship (send ticket → capture session back against it).
- **Token/cost-per-ticket = weak fit as a core feature.** It's a manager-analytics job, not a time-logging job, and it's the technically hardest part (no passive per-session token source). Defer to optional/best-effort, or a separate team report.

## Verified API reality (2026-06-30)

| Surface | Tokens | Time | Session id | Ticket bind | Official | Passive | Fit |
|---|---|---|---|---|---|---|---|
| **Hooks** `.cursor/hooks.json` | ❌ none in payloads | ✅ `sessionEnd.duration_ms` + `stop` loop heartbeat | ✅ stable `conversation_id` | branch / prompt regex | ✅ | ✅ | **4/5 (time)** |
| **CLI** `cursor-agent -p --output-format json` | ⚠️ `usage{}` exists, **undocumented & version-gated** | ✅ `duration_ms` + wrap process | ✅ `session_id`, resumable | prompt prefix / `-H` header | ✅ (usage field unofficial) | ❌ opt-in, headless only | **5/5 but narrow** |
| **Admin/Usage API** | ✅ per-*request* tokens+cost | ⚠️ infer from timestamps | ❌ **no session id** | user+time heuristic only | ✅ | poll-only | **2/5** |
| **MCP server** | ❌ | ❌ self-reported only | ❌ not reliable | explicit tool arg | ✅ | ❌ model-controlled | **2/5 (active only)** |
| **VS Code extension** | ❌ | ✅ focus/idle/edits | ❌ no AI id | branch/workspace | ✅ (AI inference unofficial) | ✅ presence only | **2/5** |
| **Local SQLite** `state.vscdb` | ⚠️ sparse (~95% bubbles=0) | ✅ per-message timestamps | ✅ `composerId` | infer from text/branch | ❌ unofficial | ✅ | **3/5, brittle** |

### Load-bearing facts (adversarially verified)

1. **Hooks do NOT carry tokens** — confirmed false that they do. Cursor staff (2026-06-28): "haven't added token usage metadata to hook inputs yet." On their request list.
2. **Admin API needs a paid Team/Business plan + admin key** — a solo Pro user cannot pull their own usage via API. And it has **no conversation id**, so it can't attribute tokens to a session — only user+day.
3. **CLI token `usage`** — partly true: `session_id`/resume is solid & documented; the token block is real on recent builds but **undocumented and version-dependent**. Mature trackers (`tokscale`) don't rely on it. Guard for absence.
4. **Per-session token attribution from any official API** — effectively no. Only the unofficial local DB gets per-session tokens, and there they're sparse / lower-bound.

## Product judgment

- **Decouple time from tokens** — different jobs, different owners, different data.
- **Time-on-ticket is TimeBro's actual job.** Auto-capturing "you spent 47 min in a Cursor session on branch `feat/FTDM-404`" → one-click worklog directly attacks the core pain (forgetting to log). TimeBro is uniquely positioned: it's the only tool sitting on **both** sides (Jira + the editor session). The branch name (or the ticket stamped at deeplink-send time) is the join key — no native Cursor "ticket" concept needed.
- **Token/cost-per-ticket is manager analytics**, narrow audience, admin-API-gated, session-blind. High effort, easy to overpromise. Treat as optional / team-only.

## Recommended shape (ranked)

1. **Primary — Hooks → passive time → suggested worklog.** ~30-line hook writes `{conversation_id, branch, start, end, duration_ms}` JSONL on `sessionStart`/`sessionEnd`; TimeBro tails it, maps branch→ticket, surfaces *"Log 47m to FTDM-404?"*. Official, passive, on-mission. **Build this first.**
2. **Secondary — MCP server for active logging.** Tiny TimeBro MCP (`start_timer(ticket)`, `log_work(ticket, minutes)`, `fetch_ticket(key)`) to log from inside Cursor by intent. Cheap, official, cross-IDE complement. (A "skill"/rule is just packaging on top of this, not a data source.)
3. **Power/CI — CLI wrapper.** The only place you cleanly get time + tokens + session id together, but only for headless `cursor-agent` runs you wrap. Optional path for terminal/CI users; ignores GUI usage.
4. **Team analytics (later) — Admin API** for an "AI cost per ticket" report, correlated by user+time-window. Enterprise motion.
5. **Skip for this purpose:** generic extension (presence time, redundant with hooks) and local SQLite scrape (only as a clearly-labeled "estimated" backfill — breaks across Cursor versions).

## MVP sketch (when picked up)

1. Ship a `.cursor/hooks.json` + capture script template (TimeBro can write it for the user, or document it).
2. Hook on `sessionStart`/`sessionEnd`: stamp wall-clock, read git branch, append a JSONL line keyed by `conversation_id`.
3. TimeBro ingestion: tail the JSONL, map branch → Jira key (reuse existing ticket resolution), aggregate session durations per ticket per day.
4. Surface a non-intrusive prompt in the Today/Week view: *"Cursor: 47m on FTDM-404 today — log it?"* → one-click worklog via existing `addWorklog`.
5. (Optional, later) Token column sourced from CLI-wrap or Admin API, clearly labeled "estimated".

## Risks / watch items

- Hooks are new (1.7, late 2025); schema still evolving. No tokens yet (watch the feature request — may land).
- CLI `usage` field undocumented/version-gated → must guard for absence and test the installed version.
- Admin API = high-privilege org secret; enterprise sales motion, not solo.
- Local DB = unofficial, brittle, sparse tokens, privacy-sensitive (contains source/prompts).
- Cloud/background agents don't fire `sessionStart`/`sessionEnd`.

## Sources

Hooks: cursor.com/docs/hooks (no-tokens confirmation: forum.cursor.com/t/cursor-hooks-token-usage-support/147216). CLI: cursor.com/docs/cli/reference/output-format (usage thread: forum.cursor.com/t/include-token-usage-in-stream-json-output/146980). Admin API: cursor.com/docs/account/teams/admin-api (Teams-gated: forum.cursor.com/t/admin-api-how-to-create-an-api-key/122406). Analytics API: cursor.com/docs/account/teams/analytics-api. MCP: cursor.com/docs/mcp. Local storage: vibe-replay.com/blog/cursor-local-storage/, github.com/getagentseal/codeburn.
