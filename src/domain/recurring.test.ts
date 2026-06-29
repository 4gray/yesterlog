import { describe, expect, it } from "vitest";
import type { RecurringEvent, RecurringOccurrence } from "../../shared/types";
import {
  buildDayRecurring,
  buildDefaultRecurringEvents,
  getRecurringCandidates,
  indexOccurrences,
  occurrenceKey
} from "./recurring";

const standup: RecurringEvent = {
  id: "rec-daily",
  title: "Daily Standup",
  daysOfWeek: [1, 2, 3, 4, 5],
  localTime: "09:15",
  durationMinutes: 15,
  defaultNote: "Daily sync",
  active: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z"
};

const planning: RecurringEvent = {
  id: "rec-plan",
  title: "Sprint Planning",
  daysOfWeek: [1],
  localTime: "10:00",
  durationMinutes: 60,
  defaultNote: "Plan the sprint",
  active: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z"
};

const occurrence = (overrides: Partial<RecurringOccurrence> & Pick<RecurringOccurrence, "eventId" | "dateKey" | "status">): RecurringOccurrence => ({
  weekKey: "2026-06-08",
  createdAt: "2026-06-08T09:00:00.000Z",
  updatedAt: "2026-06-08T09:00:00.000Z",
  ...overrides
});

describe("recurring domain", () => {
  it("seeds default events with timestamps", () => {
    const events = buildDefaultRecurringEvents("2026-06-08T00:00:00.000Z");
    expect(events).toHaveLength(4);
    expect(events[0].createdAt).toBe("2026-06-08T00:00:00.000Z");
    // The seed array must not be mutable through the returned events.
    events[0].daysOfWeek.push(6 as never);
    expect(buildDefaultRecurringEvents()[0].daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("surfaces unresolved events on a working day up to today as pending", () => {
    const result = buildDayRecurring([standup, planning], new Map(), "2026-06-08", 1, {
      isWorkingDay: true,
      isPastOrToday: true
    });

    expect(result.entries).toHaveLength(0);
    expect(result.pending.map((p) => p.eventId)).toEqual(["rec-daily", "rec-plan"]);
    expect(result.confirmedSeconds).toBe(0);
  });

  it("supports weekend recurring events", () => {
    const weekendSupport: RecurringEvent = {
      ...standup,
      id: "rec-weekend",
      title: "Weekend support",
      daysOfWeek: [6]
    };

    const result = buildDayRecurring([weekendSupport], new Map(), "2026-06-13", 6, {
      isWorkingDay: true,
      isPastOrToday: true
    });

    expect(result.pending.map((p) => p.eventId)).toEqual(["rec-weekend"]);
  });

  it("never prompts on future days", () => {
    const result = buildDayRecurring([standup], new Map(), "2026-06-12", 5, {
      isWorkingDay: true,
      isPastOrToday: false
    });

    expect(result.pending).toHaveLength(0);
  });

  it("folds confirmed occurrences into entries and counts their seconds", () => {
    const occurrences = indexOccurrences([
      occurrence({ eventId: "rec-daily", dateKey: "2026-06-08", status: "confirmed" }),
      occurrence({
        eventId: "rec-plan",
        dateKey: "2026-06-08",
        status: "confirmed",
        timeSpentSeconds: 30 * 60,
        note: "Trimmed planning"
      })
    ]);

    const result = buildDayRecurring([standup, planning], occurrences, "2026-06-08", 1, {
      isWorkingDay: true,
      isPastOrToday: true
    });

    expect(result.pending).toHaveLength(0);
    expect(result.entries).toHaveLength(2);
    // 15m default + 30m override.
    expect(result.confirmedSeconds).toBe(15 * 60 + 30 * 60);
    const planEntry = result.entries.find((entry) => entry.eventId === "rec-plan");
    expect(planEntry?.note).toBe("Trimmed planning");
    expect(planEntry?.timeSpentSeconds).toBe(30 * 60);
  });

  it("drops skipped occurrences entirely", () => {
    const occurrences = indexOccurrences([
      occurrence({ eventId: "rec-daily", dateKey: "2026-06-08", status: "skipped" })
    ]);

    const result = buildDayRecurring([standup], occurrences, "2026-06-08", 1, {
      isWorkingDay: true,
      isPastOrToday: true
    });

    expect(result.entries).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
  });

  it("ignores inactive events", () => {
    const result = buildDayRecurring([{ ...standup, active: false }], new Map(), "2026-06-08", 1, {
      isWorkingDay: true,
      isPastOrToday: true
    });

    expect(result.pending).toHaveLength(0);
  });

  it("lists candidates excluding already-confirmed events", () => {
    const occurrences = indexOccurrences([
      occurrence({ eventId: "rec-daily", dateKey: "2026-06-08", status: "confirmed" }),
      occurrence({ eventId: "rec-plan", dateKey: "2026-06-08", status: "skipped" })
    ]);

    const candidates = getRecurringCandidates([standup, planning], occurrences, "2026-06-08", 1);
    // standup confirmed → excluded; planning skipped → still a candidate (re-log).
    expect(candidates.map((event) => event.id)).toEqual(["rec-plan"]);
  });

  it("builds a stable occurrence key", () => {
    expect(occurrenceKey("rec-daily", "2026-06-08")).toBe("rec-daily|2026-06-08");
  });
});
