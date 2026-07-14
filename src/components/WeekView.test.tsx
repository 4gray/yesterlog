import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SyncResult, WeekState } from "../../shared/types";
import { isQuickLogIntervalAvailable, quickLogStartedAt, WeekView } from "./WeekView";

const weekState: WeekState = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-14T22:00:00.000Z",
  weekEndExclusiveISO: "2026-06-21T22:00:00.000Z",
  weekRangeLabel: "Jun 15-21",
  weeklyTargetHours: 40,
  trackedWeekHours: 4,
  jiraTrackedWeekHours: 2,
  personalNoteHours: 2,
  remainingWeekHours: 36,
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
      trackedHours: 4,
      missingHours: 4,
      issues: [
        {
          id: "133470",
          key: "FTDM-397",
          summary: "Restructure the access domain in nx monorepo",
          url: "https://elevait.atlassian.net/browse/FTDM-397",
          issueType: { name: "Epic", hierarchyLevel: 1 },
          loggedSeconds: 2 * 3600,
          comments: ["Follow-up on access package structure"]
        }
      ],
      personalNotes: [
        {
          id: "note-1",
          weekKey: "2026-06-15",
          dateKey: "2026-06-18",
          text: "Mentored a teammate on release planning",
          timeSpentSeconds: 2 * 3600,
          startedISO: "2026-06-18T12:00:00.000Z",
          createdAt: "2026-06-18T12:00:00.000Z",
          updatedAt: "2026-06-18T12:00:00.000Z"
        }
      ],
      recurringEntries: [],
      pendingRecurring: []
    }
  ],
  recurringTrackedHours: 0
};

const syncResult: SyncResult = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-14T22:00:00.000Z",
  weekEndExclusiveISO: "2026-06-21T22:00:00.000Z",
  syncedAt: "2026-06-18T12:00:00.000Z",
  accountId: "account-1",
  trackedSeconds: 2 * 3600,
  issueCount: 1,
  worklogCount: 1,
  daySummaries: {
    "2026-06-18": {
      trackedSeconds: 2 * 3600,
      issues: weekState.days[0].issues,
      worklogs: [
        {
          id: "2001",
          issueId: "133470",
          issueKey: "FTDM-397",
          issueSummary: "Restructure the access domain in nx monorepo",
          issueUrl: "https://elevait.atlassian.net/browse/FTDM-397",
          issueType: { name: "Epic", hierarchyLevel: 1 },
          authorAccountId: "account-1",
          started: "2026-06-18T08:00:00.000Z",
          timeSpentSeconds: 2 * 3600,
          comment: "Follow-up on access package structure"
        }
      ]
    }
  }
};

describe("WeekView", () => {
  it("starts summary quick logs retrospectively so they end at the current clock time", () => {
    const started = quickLogStartedAt({
      dateKey: "2026-06-18",
      currentDate: new Date(2026, 5, 18, 14, 37, 42, 123),
      timeSpentSeconds: 2.5 * 3600
    });

    expect(started.getFullYear()).toBe(2026);
    expect(started.getMonth()).toBe(5);
    expect(started.getDate()).toBe(18);
    expect(started.getHours()).toBe(12);
    expect(started.getMinutes()).toBe(7);
    expect(started.getSeconds()).toBe(0);
    expect(started.getMilliseconds()).toBe(0);
  });

  it("keeps the explicit start selected by a Timeline drop", () => {
    const started = quickLogStartedAt({
      dateKey: "2026-06-18",
      currentDate: new Date(2026, 5, 18, 14, 37),
      timeSpentSeconds: 2 * 3600,
      startedMinutes: 9 * 60 + 15
    });

    expect(started.getHours()).toBe(9);
    expect(started.getMinutes()).toBe(15);
  });

  it("blocks a retrospective summary quick log that overlaps committed work", () => {
    const available = isQuickLogIntervalAvailable({
      dateKey: "2026-06-18",
      currentDate: new Date(2026, 5, 18, 14, 0),
      timeSpentSeconds: 60 * 60,
      committedItems: [
        {
          id: "wl:existing",
          kind: "worklog",
          startMin: 13 * 60,
          endMin: 14 * 60,
          colorRole: "accent",
          layer: "committed"
        }
      ]
    });

    expect(available).toBe(false);
  });

  it("allows a retrospective summary quick log in an empty interval", () => {
    const available = isQuickLogIntervalAvailable({
      dateKey: "2026-06-18",
      currentDate: new Date(2026, 5, 18, 15, 0),
      timeSpentSeconds: 60 * 60,
      committedItems: [
        {
          id: "wl:existing",
          kind: "worklog",
          startMin: 13 * 60,
          endMin: 14 * 60,
          colorRole: "accent",
          layer: "committed"
        }
      ]
    });

    expect(available).toBe(true);
  });

  it("shows Jira link icons next to week ticket keys", () => {
    const markup = renderToStaticMarkup(
      <WeekView
        weekState={weekState}
        syncResult={syncResult}
        isSyncing={false}
        isConfigured={true}
        onSync={() => undefined}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
        onAddTime={() => undefined}
        onMoveWorklog={async () => true}
        onEditWorklog={() => undefined}
        onEditPersonalNote={() => undefined}
        onToggleSkipped={() => undefined}
      />
    );

    expect(markup).toContain("FTDM-397");
    expect(markup).toContain("https://elevait.atlassian.net/browse/FTDM-397");
    expect(markup).toContain("Open FTDM-397 in Jira");
    expect(markup.match(/href="https:\/\/elevait\.atlassian\.net\/browse\/FTDM-397"/g)).toHaveLength(1);
    expect(markup.match(/Open FTDM-397 in Jira/g)).toHaveLength(2);
    expect(markup).toContain("EPIC");
    expect(markup).toContain("Edit worklog for FTDM-397");
    expect(markup.match(/Edit worklog for FTDM-397/g)).toHaveLength(1);
    expect(markup).toContain("Mentored a teammate on release planning");
    expect(markup).toContain("NOTE");
    expect(markup).toContain("Edit personal note");
    expect(markup).toContain(">2h</span>");
    expect(markup).not.toContain("2h 00m");
  });

  it("renders confirmed recurring entries as LOCAL rows and unresolved ones as pending suggestions", () => {
    const recurringWeek: WeekState = {
      ...weekState,
      recurringTrackedHours: 0.25,
      days: [
        {
          ...weekState.days[0],
          recurringEntries: [
            {
              eventId: "rec-daily",
              dateKey: "2026-06-18",
              title: "Daily Standup",
              localTime: "09:15",
              timeSpentSeconds: 15 * 60,
              note: "Daily sync — blockers"
            }
          ],
          pendingRecurring: [
            {
              eventId: "rec-sync",
              dateKey: "2026-06-18",
              title: "Weekly Team Sync",
              localTime: "15:00",
              defaultDurationMinutes: 30,
              defaultNote: "Team weekly"
            }
          ]
        }
      ]
    };

    const markup = renderToStaticMarkup(
      <WeekView
        weekState={recurringWeek}
        syncResult={syncResult}
        isSyncing={false}
        isConfigured={true}
        onSync={() => undefined}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
        onAddTime={() => undefined}
        onMoveWorklog={async () => true}
        onEditWorklog={() => undefined}
        onEditPersonalNote={() => undefined}
        onToggleSkipped={() => undefined}
        onConfirmRecurring={async () => true}
        onSkipRecurring={async () => true}
        onDeleteRecurring={async () => true}
      />
    );

    // Confirmed occurrence renders like a note: EVENT eyebrow + title + text +
    // a minute-aware duration, plus edit/delete affordances.
    expect(markup).toContain("EVENT");
    expect(markup).toContain("Daily Standup");
    expect(markup).toContain("Daily sync — blockers");
    expect(markup).toContain(">15m</span>");
    expect(markup).toContain("Edit Daily Standup");
    expect(markup).not.toContain("LOCAL");
    // Unresolved occurrence renders as a pending suggestion with icon actions
    // that explain themselves via tooltips / aria-labels.
    expect(markup).toContain("Weekly Team Sync");
    expect(markup).toContain("Log 30m locally");
    expect(markup).toContain("Skip today");
    expect(markup).toContain("Adjust duration and note");
  });

  it("omits recurring pending cards when no confirm handlers are wired", () => {
    const pendingOnly: WeekState = {
      ...weekState,
      days: [
        {
          ...weekState.days[0],
          pendingRecurring: [
            {
              eventId: "rec-sync",
              dateKey: "2026-06-18",
              title: "Weekly Team Sync",
              localTime: "15:00",
              defaultDurationMinutes: 30,
              defaultNote: "Team weekly"
            }
          ]
        }
      ]
    };

    const markup = renderToStaticMarkup(
      <WeekView
        weekState={pendingOnly}
        syncResult={syncResult}
        isSyncing={false}
        isConfigured={true}
        onSync={() => undefined}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
        onAddTime={() => undefined}
        onMoveWorklog={async () => true}
        onEditWorklog={() => undefined}
        onEditPersonalNote={() => undefined}
        onToggleSkipped={() => undefined}
      />
    );

    expect(markup).not.toContain("Weekly Team Sync");
  });

  it("renders one day column per configured working day in week state", () => {
    const threeDayWeek: WeekState = {
      ...weekState,
      days: [
        { ...weekState.days[0], dateKey: "2026-06-15", weekdayName: "Monday", issues: [], personalNotes: [] },
        { ...weekState.days[0], dateKey: "2026-06-17", weekdayName: "Wednesday", issues: [], personalNotes: [] },
        { ...weekState.days[0], dateKey: "2026-06-21", weekdayName: "Sunday", issues: [], personalNotes: [] }
      ]
    };

    const markup = renderToStaticMarkup(
      <WeekView
        weekState={threeDayWeek}
        syncResult={undefined}
        isSyncing={false}
        isConfigured={true}
        onSync={() => undefined}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
        onAddTime={() => undefined}
        onMoveWorklog={async () => true}
        onEditWorklog={() => undefined}
        onEditPersonalNote={() => undefined}
        onToggleSkipped={() => undefined}
      />
    );

    expect(markup.match(/data-drop-day=/g)).toHaveLength(3);
    expect(markup).toContain("MON");
    expect(markup).toContain("WED");
    expect(markup).toContain("SUN");
  });
});
