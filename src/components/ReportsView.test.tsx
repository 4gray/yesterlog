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

describe("ReportsView", () => {
  it("shows ticket titles and Jira links in the by-ticket panel", () => {
    const markup = renderToStaticMarkup(
      <ReportsView
        weekState={weekState}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
      />
    );

    expect(markup).toContain("FTDM-397");
    expect(markup).toContain("Restructure the access domain in nx monorepo");
    expect(markup).toContain("https://elevait.atlassian.net/browse/FTDM-397");
    expect(markup).toContain("Open FTDM-397 in Jira");
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
});
