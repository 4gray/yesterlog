import { describe, expect, it } from "vitest";
import type { JiraTicket } from "../../shared/types";
import { buildDockColorMap, DOCK_PALETTE, formatRelativeTime, getDockStatus } from "./activeWork";

const ticket = (overrides: Partial<JiraTicket>): JiraTicket => ({
  id: "id",
  key: "TBRO-1",
  summary: "Summary",
  projectKey: "TBRO",
  projectName: "TimeBro Product",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  url: "https://example.atlassian.net/browse/TBRO-1",
  ...overrides
});

describe("getDockStatus", () => {
  it("marks done tickets as done", () => {
    expect(getDockStatus(ticket({ statusCategory: "done", statusName: "Closed" }))).toEqual({
      tone: "done",
      label: "Closed"
    });
  });

  it("detects review/QA statuses regardless of category", () => {
    expect(getDockStatus(ticket({ statusName: "In Review" })).tone).toBe("review");
    expect(getDockStatus(ticket({ statusName: "Design QA" })).tone).toBe("review");
  });

  it("uses the new tone for new-category tickets", () => {
    expect(getDockStatus(ticket({ statusCategory: "new", statusName: "Ready" })).tone).toBe("new");
  });

  it("falls back to progress for indeterminate work", () => {
    expect(getDockStatus(ticket({ statusName: "Blocked" })).tone).toBe("progress");
  });
});

describe("buildDockColorMap", () => {
  it("assigns stable palette colors per key in order", () => {
    const map = buildDockColorMap([ticket({ key: "A" }), ticket({ key: "B" }), ticket({ key: "A" })]);
    expect(map.get("A")).toBe(DOCK_PALETTE[0]);
    expect(map.get("B")).toBe(DOCK_PALETTE[1]);
    expect(map.size).toBe(2);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-23T12:00:00.000Z");

  it("returns undefined for missing or invalid input", () => {
    expect(formatRelativeTime(undefined, now)).toBeUndefined();
    expect(formatRelativeTime("not-a-date", now)).toBeUndefined();
  });

  it("formats recent and older timestamps", () => {
    expect(formatRelativeTime("2026-06-23T11:48:00.000Z", now)).toBe("12m ago");
    expect(formatRelativeTime("2026-06-20T12:00:00.000Z", now)).toBe("3d ago");
    expect(formatRelativeTime("2026-06-23T11:59:50.000Z", now)).toBe("just now");
  });
});
