# Yesterlog features

[← Back to the main README](../README.md)

Yesterlog is a local-first work memory for developers who use Jira. It turns
the evidence you already leave behind into a record you can complete, inspect,
and reuse.

## The core workflow

- **Reconstruct.** Rebuild a forgotten day from Jira and optional Bitbucket
  activity. The deterministic core works without AI.
- **Complete.** Fill gaps with quick logging, drag-and-drop, timeline editing,
  recurring rituals, and local-only notes.
- **Recap.** Turn a week, month, or quarter into a standup, manager update,
  performance review, CV draft, or changelog.

## Product tour

### Today — log it before you forget it

Pick a ticket or search all of Jira, choose a duration, add an optional note,
and save. The Today calendar shows what is already recorded, what is still
missing, and which touched tickets have no worklog yet. Personal notes stay
local and never touch Jira.

<p align="center">
  <img src="./screenshots/v3.0.0/dark-today.png" alt="Yesterlog Today view with a daily target bar, worklog composer, recorded entries, and detected unlogged activity." width="900" />
</p>

### Week — see the whole record

The Week view combines daily targets, worklogs, recurring events, personal
notes, vacation handling, and the Active Work dock. Use the compact summary or
the aligned timeline, then drag active tickets directly onto a day.

<p align="center">
  <img src="./screenshots/v3.0.0/dark-week.png" alt="Yesterlog Week view with daily targets, worklogs, vacation handling, and an Active Work dock." width="900" />
</p>

### Month — find every gap

The month calendar is color-coded by target completion. Jump directly to the
next missing day instead of scanning Jira one week at a time.

<p align="center">
  <img src="./screenshots/v3.0.0/dark-month.png" alt="Yesterlog Month view with daily totals, target status, weekly totals, and a jump-to-next-gap action." width="900" />
</p>

### Reconstruct — rebuild a forgotten day

Reconstruct combines existing Jira worklogs and activity with optional
Bitbucket commits and pull-request reviews on a configurable day timeline.
Place signals by drag-and-drop or all at once, adjust durations, and fill the
remaining gaps through the existing Add Time flow.

The reconstruction engine is deterministic and fully usable without AI.
Optional AI can turn raw `fix npe` or `wip` activity into cleaner worklog
drafts. Choose local [Ollama](https://ollama.com), Anthropic through the Claude
CLI, or OpenAI through the Codex CLI. AI is off by default.

<p align="center">
  <img src="./screenshots/v3.0.0/dark-recon.png" alt="Yesterlog Reconstruct view with work signals arranged on a day timeline, visible gaps, and optional AI drafts." width="900" />
</p>

### Recap — turn history into something useful

Choose a week, month, or quarter and use the same grounded history to prepare:

- a performance review;
- a manager update;
- CV or résumé candidates;
- a standup digest;
- a changelog.

Switch between Brief, Standard, and Detailed output, inspect the source evidence
behind each workstream, edit the draft, compare versions, and optionally create
a separate AI-assisted rewrite. Export as text or Markdown, print to PDF, or
save an immutable snapshot to the local brag doc.

<p align="center">
  <img src="./screenshots/v3.0.0/dark-recap.png" alt="Yesterlog Recap workspace with format and period controls, grounded workstreams, source links, versions, exports, and a local brag doc." width="900" />
</p>

### Review — get credit for code review

The optional read-only Bitbucket integration estimates review sessions from
your real pull-request activity. Select the sessions to log, adjust their
durations, and send them to the reviewed Jira ticket or a dedicated code-review
bucket.

<p align="center">
  <img src="./screenshots/v3.0.0/dark-review.png" alt="Yesterlog Review view with Bitbucket pull-request sessions, confidence, duration controls, and Jira logging actions." width="900" />
</p>

### Tickets — keep active work close

Browse assigned, in-progress, recently closed, and starred Jira tickets with
status, issue type, project context, and weekly logged hours. Open ticket
details or jump into Add Time with the ticket preselected.

<p align="center">
  <img src="./screenshots/v3.0.0/dark-tickets.png" alt="Yesterlog Tickets view with favorites, active tickets, Jira status, project context, and quick logging." width="900" />
</p>

### Notes — keep the context Jira cannot

Use a freeform Scratchpad in General notes for running thoughts, rough drafts,
and multiline notes. Switch to structured notes and to-dos when something needs
to become an item, or keep context attached to a Jira ticket or local notebook.
Type Markdown shortcuts such as `# `, `## `, `* `, or `1. ` to create headings
and lists as you write, or use the compact toolbar for bold, italic, underline,
strikethrough, and code. Scratchpad changes save automatically on the device
and are never included in Jira writes or AI briefing prompts.

<p align="center">
  <img src="./screenshots/v3.1.0/dark-notes.png" alt="Yesterlog Notes workspace with local notebooks, Jira-linked notes, and structured to-dos." width="900" />
</p>

### Reports — understand the recorded shape

Summary, Composition, Focus, and Trends pages show daily averages, days on
target, ticket totals, billable percentage, work composition, approximate focus
blocks, and week-over-week change. Export weekly data to CSV when a spreadsheet
is still required.

<p align="center">
  <img src="./screenshots/v3.0.0/dark-reports.png" alt="Yesterlog Reports view with weekly metrics, charts, and per-ticket breakdowns." width="900" />
</p>

### Settings — make it yours

Connect Jira and optional Bitbucket, configure working days and targets,
schedule reminders, manage recurring rituals, choose an optional AI provider,
import or export local notes, and use light, dark, or system appearance.

<p align="center">
  <img src="./screenshots/v3.0.0/dark-settings.png" alt="Yesterlog Settings view with connection, tracking, recurring, appearance, data, and about sections." width="900" />
</p>

## Detailed capabilities

### Worklogs and local entries

- Two-click logging with duration presets from 15 minutes to 8 hours.
- Custom **H / D / W** durations, with 1 day = 8 hours and 1 week = 5 days.
- Global `Cmd/Ctrl-K` shortcut.
- Drag-and-drop from Active Work onto a Week day or exact timeline time.
- Edit or delete Jira worklogs, including duration, date, start time, and note.
- Optional comments stored on the Jira work log item itself.
- Local-only personal notes that contribute to Yesterlog totals but never touch
  Jira.
- Optimistic refresh after writes.

### Reconstruction

- Jira worklogs, Jira issue activity, Bitbucket commits, and pull-request review
  signals.
- Configurable day timeline with visible elapsed-time limits for today.
- Per-signal placement, repositioning, removal, and duration overrides.
- Deterministic auto-distribution.
- Per-day draft persistence in IndexedDB.
- Optional signal-keyed AI drafts with an explicit Stop action.
- Local Ollama or opt-in Claude/Codex CLI providers.

### Recap and brag doc

- Week, month, and quarter intervals.
- Five purpose-specific formats and three detail levels.
- Grouping by workstream using Jira epic/project and repository context.
- Coverage warnings when the local history is incomplete.
- Source drawer for tickets, pull requests, commits, meetings, and local work.
- Local deterministic drafts, separate AI versions, and manual editing.
- Trusted user-entered outcomes for CV candidates.
- Local saved snapshots, plain-text copy, Markdown download, and print/PDF.

### Notes workspace

- A rich General scratchpad with Markdown shortcuts, a formatting toolbar,
  local autosave, and visible save status.
- Separate structured notes and to-dos with filters, completion, and archive.
- Local notebooks plus Jira-ticket containers built from recent work activity.
- Optional live pull-request context and explicit AI briefings that never read
  the user's local notes or scratchpad.
- Scratchpad text stays outside worklog totals, reports, and Jira writes.

### Jira integration

- Regular Atlassian API token authentication with no Jira administrator access
  required.
- Monday-local worklog windows and filtering to the authenticated account.
- Search across Jira, not only assigned tickets.
- Assigned, in-progress, and recently closed ticket sync.
- Status, issue-type, epic, project, and direct Jira links.
- Automatic sync on launch.

### Bitbucket integration

- Optional read-only Bitbucket Cloud connection.
- Review sessions derived from comments, approvals, and review decisions.
- Separate handling for reviewed pull requests and activity on your own pull
  requests.
- Commit groups used as reconstruction and Recap evidence.
- Adjustable estimates, confidence labels, ignore controls, confirmation, and
  batch logging to Jira.

### Planning and insight

- Daily and weekly targets.
- Configurable working days and skipped/vacation days.
- Target redistribution across the remaining active week.
- Recurring local rituals for standups, planning, and ceremonies.
- Month gap discovery.
- Multi-page reports and CSV export.
- Deterministic projection of unusually long Jira worklogs across the days they
  represent without creating extra Jira writes.

### Desktop details

- Warm editorial design in light, dark, or system mode.
- Responsive layouts and collapsible navigation.
- Native reminder notifications.
- Sync, save, and update notifications.
- In-app release notes and update handling.
- Remembered window position and size.
- Import and export for personal notes.

For connection instructions, see [Getting started](./getting-started.md). For
storage and network behavior, see [Data and privacy](./privacy.md).
