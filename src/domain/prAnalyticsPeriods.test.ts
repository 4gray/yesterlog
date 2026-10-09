import { describe, expect, it } from "vitest";
import { calendarDays, customAnalyticsRange, previousAnalyticsRange } from "./prAnalyticsPeriods";
import { toLocalDateKey } from "../utils/date";
describe("custom analytics periods", () => {
  const today = new Date(2026, 9, 7);
  it("includes both dates and gives a one-day period a next-midnight exclusive bound", () => {
    const { range } = customAnalyticsRange("2026-10-07", "2026-10-07", today);
    expect(toLocalDateKey(range!.start)).toBe("2026-10-07");
    expect(toLocalDateKey(range!.end)).toBe("2026-10-08");
    expect(range!.start.getHours()).toBe(0);
    expect(calendarDays(range!)).toBe(1);
  });
  it("rejects impossible, reversed, future, empty and oversized intervals", () => {
    for (const [from, to] of [
      ["2026-02-30", "2026-03-01"],
      ["2026-10-07", "2026-10-06"],
      ["2026-10-06", "2026-10-08"],
      ["", ""],
      ["2024-01-01", "2026-01-01"]
    ]) {
      expect(customAnalyticsRange(from, to, today).error).toBeTruthy();
    }
  });
  it("compares equal calendar days across month, year and DST boundaries", () => {
    const range = customAnalyticsRange("2026-03-28", "2026-03-30", today).range!;
    const previous = previousAnalyticsRange(range);
    expect(calendarDays(range)).toBe(3);
    expect(calendarDays(previous)).toBe(3);
    expect(toLocalDateKey(previous.start)).toBe("2026-03-25");
    expect(+previous.end).toBe(+range.start);
    expect(previous.start.getHours()).toBe(0);
    const year = previousAnalyticsRange(customAnalyticsRange("2026-01-01", "2026-01-03", today).range!);
    expect(toLocalDateKey(year.start)).toBe("2025-12-29");
  });
});
