import { describe, expect, it } from "vitest";
import type { SyncResult } from "../../shared/types";
import { buildWeekState, DEFAULT_SETTINGS, getWeekBounds } from "./week";

const monday = new Date(2026, 5, 8, 12);

describe("week calculations", () => {
  it("starts weeks on Monday in local time", () => {
    const bounds = getWeekBounds(new Date(2026, 5, 14, 16));

    expect(bounds.weekKey).toBe("2026-06-08");
  });

  it("redistributes weekly target across non-skipped working days", () => {
    const state = buildWeekState(
      monday,
      DEFAULT_SETTINGS,
      {
        weekKey: "2026-06-08",
        skippedDates: ["2026-06-10"]
      },
      undefined,
      undefined,
      new Date(2026, 5, 10, 9)
    );

    expect(state.activeWorkingDates).toEqual([
      "2026-06-08",
      "2026-06-09",
      "2026-06-11",
      "2026-06-12"
    ]);
    expect(state.dailyTargetHours).toBe(10);
    expect(state.days[2].targetHours).toBe(0);
  });

  it("subtracts synced Jira worklogs from weekly and daily remaining time", () => {
    const syncResult: SyncResult = {
      weekKey: "2026-06-08",
      weekStartISO: new Date(2026, 5, 8).toISOString(),
      weekEndExclusiveISO: new Date(2026, 5, 15).toISOString(),
      syncedAt: new Date(2026, 5, 9, 16).toISOString(),
      accountId: "account-1",
      trackedSeconds: 9 * 3600,
      issueCount: 1,
      worklogCount: 2,
      daySummaries: {
        "2026-06-09": {
          trackedSeconds: 9 * 3600,
          issues: [
            {
              id: "10000",
              key: "APP-42",
              summary: "Build tracker",
              loggedSeconds: 9 * 3600
            }
          ],
          worklogs: []
        }
      }
    };

    const state = buildWeekState(
      monday,
      DEFAULT_SETTINGS,
      { weekKey: "2026-06-08", skippedDates: [] },
      syncResult,
      undefined,
      new Date(2026, 5, 9, 9)
    );

    expect(state.remainingWeekHours).toBe(31);
    expect(state.days[1].trackedHours).toBe(9);
    expect(state.days[1].missingHours).toBe(0);
  });

  it("counts local personal notes toward day and week tracking", () => {
    const timestamp = new Date(2026, 5, 9, 10).toISOString();
    const state = buildWeekState(
      monday,
      DEFAULT_SETTINGS,
      { weekKey: "2026-06-08", skippedDates: [] },
      undefined,
      [
        {
          id: "note-1",
          weekKey: "2026-06-08",
          dateKey: "2026-06-09",
          text: "Planning without a ticket",
          timeSpentSeconds: 90 * 60,
          startedISO: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      new Date(2026, 5, 9, 9)
    );

    expect(state.personalNoteHours).toBe(1.5);
    expect(state.jiraTrackedWeekHours).toBe(0);
    expect(state.trackedWeekHours).toBe(1.5);
    expect(state.remainingWeekHours).toBe(38.5);
    expect(state.days[1].trackedHours).toBe(1.5);
    expect(state.days[1].personalNotes[0].text).toBe("Planning without a ticket");
  });
});
