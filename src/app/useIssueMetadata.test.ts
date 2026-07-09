import { describe, expect, it } from "vitest";
import type {
  BitbucketReviewSyncResult,
  DayTrackingSummary,
  JiraIssueSummary,
  JiraTicket,
  JiraWorklog,
  PersonalNote,
  SyncDayBucket,
  SyncResult,
  TicketsResult,
  WeekState
} from "../../shared/types";
import { buildIssueMetadata } from "./useIssueMetadata";

const issueType = (name: string) => ({ name });

const buildIssue = (key: string, overrides: Partial<JiraIssueSummary> = {}): JiraIssueSummary => ({
  id: key,
  key,
  summary: `${key} summary`,
  loggedSeconds: 3600,
  ...overrides
});

const buildWorklog = (issueKey: string, overrides: Partial<JiraWorklog> = {}): JiraWorklog => ({
  id: `${issueKey}-worklog`,
  issueId: issueKey,
  issueKey,
  issueSummary: `${issueKey} summary`,
  authorAccountId: "account-1",
  started: "2026-06-17T09:00:00.000Z",
  timeSpentSeconds: 1800,
  ...overrides
});

const buildBucket = (overrides: Partial<SyncDayBucket> = {}): SyncDayBucket => ({
  trackedSeconds: 0,
  issues: [],
  worklogs: [],
  ...overrides
});

const buildSyncResult = (overrides: Partial<SyncResult> = {}): SyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-17T12:00:00.000Z",
  accountId: "account-1",
  trackedSeconds: 0,
  issueCount: 0,
  worklogCount: 0,
  daySummaries: {},
  ...overrides
});

const buildReviewResult = (overrides: Partial<BitbucketReviewSyncResult> = {}): BitbucketReviewSyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-17T12:00:00.000Z",
  workspace: "timebro",
  repositoryCount: 1,
  pullRequestCount: 1,
  sessionCount: 0,
  sessions: [],
  ...overrides
});

const buildTicket = (key: string, overrides: Partial<JiraTicket> = {}): JiraTicket => ({
  id: key,
  key,
  summary: `${key} summary`,
  projectKey: key.split("-")[0],
  projectName: "TimeBro",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  url: `https://jira.example/browse/${key}`,
  ...overrides
});

const buildNote = (id: string, overrides: Partial<PersonalNote> = {}): PersonalNote => ({
  id,
  weekKey: "2026-06-15",
  dateKey: "2026-06-17",
  text: id,
  timeSpentSeconds: 1800,
  startedISO: "2026-06-17T09:00:00.000Z",
  createdAt: "2026-06-17T09:00:00.000Z",
  updatedAt: "2026-06-17T09:00:00.000Z",
  ...overrides
});

const buildDay = (overrides: Partial<DayTrackingSummary> = {}): DayTrackingSummary => ({
  dateKey: "2026-06-17",
  dateLabel: "Jun 17",
  weekdayName: "Wed",
  isToday: true,
  isConfiguredWorkingDay: true,
  isSkipped: false,
  targetHours: 8,
  trackedHours: 3,
  missingHours: 5,
  issues: [],
  personalNotes: [],
  recurringEntries: [],
  pendingRecurring: [],
  ...overrides
});

const buildWeekState = (overrides: Partial<WeekState> = {}): WeekState => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  weekRangeLabel: "Jun 15-21",
  weeklyTargetHours: 40,
  trackedWeekHours: 0,
  jiraTrackedWeekHours: 0,
  personalNoteHours: 0,
  recurringTrackedHours: 0,
  remainingWeekHours: 40,
  dailyTargetHours: 8,
  activeWorkingDates: ["2026-06-17"],
  skippedDates: [],
  days: [buildDay()],
  ...overrides
});

const buildTicketsResult = (overrides: Partial<TicketsResult> = {}): TicketsResult => ({
  fetchedAt: "2026-06-17T12:00:00.000Z",
  accountId: "account-1",
  inProgress: [buildTicket("TB-1")],
  recentlyClosed: [],
  ...overrides
});

describe("issue metadata", () => {
  it("scopes sync and review results to the visible week", () => {
    const weekState = buildWeekState();
    const currentSync = buildSyncResult();
    const currentReview = buildReviewResult();

    expect(
      buildIssueMetadata({
        currentDate: new Date("2026-06-17T12:00:00.000Z"),
        weekState,
        syncResult: currentSync,
        bitbucketReviewResult: currentReview
      })
    ).toMatchObject({
      visibleSyncResult: currentSync,
      visibleBitbucketReviewResult: currentReview
    });

    const stale = buildIssueMetadata({
      currentDate: new Date("2026-06-17T12:00:00.000Z"),
      weekState,
      syncResult: buildSyncResult({ weekKey: "2026-06-08" }),
      bitbucketReviewResult: buildReviewResult({ weekKey: "2026-06-08" })
    });

    expect(stale.visibleSyncResult).toBeUndefined();
    expect(stale.visibleBitbucketReviewResult).toBeUndefined();
    expect(stale.hoursByKey).toEqual({});
  });

  it("builds issue hours, URLs, and issue types with selected ticket precedence", () => {
    const syncResult = buildSyncResult({
      daySummaries: {
        "2026-06-16": buildBucket({
          issues: [
            buildIssue("TB-1", {
              loggedSeconds: 1800,
              url: "https://jira.example/browse/TB-1-sync",
              issueType: issueType("Story")
            })
          ]
        }),
        "2026-06-17": buildBucket({
          issues: [
            buildIssue("TB-1", { loggedSeconds: 5400 }),
            buildIssue("TB-2", {
              loggedSeconds: 3600,
              url: "https://jira.example/browse/TB-2-sync",
              issueType: issueType("Bug")
            })
          ]
        })
      }
    });
    const tickets = buildTicketsResult({
      inProgress: [
        buildTicket("TB-1", {
          url: "https://jira.example/browse/TB-1-ticket",
          issueType: issueType("Task")
        })
      ],
      recentlyClosed: [
        buildTicket("TB-3", {
          url: "https://jira.example/browse/TB-3-ticket",
          issueType: issueType("Spike")
        })
      ]
    });
    const selectedTicket = buildTicket("TB-1", {
      url: "https://jira.example/browse/TB-1-selected",
      issueType: issueType("Sub-task")
    });
    const visibleWeekState = buildWeekState({
      activeWorkingDates: ["2026-06-16", "2026-06-17"],
      days: [
        buildDay({ dateKey: "2026-06-16", weekdayName: "Tue", isToday: false }),
        buildDay({ dateKey: "2026-06-17", weekdayName: "Wed", isToday: true })
      ]
    });

    const metadata = buildIssueMetadata({
      currentDate: new Date("2026-06-17T12:00:00.000Z"),
      weekState: visibleWeekState,
      syncResult,
      tickets,
      selectedTicket
    });

    expect(metadata.hoursByKey).toEqual({
      "TB-1": 2,
      "TB-2": 1
    });
    expect(metadata.issueUrlsByKey).toEqual({
      "TB-1": "https://jira.example/browse/TB-1-selected",
      "TB-2": "https://jira.example/browse/TB-2-sync",
      "TB-3": "https://jira.example/browse/TB-3-ticket"
    });
    expect(metadata.issueTypesByKey).toEqual({
      "TB-1": issueType("Sub-task"),
      "TB-2": issueType("Bug"),
      "TB-3": issueType("Spike")
    });
  });

  it("scopes issue hour badges to visible week days while preserving synced metadata", () => {
    const syncResult = buildSyncResult({
      daySummaries: {
        "2026-06-16": buildBucket({
          issues: [
            buildIssue("TB-1", {
              loggedSeconds: 7200,
              url: "https://jira.example/browse/TB-1-hidden",
              issueType: issueType("Bug")
            })
          ]
        }),
        "2026-06-17": buildBucket({
          issues: [
            buildIssue("TB-2", {
              loggedSeconds: 3600,
              url: "https://jira.example/browse/TB-2-visible",
              issueType: issueType("Story")
            })
          ]
        })
      }
    });

    const metadata = buildIssueMetadata({
      currentDate: new Date("2026-06-17T12:00:00.000Z"),
      weekState: buildWeekState({ days: [buildDay({ dateKey: "2026-06-17" })] }),
      syncResult
    });

    expect(metadata.hoursByKey).toEqual({
      "TB-2": 1
    });
    expect(metadata.issueUrlsByKey).toEqual({
      "TB-1": "https://jira.example/browse/TB-1-hidden",
      "TB-2": "https://jira.example/browse/TB-2-visible"
    });
    expect(metadata.issueTypesByKey).toEqual({
      "TB-1": issueType("Bug"),
      "TB-2": issueType("Story")
    });
  });

  it("derives today values and filters in-progress tickets already logged today", () => {
    const todayNote = buildNote("today-note");
    const todayRecurring = {
      eventId: "rec-daily",
      dateKey: "2026-06-17",
      title: "Daily Standup",
      localTime: "09:15",
      timeSpentSeconds: 900
    };
    const todayPending = {
      eventId: "rec-sync",
      dateKey: "2026-06-17",
      title: "Weekly Team Sync",
      localTime: "15:00",
      defaultDurationMinutes: 30,
      defaultNote: "Team weekly"
    };
    const todayBucket = buildBucket({
      trackedSeconds: 7200,
      worklogs: [buildWorklog("TB-1")]
    });
    const syncResult = buildSyncResult({
      daySummaries: {
        "2026-06-17": todayBucket
      }
    });
    const weekState = buildWeekState({
      days: [
        buildDay({
          personalNotes: [todayNote],
          recurringEntries: [todayRecurring],
          pendingRecurring: [todayPending],
          trackedHours: 4
        })
      ]
    });
    const tickets = buildTicketsResult({
      inProgress: [buildTicket("TB-1"), buildTicket("TB-2")],
      recentlyClosed: [buildTicket("TB-3")]
    });

    const metadata = buildIssueMetadata({
      currentDate: new Date("2026-06-17T12:00:00.000Z"),
      weekState,
      syncResult,
      tickets
    });

    expect(metadata.todayKey).toBe("2026-06-17");
    expect(metadata.todayBucket).toBe(todayBucket);
    expect(metadata.todayWorklogs).toEqual([todayBucket.worklogs[0]]);
    expect(metadata.todayPersonalNotes).toEqual([todayNote]);
    expect(metadata.todayRecurringEntries).toEqual([todayRecurring]);
    expect(metadata.todayPendingRecurring).toEqual([todayPending]);
    expect(metadata.todayTrackedHours).toBe(4);
    expect(metadata.touchedNotLogged.map((ticket) => ticket.key)).toEqual(["TB-2"]);
  });

  it("falls back to today's Jira bucket when the current date is outside the visible week days", () => {
    const todayBucket = buildBucket({ trackedSeconds: 5400 });
    const metadata = buildIssueMetadata({
      currentDate: new Date("2026-06-20T12:00:00.000Z"),
      weekState: buildWeekState({ days: [buildDay({ dateKey: "2026-06-17" })] }),
      syncResult: buildSyncResult({
        daySummaries: {
          "2026-06-20": todayBucket
        }
      })
    });

    expect(metadata.todaySummary).toBeUndefined();
    expect(metadata.todayBucket).toBe(todayBucket);
    expect(metadata.todayTrackedHours).toBe(1.5);
    expect(metadata.todayWorklogs).toEqual([]);
    expect(metadata.todayPersonalNotes).toEqual([]);
  });

  it("includes local notes when today is not a configured week column", () => {
    const todayBucket = buildBucket({ trackedSeconds: 5400 });
    const hiddenTodayNote = buildNote("hidden-today-note", {
      dateKey: "2026-06-20",
      timeSpentSeconds: 30 * 60
    });

    const metadata = buildIssueMetadata({
      currentDate: new Date("2026-06-20T12:00:00.000Z"),
      weekState: buildWeekState({ days: [buildDay({ dateKey: "2026-06-17" })] }),
      syncResult: buildSyncResult({
        daySummaries: {
          "2026-06-20": todayBucket
        }
      }),
      personalNotes: [hiddenTodayNote]
    });

    expect(metadata.todaySummary).toBeUndefined();
    expect(metadata.todayPersonalNotes).toEqual([hiddenTodayNote]);
    expect(metadata.todayTrackedHours).toBe(2);
  });
});
