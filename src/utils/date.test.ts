import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDuration,
  formatWeekRangeCompact,
  getIsoWeekNumber,
  parseDurationToSeconds
} from "./date";

describe("formatDuration", () => {
  it("omits minutes when they are zero", () => {
    expect(formatDuration(40)).toBe("40h");
    expect(formatDuration(0)).toBe("0h");
  });

  it("shows minutes when a duration has non-zero minutes", () => {
    expect(formatDuration(31.5)).toBe("31h 30m");
    expect(formatDuration(1.25)).toBe("1h 15m");
  });
});

describe("getIsoWeekNumber", () => {
  it("returns week 25 for the week of Mon 15 Jun 2026", () => {
    expect(getIsoWeekNumber(new Date(2026, 5, 15))).toBe(25);
    expect(getIsoWeekNumber(new Date(2026, 5, 18))).toBe(25);
  });

  it("returns week 1 for early January", () => {
    expect(getIsoWeekNumber(new Date(2026, 0, 1))).toBe(1);
  });
});

describe("formatWeekRangeCompact", () => {
  it("collapses the month when the week stays within one", () => {
    expect(formatWeekRangeCompact(new Date(2026, 5, 15))).toBe("JUN 15–21");
  });

  it("shows both months when the week spans a boundary", () => {
    expect(formatWeekRangeCompact(new Date(2026, 5, 29))).toBe("JUN 29 – JUL 5");
  });
});

describe("formatClock", () => {
  it("always shows padded minutes alongside hours", () => {
    expect(formatClock(2 * 3600)).toBe("2h 00m");
    expect(formatClock(2 * 3600 + 45 * 60)).toBe("2h 45m");
  });

  it("drops the hours segment under an hour", () => {
    expect(formatClock(45 * 60)).toBe("45m");
    expect(formatClock(0)).toBe("0m");
  });
});

describe("parseDurationToSeconds", () => {
  it("parses Jira-style compound durations (1w=5d, 1d=8h)", () => {
    expect(parseDurationToSeconds("1h 30m")).toBe(90 * 60);
    expect(parseDurationToSeconds("2h")).toBe(2 * 3600);
    expect(parseDurationToSeconds("45m")).toBe(45 * 60);
    expect(parseDurationToSeconds("1d")).toBe(8 * 3600);
    expect(parseDurationToSeconds("1w")).toBe(40 * 3600);
  });

  it("treats a bare number as hours and rejects gibberish", () => {
    expect(parseDurationToSeconds("1.5")).toBe(90 * 60);
    expect(parseDurationToSeconds("")).toBeNull();
    expect(parseDurationToSeconds("abc")).toBeNull();
  });
});
