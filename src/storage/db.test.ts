// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { JiraWorklog, SyncResult } from "../../shared/types";
import { getSyncResult, saveSyncResult } from "./db";

const source = (id: string, jiraSite: string, started: string): JiraWorklog => ({
  id,
  issueId: `${id}-issue`,
  issueKey: `TB-${id}`,
  issueSummary: `Worklog ${id}`,
  issueUrl: `${jiraSite}/browse/TB-${id}`,
  authorAccountId: "same-account",
  started,
  created: started,
  updated: started,
  timeSpentSeconds: 16 * 3600
});

const syncResult = (
  weekKey: string,
  jiraSite: string,
  syncedAt: string,
  sourceWorklogs: JiraWorklog[]
): SyncResult => ({
  weekKey,
  weekStartISO: `${weekKey}T00:00:00.000Z`,
  weekEndExclusiveISO: "2026-08-10T00:00:00.000Z",
  syncedAt,
  accountId: "same-account",
  jiraSite,
  trackedSeconds: 0,
  issueCount: 0,
  worklogCount: 0,
  daySummaries: {},
  sourceWorklogs,
  scanStartISO: "2026-04-01T00:00:00.000Z",
  scanEndExclusiveISO: "2026-08-10T00:00:00.000Z"
});

describe("Jira worklog ledger", () => {
  it("refreshes cached weeks while isolating equal account and worklog IDs by Jira site", async () => {
    const siteA = "https://alpha.atlassian.net";
    const siteB = "https://beta.atlassian.net";
    const a1 = source("bulk-1", siteA, "2026-07-14T09:00:00.000Z");
    const a2 = source("shared-id", siteA, "2026-07-21T09:00:00.000Z");
    const b2 = source("shared-id", siteB, "2026-07-28T09:00:00.000Z");

    await saveSyncResult(syncResult("2026-07-13", siteA, "2026-07-14T12:00:00.000Z", [a1]));
    expect((await getSyncResult("2026-07-13"))?.sourceWorklogs?.map((worklog) => worklog.id)).toEqual([
      "bulk-1"
    ]);

    await saveSyncResult(syncResult("2026-07-20", siteA, "2026-07-21T12:00:00.000Z", [a1, a2]));
    const refreshedWeek = await getSyncResult("2026-07-13");
    expect(refreshedWeek?.sourceWorklogs?.map((worklog) => worklog.id).sort()).toEqual(["bulk-1", "shared-id"]);
    expect(refreshedWeek?.sourceWorklogs?.every((worklog) => worklog.issueUrl?.startsWith(siteA))).toBe(true);

    await saveSyncResult(syncResult("2026-07-27", siteB, "2026-07-28T12:00:00.000Z", [b2]));
    const isolatedStoredWeek = await getSyncResult("2026-07-13");
    expect(isolatedStoredWeek?.sourceWorklogs?.map((worklog) => worklog.id).sort()).toEqual([
      "bulk-1",
      "shared-id"
    ]);
    expect(isolatedStoredWeek?.sourceWorklogs?.every((worklog) => worklog.issueUrl?.startsWith(siteA))).toBe(true);

    const synthesizedLatestWeek = await getSyncResult("2026-08-03");
    expect(synthesizedLatestWeek?.jiraSite).toBe(siteB);
    expect(synthesizedLatestWeek?.sourceWorklogs).toEqual([b2]);
  });
});
