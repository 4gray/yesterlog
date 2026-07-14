import { describe, expect, it } from "vitest";
import type { JiraWorklog, SyncResult, WorklogAllocationPreference } from "../../shared/types";
import { toLocalDateKey } from "../utils/date";
import { DEFAULT_SETTINGS } from "./week";
import { projectWorklogsForWeek } from "./worklogAllocation";

const worklog = (overrides: Partial<JiraWorklog> = {}): JiraWorklog => ({
  id: "bulk-1",
  issueId: "10001",
  issueKey: "TB-1",
  issueSummary: "Bulk migration",
  authorAccountId: "me",
  started: "2026-07-14T09:00:00.000Z",
  created: "2026-07-14T17:00:00.000Z",
  updated: "2026-07-14T17:00:00.000Z",
  timeSpentSeconds: 80 * 3600,
  ...overrides
});

const sync = (weekKey: string, sources: JiraWorklog[]): SyncResult => ({
  weekKey,
  weekStartISO: `${weekKey}T00:00:00.000Z`,
  weekEndExclusiveISO: "2026-07-20T00:00:00.000Z",
  syncedAt: "2026-07-14T18:00:00.000Z",
  accountId: "me",
  jiraSite: "https://alpha.atlassian.net",
  trackedSeconds: 0,
  issueCount: 0,
  worklogCount: 0,
  daySummaries: {},
  sourceWorklogs: sources
});

const projectedHours = (result: SyncResult) =>
  Object.fromEntries(Object.entries(result.daySummaries).map(([dateKey, bucket]) => [dateKey, bucket.trackedSeconds / 3600]));

describe("projectWorklogsForWeek", () => {
  it("spreads a same-day 2w worklog backward over working days and preserves the source total", () => {
    const result = projectWorklogsForWeek(sync("2026-07-13", [worklog()]), {
      settings: DEFAULT_SETTINGS,
      now: new Date("2026-07-14T18:00:00.000Z")
    })!;

    expect(projectedHours(result)).toEqual({ "2026-07-13": 8, "2026-07-14": 8 });
    expect(result.daySummaries["2026-07-13"].worklogs[0].allocation).toMatchObject({
      direction: "backward",
      partCount: 10,
      isApproximate: true
    });
    expect(result.sourceWorklogs?.[0]).not.toHaveProperty("allocation");
    expect(
      result.sourceWorklogs?.reduce((sum, source) => sum + source.timeSpentSeconds, 0)
    ).toBe(80 * 3600);
  });

  it("preserves the full duration across week projections and skips excluded dates", () => {
    const options = {
      settings: DEFAULT_SETTINGS,
      skippedDates: ["2026-07-13"],
      now: new Date("2026-07-14T18:00:00.000Z")
    };
    const source = worklog();
    const weeks = ["2026-06-29", "2026-07-06", "2026-07-13"].map(
      (weekKey) => projectWorklogsForWeek(sync(weekKey, [source]), options)!
    );

    expect(weeks.reduce((sum, week) => sum + week.trackedSeconds, 0)).toBe(80 * 3600);
    expect(weeks[2].daySummaries).not.toHaveProperty("2026-07-13");
    expect(Object.keys(weeks[2].daySummaries)).toEqual(["2026-07-14"]);
  });

  it("uses an explicit local preference and marks TimeBro-created allocation as exact", () => {
    const preference: WorklogAllocationPreference = {
      preferenceKey: JSON.stringify(["https://alpha.atlassian.net", "me", "bulk-1"]),
      jiraSite: "https://alpha.atlassian.net",
      authorAccountId: "me",
      worklogId: "bulk-1",
      direction: "forward",
      createdAt: "2026-07-14T18:00:00.000Z",
      updatedAt: "2026-07-14T18:00:00.000Z"
    };
    const result = projectWorklogsForWeek(
      sync("2026-07-06", [worklog({ started: "2026-07-06T09:00:00.000Z" })]),
      {
        settings: DEFAULT_SETTINGS,
        preferences: [preference],
        now: new Date("2026-07-14T18:00:00.000Z")
      }
    )!;

    expect(projectedHours(result)).toEqual({
      "2026-07-06": 8,
      "2026-07-07": 8,
      "2026-07-08": 8,
      "2026-07-09": 8,
      "2026-07-10": 8
    });
    expect(result.daySummaries["2026-07-06"].worklogs[0].allocation).toMatchObject({
      direction: "forward",
      isApproximate: false
    });
  });

  it("lets an explicit forward preference continue to today even when Jira created it earlier", () => {
    const bulkStart = new Date(2026, 6, 13, 9, 0, 0, 0);
    const preference: WorklogAllocationPreference = {
      preferenceKey: JSON.stringify(["https://alpha.atlassian.net", "me", "bulk-1"]),
      jiraSite: "https://alpha.atlassian.net",
      authorAccountId: "me",
      worklogId: "bulk-1",
      direction: "forward",
      createdAt: bulkStart.toISOString(),
      updatedAt: bulkStart.toISOString()
    };
    const result = projectWorklogsForWeek(
      sync("2026-07-13", [
        worklog({
          started: bulkStart.toISOString(),
          created: new Date(2026, 6, 10, 9, 0, 0, 0).toISOString(),
          timeSpentSeconds: 16 * 3600
        })
      ]),
      {
        settings: DEFAULT_SETTINGS,
        preferences: [preference],
        now: new Date(2026, 6, 14, 18, 0, 0, 0)
      }
    )!;

    expect(projectedHours(result)).toEqual({ "2026-07-13": 8, "2026-07-14": 8 });
  });

  it("ignores an exact preference saved for another Jira site", () => {
    const preference: WorklogAllocationPreference = {
      preferenceKey: JSON.stringify(["https://beta.atlassian.net", "me", "bulk-1"]),
      jiraSite: "https://beta.atlassian.net",
      authorAccountId: "me",
      worklogId: "bulk-1",
      direction: "forward",
      createdAt: "2026-07-14T18:00:00.000Z",
      updatedAt: "2026-07-14T18:00:00.000Z"
    };
    const result = projectWorklogsForWeek(sync("2026-07-13", [worklog({ timeSpentSeconds: 16 * 3600 })]), {
      settings: DEFAULT_SETTINGS,
      preferences: [preference],
      now: new Date("2026-07-14T18:00:00.000Z")
    })!;

    expect(result.daySummaries["2026-07-14"].worklogs[0].allocation).toMatchObject({
      direction: "backward",
      isApproximate: true
    });
  });

  it("caps configured daily capacity at the remaining hours in the calendar day", () => {
    const result = projectWorklogsForWeek(
      sync("2026-07-13", [worklog({ timeSpentSeconds: 30 * 3600 })]),
      {
        settings: { ...DEFAULT_SETTINGS, weeklyTargetHours: 100 },
        now: new Date("2026-07-14T18:00:00.000Z")
      }
    )!;
    const allocations = Object.values(result.daySummaries).flatMap((bucket) => bucket.worklogs);

    expect(allocations.map((entry) => entry.allocation!.timeSpentSeconds / 3600)).toEqual([15, 15]);
    for (const entry of allocations) {
      const start = new Date(entry.allocation!.started);
      expect(start.getHours() * 3600 + start.getMinutes() * 60 + entry.allocation!.timeSpentSeconds).toBeLessThanOrEqual(
        24 * 3600
      );
    }
  });

  it("fills around ordinary worklogs before exposing unavoidable overflow", () => {
    const ordinaryStart = new Date(2026, 6, 13, 10, 0, 0, 0);
    const ordinary = worklog({
      id: "normal-1",
      started: ordinaryStart.toISOString(),
      created: ordinaryStart.toISOString(),
      timeSpentSeconds: 2 * 3600
    });
    const result = projectWorklogsForWeek(sync("2026-07-13", [ordinary, worklog()]), {
      settings: DEFAULT_SETTINGS,
      now: new Date(2026, 6, 14, 18, 0, 0, 0)
    })!;

    expect(projectedHours(result)).toEqual({ "2026-07-13": 8, "2026-07-14": 8 });
    const allocated = result.daySummaries["2026-07-13"].worklogs.filter((entry) => entry.allocation);
    expect(allocated).toHaveLength(2);
    expect(allocated.map((entry) => new Date(entry.allocation!.started).getHours())).toEqual([9, 12]);
    expect(allocated.map((entry) => entry.allocation!.timeSpentSeconds / 3600)).toEqual([1, 5]);

    const ordinaryEnd = ordinaryStart.getTime() + ordinary.timeSpentSeconds * 1000;
    for (const entry of allocated) {
      const allocatedStart = new Date(entry.allocation!.started).getTime();
      const allocatedEnd = allocatedStart + entry.allocation!.timeSpentSeconds * 1000;
      expect(allocatedStart < ordinaryEnd && ordinaryStart.getTime() < allocatedEnd).toBe(false);
    }
  });

  it("keeps normal one-day worklogs unchanged", () => {
    const normal = worklog({ id: "normal", timeSpentSeconds: 7 * 3600 });
    const result = projectWorklogsForWeek(sync("2026-07-13", [normal]), {
      settings: DEFAULT_SETTINGS,
      now: new Date("2026-07-14T18:00:00.000Z")
    })!;

    expect(projectedHours(result)).toEqual({ "2026-07-14": 7 });
    expect(result.daySummaries["2026-07-14"].worklogs[0]).not.toHaveProperty("allocation");
  });

  it("keeps an imported overtime worklog below two daily targets on its Jira day", () => {
    const overtime = worklog({ id: "overtime", timeSpentSeconds: 9 * 3600 });
    const result = projectWorklogsForWeek(sync("2026-07-13", [overtime]), {
      settings: DEFAULT_SETTINGS,
      now: new Date("2026-07-14T18:00:00.000Z")
    })!;

    expect(projectedHours(result)).toEqual({ "2026-07-14": 9 });
    expect(result.daySummaries["2026-07-14"].worklogs[0]).not.toHaveProperty("allocation");
  });

  it("honors an explicit TimeBro distribution choice below the imported bulk threshold", () => {
    const preference: WorklogAllocationPreference = {
      preferenceKey: JSON.stringify(["https://alpha.atlassian.net", "me", "explicit-overtime"]),
      jiraSite: "https://alpha.atlassian.net",
      authorAccountId: "me",
      worklogId: "explicit-overtime",
      direction: "backward",
      createdAt: "2026-07-14T18:00:00.000Z",
      updatedAt: "2026-07-14T18:00:00.000Z"
    };
    const overtime = worklog({ id: "explicit-overtime", timeSpentSeconds: 9 * 3600 });
    const result = projectWorklogsForWeek(sync("2026-07-13", [overtime]), {
      settings: DEFAULT_SETTINGS,
      preferences: [preference],
      now: new Date("2026-07-14T18:00:00.000Z")
    })!;

    expect(projectedHours(result)).toEqual({ "2026-07-13": 1, "2026-07-14": 8 });
    expect(result.daySummaries["2026-07-14"].worklogs[0].allocation).toMatchObject({
      direction: "backward",
      isApproximate: false
    });
  });

  it("keeps an overloaded residual start on its allocation date", () => {
    const dateKey = "2026-07-14";
    const lateStart = new Date(2026, 6, 14, 23, 0, 0, 0);
    const bulkStart = new Date(2026, 6, 14, 9, 0, 0, 0);
    const ordinary = worklog({
      id: "normal-late",
      started: lateStart.toISOString(),
      created: lateStart.toISOString(),
      timeSpentSeconds: 2 * 3600
    });
    const bulk = worklog({
      started: bulkStart.toISOString(),
      created: bulkStart.toISOString(),
      timeSpentSeconds: 16 * 3600
    });
    const preference: WorklogAllocationPreference = {
      preferenceKey: JSON.stringify(["https://alpha.atlassian.net", "me", bulk.id]),
      jiraSite: "https://alpha.atlassian.net",
      authorAccountId: "me",
      worklogId: bulk.id,
      direction: "forward",
      createdAt: bulkStart.toISOString(),
      updatedAt: bulkStart.toISOString()
    };
    const result = projectWorklogsForWeek(sync("2026-07-13", [ordinary, bulk]), {
      settings: DEFAULT_SETTINGS,
      preferences: [preference],
      now: new Date(2026, 6, 14, 23, 30, 0, 0)
    })!;

    const residual = result.daySummaries[dateKey].worklogs
      .filter((entry) => entry.allocation)
      .find((entry) => entry.allocation!.timeSpentSeconds === 10 * 3600)!;
    expect(toLocalDateKey(new Date(residual.allocation!.started))).toBe(dateKey);
    expect(new Date(residual.allocation!.started).getHours()).toBe(17);
  });
});
