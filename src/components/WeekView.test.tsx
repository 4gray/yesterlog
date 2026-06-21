import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SyncResult, WeekState } from "../../shared/types";
import { WeekView } from "./WeekView";

const weekState: WeekState = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-14T22:00:00.000Z",
  weekEndExclusiveISO: "2026-06-21T22:00:00.000Z",
  weekRangeLabel: "Jun 15-21",
  weeklyTargetHours: 40,
  trackedWeekHours: 2,
  remainingWeekHours: 38,
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
      trackedHours: 2,
      missingHours: 6,
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
      ]
    }
  ]
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
        onEditWorklog={() => undefined}
        onToggleSkipped={() => undefined}
      />
    );

    expect(markup).toContain("FTDM-397");
    expect(markup).toContain("https://elevait.atlassian.net/browse/FTDM-397");
    expect(markup).toContain("Open FTDM-397 in Jira");
    expect(markup).toContain("EPIC");
    expect(markup).toContain("Edit worklog for FTDM-397");
  });
});
