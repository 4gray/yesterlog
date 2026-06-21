import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WeekState } from "../../shared/types";
import { WeekView } from "./WeekView";

const weekState: WeekState = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-14T22:00:00.000Z",
  weekEndExclusiveISO: "2026-06-21T22:00:00.000Z",
  weekRangeLabel: "Jun 15-21",
  weeklyTargetHours: 40,
  trackedWeekHours: 2.5,
  jiraTrackedWeekHours: 2,
  personalNoteHours: 0.5,
  remainingWeekHours: 37.5,
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
      trackedHours: 2.5,
      missingHours: 5.5,
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
          timeSpentSeconds: 30 * 60,
          startedISO: "2026-06-18T12:00:00.000Z",
          createdAt: "2026-06-18T12:00:00.000Z",
          updatedAt: "2026-06-18T12:00:00.000Z"
        }
      ]
    }
  ]
};

describe("WeekView", () => {
  it("shows Jira link icons next to week ticket keys", () => {
    const markup = renderToStaticMarkup(
      <WeekView
        weekState={weekState}
        isSyncing={false}
        isConfigured={true}
        onSync={() => undefined}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
        onAddTime={() => undefined}
        onToggleSkipped={() => undefined}
      />
    );

    expect(markup).toContain("FTDM-397");
    expect(markup).toContain("https://elevait.atlassian.net/browse/FTDM-397");
    expect(markup).toContain("Open FTDM-397 in Jira");
    expect(markup).toContain("EPIC");
    expect(markup).toContain("Mentored a teammate on release planning");
    expect(markup).toContain("NOTE");
  });
});
