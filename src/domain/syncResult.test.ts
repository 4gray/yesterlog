import { describe, expect, it } from "vitest";
import type { JiraTicket, SyncResult } from "../../shared/types";
import { mergeCreatedWorklogIntoSyncResult } from "./syncResult";

const ticket: JiraTicket = {
  id: "10002",
  key: "TB-22",
  summary: "Wire immediate worklog refresh",
  projectKey: "TB",
  projectName: "TimeBro",
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
