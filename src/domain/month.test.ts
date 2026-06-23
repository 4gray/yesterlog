import { describe, expect, it } from "vitest";
import type { SyncResult, WeekState } from "../../shared/types";
import { buildWeekState, DEFAULT_SETTINGS } from "./week";
import { buildMonthState, getMonthAnchor, getMonthWeekStarts } from "./month";
import { toLocalDateKey } from "../utils/date";

// June 2026 starts on a Monday, so its weeks anchor on Jun 1, 8, 15, 22, 29.
const JUNE = new Date(2026, 5, 15, 12);

const trackedSyncResult = (weekKey: string, hoursByDate: Record<string, number>): SyncResult => {
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
    syncedAt: new Date(2026, 5, 15, 18).toISOString(),
    accountId: "test-account",
    trackedSeconds,
    worklogCount: 0,
    issueCount: 0,
    daySummaries
  };
};

const buildWeek = (weekStart: Date, today: Date, sync?: SyncResult): WeekState =>
  buildWeekState(weekStart, DEFAULT_SETTINGS, { weekKey: toLocalDateKey(weekStart), skippedDates: [] }, sync, [], today);

describe("month calculations", () => {
  it("enumerates every Monday-week overlapping the month", () => {
    const starts = getMonthWeekStarts(getMonthAnchor(JUNE)).map(toLocalDateKey);
    expect(starts).toEqual(["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"]);
  });

  it("aggregates per-week totals and classifies day status against today", () => {
    const today = new Date(2026, 5, 17, 9); // Wed Jun 17
    const anchor = getMonthAnchor(today);
    const starts = getMonthWeekStarts(anchor);

    const syncByKey: Record<string, SyncResult | undefined> = {
      "2026-06-01": trackedSyncResult("2026-06-01", {
        "2026-06-01": 8,
        "2026-06-02": 6, // gap (< 7h threshold)
        "2026-06-03": 8,
        "2026-06-04": 8,
        "2026-06-05": 8
      }),
      "2026-06-08": trackedSyncResult("2026-06-08", {
        "2026-06-08": 8,
        "2026-06-09": 8,
        "2026-06-10": 9,
        "2026-06-11": 8,
        "2026-06-12": 8
      }),
      "2026-06-15": trackedSyncResult("2026-06-15", {
        "2026-06-15": 6, // past, gap
        "2026-06-16": 8, // past, full
        "2026-06-17": 4 // today
      })
    };

    const weekStates = starts.map((start) => buildWeek(start, today, syncByKey[toLocalDateKey(start)]));
    const month = buildMonthState(anchor, today, DEFAULT_SETTINGS, weekStates);

    // 38 + 41 + 18 logged across populated weeks.
    expect(Math.round(month.trackedHours)).toBe(97);
    expect(month.targetHours).toBe(176); // 22 working days * 8h

    const [w23, w24, w25, w26, w27] = month.weeks;
    expect(w23.status).toBe("under"); // 38 / 40
    expect(w24.status).toBe("met"); // 41 / 40
    expect(w25.status).toBe("current"); // contains today
    expect(w26.status).toBe("future");
    expect(w27.status).toBe("partial"); // only Jun 29–30 fall in the month

    // W27 has Wed–Fri spilling into July → "other".
    expect(w27.days.map((day) => day.status)).toEqual(["future", "future", "other", "other", "other"]);

    // Gaps: Jun 2 and Jun 15 are past working days under 7h.
    expect(month.gapCount).toBe(2);
    expect(month.weeksOnTarget).toBe(1);
    expect(month.firstMetWeekLabel).toBe(w24.label);

    const todayCell = w25.days.find((day) => day.dateKey === "2026-06-17");
    expect(todayCell?.status).toBe("today");
  });
});
