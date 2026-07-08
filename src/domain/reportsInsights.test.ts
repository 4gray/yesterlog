import { describe, expect, it } from "vitest";
import type { DayTrackingSummary, PersonalNote, WeekState } from "../../shared/types";
import { buildComposition, buildFocus, buildTrends, weekContextSwitches } from "./reportsInsights";

const hours = (h: number) => h * 3600;

const note = (id: string, dateKey: string, seconds: number, category?: "meeting" | "firefighting"): PersonalNote => ({
  id,
  weekKey: "2026-06-15",
  dateKey,
  text: id,
  timeSpentSeconds: seconds,
  startedISO: `${dateKey}T10:00:00.000Z`,
  category,
  createdAt: `${dateKey}T10:00:00.000Z`,
  updatedAt: `${dateKey}T10:00:00.000Z`
});

const day = (over: Partial<DayTrackingSummary> & { dateKey: string; weekdayName: string }): DayTrackingSummary => ({
  dateLabel: over.dateKey,
  isToday: false,
  isConfiguredWorkingDay: true,
  isSkipped: false,
  targetHours: 8,
  trackedHours: 0,
  missingHours: 0,
  issues: [],
  personalNotes: [],
  recurringEntries: [],
  pendingRecurring: [],
  ...over
});

const week = (over: Partial<WeekState> & { weekKey: string; days: DayTrackingSummary[] }): WeekState => ({
  weekStartISO: `${over.weekKey}T00:00:00.000Z`,
  weekEndExclusiveISO: `${over.weekKey}T00:00:00.000Z`,
  weekRangeLabel: over.weekKey,
  weeklyTargetHours: 40,
  trackedWeekHours: 0,
  jiraTrackedWeekHours: 0,
  personalNoteHours: 0,
  remainingWeekHours: 0,
  dailyTargetHours: 8,
  activeWorkingDates: [],
  skippedDates: [],
  recurringTrackedHours: 0,
  ...over
});

// A week: Mon = 6h coding + 1h meeting; Wed = 1h coding + 2h firefighting.
const sampleWeek = () =>
  week({
    weekKey: "2026-06-15",
    trackedWeekHours: 10,
    jiraTrackedWeekHours: 7,
    personalNoteHours: 2,
    recurringTrackedHours: 1,
    days: [
      day({
        dateKey: "2026-06-15",
        weekdayName: "Monday",
        trackedHours: 7,
        issues: [{ id: "1", key: "AB-1", summary: "Coding", loggedSeconds: hours(6) }],
        recurringEntries: [{ eventId: "e1", dateKey: "2026-06-15", title: "Standup", localTime: "09:00", timeSpentSeconds: hours(1) }]
      }),
      day({
        dateKey: "2026-06-17",
        weekdayName: "Wednesday",
        trackedHours: 3,
        issues: [{ id: "2", key: "AB-2", summary: "Fix", loggedSeconds: hours(1) }],
        personalNotes: [
          note("firefight-a", "2026-06-17", hours(1)),
          note("firefight-b", "2026-06-17", hours(1))
        ]
      })
    ]
  });

describe("buildComposition", () => {
  it("splits the week into visible vs invisible work", () => {
    const report = buildComposition(sampleWeek());
    expect(report.totalHours).toBe(10);
    expect(report.visibleHours).toBe(7);
    expect(report.invisibleHours).toBe(3);
    expect(report.invisiblePct).toBe(30);
    expect(report.visiblePct).toBe(70);
  });

  it("keeps category hours summing to the tracked total", () => {
    const report = buildComposition(sampleWeek());
    const sum = report.categories.reduce((total, category) => total + category.hours, 0);
    expect(sum).toBeCloseTo(report.totalHours, 5);
    const meeting = report.categories.find((category) => category.key === "meeting");
    const fire = report.categories.find((category) => category.key === "fire");
    expect(meeting?.hours).toBeCloseTo(1, 5);
    expect(fire?.hours).toBeCloseTo(2, 5);
  });

  it("flags the most-invisible working day", () => {
    const report = buildComposition(sampleWeek());
    // Wednesday is 2h of 3h invisible (67%) vs Monday's 1h of 7h (14%).
    expect(report.worstDay?.label).toBe("WED");
    expect(report.days.find((d) => d.label === "WED")?.isWorst).toBe(true);
  });

  it("does not flag a worst day when no day is invisible-dominated", () => {
    const allVisible = week({
      weekKey: "2026-06-15",
      trackedWeekHours: 12,
      jiraTrackedWeekHours: 12,
      days: [
        day({
          dateKey: "2026-06-15",
          weekdayName: "Monday",
          trackedHours: 6,
          issues: [{ id: "a", key: "AB-1", summary: "x", loggedSeconds: hours(6) }]
        }),
        day({
          dateKey: "2026-06-17",
          weekdayName: "Wednesday",
          trackedHours: 6,
          issues: [{ id: "b", key: "AB-2", summary: "y", loggedSeconds: hours(6) }]
        })
      ]
    });
    const report = buildComposition(allVisible);
    expect(report.worstDay).toBeUndefined();
    expect(report.days.every((d) => !d.isWorst)).toBe(true);
  });
});

describe("buildFocus", () => {
  it("computes deep-work share and the longest block", () => {
    const report = buildFocus(sampleWeek());
    // Every block is ≥45m, so all 10h of active time is deep.
    expect(report.longestBlockMinutes).toBe(360);
    expect(report.longestBlockDayLabel).toBe("Monday");
    expect(report.deepSharePct).toBe(100);
  });

  it("treats blocks under 45 min as shallow and rates a fragmented day choppy", () => {
    const choppyWeek = week({
      weekKey: "2026-06-15",
      trackedWeekHours: 2,
      jiraTrackedWeekHours: 2,
      days: [
        day({
          dateKey: "2026-06-15",
          weekdayName: "Monday",
          trackedHours: 2,
          issues: [
            { id: "1", key: "AB-1", summary: "a", loggedSeconds: hours(0.25) },
            { id: "2", key: "AB-2", summary: "b", loggedSeconds: hours(0.25) },
            { id: "3", key: "AB-3", summary: "c", loggedSeconds: hours(0.25) },
            { id: "4", key: "AB-4", summary: "d", loggedSeconds: hours(0.25) },
            { id: "5", key: "AB-5", summary: "e", loggedSeconds: hours(0.25) },
            { id: "6", key: "AB-6", summary: "f", loggedSeconds: hours(0.25) },
            { id: "7", key: "AB-7", summary: "g", loggedSeconds: hours(0.25) },
            { id: "8", key: "AB-8", summary: "h", loggedSeconds: hours(0.25) },
            { id: "9", key: "AB-9", summary: "i", loggedSeconds: hours(0.25) }
          ]
        })
      ]
    });
    const report = buildFocus(choppyWeek);
    expect(report.deepSharePct).toBe(0);
    expect(report.days[0].rating).toBe("choppy");
    expect(report.days[0].isWorst).toBe(true);
  });

  it("counts context switches as blocks-per-day beyond the first", () => {
    // Mon has 2 blocks (1 switch); Wed has 3 blocks (2 switches) => 3 total.
    expect(weekContextSwitches(sampleWeek())).toBe(3);
    expect(buildFocus(sampleWeek()).contextSwitches).toBe(3);
  });

  it("reports a switches delta against the previous week", () => {
    const report = buildFocus(sampleWeek(), sampleWeek());
    expect(report.switchesDelta).toBe(0);
  });

  it("rates a single long block as the best day", () => {
    const report = buildFocus(sampleWeek());
    expect(report.days.find((d) => d.label === "MON")?.rating).toBe("best");
  });

  it("does not flag a most-fragmented day for a clean single-block week", () => {
    const clean = week({
      weekKey: "2026-06-15",
      trackedWeekHours: 2,
      jiraTrackedWeekHours: 2,
      days: [
        day({
          dateKey: "2026-06-15",
          weekdayName: "Monday",
          trackedHours: 2,
          issues: [{ id: "a", key: "AB-1", summary: "x", loggedSeconds: hours(2) }]
        })
      ]
    });
    const report = buildFocus(clean);
    expect(report.days[0].rating).toBe("best");
    expect(report.worstDay).toBeUndefined();
  });
});

describe("buildTrends", () => {
  const priorWeek = () =>
    week({
      weekKey: "2026-06-08",
      trackedWeekHours: 8,
      jiraTrackedWeekHours: 6,
      personalNoteHours: 1,
      recurringTrackedHours: 1,
      days: [
        day({
          dateKey: "2026-06-08",
          weekdayName: "Monday",
          trackedHours: 8,
          issues: [{ id: "p1", key: "AB-9", summary: "Prev", loggedSeconds: hours(6) }],
          recurringEntries: [{ eventId: "e", dateKey: "2026-06-08", title: "Standup", localTime: "09:00", timeSpentSeconds: hours(2) }]
        })
      ]
    });

  it("returns undefined when the current week is missing from the window", () => {
    expect(buildTrends([sampleWeek()], "2000-01-01")).toBeUndefined();
  });

  it("builds KPI deltas comparing the current week to the prior one", () => {
    const report = buildTrends([priorWeek(), sampleWeek()], "2026-06-15");
    expect(report?.hasComparison).toBe(true);
    // 10h this week vs 8h last = +25%.
    expect(report?.headlinePct).toBe(25);
    expect(report?.totalLogged.deltaLabel).toBe("+25%");
    expect(report?.totalLogged.deltaTone).toBe("good");
  });

  it("marks more invisible work as a bad trend", () => {
    const report = buildTrends([priorWeek(), sampleWeek()], "2026-06-15");
    // 30% invisible this week vs 25% last => +5pp, bad.
    expect(report?.invisible.deltaLabel).toBe("+5pp");
    expect(report?.invisible.deltaTone).toBe("bad");
  });

  it("provides a this-vs-last overlay per weekday and 4-week sparklines", () => {
    const report = buildTrends([priorWeek(), sampleWeek()], "2026-06-15");
    expect(report?.days[0]).toMatchObject({ label: "MON", thisHours: 7, lastHours: 8 });
    expect(report?.sparklines).toHaveLength(3);
    expect(report?.sparklines[0].bars.length).toBe(2);
  });

  const totalOnly = (key: string, total: number): WeekState =>
    week({
      weekKey: key,
      trackedWeekHours: total,
      jiraTrackedWeekHours: total,
      days: [
        day({
          dateKey: key,
          weekdayName: "Monday",
          trackedHours: total,
          issues: [{ id: key, key: "AB-1", summary: "x", loggedSeconds: hours(total) }]
        })
      ]
    });

  it("ends the 4-week sparkline window at the selected week, not the newest", () => {
    const weeks = [
      totalOnly("2026-05-25", 10),
      totalOnly("2026-06-01", 20),
      totalOnly("2026-06-08", 30),
      totalOnly("2026-06-15", 40),
      totalOnly("2026-06-22", 50)
    ];
    const report = buildTrends(weeks, "2026-06-08"); // index 2 — not the newest
    const total = report?.sparklines.find((m) => m.key === "total");
    // Window is weeks[0..2]; the highlighted latest bar is the *selected* week (30h), not 50h.
    expect(total?.latestValue).toBe(30);
    expect(total?.bars.length).toBe(3);
  });

  it("aligns the this-vs-last overlay by weekday when a leading day is filtered", () => {
    const current = week({
      weekKey: "2026-06-15",
      trackedWeekHours: 4,
      jiraTrackedWeekHours: 4,
      days: [
        // Monday is off this week (not configured, untracked) → dropped from reportableDays.
        day({ dateKey: "2026-06-15", weekdayName: "Monday", isConfiguredWorkingDay: false, trackedHours: 0 }),
        day({
          dateKey: "2026-06-16",
          weekdayName: "Tuesday",
          trackedHours: 4,
          issues: [{ id: "t", key: "AB-1", summary: "x", loggedSeconds: hours(4) }]
        })
      ]
    });
    const previous = week({
      weekKey: "2026-06-08",
      trackedWeekHours: 9,
      jiraTrackedWeekHours: 9,
      days: [
        day({
          dateKey: "2026-06-08",
          weekdayName: "Monday",
          trackedHours: 6,
          issues: [{ id: "m", key: "AB-9", summary: "x", loggedSeconds: hours(6) }]
        }),
        day({
          dateKey: "2026-06-09",
          weekdayName: "Tuesday",
          trackedHours: 3,
          issues: [{ id: "tu", key: "AB-8", summary: "y", loggedSeconds: hours(3) }]
        })
      ]
    });
    const report = buildTrends([previous, current], "2026-06-15");
    // Only Tuesday is reportable this week; it must pair with last week's Tuesday (3h), not Monday (6h).
    expect(report?.days).toHaveLength(1);
    expect(report?.days[0]).toMatchObject({ label: "TUE", thisHours: 4, lastHours: 3 });
  });
});
