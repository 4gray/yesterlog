import type {
  AppSettings,
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
  tickets: TicketsResult;
  favoriteKeys: string[];
  selectedTicket?: JiraTicket;
}

const DEMO_JIRA_BASE_URL = "https://timebro-demo.example.test";
const ACCOUNT_ID = "demo-account-001";

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
      issueType: ISSUE_TYPES.epic
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

  return {
    today,
    weekStart,
    settings: {
      jiraBaseUrl: DEMO_JIRA_BASE_URL,
      jiraEmail: "demo.user@example.test",
      jiraApiToken: "demo-token-not-real",
      weeklyTargetHours: 40,
      workingDays: [1, 2, 3, 4, 5],
      reminderTime: "16:30",
      remindersEnabled: true
    },
    weekOverride: {
      weekKey: toLocalDateKey(weekStart),
      skippedDates: [fridayKey]
    },
    syncResult: buildSyncResult({ weekStart, today, logs, ticketsByKey }),
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
