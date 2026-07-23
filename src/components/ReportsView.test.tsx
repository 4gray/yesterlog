import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BitbucketReviewSyncResult, WeekState } from "../../shared/types";
import { ReportsView } from "./ReportsView";

const weekState: WeekState = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-14T22:00:00.000Z",
  weekEndExclusiveISO: "2026-06-21T22:00:00.000Z",
  weekRangeLabel: "Jun 15-21",
  weeklyTargetHours: 40,
  trackedWeekHours: 5.5,
  jiraTrackedWeekHours: 5,
  personalNoteHours: 0.5,
  remainingWeekHours: 34.5,
  dailyTargetHours: 8,
  activeWorkingDates: ["2026-06-18"],
  skippedDates: [],
  days: [
    {
      dateKey: "2026-06-18",
      dateLabel: "Jun 18",
      weekdayName: "Thursday",
      isToday: false,
      isConfiguredWorkingDay: true,
      isSkipped: false,
      targetHours: 8,
      trackedHours: 5.5,
      missingHours: 2.5,
      issues: [
        {
          id: "133470",
          key: "YLOG-397",
          summary: "Restructure the access domain in nx monorepo",
          url: "https://elevait.atlassian.net/browse/YLOG-397",
          issueType: { name: "Epic", hierarchyLevel: 1 },
          loggedSeconds: 5 * 3600
        }
      ],
      personalNotes: [
        {
          id: "note-1",
          weekKey: "2026-06-15",
          dateKey: "2026-06-18",
          title: "Interview feedback",
          text: "Wrote up notes from the platform interviews",
          timeSpentSeconds: 30 * 60,
          startedISO: "2026-06-18T12:00:00.000Z",
          createdAt: "2026-06-18T12:00:00.000Z",
          updatedAt: "2026-06-18T12:00:00.000Z"
        },
        {
          id: "note-2",
          weekKey: "2026-06-15",
          dateKey: "2026-06-18",
          title: "1:1 with Dana",
          text: "Career growth check-in",
          timeSpentSeconds: 30 * 60,
          startedISO: "2026-06-18T13:00:00.000Z",
          createdAt: "2026-06-18T13:00:00.000Z",
          updatedAt: "2026-06-18T13:00:00.000Z"
        }
      ],
      recurringEntries: [],
      pendingRecurring: []
    }
  ],
  recurringTrackedHours: 0
};

const reviewResult: BitbucketReviewSyncResult = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-18T18:00:00.000Z",
  accountId: "reviewer",
  workspace: "team",
  repositoryCount: 2,
  pullRequestCount: 2,
  sessionCount: 3,
  sessions: [
    {
      id: "team/explorer-core#226:2026-06-17",
      workspace: "team",
      repositorySlug: "explorer-core",
      repositoryName: "explorer-core",
      pullRequestId: 226,
      pullRequestTitle: "Interrupt-safe queue draining",
      pullRequestUrl: "https://bitbucket.org/team/explorer-core/pull-requests/226",
      pullRequestState: "OPEN",
      pullRequestAuthorDisplayName: "Lina Park",
      isPullRequestAuthor: false,
      jiraIssueKey: "YLOG-410",
      dateKey: "2026-06-17",
      startedISO: "2026-06-17T10:00:00.000Z",
      endedISO: "2026-06-17T11:00:00.000Z",
      estimatedSeconds: 45 * 60,
      reviewStateLabel: "COMMENTED",
      commentCount: 6,
      activityCount: 7,
      confidence: "high",
      events: [],
      status: "logged",
      logged: {
        issueKey: "YLOG-410",
        worklogId: "wl-226",
        loggedAt: "2026-06-17T12:00:00.000Z",
        targetMode: "reviewed-ticket",
        timeSpentSeconds: 60 * 60,
        estimatedSecondsAtLog: 45 * 60
      }
    },
    {
      id: "team/explorer-core#226:2026-06-18",
      workspace: "team",
      repositorySlug: "explorer-core",
      repositoryName: "explorer-core",
      pullRequestId: 226,
      pullRequestTitle: "Interrupt-safe queue draining",
      pullRequestUrl: "https://bitbucket.org/team/explorer-core/pull-requests/226",
      pullRequestState: "OPEN",
      pullRequestAuthorDisplayName: "Lina Park",
      isPullRequestAuthor: false,
      jiraIssueKey: "YLOG-410",
      dateKey: "2026-06-18",
      startedISO: "2026-06-18T13:00:00.000Z",
      endedISO: "2026-06-18T13:20:00.000Z",
      estimatedSeconds: 20 * 60,
      reviewStateLabel: "CHANGES",
      commentCount: 8,
      activityCount: 9,
      confidence: "medium",
      events: [],
      status: "unlogged"
    },
    {
      id: "team/explorer-web#231:2026-06-18",
      workspace: "team",
      repositorySlug: "explorer-web",
      repositoryName: "explorer-web",
      pullRequestId: 231,
      pullRequestTitle: "Edge cases in poller interrupts",
      pullRequestUrl: "https://bitbucket.org/team/explorer-web/pull-requests/231",
      pullRequestState: "OPEN",
      pullRequestAuthorDisplayName: "Demo Reviewer",
      isPullRequestAuthor: true,
      jiraIssueKey: "YLOG-377",
      dateKey: "2026-06-18",
      startedISO: "2026-06-18T15:00:00.000Z",
      endedISO: "2026-06-18T15:30:00.000Z",
      estimatedSeconds: 30 * 60,
      reviewStateLabel: "APPROVED",
      commentCount: 3,
      activityCount: 4,
      confidence: "high",
      events: [],
      status: "unlogged"
    }
  ]
};

describe("ReportsView", () => {
  it("shows ticket titles and Jira links in the by-ticket panel", () => {
    const markup = renderToStaticMarkup(
      <ReportsView
        reportTab="summary"
        weekState={weekState}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
      />
    );

    expect(markup).toContain("YLOG-397");
    expect(markup).toContain("Restructure the access domain in nx monorepo");
    expect(markup).toContain("https://elevait.atlassian.net/browse/YLOG-397");
    expect(markup).toContain("Open YLOG-397 in Jira");
    expect(markup).toContain("EPIC");
    // Personal notes appear as separate rows keyed by their title, not lumped
    // into one aggregated "Personal notes" entry.
    expect(markup).not.toContain("Personal notes");
    expect(markup).toContain("Interview feedback");
    expect(markup).toContain("1:1 with Dana");
    expect(markup).toContain("LOCAL");
    expect(markup).toContain("THIS WEEK");
    expect(markup).toContain("Previous week");
    expect(markup).toContain("Next week");
  });

  it("renders the billable / to-log split in an insight sub-page header", () => {
    const markup = renderToStaticMarkup(
      <ReportsView
        reportTab="composition"
        weekState={weekState}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
      />
    );

    // Same billable-vs-"to log" readout as Today/Summary, driven off week totals
    // (5h Jira billable, 5.5 tracked − 5 = 0.5h local still to log).
    expect(markup).toContain("reports-split");
    expect(markup).toContain("5h billable");
    expect(markup).toContain("0h 30m to log");
  });

  it("uses the configured day count in the days-on-target KPI", () => {
    const threeDayState: WeekState = {
      ...weekState,
      weeklyTargetHours: 30,
      trackedWeekHours: 10,
      jiraTrackedWeekHours: 10,
      personalNoteHours: 0,
      remainingWeekHours: 20,
      dailyTargetHours: 10,
      activeWorkingDates: ["2026-06-15", "2026-06-17", "2026-06-21"],
      days: [
        {
          ...weekState.days[0],
          dateKey: "2026-06-15",
          weekdayName: "Monday",
          targetHours: 10,
          trackedHours: 10,
          issues: [],
          personalNotes: []
        },
        {
          ...weekState.days[0],
          dateKey: "2026-06-17",
          weekdayName: "Wednesday",
          targetHours: 10,
          trackedHours: 0,
          issues: [],
          personalNotes: []
        },
        {
          ...weekState.days[0],
          dateKey: "2026-06-21",
          weekdayName: "Sunday",
          targetHours: 10,
          trackedHours: 0,
          issues: [],
          personalNotes: []
        }
      ]
    };

    const markup = renderToStaticMarkup(
      <ReportsView
        reportTab="summary"
        weekState={threeDayState}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
      />
    );

    expect(markup).toContain("/ 3");
    expect(markup).toContain("MON");
    expect(markup).toContain("WED");
    expect(markup).toContain("SUN");
  });

  it("adds a review teaser without changing the existing weekly totals", () => {
    const markup = renderToStaticMarkup(
      <ReportsView
        reportTab="summary"
        weekState={weekState}
        reviewResult={reviewResult}
        isBitbucketReady
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
      />
    );

    expect(markup).toContain("Code review summary");
    expect(markup).toContain("1h 20m");
    expect(markup).toContain("1h logged + 0h 20m estimated");
    expect(markup).toContain("14");
    expect(markup).toContain("comments by you");
    // Review evidence stays separate: existing WeekState totals remain unchanged.
    expect(markup).toContain("5h Jira of 5.5h");
    expect(markup).toContain("YLOG-397");
  });

  it("renders the read-only Code review report with PR links and effort provenance", () => {
    const markup = renderToStaticMarkup(
      <ReportsView
        reportTab="reviews"
        weekState={weekState}
        reviewResult={reviewResult}
        isBitbucketReady
        issueUrlsByKey={{ "YLOG-410": "https://example.atlassian.net/browse/YLOG-410" }}
        issueTypesByKey={{ "YLOG-410": { name: "Task", hierarchyLevel: 0 } }}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
      />
    );

    expect(markup).toContain("REPORTS / CODE REVIEW");
    expect(markup).toContain("REVIEW EFFORT BY DAY");
    expect(markup).toContain("MOST INVOLVED");
    expect(markup).toContain("PULL REQUEST ACTIVITY");
    expect(markup).toContain("Interrupt-safe queue draining");
    expect(markup).toContain("https://bitbucket.org/team/explorer-core/pull-requests/226");
    expect(markup).toContain("https://example.atlassian.net/browse/YLOG-410");
    expect(markup).toContain("1h logged + 0h 20m estimated");
    expect(markup).toContain("OWN PR");
    expect(markup).toContain("not added to weekly tracked time");
  });

  it("shows an honest empty state before the configured week has been synced", () => {
    const markup = renderToStaticMarkup(
      <ReportsView
        reportTab="reviews"
        weekState={weekState}
        isBitbucketReady
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
      />
    );

    expect(markup).toContain("No Bitbucket review snapshot for this week");
  });

  it("keeps an own-PR-only week separate from peer-review rankings", () => {
    const ownOnly = {
      ...reviewResult,
      pullRequestCount: 1,
      sessionCount: 1,
      sessions: [reviewResult.sessions[2]]
    };
    const markup = renderToStaticMarkup(
      <ReportsView
        reportTab="reviews"
        weekState={weekState}
        reviewResult={ownOnly}
        isBitbucketReady
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
      />
    );

    expect(markup).toContain("This week only contains activity on your own pull requests");
    expect(markup).toContain("OWN PR");
    expect(markup).toContain("0 reviewed / 1 own PR");
  });

  it("falls back to Summary if the saved review tab is unavailable", () => {
    const markup = renderToStaticMarkup(
      <ReportsView
        reportTab="reviews"
        weekState={weekState}
        reviewResult={reviewResult}
        isBitbucketReady={false}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
      />
    );

    expect(markup).toContain("BY TICKET");
    expect(markup).not.toContain("REPORTS / CODE REVIEW");
    expect(markup).not.toContain("Code review summary");
  });
});

const trendWeek = (weekKey: string, overrides: Partial<WeekState>): WeekState => ({
  ...weekState,
  weekKey,
  weekStartISO: `${weekKey}T00:00:00.000Z`,
  weekEndExclusiveISO: `${weekKey}T00:00:00.000Z`,
  weekRangeLabel: weekKey,
  ...overrides
});

const populatedWeek = (weekKey: string, jira: number): WeekState =>
  trendWeek(weekKey, {
    jiraTrackedWeekHours: jira,
    recurringTrackedHours: 4,
    personalNoteHours: 2,
    trackedWeekHours: jira + 6
  });

const emptyWeek = (weekKey: string): WeekState =>
  trendWeek(weekKey, {
    jiraTrackedWeekHours: 0,
    recurringTrackedHours: 0,
    personalNoteHours: 0,
    trackedWeekHours: 0
  });

const renderReports = (tab: "summary" | "trends", current: WeekState, weekStates?: WeekState[]) =>
  renderToStaticMarkup(
    <ReportsView
      reportTab={tab}
      weekState={current}
      weekStates={weekStates}
      onPreviousWeek={() => undefined}
      onCurrentWeek={() => undefined}
      onNextWeek={() => undefined}
    />
  );

describe("ReportsView Summary deltas", () => {
  it("renders week-over-week delta chips once a baseline exists", () => {
    const weeks = [populatedWeek("2026-06-01", 22), populatedWeek("2026-06-08", 18), populatedWeek("2026-06-15", 24)];
    const markup = renderReports("summary", weeks[2], weeks);

    expect(markup).toContain("kpi-delta");
  });

  it("omits delta chips when no history is supplied", () => {
    const markup = renderReports("summary", populatedWeek("2026-06-15", 24));

    expect(markup).not.toContain("kpi-delta");
  });
});

describe("ReportsView Trends tab", () => {
  it("renders KPI deltas, the day overlay and 4-week sparklines with history", () => {
    const weeks = [populatedWeek("2026-06-01", 22), populatedWeek("2026-06-08", 18), populatedWeek("2026-06-15", 24)];
    const markup = renderReports("trends", weeks[2], weeks);

    expect(markup).toContain("TOTAL LOGGED");
    expect(markup).toContain("VS LAST WEEK");
    expect(markup).toContain("overlay-chart");
    expect(markup).toContain("spark-bars");
    // The longer week-over-week line appears once a baseline exists.
    expect(markup).toContain("trend-svg");
    expect(markup).not.toContain("Building baseline");
  });

  it("shows a building-baseline note for the longer view below the threshold", () => {
    const weeks = [emptyWeek("2026-06-01"), emptyWeek("2026-06-08"), populatedWeek("2026-06-15", 24)];
    const markup = renderReports("trends", weeks[2], weeks);

    expect(markup).toContain("Building baseline");
    expect(markup).not.toContain("trend-svg");
  });

  it("shows an empty state when no history is supplied", () => {
    const markup = renderReports("trends", populatedWeek("2026-06-15", 24));

    expect(markup).toContain("Trends compare weeks");
    expect(markup).not.toContain("overlay-chart");
  });
});
