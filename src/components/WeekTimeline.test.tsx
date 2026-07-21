import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SyncResult, WeekState } from "../../shared/types";
import { WeekTimeline } from "./WeekTimeline";

const baseDay = {
  dateLabel: "Jun 16",
  isConfiguredWorkingDay: true,
  targetHours: 8,
  trackedHours: 0,
  missingHours: 8,
  issues: [],
  personalNotes: [],
  recurringEntries: [],
  pendingRecurring: []
};

const weekState: WeekState = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-14T22:00:00.000Z",
  weekEndExclusiveISO: "2026-06-21T22:00:00.000Z",
  weekRangeLabel: "Jun 15–21",
  weeklyTargetHours: 16,
  trackedWeekHours: 2,
  jiraTrackedWeekHours: 2,
  personalNoteHours: 0,
  recurringTrackedHours: 0,
  remainingWeekHours: 14,
  dailyTargetHours: 8,
  activeWorkingDates: ["2026-06-16", "2026-06-17"],
  skippedDates: ["2026-06-18"],
  days: [
    {
      ...baseDay,
      dateKey: "2026-06-16",
      weekdayName: "Tuesday",
      isToday: true,
      isSkipped: false,
      trackedHours: 2,
      missingHours: 6,
      issues: [
        {
          id: "1",
          key: "FTDM-401",
          summary: "Build shared week timeline",
          loggedSeconds: 7200
        }
      ]
    },
    {
      ...baseDay,
      dateKey: "2026-06-17",
      weekdayName: "Wednesday",
      isToday: false,
      isSkipped: false
    },
    {
      ...baseDay,
      dateKey: "2026-06-18",
      weekdayName: "Thursday",
      isToday: false,
      isSkipped: true,
      targetHours: 0,
      missingHours: 0
    }
  ]
};

const syncResult: SyncResult = {
  weekKey: "2026-06-15",
  weekStartISO: weekState.weekStartISO,
  weekEndExclusiveISO: weekState.weekEndExclusiveISO,
  syncedAt: "2026-06-16T10:00:00.000Z",
  accountId: "account-1",
  trackedSeconds: 7200,
  issueCount: 1,
  worklogCount: 1,
  daySummaries: {
    "2026-06-16": {
      trackedSeconds: 7200,
      issues: weekState.days[0].issues,
      worklogs: [
        {
          id: "wl-1",
          issueId: "1",
          issueKey: "FTDM-401",
          issueSummary: "Build shared week timeline",
          authorAccountId: "account-1",
          started: "2026-06-16T07:00:00.000Z",
          timeSpentSeconds: 7200
        }
      ]
    }
  }
};

describe("WeekTimeline", () => {
  it("aligns editable, future, and vacation days on one shared time grid", () => {
    const markup = renderToStaticMarkup(
      <WeekTimeline
        weekState={weekState}
        syncResult={syncResult}
        currentDate={new Date("2026-06-16T10:00:00.000Z")}
        todayKey="2026-06-16"
        onAddTime={() => undefined}
        onMoveWorklog={async () => true}
        onMoveRecurring={async () => true}
        onEditWorklog={() => undefined}
        onEditPersonalNote={() => undefined}
        onToggleSkipped={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="Week timeline"');
    expect(markup).toContain('height:1296px');
    expect(markup.match(/cal--embedded/g)).toHaveLength(2);
    expect(markup.match(/data-timeline-start=/g)).toHaveLength(2);
    expect(markup.match(/data-drop-day=/g)).toHaveLength(3);
    expect(markup).toContain("FTDM-401");
    expect(markup).toContain("is-draggable");
    expect(markup).toContain("Future day");
    expect(markup).toContain("Read-only until this day begins");
    expect(markup).toContain("OFF · VACATION");
  });
});
