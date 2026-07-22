// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { JiraWorklog, RecapDraftRecord, SavedRecap, SyncResult, WorklogAllocationPreference } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../domain/week";
import {
  deleteWorklogAllocationPreference,
  getSyncResult,
  getWorklogAllocationPreferences,
  saveSyncResult,
  saveSettings,
  getRecapDraft,
  getSavedRecaps,
  saveRecapDraft,
  saveSavedRecap,
  saveWorklogAllocationPreference
} from "./db";
import { mergeUpdatedWorklogIntoSyncResult } from "../domain/syncResult";

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

describe("Recap persistence", () => {
  const version = {
    version: 1,
    generatedAt: "2026-06-30T12:00:00.000Z",
    generator: "deterministic" as const,
    interval: {
      key: "quarter:2026-Q2",
      period: "quarter" as const,
      startDateKey: "2026-04-01",
      endDateKeyExclusive: "2026-07-01",
      label: "Q2 2026",
      shortLabel: "Q2 2026",
      calendarLabel: "Q2"
    },
    themes: [],
    sources: [],
    coverage: { requestedWeeks: 14, jiraWeeks: 2, bitbucketWeeks: 1, ticketCount: 0, pullRequestCount: 0, commitCount: 0 }
  };

  it("stores every draft version and the active version by interval", async () => {
    const record: RecapDraftRecord = {
      intervalKey: version.interval.key,
      activeVersion: 2,
      versions: [version, { ...version, version: 2, generatedAt: "2026-06-30T12:05:00.000Z" }]
    };
    await saveRecapDraft(record);
    expect(await getRecapDraft(record.intervalKey)).toEqual(record);
  });

  it("orders saved snapshots newest-first and never overwrites an existing id", async () => {
    const older: SavedRecap = { id: "saved-recap-older", savedAt: "2026-06-20T12:00:00.000Z", format: "perf", detail: "detailed", version };
    const newer: SavedRecap = { id: "saved-recap-newer", savedAt: "2026-06-21T12:00:00.000Z", format: "manager", detail: "balanced", version };
    await saveSavedRecap(older);
    await saveSavedRecap(newer);
    await expect(saveSavedRecap({ ...older, format: "cv" })).rejects.toBeTruthy();
    const stored = (await getSavedRecaps()).filter((item) => item.id.startsWith("saved-recap-"));
    expect(stored.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(stored.find((item) => item.id === older.id)?.format).toBe("perf");
  });
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

const putRawSyncResult = async (result: SyncResult) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("jira-week-tracker");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("syncResults", "readwrite");
    transaction.objectStore("syncResults").put(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
  db.close();
};

describe("Jira worklog ledger", () => {
  it("keeps a legacy cached week usable before the first site-scoped sync", async () => {
    const site = "https://legacy.atlassian.net";
    const legacyWorklog = source("legacy", site, "2026-07-07T09:00:00.000Z");
    legacyWorklog.issueUrl = undefined;
    const legacy: SyncResult = {
      ...syncResult("2026-07-06", site, "2026-07-07T12:00:00.000Z", []),
      jiraSite: undefined,
      sourceWorklogs: undefined,
      trackedSeconds: legacyWorklog.timeSpentSeconds,
      issueCount: 1,
      worklogCount: 1,
      daySummaries: {
        "2026-07-07": {
          trackedSeconds: legacyWorklog.timeSpentSeconds,
          issues: [],
          worklogs: [legacyWorklog]
        }
      }
    };
    await saveSettings({ ...DEFAULT_SETTINGS, jiraBaseUrl: site, jiraEmail: "person@example.com" });
    await putRawSyncResult(legacy);

    expect(await getSyncResult(legacy.weekKey)).toEqual(legacy);

    const newlySynced = source("new-scan", site, "2026-07-14T09:00:00.000Z");
    await saveSyncResult(
      syncResult("2026-07-13", site, "2026-07-14T12:00:00.000Z", [newlySynced])
    );
    const afterContextSync = await getSyncResult(legacy.weekKey);
    expect(afterContextSync).toMatchObject({
      trackedSeconds: legacyWorklog.timeSpentSeconds,
      issueCount: 1,
      worklogCount: 1
    });
    expect(afterContextSync?.daySummaries["2026-07-07"].worklogs).toEqual([legacyWorklog]);
  });

  it("refreshes cached weeks while following the active Jira site context", async () => {
    const siteA = "https://alpha.atlassian.net";
    const siteB = "https://beta.atlassian.net";
    const a1 = source("bulk-1", siteA, "2026-07-14T09:00:00.000Z");
    const a2 = source("shared-id", siteA, "2026-07-21T09:00:00.000Z");
    const b2 = source("shared-id", siteB, "2026-07-28T09:00:00.000Z");

    await saveSettings({ ...DEFAULT_SETTINGS, jiraBaseUrl: siteA, jiraEmail: "person@example.com" });
    await saveSyncResult(syncResult("2026-07-13", siteA, "2026-07-14T12:00:00.000Z", [a1]));
    expect((await getSyncResult("2026-07-13"))?.sourceWorklogs?.map((worklog) => worklog.id)).toEqual([
      "bulk-1"
    ]);

    await saveSyncResult(syncResult("2026-07-20", siteA, "2026-07-21T12:00:00.000Z", [a1, a2]));
    const refreshedWeek = await getSyncResult("2026-07-13");
    expect(refreshedWeek?.sourceWorklogs?.map((worklog) => worklog.id).sort()).toEqual(["bulk-1", "shared-id"]);
    expect(refreshedWeek?.sourceWorklogs?.every((worklog) => worklog.issueUrl?.startsWith(siteA))).toBe(true);

    await saveSettings({ ...DEFAULT_SETTINGS, jiraBaseUrl: siteB, jiraEmail: "person@example.com" });
    await saveSyncResult(syncResult("2026-07-27", siteB, "2026-07-28T12:00:00.000Z", [b2]));
    const activeSiteWeek = await getSyncResult("2026-07-13");
    expect(activeSiteWeek?.sourceWorklogs?.map((worklog) => worklog.id)).toEqual(["shared-id"]);
    expect(activeSiteWeek?.sourceWorklogs?.every((worklog) => worklog.issueUrl?.startsWith(siteB))).toBe(true);

    const synthesizedLatestWeek = await getSyncResult("2026-08-03");
    expect(synthesizedLatestWeek?.jiraSite).toBe(siteB);
    expect(synthesizedLatestWeek?.sourceWorklogs).toEqual([b2]);
    expect(synthesizedLatestWeek).toMatchObject({
      scanStartISO: "2026-04-01T00:00:00.000Z",
      scanEndExclusiveISO: "2026-08-10T00:00:00.000Z"
    });

    const outsidePersistedScan = await getSyncResult("2026-08-17");
    expect(outsidePersistedScan?.sourceWorklogs).toEqual([b2]);
    expect(outsidePersistedScan?.scanStartISO).toBeUndefined();
    expect(outsidePersistedScan?.scanEndExclusiveISO).toBeUndefined();
  });

  it("orders synthesized sync timestamps by instant instead of Jira date syntax", async () => {
    const site = "https://dates.atlassian.net";
    const earlier = source("offset-earlier", site, "2026-08-03T09:00:00.000Z");
    earlier.updated = "2026-08-04T02:30:00.000+0200";
    const later = source("z-later", site, "2026-08-04T09:00:00.000Z");
    later.updated = "2026-08-04T01:00:00.000Z";

    await saveSettings({ ...DEFAULT_SETTINGS, jiraBaseUrl: site, jiraEmail: "person@example.com" });
    await saveSyncResult(syncResult("2026-08-03", site, "2026-08-05T12:00:00.000Z", [earlier, later]));
    const synthesized = await getSyncResult("2026-08-10");

    expect(synthesized?.syncedAt).toBe(later.updated);
  });

  it("stores equal worklog preference IDs independently by Jira site", async () => {
    const timestamp = "2026-08-05T12:00:00.000Z";
    const preference = (jiraSite: string, direction: WorklogAllocationPreference["direction"]): WorklogAllocationPreference => ({
      preferenceKey: JSON.stringify([jiraSite, "same-account", "shared-id"]),
      jiraSite,
      authorAccountId: "same-account",
      worklogId: "shared-id",
      direction,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    await saveWorklogAllocationPreference(preference("https://alpha.atlassian.net", "backward"));
    await saveWorklogAllocationPreference(preference("https://beta.atlassian.net", "forward"));
    const stored = (await getWorklogAllocationPreferences()).filter(
      (entry) => entry.worklogId === "shared-id"
    );

    expect(stored).toHaveLength(2);
    expect(stored.map((entry) => entry.direction).sort()).toEqual(["backward", "forward"]);

    await deleteWorklogAllocationPreference(
      JSON.stringify(["https://alpha.atlassian.net", "same-account", "shared-id"])
    );
    const remaining = (await getWorklogAllocationPreferences()).filter(
      (entry) => entry.worklogId === "shared-id"
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      jiraSite: "https://beta.atlassian.net",
      direction: "forward"
    });
  });

  it("populates raw day buckets when synthesizing a ledger-only week", async () => {
    const site = "https://ledger-only.atlassian.net";
    const ordinary = source("ledger-normal", site, "2026-08-18T09:00:00.000Z");
    ordinary.timeSpentSeconds = 2 * 3600;

    await saveSettings({ ...DEFAULT_SETTINGS, jiraBaseUrl: site, jiraEmail: "person@example.com" });
    await saveSyncResult(
      syncResult("2026-08-10", site, "2026-08-20T12:00:00.000Z", [ordinary])
    );
    const synthesized = await getSyncResult("2026-08-17");

    expect(synthesized).toMatchObject({
      trackedSeconds: 2 * 3600,
      issueCount: 1,
      worklogCount: 1
    });
    expect(synthesized?.daySummaries["2026-08-18"].worklogs).toEqual([ordinary]);
    expect(synthesized?.daySummaries["2026-08-18"].issues[0]).toMatchObject({
      key: ordinary.issueKey,
      loggedSeconds: 2 * 3600
    });

    const moved = mergeUpdatedWorklogIntoSyncResult(synthesized, {
      worklogId: ordinary.id,
      startedISO: "2026-08-18T10:00:00.000Z",
      timeSpentSeconds: 3 * 3600
    });
    expect(moved?.daySummaries["2026-08-18"].worklogs[0]).toMatchObject({
      id: ordinary.id,
      started: "2026-08-18T10:00:00.000Z",
      timeSpentSeconds: 3 * 3600
    });
  });

  it("does not synthesize history after Jira site or account settings change before sync", async () => {
    const site = "https://previous.atlassian.net";
    const ordinary = source("previous-site", site, "2026-08-25T09:00:00.000Z");
    await saveSettings({ ...DEFAULT_SETTINGS, jiraBaseUrl: site, jiraEmail: "old@example.com" });
    await saveSyncResult(
      syncResult("2026-08-17", site, "2026-08-25T12:00:00.000Z", [ordinary])
    );

    await saveSettings({ ...DEFAULT_SETTINGS, jiraBaseUrl: site, jiraEmail: "new@example.com" });
    expect(await getSyncResult("2026-08-24")).toBeUndefined();

    await saveSettings({
      ...DEFAULT_SETTINGS,
      jiraBaseUrl: "https://new.atlassian.net",
      jiraEmail: "old@example.com"
    });
    expect(await getSyncResult("2026-08-24")).toBeUndefined();
  });
});
