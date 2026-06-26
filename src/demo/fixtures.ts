import type {
  AppSettings,
  BitbucketCommitGroup,
  BitbucketReviewSession,
  BitbucketReviewSyncResult,
  JiraIssueSummary,
  JiraIssueTypeInfo,
  JiraTicket,
  JiraWorklog,
  SyncDayBucket,
  SyncResult,
  TicketsResult,
  WeekOverride
} from "../../shared/types";
import { addDays, startOfWeekMonday, toLocalDateKey } from "../utils/date";
import type { DemoConfig } from "./config";

export interface DemoScenario {
  today: Date;
  weekStart: Date;
  settings: AppSettings;
  weekOverride: WeekOverride;
  syncResult: SyncResult;
  bitbucketReviewResult: BitbucketReviewSyncResult;
  tickets: TicketsResult;
  favoriteKeys: string[];
  selectedTicket?: JiraTicket;
}

const DEMO_JIRA_BASE_URL = "https://timebro-demo.example.test";
const ACCOUNT_ID = "demo-account-001";
const DEMO_ASSIGNEES: Record<string, string> = {
  DOC: "Mina Park",
  FTDM: "Demo Timekeeper",
  INT: "Noah Klein",
  MOB: "Iris Chen",
  OPS: "Sam Rivera",
  PAY: "Anika Shah",
  QA: "Leo Martins",
  UX: "Rae Morgan",
  WEB: "Jon Bell"
};

const ISSUE_TYPES: Record<string, JiraIssueTypeInfo> = {
  epic: { name: "Epic", hierarchyLevel: 1 },
  story: { name: "Story", hierarchyLevel: 0 },
  task: { name: "Task", hierarchyLevel: 0 },
  bug: { name: "Bug", hierarchyLevel: 0 },
  subtask: { name: "Sub-task", subtask: true, hierarchyLevel: -1 }
};

const NOTE_SETS = [
  [
    "Mapped the edge case and left cleanup notes for tomorrow.",
    "Paired with design on the empty-state copy.",
    "Split the sync fix into a smaller reviewable patch."
  ],
  [
    "Verified the local week boundary against Jira timestamps.",
    "Updated screenshots after tightening the spacing.",
    "Documented the follow-up in the release checklist."
  ],
  [
    "Replayed the Add Time flow with the new keyboard path.",
    "Checked token copy with a fake account and no real credentials.",
    "Kept the report export wording aligned with worklog notes."
  ]
];

const hashSeed = (seed: string) => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed: string) => {
  let value = hashSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
};

const ticketUrl = (key: string) => `${DEMO_JIRA_BASE_URL}/browse/${key}`;

const ticket = ({
  id,
  key,
  summary,
  projectName,
  statusName,
  statusCategory,
  loggedSecondsTotal,
  createdAt,
  assigneeDisplayName,
  issueType
}: Omit<JiraTicket, "projectKey" | "url">): JiraTicket => ({
  id,
  key,
  summary,
  projectKey: key.split("-")[0],
  projectName,
  statusName,
  statusCategory,
  loggedSecondsTotal,
  createdAt,
  assigneeDisplayName: assigneeDisplayName ?? DEMO_ASSIGNEES[key.split("-")[0]],
  issueType,
  url: ticketUrl(key)
});

const seconds = (hours: number, minutes = 0) => hours * 3600 + minutes * 60;

const localStartISO = (dateKey: string, time: string) => new Date(`${dateKey}T${time}:00`).toISOString();

const worklog = ({
  id,
  ticket: sourceTicket,
  dateKey,
  time,
  duration,
  comment
}: {
  id: string;
  ticket: JiraTicket;
  dateKey: string;
  time: string;
  duration: number;
  comment?: string;
}): JiraWorklog => ({
  id,
  issueId: sourceTicket.id,
  issueKey: sourceTicket.key,
  issueSummary: sourceTicket.summary,
  issueType: sourceTicket.issueType,
  authorAccountId: ACCOUNT_ID,
  started: localStartISO(dateKey, time),
  timeSpentSeconds: duration,
  comment
});

const reviewSession = ({
  workspace,
  repositorySlug,
  repositoryName,
  pullRequestId,
  title,
  issueKey,
  dateKey,
  time,
  duration,
  label,
  comments,
  author = "Nadia Chen",
  isOwnPullRequest = false,
  confidence = "high"
}: {
  workspace: string;
  repositorySlug: string;
  repositoryName: string;
  pullRequestId: number;
  title: string;
  issueKey: string;
  dateKey: string;
  time: string;
  duration: number;
  label: BitbucketReviewSession["reviewStateLabel"];
  comments: number;
  author?: string;
  isOwnPullRequest?: boolean;
  confidence?: BitbucketReviewSession["confidence"];
}): BitbucketReviewSession => {
  const started = new Date(localStartISO(dateKey, time));
  const ended = new Date(started.getTime() + duration * 1000);

  return {
    id: `${workspace}/${repositorySlug}#${pullRequestId}:${dateKey}`,
    workspace,
    repositorySlug,
    repositoryName,
    pullRequestId,
    pullRequestTitle: title,
    pullRequestUrl: `https://bitbucket.org/${workspace}/${repositorySlug}/pull-requests/${pullRequestId}`,
    pullRequestState: "OPEN",
    pullRequestAuthorAccountId: isOwnPullRequest ? "demo-bitbucket-account" : `demo-author-${author.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    pullRequestAuthorDisplayName: isOwnPullRequest ? "Demo Reviewer" : author,
    isPullRequestAuthor: isOwnPullRequest,
    sourceBranch: `feature/${issueKey.toLowerCase()}-review`,
    destinationBranch: "main",
    jiraIssueKey: issueKey,
    dateKey,
    startedISO: started.toISOString(),
    endedISO: ended.toISOString(),
    estimatedSeconds: duration,
    reviewStateLabel: label,
    commentCount: comments,
    activityCount: Math.max(comments, 1) + (label === "COMMENTED" ? 0 : 1),
    confidence,
    events: [
      {
        id: `comment:${pullRequestId}:1`,
        type: comments > 0 ? "comment" : "approved",
        occurredAt: new Date(started.getTime() + 5 * 60 * 1000).toISOString()
      }
    ],
    status: "unlogged"
  };
};

const commitGroup = ({
  repositorySlug,
  repositoryName,
  pullRequestId,
  issueKey,
  dateKey,
  time,
  durationSeconds,
  commitCount,
  message,
  confidence = "high"
}: {
  repositorySlug: string;
  repositoryName: string;
  pullRequestId: number;
  issueKey: string;
  dateKey: string;
  time: string;
  durationSeconds: number;
  commitCount: number;
  message: string;
  confidence?: BitbucketCommitGroup["confidence"];
}): BitbucketCommitGroup => {
  const first = new Date(localStartISO(dateKey, time));
  const last = new Date(first.getTime() + durationSeconds * 1000);
  return {
    id: `timebro-demo/${repositorySlug}#${pullRequestId}:commits:${dateKey}`,
    workspace: "timebro-demo",
    repositorySlug,
    repositoryName,
    branch: `feature/${issueKey.toLowerCase()}`,
    jiraIssueKey: issueKey,
    pullRequestId,
    dateKey,
    commitCount,
    firstCommitISO: first.toISOString(),
    lastCommitISO: last.toISOString(),
    estimatedSeconds: durationSeconds,
    primaryMessage: message,
    confidence
  };
};

const buildBitbucketReviewResult = ({
  weekStart,
  today,
  sessions,
  commitGroups
}: {
  weekStart: Date;
  today: Date;
  sessions: BitbucketReviewSession[];
  commitGroups: BitbucketCommitGroup[];
}): BitbucketReviewSyncResult => ({
  weekKey: toLocalDateKey(weekStart),
  weekStartISO: weekStart.toISOString(),
  weekEndExclusiveISO: addDays(weekStart, 7).toISOString(),
  syncedAt: today.toISOString(),
  accountId: "demo-bitbucket-account",
  displayName: "Demo Reviewer",
  workspace: "timebro-demo",
  repositoryCount: new Set(sessions.map((session) => session.repositorySlug)).size,
  pullRequestCount: new Set(sessions.map((session) => `${session.repositorySlug}#${session.pullRequestId}`)).size,
  sessionCount: sessions.length,
  sessions,
  commitGroups
});

const buildSyncResult = ({
  weekStart,
  today,
  logs,
  ticketsByKey
}: {
  weekStart: Date;
  today: Date;
  logs: JiraWorklog[];
  ticketsByKey: Map<string, JiraTicket>;
}): SyncResult => {
  const daySummaries: Record<string, SyncDayBucket> = {};
  const issueKeys = new Set<string>();

  for (const log of logs) {
    const dateKey = toLocalDateKey(new Date(log.started));
    const bucket = (daySummaries[dateKey] ??= {
      trackedSeconds: 0,
      issues: [],
      worklogs: []
    });
    const sourceTicket = ticketsByKey.get(log.issueKey);
    let issue = bucket.issues.find((candidate) => candidate.key === log.issueKey);

    if (!issue) {
      issue = {
        id: log.issueId,
        key: log.issueKey,
        summary: log.issueSummary,
        url: sourceTicket?.url,
        issueType: log.issueType,
        loggedSeconds: 0,
        comments: []
      };
      bucket.issues.push(issue);
    }

    issue.loggedSeconds += log.timeSpentSeconds;
    if (log.comment && !issue.comments?.includes(log.comment)) {
      issue.comments = [...(issue.comments ?? []), log.comment];
    }

    bucket.trackedSeconds += log.timeSpentSeconds;
    bucket.worklogs.push(log);
    issueKeys.add(log.issueKey);
  }

  for (const bucket of Object.values(daySummaries)) {
    bucket.issues.sort((a: JiraIssueSummary, b: JiraIssueSummary) => b.loggedSeconds - a.loggedSeconds);
    bucket.worklogs.sort((a, b) => new Date(a.started).getTime() - new Date(b.started).getTime());
  }

  const syncedAt = new Date(today);
  syncedAt.setHours(15, 8, 0, 0);
  const trackedSeconds = logs.reduce((sum, log) => sum + log.timeSpentSeconds, 0);

  return {
    weekKey: toLocalDateKey(weekStart),
    weekStartISO: weekStart.toISOString(),
    weekEndExclusiveISO: addDays(weekStart, 7).toISOString(),
    syncedAt: syncedAt.toISOString(),
    accountId: ACCOUNT_ID,
    displayName: "Demo Timekeeper",
    trackedSeconds,
    issueCount: issueKeys.size,
    worklogCount: logs.length,
    daySummaries
  };
};

export const createDemoScenario = (config: DemoConfig): DemoScenario => {
  const random = seededRandom(config.seed);
  const notes = NOTE_SETS[Math.floor(random() * NOTE_SETS.length)] ?? NOTE_SETS[0];
  const today = new Date(config.today);
  const weekStart = startOfWeekMonday(today);
  const mondayKey = toLocalDateKey(weekStart);
  const tuesdayKey = toLocalDateKey(addDays(weekStart, 1));
  const todayKey = toLocalDateKey(today);
  const thursdayKey = toLocalDateKey(addDays(weekStart, 3));
  const fridayKey = toLocalDateKey(addDays(weekStart, 4));

  const inProgress = [
    ticket({
      id: "demo-204",
      key: "FTDM-204",
      summary: "Rework weekly progress model for skipped days",
      projectName: "Feature Team Data Management",
      statusName: "In Progress",
      statusCategory: "indeterminate",
      loggedSecondsTotal: seconds(18, 30),
      createdAt: "2026-06-03T09:12:00.000Z",
      issueType: ISSUE_TYPES.story
    }),
    ticket({
      id: "demo-401",
      key: "FTDM-401",
      summary: "Polish Add Time modal keyboard flow",
      projectName: "Feature Team Data Management",
      statusName: "In Review",
      statusCategory: "indeterminate",
      loggedSecondsTotal: seconds(6, 45),
      createdAt: "2026-06-21T15:20:00.000Z",
      issueType: ISSUE_TYPES.subtask
    }),
    ticket({
      id: "demo-088",
      key: "WEB-88",
      summary: "Tighten dashboard spacing for release screenshots",
      projectName: "Web Experience",
      statusName: "Design QA",
      statusCategory: "indeterminate",
      loggedSecondsTotal: seconds(11, 15),
      createdAt: "2026-06-12T10:00:00.000Z",
      issueType: ISSUE_TYPES.task
    }),
    ticket({
      id: "demo-077",
      key: "OPS-77",
      summary: "Investigate stale Jira worklog sync window",
      projectName: "Operations",
      statusName: "Blocked",
      statusCategory: "indeterminate",
      loggedSecondsTotal: seconds(9),
      createdAt: "2026-06-18T07:45:00.000Z",
      issueType: ISSUE_TYPES.bug
    }),
    ticket({
      id: "demo-142",
      key: "PAY-142",
      summary: "Replace token copy in onboarding settings",
      projectName: "Payments Platform",
      statusName: "Ready",
      statusCategory: "new",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-20T12:30:00.000Z",
      issueType: ISSUE_TYPES.epic
    }),
    ticket({
      id: "demo-512",
      key: "FTDM-512",
      summary: "Normalize Jira ticket picker filters",
      projectName: "Feature Team Data Management",
      statusName: "Selected for Development",
      statusCategory: "new",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-22T08:20:00.000Z",
      issueType: ISSUE_TYPES.task
    }),
    ticket({
      id: "demo-506",
      key: "FTDM-506",
      summary: "Backfill created date in ticket summaries",
      projectName: "Feature Team Data Management",
      statusName: "In Progress",
      statusCategory: "indeterminate",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-19T09:05:00.000Z",
      issueType: ISSUE_TYPES.story
    }),
    ticket({
      id: "demo-044",
      key: "QA-44",
      summary: "Audit Add Time dropdown scroll behavior",
      projectName: "Quality Assurance",
      statusName: "Ready",
      statusCategory: "new",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-17T13:40:00.000Z",
      issueType: ISSUE_TYPES.task
    }),
    ticket({
      id: "demo-215",
      key: "MOB-215",
      summary: "Check compact picker layout on narrow screens",
      projectName: "Mobile Experience",
      statusName: "In Progress",
      statusCategory: "indeterminate",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-16T11:25:00.000Z",
      issueType: ISSUE_TYPES.bug
    }),
    ticket({
      id: "demo-118",
      key: "OPS-118",
      summary: "Document Jira API pagination limits",
      projectName: "Operations",
      statusName: "Selected for Development",
      statusCategory: "new",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-15T16:10:00.000Z",
      issueType: ISSUE_TYPES.story
    }),
    ticket({
      id: "demo-094",
      key: "WEB-94",
      summary: "Refresh demo ticket search fixtures",
      projectName: "Web Experience",
      statusName: "Ready",
      statusCategory: "new",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-14T10:05:00.000Z",
      issueType: ISSUE_TYPES.task
    }),
    ticket({
      id: "demo-063",
      key: "DOC-63",
      summary: "Clarify created-date sorting copy",
      projectName: "Documentation",
      statusName: "In Progress",
      statusCategory: "indeterminate",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-13T08:50:00.000Z",
      issueType: ISSUE_TYPES.task
    }),
    ticket({
      id: "demo-336",
      key: "UX-336",
      summary: "Review picker control labels",
      projectName: "User Experience",
      statusName: "Design QA",
      statusCategory: "indeterminate",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-11T14:35:00.000Z",
      issueType: ISSUE_TYPES.story
    }),
    ticket({
      id: "demo-028",
      key: "QA-28",
      summary: "Replay keyboard selection after sorting",
      projectName: "Quality Assurance",
      statusName: "Ready",
      statusCategory: "new",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-10T10:20:00.000Z",
      issueType: ISSUE_TYPES.subtask
    }),
    ticket({
      id: "demo-071",
      key: "OPS-71",
      summary: "Trace assigned-only Jira search scope",
      projectName: "Operations",
      statusName: "In Progress",
      statusCategory: "indeterminate",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-09T12:15:00.000Z",
      issueType: ISSUE_TYPES.task
    }),
    ticket({
      id: "demo-052",
      key: "WEB-52",
      summary: "Polish ticket row truncation",
      projectName: "Web Experience",
      statusName: "Ready",
      statusCategory: "new",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-08T09:30:00.000Z",
      issueType: ISSUE_TYPES.task
    }),
    ticket({
      id: "demo-017",
      key: "INT-17",
      summary: "Prepare integration test notes",
      projectName: "Integrations",
      statusName: "Selected for Development",
      statusCategory: "new",
      loggedSecondsTotal: 0,
      createdAt: "2026-06-06T15:45:00.000Z",
      issueType: ISSUE_TYPES.story
    })
  ];

  const recentlyClosed = [
    ticket({
      id: "demo-031",
      key: "UX-31",
      summary: "Review notes popover affordance",
      projectName: "User Experience",
      statusName: "Done",
      statusCategory: "done",
      loggedSecondsTotal: seconds(5, 30),
      createdAt: "2026-05-29T11:15:00.000Z",
      issueType: ISSUE_TYPES.task
    }),
    ticket({
      id: "demo-019",
      key: "DOC-19",
      summary: "Draft release screenshot workflow",
      projectName: "Documentation",
      statusName: "Done",
      statusCategory: "done",
      loggedSecondsTotal: seconds(3, 30),
      createdAt: "2026-05-24T14:05:00.000Z",
      issueType: ISSUE_TYPES.story
    })
  ];

  const allTickets = [...inProgress, ...recentlyClosed];
  const ticketsByKey = new Map(allTickets.map((candidate) => [candidate.key, candidate]));
  const byKey = (key: string) => ticketsByKey.get(key)!;

  const logs = [
    worklog({
      id: "demo-wl-1001",
      ticket: byKey("FTDM-204"),
      dateKey: mondayKey,
      time: "09:10",
      duration: seconds(2, 15),
      comment: notes[0]
    }),
    worklog({
      id: "demo-wl-1002",
      ticket: byKey("OPS-77"),
      dateKey: mondayKey,
      time: "11:40",
      duration: seconds(1, 30),
      comment: "Checked the retry path with a fake Jira tenant."
    }),
    worklog({
      id: "demo-wl-1003",
      ticket: byKey("UX-31"),
      dateKey: mondayKey,
      time: "13:30",
      duration: seconds(3),
      comment: notes[1]
    }),
    worklog({
      id: "demo-wl-1004",
      ticket: byKey("DOC-19"),
      dateKey: mondayKey,
      time: "16:35",
      duration: seconds(3, 30),
      comment: "Turned the screenshot plan into a release checklist."
    }),
    worklog({
      id: "demo-wl-1005",
      ticket: byKey("FTDM-204"),
      dateKey: tuesdayKey,
      time: "09:20",
      duration: seconds(3, 30),
      comment: "Moved Monday-local calculations behind a focused helper."
    }),
    worklog({
      id: "demo-wl-1006",
      ticket: byKey("WEB-88"),
      dateKey: tuesdayKey,
      time: "13:10",
      duration: seconds(2),
      comment: "Captured dark-mode spacing notes for the week board."
    }),
    worklog({
      id: "demo-wl-1007",
      ticket: byKey("OPS-77"),
      dateKey: tuesdayKey,
      time: "15:25",
      duration: seconds(3, 15),
      comment: notes[2]
    }),
    worklog({
      id: "demo-wl-1008",
      ticket: byKey("FTDM-401"),
      dateKey: todayKey,
      time: "09:30",
      duration: seconds(2, 15),
      comment: "Replayed the composer flow with seeded ticket options."
    }),
    worklog({
      id: "demo-wl-1009",
      ticket: byKey("WEB-88"),
      dateKey: todayKey,
      time: "12:45",
      duration: seconds(1, 45),
      comment: "Adjusted screenshot crops for blog-friendly framing."
    }),
    worklog({
      id: "demo-wl-1010",
      ticket: byKey("FTDM-204"),
      dateKey: todayKey,
      time: "15:00",
      duration: seconds(2),
      comment: "Checked the skipped Friday redistribution in reports."
    })
  ];

  const reviewSessions = [
    reviewSession({
      workspace: "timebro-demo",
      repositorySlug: "explorer-web",
      repositoryName: "explorer-web",
      pullRequestId: 214,
      title: "Active interrupt handling for poller",
      issueKey: "FTDM-328",
      dateKey: mondayKey,
      time: "09:40",
      duration: seconds(0, 45),
      label: "APPROVED",
      comments: 9,
      author: "Mira Novak"
    }),
    reviewSession({
      workspace: "timebro-demo",
      repositorySlug: "explorer-web",
      repositoryName: "explorer-web",
      pullRequestId: 221,
      title: "Add documents dialog empty states",
      issueKey: "FTDM-363",
      dateKey: tuesdayKey,
      time: "11:00",
      duration: seconds(1),
      label: "CHANGES",
      comments: 12,
      author: "Jules Patel"
    }),
    reviewSession({
      workspace: "timebro-demo",
      repositorySlug: "auth",
      repositoryName: "auth",
      pullRequestId: 219,
      title: "Bump keycloak-admin-client",
      issueKey: "FTDM-391",
      dateKey: tuesdayKey,
      time: "16:10",
      duration: seconds(0, 20),
      label: "COMMENTED",
      comments: 3,
      isOwnPullRequest: true,
      confidence: "medium"
    }),
    reviewSession({
      workspace: "timebro-demo",
      repositorySlug: "explorer-core",
      repositoryName: "explorer-core",
      pullRequestId: 226,
      title: "Interrupt-safe queue draining",
      issueKey: "FTDM-410",
      dateKey: todayKey,
      time: "10:15",
      duration: seconds(1, 5),
      label: "CHANGES",
      comments: 14,
      author: "Lina Park"
    }),
    reviewSession({
      workspace: "timebro-demo",
      repositorySlug: "explorer-core",
      repositoryName: "explorer-core",
      pullRequestId: 230,
      title: "Scaffold monorepo domains",
      issueKey: "FTDM-393",
      dateKey: thursdayKey,
      time: "15:20",
      duration: seconds(0, 30),
      label: "COMMENTED",
      comments: 5,
      author: "Mateo Silva",
      confidence: "medium"
    }),
    reviewSession({
      workspace: "timebro-demo",
      repositorySlug: "explorer-web",
      repositoryName: "explorer-web",
      pullRequestId: 231,
      title: "Edge cases in poller interrupts",
      issueKey: "FTDM-377",
      dateKey: thursdayKey,
      time: "13:00",
      duration: seconds(0, 25),
      label: "APPROVED",
      comments: 6,
      isOwnPullRequest: true
    })
  ];

  const commitGroups = [
    commitGroup({
      repositorySlug: "explorer-web",
      repositoryName: "explorer-web",
      pullRequestId: 220,
      issueKey: "FTDM-328",
      dateKey: mondayKey,
      time: "09:12",
      durationSeconds: seconds(1, 50),
      commitCount: 5,
      message: "Add auth middleware"
    }),
    commitGroup({
      repositorySlug: "api",
      repositoryName: "api",
      pullRequestId: 224,
      issueKey: "FTDM-377",
      dateKey: tuesdayKey,
      time: "10:25",
      durationSeconds: seconds(1, 10),
      commitCount: 3,
      message: "Refactor cursor pagination",
      confidence: "medium"
    }),
    commitGroup({
      repositorySlug: "explorer-web",
      repositoryName: "explorer-web",
      pullRequestId: 230,
      issueKey: "FTDM-410",
      dateKey: todayKey,
      time: "09:20",
      durationSeconds: seconds(2, 5),
      commitCount: 7,
      message: "Interrupt-safe queue draining"
    })
  ];

  return {
    today,
    weekStart,
    settings: {
      jiraBaseUrl: DEMO_JIRA_BASE_URL,
      jiraEmail: "demo.user@example.test",
      jiraApiToken: "demo-token-not-real",
      bitbucketEmail: "demo.user@example.test",
      bitbucketApiToken: "demo-bitbucket-token-not-real",
      bitbucketWorkspace: "timebro-demo",
      bitbucketRepositories: "explorer-web, explorer-core, auth",
      bitbucketReviewBucketIssueKey: "FTDM-999",
      weeklyTargetHours: 40,
      workingDays: [1, 2, 3, 4, 5],
      reminderTime: "16:30",
      remindersEnabled: true,
      aiEnabled: false,
      ollamaEndpoint: "http://localhost:11434",
      ollamaModel: "llama3.1:8b",
    },
    weekOverride: {
      weekKey: toLocalDateKey(weekStart),
      skippedDates: [fridayKey]
    },
    syncResult: buildSyncResult({ weekStart, today, logs, ticketsByKey }),
    bitbucketReviewResult: buildBitbucketReviewResult({ weekStart, today, sessions: reviewSessions, commitGroups }),
    tickets: {
      fetchedAt: today.toISOString(),
      accountId: ACCOUNT_ID,
      inProgress,
      recentlyClosed
    },
    favoriteKeys: ["FTDM-204", "PAY-142", "WEB-88"],
    selectedTicket: byKey("FTDM-401")
  };
};
