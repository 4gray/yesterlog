import { describe, expect, it } from "vitest";
import type { DayTrackingSummary, JiraIssueSummary, PersonalNote, RecurringEntry } from "../../shared/types";
import {
  activitySegments,
  activitySegmentsFromHours,
  billableSplitFromSeconds,
  dayActivitySeconds,
  dayBillableSplit,
  ringSegmentFractions,
  sumActivitySeconds,
  weekBillableSplit
} from "./activity";

const issue = (loggedSeconds: number): JiraIssueSummary => ({
  id: `i-${loggedSeconds}`,
  key: "ABC-1",
  summary: "s",
  loggedSeconds
});

const note = (timeSpentSeconds: number, category?: PersonalNote["category"]): PersonalNote => ({
  id: `n-${timeSpentSeconds}-${category ?? "none"}`,
  weekKey: "2026-06-15",
  dateKey: "2026-06-17",
  text: "t",
  timeSpentSeconds,
  startedISO: "2026-06-17T10:00:00.000Z",
  category,
  createdAt: "2026-06-17T10:00:00.000Z",
  updatedAt: "2026-06-17T10:00:00.000Z"
});

const recurring = (timeSpentSeconds: number): RecurringEntry => ({
  eventId: "e",
  dateKey: "2026-06-17",
  title: "Standup",
  localTime: "09:15",
  timeSpentSeconds
});

const day = (partial: Partial<DayTrackingSummary>): DayTrackingSummary => ({
  dateKey: "2026-06-17",
  dateLabel: "Jun 17",
  weekdayName: "Wednesday",
  isToday: true,
  isConfiguredWorkingDay: true,
  isSkipped: false,
  targetHours: 8,
  trackedHours: 0,
  missingHours: 0,
  issues: [],
  personalNotes: [],
  recurringEntries: [],
  pendingRecurring: [],
  ...partial
});

describe("dayActivitySeconds", () => {
  it("buckets worklogs, recurring + meeting-notes, and firefighting notes", () => {
    const result = dayActivitySeconds(
      day({
        issues: [issue(3600), issue(1800)],
        recurringEntries: [recurring(900)],
        personalNotes: [note(600, "meeting"), note(1200, "firefighting"), note(300)]
      })
    );
    expect(result.ticket).toBe(5400);
    expect(result.meeting).toBe(900 + 600); // recurring entry + meeting-tagged note
    expect(result.fire).toBe(1200 + 300); // firefighting + untagged default
  });

  it("treats undefined-category notes as firefighting", () => {
    const result = dayActivitySeconds(day({ personalNotes: [note(600)] }));
    expect(result.meeting).toBe(0);
    expect(result.fire).toBe(600);
  });
});

describe("billable split", () => {
  it("counts ticket seconds as billable and meetings + firefighting as local", () => {
    const split = billableSplitFromSeconds({ ticket: 3600 * 4, meeting: 3600, fire: 1800 });
    expect(split.billableHours).toBe(4);
    expect(split.localHours).toBe(1.5); // 1h meeting + 0.5h fire
    expect(split.totalHours).toBe(5.5);
  });

  it("derives the day split from worklogs, recurring rituals and notes", () => {
    const split = dayBillableSplit(
      day({
        issues: [issue(3600 * 4)],
        recurringEntries: [recurring(1800)], // meeting → local
        personalNotes: [note(3600, "firefighting")] // fire → local
      })
    );
    expect(split.billableHours).toBe(4);
    expect(split.localHours).toBe(1.5);
    expect(split.totalHours).toBe(5.5);
  });

  it("reports a fully local day as zero billable", () => {
    const split = dayBillableSplit(day({ personalNotes: [note(3600)] }));
    expect(split.billableHours).toBe(0);
    expect(split.localHours).toBe(1);
  });

  it("derives the week split from the precomputed WeekState totals", () => {
    const split = weekBillableSplit({ jiraTrackedWeekHours: 30, trackedWeekHours: 42 });
    expect(split.billableHours).toBe(30);
    expect(split.localHours).toBe(12); // notes + recurring remainder
    expect(split.totalHours).toBe(42);
  });

  it("never reports negative local hours when tracked trails billable", () => {
    // Defensive: rounding could momentarily make jira exceed the tracked total.
    const split = weekBillableSplit({ jiraTrackedWeekHours: 8.01, trackedWeekHours: 8 });
    expect(split.localHours).toBe(0);
  });
});

describe("sumActivitySeconds", () => {
  it("folds per-category seconds across days", () => {
    const total = sumActivitySeconds([
      { ticket: 100, meeting: 50, fire: 25 },
      { ticket: 200, meeting: 0, fire: 75 }
    ]);
    expect(total).toEqual({ ticket: 300, meeting: 50, fire: 100 });
  });
});

describe("activitySegments / activitySegmentsFromHours", () => {
  it("maps seconds to hours in category order", () => {
    const segs = activitySegments({ ticket: 3600, meeting: 1800, fire: 0 });
    expect(segs.map((segment) => segment.key)).toEqual(["ticket", "meeting", "fire"]);
    expect(segs[0].hours).toBe(1);
    expect(segs[1].hours).toBe(0.5);
  });

  it("passes a per-category hours breakdown through unchanged", () => {
    const segs = activitySegmentsFromHours({ ticket: 2, meeting: 1, fire: 0.5 });
    expect(segs.map((segment) => segment.hours)).toEqual([2, 1, 0.5]);
  });
});

describe("ringSegmentFractions", () => {
  const segs = (ticket: number, meeting: number, fire: number) => [
    { key: "ticket", color: "t", hours: ticket },
    { key: "meeting", color: "m", hours: meeting },
    { key: "fire", color: "f", hours: fire }
  ];

  it("lays segments end-to-end and closes exactly at target", () => {
    const spans = ringSegmentFractions(segs(4, 2, 2), 8);
    expect(spans[0]).toMatchObject({ key: "ticket", start: 0, end: 0.5 });
    expect(spans[1]).toMatchObject({ key: "meeting", start: 0.5, end: 0.75 });
    expect(spans[2]).toMatchObject({ key: "fire", start: 0.75, end: 1 });
  });

  it("leaves an unfilled remainder when under target", () => {
    const spans = ringSegmentFractions(segs(2, 0, 0), 8);
    expect(spans).toHaveLength(1);
    expect(spans[0].end).toBeCloseTo(0.25);
  });

  it("fills completely without overflowing past full when over target", () => {
    const spans = ringSegmentFractions(segs(6, 4, 2), 8); // 12h logged on an 8h target
    const last = spans[spans.length - 1];
    expect(last.end).toBeCloseTo(1);
    expect(last.end).toBeLessThanOrEqual(1);
  });

  it("skips zero and empty segments", () => {
    expect(ringSegmentFractions(segs(0, 0, 0), 8)).toHaveLength(0);
    expect(ringSegmentFractions(segs(4, 0, 2), 8).map((span) => span.key)).toEqual(["ticket", "fire"]);
  });
});
