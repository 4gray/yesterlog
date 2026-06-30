import { describe, expect, it } from "vitest";
import type { DayTrackingSummary, WeekState } from "../../shared/types";
import { buildKpiDeltas, buildReportsHistory, MIN_TREND_WEEKS } from "./reportsTrend";

const makeDay = (
  dateKey: string,
  options: { tracked: number; target: number; ticketKeys?: string[] }
): DayTrackingSummary => ({
  dateKey,
  dateLabel: dateKey,
  weekdayName: "Mon",
  isToday: false,
  isConfiguredWorkingDay: options.target > 0,
  isSkipped: false,
  targetHours: options.target,
  trackedHours: options.tracked,
  missingHours: Math.max(options.target - options.tracked, 0),
  issues: (options.ticketKeys ?? []).map((key) => ({
    id: key,
    key,
    summary: key,
    loggedSeconds: 3600
  })),
  personalNotes: [],
  recurringEntries: [],
  pendingRecurring: []
});

const makeWeek = (
  weekKey: string,
  parts: {
    target: number;
    jira: number;
    recurring: number;
    personal: number;
    days: DayTrackingSummary[];
  }
): WeekState => {
  const tracked = parts.jira + parts.recurring + parts.personal;
  return {
    weekKey,
    weekStartISO: `${weekKey}T00:00:00.000Z`,
    weekEndExclusiveISO: `${weekKey}T00:00:00.000Z`,
    weekRangeLabel: weekKey,
    weeklyTargetHours: parts.target,
    trackedWeekHours: tracked,
    jiraTrackedWeekHours: parts.jira,
    personalNoteHours: parts.personal,
    remainingWeekHours: Math.max(parts.target - tracked, 0),
    dailyTargetHours: parts.target / 5,
    activeWorkingDates: parts.days.filter((day) => day.trackedHours > 0).map((day) => day.dateKey),
    skippedDates: [],
    days: parts.days,
    recurringTrackedHours: parts.recurring
  };
};

const previousWeek = makeWeek("2026-06-15", {
  target: 40,
  jira: 18,
  recurring: 4,
  personal: 2,
  days: [
    makeDay("2026-06-15", { tracked: 8, target: 8, ticketKeys: ["B-1"] }),
    makeDay("2026-06-16", { tracked: 6, target: 8, ticketKeys: ["B-2"] }),
    makeDay("2026-06-17", { tracked: 10, target: 8, ticketKeys: ["B-1"] }),
    makeDay("2026-06-18", { tracked: 0, target: 8 }),
    makeDay("2026-06-19", { tracked: 0, target: 8 })
  ]
});

const currentWeek = makeWeek("2026-06-22", {
  target: 40,
  jira: 24,
  recurring: 4,
  personal: 2,
  days: [
    makeDay("2026-06-22", { tracked: 8, target: 8, ticketKeys: ["A-1"] }),
    makeDay("2026-06-23", { tracked: 8, target: 8, ticketKeys: ["A-2"] }),
    makeDay("2026-06-24", { tracked: 6, target: 8, ticketKeys: ["A-1"] }),
    makeDay("2026-06-25", { tracked: 8, target: 8, ticketKeys: ["A-3"] }),
    makeDay("2026-06-26", { tracked: 0, target: 8 })
  ]
});

const onTargetWeek = makeWeek("2026-06-08", {
  target: 40,
  jira: 36,
  recurring: 2,
  personal: 2,
  days: [makeDay("2026-06-08", { tracked: 40, target: 40, ticketKeys: ["C-1"] })]
});

describe("buildKpiDeltas", () => {
  it("computes week-over-week deltas at display precision", () => {
    const deltas = buildKpiDeltas(currentWeek, previousWeek);
    expect(deltas).toBeDefined();
    // dailyAverage: 30/4 = 7.5 vs 24/3 = 8
    expect(deltas?.dailyAverage.current).toBeCloseTo(7.5);
    expect(deltas?.dailyAverage.delta).toBeCloseTo(-0.5);
    // billable: 24/30 = 80% vs 18/24 = 75%
    expect(deltas?.billablePct.current).toBe(80);
    expect(deltas?.billablePct.delta).toBe(5);
    // tickets touched: {A-1,A-2,A-3} = 3 vs {B-1,B-2} = 2
    expect(deltas?.ticketsTouched.delta).toBe(1);
    // days on target: 3 vs 2
    expect(deltas?.daysOnTarget.current).toBe(3);
    expect(deltas?.daysOnTarget.delta).toBe(1);
  });

  it("returns undefined when there is no previous week", () => {
    expect(buildKpiDeltas(currentWeek, undefined)).toBeUndefined();
  });
});

describe("buildReportsHistory", () => {
  it("builds trend, composition and deltas over the window", () => {
    const history = buildReportsHistory([previousWeek, currentWeek], currentWeek.weekKey);

    expect(history.trend).toHaveLength(2);
    expect(history.trend[1].isCurrent).toBe(true);
    expect(history.trend[1].onTarget).toBe(false);

    // composition reuses the week-level split and sums to trackedWeekHours
    const current = history.composition[1];
    expect(current.ticketHours).toBe(24);
    expect(current.meetingHours).toBe(4);
    expect(current.fireHours).toBe(2);
    expect(current.totalHours).toBe(currentWeek.trackedWeekHours);

    expect(history.deltas?.billablePct.delta).toBe(5);
  });

  it("flags the baseline only once enough populated weeks exist", () => {
    const sparse = buildReportsHistory([previousWeek, currentWeek], currentWeek.weekKey);
    expect(sparse.populatedWeeks).toBe(2);
    expect(sparse.hasBaseline).toBe(false);

    const full = buildReportsHistory(
      [onTargetWeek, previousWeek, currentWeek],
      currentWeek.weekKey
    );
    expect(full.populatedWeeks).toBe(MIN_TREND_WEEKS);
    expect(full.hasBaseline).toBe(true);
    expect(full.trend[0].onTarget).toBe(true);
  });

  it("has no deltas when the current week has no predecessor in the window", () => {
    const history = buildReportsHistory([currentWeek], currentWeek.weekKey);
    expect(history.deltas).toBeUndefined();
  });
});
