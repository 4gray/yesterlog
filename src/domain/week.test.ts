import { describe, expect, it } from "vitest";
import type { PersonalNote, SyncResult } from "../../shared/types";
import { buildWeekState, DEFAULT_SETTINGS, getWeekBounds } from "./week";

const monday = new Date(2026, 5, 8, 12);

const syncResultFor = (weekKey: string, hoursByDate: Record<string, number>): SyncResult => {
  const daySummaries: SyncResult["daySummaries"] = {};
  let trackedSeconds = 0;
  for (const [dateKey, hours] of Object.entries(hoursByDate)) {
    const seconds = hours * 3600;
    trackedSeconds += seconds;
    daySummaries[dateKey] = { trackedSeconds: seconds, issues: [], worklogs: [] };
  }
  return {
    weekKey,
    weekStartISO: new Date(`${weekKey}T00:00:00`).toISOString(),
    weekEndExclusiveISO: new Date(`${weekKey}T00:00:00`).toISOString(),
    syncedAt: new Date(2026, 5, 9, 16).toISOString(),
    accountId: "account-1",
    trackedSeconds,
    issueCount: 0,
    worklogCount: 0,
    daySummaries
  };
};

describe("week calculations", () => {
  it("starts weeks on Monday in local time", () => {
    const bounds = getWeekBounds(new Date(2026, 5, 14, 16));

    expect(bounds.weekKey).toBe("2026-06-08");
  });

  it("subtracts skipped working days from the weekly target", () => {
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
    expect(state.weeklyTargetHours).toBe(32);
    expect(state.remainingWeekHours).toBe(32);
    expect(state.dailyTargetHours).toBe(8);
    expect(state.days[0].targetHours).toBe(8);
    expect(state.days[2].targetHours).toBe(0);
  });

  it("uses the configured daily share for part-time weeks with skipped days", () => {
    const state = buildWeekState(
      monday,
      {
        ...DEFAULT_SETTINGS,
        weeklyTargetHours: 30
      },
      {
        weekKey: "2026-06-08",
        skippedDates: ["2026-06-12"]
      },
      undefined,
      new Date(2026, 5, 9, 9)
    );

    expect(state.dailyTargetHours).toBe(6);
    expect(state.weeklyTargetHours).toBe(24);
    expect(state.remainingWeekHours).toBe(24);
    expect(state.days[4].targetHours).toBe(0);
  });

  it("builds only the configured working-day columns", () => {
    const state = buildWeekState(
      monday,
      {
        ...DEFAULT_SETTINGS,
        weeklyTargetHours: 30,
        workingDays: [1, 3, 5]
      },
      { weekKey: "2026-06-08", skippedDates: [] },
      undefined,
      new Date(2026, 5, 9, 9)
    );

    expect(state.days.map((day) => day.dateKey)).toEqual(["2026-06-08", "2026-06-10", "2026-06-12"]);
    expect(state.days.map((day) => day.weekdayName)).toEqual(["Monday", "Wednesday", "Friday"]);
    expect(state.activeWorkingDates).toEqual(["2026-06-08", "2026-06-10", "2026-06-12"]);
    expect(state.dailyTargetHours).toBe(10);
    expect(state.weeklyTargetHours).toBe(30);
  });

  it("supports weekend-only working weeks", () => {
    const state = buildWeekState(
      monday,
      {
        ...DEFAULT_SETTINGS,
        weeklyTargetHours: 16,
        workingDays: [6, 7]
      },
      { weekKey: "2026-06-08", skippedDates: [] },
      undefined,
      new Date(2026, 5, 13, 9)
    );

    expect(state.days.map((day) => day.dateKey)).toEqual(["2026-06-13", "2026-06-14"]);
    expect(state.days.map((day) => day.weekdayName)).toEqual(["Saturday", "Sunday"]);
    expect(state.dailyTargetHours).toBe(8);
    expect(state.weeklyTargetHours).toBe(16);
  });

  it("supports seven-day working weeks", () => {
    const state = buildWeekState(
      monday,
      {
        ...DEFAULT_SETTINGS,
        weeklyTargetHours: 35,
        workingDays: [1, 2, 3, 4, 5, 6, 7]
      },
      { weekKey: "2026-06-08", skippedDates: [] },
      undefined,
      new Date(2026, 5, 11, 9)
    );

    expect(state.days.map((day) => day.dateKey)).toEqual([
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14"
    ]);
    expect(state.days.map((day) => day.weekdayName)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday"
    ]);
    expect(state.dailyTargetHours).toBe(5);
    expect(state.weeklyTargetHours).toBe(35);
  });

  it("ignores raw sync and local notes from unselected days in weekly aggregates", () => {
    const timestamp = new Date(2026, 5, 12, 10).toISOString();
    const notes: PersonalNote[] = [
      {
        id: "note-selected",
        weekKey: "2026-06-08",
        dateKey: "2026-06-12",
        text: "Selected day note",
        timeSpentSeconds: 60 * 60,
        startedISO: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "note-hidden",
        weekKey: "2026-06-08",
        dateKey: "2026-06-09",
        text: "Hidden day note",
        timeSpentSeconds: 2 * 60 * 60,
        startedISO: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];
    const syncResult = syncResultFor("2026-06-08", {
      "2026-06-09": 5,
      "2026-06-10": 6,
      "2026-06-14": 4
    });

    const state = buildWeekState(
      monday,
      {
        ...DEFAULT_SETTINGS,
        weeklyTargetHours: 30,
        workingDays: [1, 3, 5]
      },
      { weekKey: "2026-06-08", skippedDates: [] },
      syncResult,
      notes,
      new Date(2026, 5, 12, 9)
    );

    expect(state.jiraTrackedWeekHours).toBe(6);
    expect(state.personalNoteHours).toBe(1);
    expect(state.trackedWeekHours).toBe(7);
    expect(state.days.map((day) => day.trackedHours)).toEqual([0, 6, 1]);
    expect(state.days.flatMap((day) => day.personalNotes.map((note) => note.id))).toEqual(["note-selected"]);
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

  it("ignores stale sync and override data from a different selected week", () => {
    const syncResult: SyncResult = {
      weekKey: "2026-06-01",
      weekStartISO: new Date(2026, 5, 1).toISOString(),
      weekEndExclusiveISO: new Date(2026, 5, 8).toISOString(),
      syncedAt: new Date(2026, 5, 2, 16).toISOString(),
      accountId: "account-1",
      trackedSeconds: 9 * 3600,
      issueCount: 1,
      worklogCount: 1,
      daySummaries: {
        "2026-06-02": {
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
      { weekKey: "2026-06-01", skippedDates: ["2026-06-10"] },
      syncResult,
      undefined,
      new Date(2026, 5, 9, 9)
    );

    expect(state.weekKey).toBe("2026-06-08");
    expect(state.jiraTrackedWeekHours).toBe(0);
    expect(state.trackedWeekHours).toBe(0);
    expect(state.weeklyTargetHours).toBe(40);
    expect(state.remainingWeekHours).toBe(40);
    expect(state.skippedDates).toEqual([]);
    expect(state.days[2].isSkipped).toBe(false);
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
