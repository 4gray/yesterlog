import type {
  BitbucketPullRequestDetailsResult
} from "../../shared/types";
import type { NotesBriefingSuggestion } from "../domain/notesBriefing";
import {
  GENERAL_NOTES_CONTAINER_ID,
  notebookContainerId,
  type NoteJiraSnapshot,
  type NoteNotebook,
  type NoteTicketActivity,
  type WorkspaceNote,
  type WorkspaceNoteBucket,
  type WorkspaceNoteType
} from "../domain/ticketNotes";
import { toLocalDateKey } from "../utils/date";
import { uid } from "./notesWorkspaceShared";

/* Seeded demo content for the Notes workspace (?demo=1). */

export const makeDemoData = (currentDate: Date) => {
  const at = (dayOffset: number, hour = 10) => {
    const value = new Date(currentDate);
    value.setDate(value.getDate() + dayOffset);
    value.setHours(hour, 0, 0, 0);
    return value.toISOString();
  };
  const note = (
    id: string,
    type: WorkspaceNoteType,
    text: string,
    dayOffset: number,
    done = false,
    archived = false
  ): WorkspaceNote => ({
    id,
    type,
    text,
    done,
    createdAt: at(dayOffset),
    updatedAt: at(dayOffset),
    ...(archived ? { archivedAt: at(dayOffset) } : {})
  });
  const jira = (
    key: string,
    summary: string,
    statusName: string,
    statusCategory: NoteJiraSnapshot["statusCategory"] = "indeterminate"
  ): NoteJiraSnapshot => ({
    key,
    summary,
    statusName,
    statusCategory,
    url: `https://example.atlassian.net/browse/${key}`,
    issueType: { name: "Task", hierarchyLevel: 0 }
  });

  const snapshots = {
    redis: jira("TB-352", "Migrate session storage to Redis", "In progress"),
    e2e: jira("TB-360", "Flaky e2e: checkout smoke test", "In progress"),
    retry: jira("TB-341", "Payment retry logic on failed webhooks", "Done", "done"),
    linked: {
      ...jira("TB-353", "Write Redis failover runbook", "Backlog", "new"),
      issueType: { name: "Sub-task", subtask: true, hierarchyLevel: -1 }
    }
  };
  const buckets: WorkspaceNoteBucket[] = [
    {
      containerId: "TB-352",
      jira: snapshots.redis,
      notes: [
        note("demo-redis-text", "text", "Staging Redis is 6.2 — no RESP3. Keep the client pinned to v4.", -1),
        note("demo-redis-done", "todo", "Spike: TTL semantics match current cookie expiry", -1, true),
        note("demo-redis-open", "todo", "Benchmark session read p99 before cutover", 0)
      ]
    },
    {
      containerId: "TB-341",
      jira: snapshots.retry,
      notes: [
        note("demo-retry-archive", "todo", "Add exponential backoff to the retry queue", -2, true, true),
        note("demo-retry-text", "text", "Stripe re-sends webhooks on timeout — dedupe by event id.", -2),
        note("demo-retry-open", "todo", "Update the on-call runbook (retry window changed)", -1)
      ]
    },
    {
      containerId: "TB-353",
      jira: snapshots.linked,
      notes: [note("demo-linked", "todo", "Confirm runbook owners before launch", -1)]
    },
    {
      containerId: GENERAL_NOTES_CONTAINER_ID,
      document: {
        text: [
          "Loose threads",
          "",
          "Redis rollout: confirm the fallback metric before Thursday.",
          "Bring the new standup format to the platform retro.",
          "",
          "The Vitest migration still looks like a good Friday experiment."
        ].join("\n"),
        updatedAt: at(-1)
      },
      notes: [
        note("demo-general-open", "todo", "Prep talking points for Monday 1:1", -1),
        note("demo-general-text", "text", "Vitest migration looks painless — try it in a side branch.", -2),
        note("demo-general-archive", "text", "Old standup format: blockers first, then demos.", -20, false, true)
      ]
    },
    {
      containerId: notebookContainerId("demo-lena"),
      notes: [
        note("demo-notebook-open", "todo", "Ask about the Berlin offsite budget", -1),
        note("demo-notebook-text", "text", "The platform team may take over rate limiting next quarter.", -1)
      ]
    }
  ];
  const activity: NoteTicketActivity[] = [
    { ...snapshots.redis, lastWorkedAt: at(0, 11), loggedSeconds: 13_500 },
    { ...snapshots.e2e, lastWorkedAt: at(0, 9), loggedSeconds: 4_200 },
    { ...snapshots.retry, lastWorkedAt: at(-1, 15), loggedSeconds: 22_800 }
  ];
  const notebooks: NoteNotebook[] = [
    {
      id: "demo-lena",
      title: "1:1 with Lena",
      createdAt: at(-20),
      updatedAt: at(-20)
    }
  ];
  return { buckets, activity, notebooks };
};

export const DEMO_PULL_REQUEST: BitbucketPullRequestDetailsResult = {
  workspace: "yesterlog",
  repositorySlug: "web",
  repositoryName: "web",
  pullRequestId: 472,
  title: "Redis session store",
  state: "OPEN",
  url: "https://bitbucket.org/yesterlog/web/pull-requests/472",
  sourceBranch: "feature/TB-352-redis",
  destinationBranch: "main",
  jiraIssueKey: "TB-352",
  approvalCount: 2,
  commentCount: 14,
  diffstatSummary: "6 files changed, +218 -74. Session store, migration path, and integration tests.",
  tasks: [
    {
      id: 1,
      content: "Rename SessionStore.flush() to drain() — flush collides with the express API",
      state: "UNRESOLVED",
      resolved: false,
      authorDisplayName: "Anna K.",
      authorInitials: "AK"
    },
    {
      id: 2,
      content: "Add a metric for the session_migration_fallback path",
      state: "UNRESOLVED",
      resolved: false,
      authorDisplayName: "Marc D.",
      authorInitials: "MD"
    }
  ],
  comments: [
    {
      id: 11,
      content: "This TTL constant duplicates config/session.ts — import it instead of re-declaring.",
      authorDisplayName: "Anna K.",
      authorInitials: "AK",
      path: "src/session/store.ts",
      line: 41
    },
    {
      id: 12,
      content: "Can we log when the cookie fallback fires? Debugging prod without it will be painful.",
      authorDisplayName: "Marc D.",
      authorInitials: "MD",
      path: "src/session/migrate.ts",
      line: 88
    }
  ]
};

export const DEMO_BRIEFING: NotesBriefingSuggestion[] = [
  {
    id: "demo-risk-1",
    kind: "risk",
    text: "The load balancer still pins sessions by cookie, so rollout may temporarily mix cookie and Redis sessions."
  },
  {
    id: "demo-risk-2",
    kind: "risk",
    text: "The production eviction policy can remove live sessions during a traffic burst."
  },
  {
    id: "demo-question-1",
    kind: "question",
    text: "What happens to sessions active at cutover: force re-login or migrate lazily?"
  },
  {
    id: "demo-check-1",
    kind: "check",
    text: "Verify concurrent refreshes racing on the same session key are covered by a test."
  }
];
