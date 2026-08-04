import { describe, expect, it } from "vitest";
import type { JiraTicket, SyncResult } from "../../shared/types";
import {
  mergeCreatedWorklogIntoSyncResult,
  mergeMovedWorklogIntoSyncResult,
  mergeUpdatedWorklogIntoSyncResult
} from "./syncResult";

const ticket: JiraTicket = {
  id: "10002",
  key: "TB-22",
  summary: "Wire immediate worklog refresh",
  projectKey: "TB",
  projectName: "Yesterlog",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  issueType: { name: "Task", hierarchyLevel: 0 },
  epic: {
    id: "10000",
    key: "TB-1",
    summary: "Time tracking polish",
    url: "https://example.atlassian.net/browse/TB-1"
  },
  url: "https://example.atlassian.net/browse/TB-22"
};

const syncResult: SyncResult = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-18T08:00:00.000Z",
  accountId: "account-1",
  displayName: "Dev User",
  trackedSeconds: 3600,
  issueCount: 1,
  worklogCount: 1,
  daySummaries: {
    "2026-06-18": {
      trackedSeconds: 3600,
      issues: [
        {
          id: "10001",
          key: "TB-10",
          summary: "Existing work",
          loggedSeconds: 3600
        }
      ],
      worklogs: [
        {
          id: "20001",
          issueId: "10001",
          issueKey: "TB-10",
          issueSummary: "Existing work",
          authorAccountId: "account-1",
          started: "2026-06-18T08:00:00.000Z",
          timeSpentSeconds: 3600
        }
      ]
    }
  }
};

describe("mergeCreatedWorklogIntoSyncResult", () => {
  it("adds a newly created worklog for a ticket missing from the fresh sync result", () => {
    const merged = mergeCreatedWorklogIntoSyncResult(syncResult, {
      ticket,
      worklogId: "20002",
      startedISO: "2026-06-18T11:00:00.000Z",
      timeSpentSeconds: 1800,
      comment: "Added through the modal",
      syncedAtISO: "2026-06-18T11:01:00.000Z"
    });

    expect(merged).toBeDefined();
    expect(merged).not.toBe(syncResult);
    expect(merged?.trackedSeconds).toBe(5400);
    expect(merged?.worklogCount).toBe(2);
    expect(merged?.issueCount).toBe(2);
    expect(merged?.syncedAt).toBe("2026-06-18T11:01:00.000Z");
    expect(merged?.daySummaries["2026-06-18"].trackedSeconds).toBe(5400);
    expect(merged?.daySummaries["2026-06-18"].worklogs[1]).toMatchObject({
      id: "20002",
      issueId: "10002",
      issueKey: "TB-22",
      issueSummary: "Wire immediate worklog refresh",
      issueUrl: "https://example.atlassian.net/browse/TB-22",
      authorAccountId: "account-1",
      started: "2026-06-18T11:00:00.000Z",
      timeSpentSeconds: 1800,
      comment: "Added through the modal"
    });
    expect(merged?.daySummaries["2026-06-18"].issues[1]).toMatchObject({
      id: "10002",
      key: "TB-22",
      summary: "Wire immediate worklog refresh",
      loggedSeconds: 1800,
      comments: ["Added through the modal"]
    });
  });

  it("increments an existing issue without duplicating its comments", () => {
    const base: SyncResult = {
      ...syncResult,
      daySummaries: {
        "2026-06-18": {
          ...syncResult.daySummaries["2026-06-18"],
          issues: [
            {
              id: "10002",
              key: "TB-22",
              summary: "Wire immediate worklog refresh",
              loggedSeconds: 900,
              comments: ["Added through the modal"]
            }
          ],
          worklogs: []
        }
      }
    };

    const merged = mergeCreatedWorklogIntoSyncResult(base, {
      ticket,
      worklogId: "20003",
      startedISO: "2026-06-18T12:00:00.000Z",
      timeSpentSeconds: 900,
      comment: "Added through the modal"
    });

    expect(merged?.daySummaries["2026-06-18"].issues).toHaveLength(1);
    expect(merged?.daySummaries["2026-06-18"].issues[0].loggedSeconds).toBe(1800);
    expect(merged?.daySummaries["2026-06-18"].issues[0].comments).toEqual(["Added through the modal"]);
  });

  it("returns the same result when the worklog is already present", () => {
    const merged = mergeCreatedWorklogIntoSyncResult(syncResult, {
      ticket,
      worklogId: "20001",
      startedISO: "2026-06-18T08:00:00.000Z",
      timeSpentSeconds: 1800
    });

    expect(merged).toBe(syncResult);
  });
});

describe("mergeUpdatedWorklogIntoSyncResult", () => {
  // Local-time fixture so day-bucket keys line up with toLocalDateKey regardless of TZ.
  const at = (hour: number, minute = 0) => new Date(2026, 5, 18, hour, minute).toISOString();
  const dayKey = "2026-06-18";
  const base = (): SyncResult => ({
    weekKey: "2026-06-15",
    weekStartISO: new Date(2026, 5, 15).toISOString(),
    weekEndExclusiveISO: new Date(2026, 5, 22).toISOString(),
    syncedAt: at(8),
    accountId: "account-1",
    trackedSeconds: 3600,
    issueCount: 1,
    worklogCount: 1,
    daySummaries: {
      [dayKey]: {
        trackedSeconds: 3600,
        issues: [{ id: "10001", key: "TB-10", summary: "Existing work", loggedSeconds: 3600, comments: ["kept"] }],
        worklogs: [
          {
            id: "20001",
            issueId: "10001",
            issueKey: "TB-10",
            issueSummary: "Existing work",
            authorAccountId: "account-1",
            started: at(8),
            timeSpentSeconds: 3600,
            comment: "kept"
          }
        ]
      }
    }
  });

  it("resizes a worklog in place, keeping bucket + issue + top totals consistent", () => {
    const merged = mergeUpdatedWorklogIntoSyncResult(base(), {
      worklogId: "20001",
      startedISO: at(8),
      timeSpentSeconds: 5400
    });

    expect(merged).not.toBe(base());
    expect(merged?.trackedSeconds).toBe(5400);
    expect(merged?.worklogCount).toBe(1);
    expect(merged?.daySummaries[dayKey].trackedSeconds).toBe(5400);
    expect(merged?.daySummaries[dayKey].issues[0].loggedSeconds).toBe(5400);
    expect(merged?.daySummaries[dayKey].worklogs[0]).toMatchObject({ timeSpentSeconds: 5400, comment: "kept" });
  });

  it("moves a worklog to a new time within the same day", () => {
    const merged = mergeUpdatedWorklogIntoSyncResult(base(), {
      worklogId: "20001",
      startedISO: at(10),
      timeSpentSeconds: 3600
    });

    expect(merged?.trackedSeconds).toBe(3600);
    expect(merged?.daySummaries[dayKey].trackedSeconds).toBe(3600);
    expect(merged?.daySummaries[dayKey].worklogs[0].started).toBe(at(10));
  });

  it("shifts a worklog across midnight between day buckets", () => {
    const nextDay = new Date(2026, 5, 19, 10, 0).toISOString();
    const merged = mergeUpdatedWorklogIntoSyncResult(base(), {
      worklogId: "20001",
      startedISO: nextDay,
      timeSpentSeconds: 3600
    });

    expect(merged?.trackedSeconds).toBe(3600);
    expect(merged?.daySummaries[dayKey].trackedSeconds).toBe(0);
    expect(merged?.daySummaries[dayKey].worklogs).toHaveLength(0);
    expect(merged?.daySummaries[dayKey].issues[0].loggedSeconds).toBe(0);
    expect(merged?.daySummaries["2026-06-19"].trackedSeconds).toBe(3600);
    expect(merged?.daySummaries["2026-06-19"].worklogs).toHaveLength(1);
    expect(merged?.daySummaries["2026-06-19"].issues[0]).toMatchObject({ key: "TB-10", loggedSeconds: 3600 });
  });

  it("returns the input unchanged when the worklog is missing", () => {
    const input = base();
    expect(mergeUpdatedWorklogIntoSyncResult(input, { worklogId: "nope", startedISO: at(9), timeSpentSeconds: 900 })).toBe(
      input
    );
  });

  it("returns the input unchanged when the new start is outside the synced week", () => {
    const input = base();
    const outside = new Date(2026, 6, 1, 10, 0).toISOString();
    expect(mergeUpdatedWorklogIntoSyncResult(input, { worklogId: "20001", startedISO: outside, timeSpentSeconds: 900 })).toBe(
      input
    );
  });
});

describe("mergeMovedWorklogIntoSyncResult", () => {
  it("retargets the cached worklog while keeping time totals and worklog identity stable", () => {
    const source = {
      ...syncResult,
      sourceWorklogs: [syncResult.daySummaries["2026-06-18"].worklogs[0]]
    };

    const merged = mergeMovedWorklogIntoSyncResult(source, {
      worklogId: "20001",
      targetTicket: ticket,
      syncedAtISO: "2026-06-18T12:00:00.000Z"
    });

    expect(merged).not.toBe(source);
    expect(merged?.trackedSeconds).toBe(3600);
    expect(merged?.worklogCount).toBe(1);
    expect(merged?.issueCount).toBe(1);
    expect(merged?.daySummaries["2026-06-18"].worklogs[0]).toMatchObject({
      id: "20001",
      issueId: ticket.id,
      issueKey: ticket.key,
      issueSummary: ticket.summary,
      authorAccountId: "account-1",
      started: "2026-06-18T08:00:00.000Z",
      timeSpentSeconds: 3600
    });
    expect(merged?.daySummaries["2026-06-18"].issues).toEqual([
      expect.objectContaining({ key: ticket.key, loggedSeconds: 3600 })
    ]);
    expect(merged?.sourceWorklogs?.[0]).toMatchObject({ id: "20001", issueKey: ticket.key });
  });

  it("returns the input unchanged when the worklog is missing", () => {
    expect(
      mergeMovedWorklogIntoSyncResult(syncResult, { worklogId: "missing", targetTicket: ticket })
    ).toBe(syncResult);
  });
});
