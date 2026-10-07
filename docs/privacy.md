# Data and privacy

[← Back to the main README](../README.md)

Yesterlog is local-first. It has no hosted account system, application backend,
AI proxy, or telemetry pipeline.

## At a glance

| Connection | Purpose | When data leaves the device |
| --- | --- | --- |
| Jira Cloud | Tickets, activity, worklogs, and intentional worklog writes | When testing, syncing, searching, or changing a Jira worklog |
| Bitbucket Cloud | Optional commits and pull-request review activity | When testing or syncing the configured repositories |
| Ollama | Optional AI drafting | Never leaves the device; requests go to the configured localhost endpoint |
| Claude CLI | Optional AI drafting | Only after an explicit AI action, under your existing Anthropic CLI authentication |
| Codex CLI | Optional AI drafting | Only after an explicit AI action, under your existing OpenAI CLI authentication |
| GitHub Releases | Update metadata and downloads | When checking for or downloading an update |

## Local storage

Jira and Bitbucket credentials, synced history, settings, and drafts are stored
in local IndexedDB. Yesterlog does not relay those credentials through a
Yesterlog-operated server.

IndexedDB stores:

- `settings`
- `weekOverrides`
- `syncResults`
- `jiraActivityResults`
- `jiraWorklogs`
- `favorites`
- `personalNotes`
- `workspaceNotes`
- `noteNotebooks`
- `bitbucketReviewResults`
- `recurringEvents`
- `recurringOccurrences`
- `reconstructDrafts`
- `reconstructAiDrafts`
- `recapDrafts`
- `savedRecaps`
- `worklogAllocationPreferences`

API calls are made by the Electron main process over IPC rather than directly
from renderer components.

## Jira data flow

Yesterlog syncs Jira **work log items**, not issue discussion comments. Worklog
notes are read from `worklogs[*].comment` as Atlassian Document Format and
flattened locally.

It identifies the authenticated account with:

```text
GET /rest/api/3/myself
```

It searches for candidate issues with Monday-local date bounds:

```jql
worklogAuthor = currentUser()
AND worklogDate >= "<week-start>"
AND worklogDate <= "<week-end>"
ORDER BY updated DESC
```

It then fetches worklogs for each issue:

```text
GET /rest/api/3/issue/{issueIdOrKey}/worklog?startedAfter=<ms>&startedBefore=<ms>
```

Yesterlog filters the result again by authenticated account ID and the local
`[weekStart, weekEndExclusive)` window. It uses `started` as the timestamp and
`timeSpentSeconds` for totals.

### Jira writes

The intentional Add Time flow creates a worklog:

```text
POST /rest/api/3/issue/{issueIdOrKey}/worklog
```

The request contains `started`, `timeSpentSeconds`, and an optional ADF
`comment`. Editing and deletion target the selected Jira worklog item.

Yesterlog does not use the issue-comments endpoint for worklog notes.

## Bitbucket data flow

The optional Bitbucket connection is read-only. Yesterlog reads configured
repositories to find:

- your pull-request review activity;
- activity on your own pull requests;
- your commits associated with pull requests and branches.

This evidence can appear in Review, Reconstruct, Today suggestions, and Recap.
Nothing is written to Bitbucket.

## Optional AI

Reconstruct and Recap always have deterministic local behavior. AI is optional
and off by default.

### Ollama

Ollama requests go through the Electron main process to the configured local
endpoint, normally `http://localhost:11434`. No cloud API key is required.

### Claude CLI and Codex CLI

These providers use CLI authentication already present on the machine.
Yesterlog does not read or store those credentials.

Before a prompt is sent, Yesterlog applies best-effort redaction to known Jira
keys, repository identifiers, and other supplied literals. Redaction reduces
exposure but is not a formal anonymization guarantee. The resulting prompt is
handled under the selected provider's terms.

No cloud request occurs merely because a view was opened. Cloud AI is called
only after an explicit action such as drafting Reconstruct copy or rewriting a
Recap version.

## Personal notes, workspace notes, and saved drafts

Personal notes, ticket-note items, local notebooks, and the General notes
Scratchpad never sync to Jira or Bitbucket. The Scratchpad is not counted as
time and is not included in reports. Its Markdown fallback and rich formatting
state are stored only in the local notes database. Notes AI briefings use Jira
and optional pull-request context; local notes and Scratchpad text are
deliberately excluded from their prompts.

Reconstruct placements, durations, and AI drafts are cached per day. Recap
drafts, version histories, trusted CV outcomes, and brag-doc snapshots remain
local.

Import and export actions occur only when you choose them.

For setup instructions, see [Getting started](./getting-started.md).

### PR review-flow analysis

PR Analytics invokes AI only when you choose **Analyze review flow** with AI enabled.
The prompt includes aggregate counts, median/p75 durations, sample sizes, coverage and
whether the selected period includes today. It excludes repository names, PR numbers,
titles, comments, code, author identities, links and exact event timestamps for every
provider. Supporting PR links are resolved locally from the cached history.

Ollama uses your configured endpoint. Claude CLI and Codex CLI send these aggregates
to Anthropic and OpenAI respectively using your existing CLI authentication. Explanations
remain in the current view rather than being saved to the analytics cache. Changing the
scope, source data or provider discards them. AI is optional; all metrics and repository
comparisons are calculated without it.
