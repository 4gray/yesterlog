import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WeekState } from "../../shared/types";
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
          key: "FTDM-397",
          summary: "Restructure the access domain in nx monorepo",
          url: "https://elevait.atlassian.net/browse/FTDM-397",
          issueType: { name: "Epic", hierarchyLevel: 1 },
          loggedSeconds: 5 * 3600
        }
      ],
      personalNotes: [
        {
          id: "note-1",
          weekKey: "2026-06-15",
          dateKey: "2026-06-18",
          text: "Interview feedback write-up",
          timeSpentSeconds: 30 * 60,
          startedISO: "2026-06-18T12:00:00.000Z",
          createdAt: "2026-06-18T12:00:00.000Z",
          updatedAt: "2026-06-18T12:00:00.000Z"
        }
      ]
    }
  ]
};

describe("ReportsView", () => {
  it("shows ticket titles and Jira links in the by-ticket panel", () => {
    const markup = renderToStaticMarkup(<ReportsView weekState={weekState} onCurrentWeek={() => undefined} />);

    expect(markup).toContain("FTDM-397");
    expect(markup).toContain("Restructure the access domain in nx monorepo");
    expect(markup).toContain("https://elevait.atlassian.net/browse/FTDM-397");
    expect(markup).toContain("Open FTDM-397 in Jira");
    expect(markup).toContain("EPIC");
    expect(markup).toContain("Personal notes");
    expect(markup).toContain("LOCAL");
  });
});
