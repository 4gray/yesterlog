// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { JiraWorklog, RecapDraftRecord, SavedRecap, SyncResult, WorklogAllocationPreference } from "../../shared/types";
import type {
  NoteNotebook,
  WorkspaceNoteBucket,
  WorkspaceNoteJiraScope
} from "../domain/ticketNotes";
import { DEFAULT_SETTINGS } from "../domain/week";
import {
  deleteWorkspaceNoteBucket,
  deleteWorklogAllocationPreference,
  getNoteNotebooks,
  getNoteTicketActivity,
  getSyncResult,
  getWorkspaceNoteJiraScope,
  getWorkspaceNoteBuckets,
  getWorklogAllocationPreferences,
  getRecapDraft,
  getSavedRecaps,
  saveNoteNotebooks,
  saveRecapDraft,
  saveSavedRecap,
  saveSettings,
  saveSyncResult,
  saveWorkspaceNoteBucket,
  saveWorkspaceNoteBuckets,
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

describe("notes workspace schema migration", () => {
  it("upgrades matching version 14 Jira buckets into site/account-scoped records", async () => {
    const jiraSite = "https://migration-notes.atlassian.net";
    const authorAccountId = "migration-account";
    const jiraEmail = "migration@example.com";
    const logicalContainerId = "NOTES-MIGRATE";
    const storageKey = JSON.stringify([
      "jira",
      jiraSite,
      authorAccountId,
      logicalContainerId
    ]);

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("jira-week-tracker", 14);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        const settingsStore = db.createObjectStore("settings", {
          keyPath: "id"
        });
        const notesStore = db.createObjectStore("workspaceNotes", {
          keyPath: "containerId"
        });
        settingsStore.put({
          id: "default",
          ...DEFAULT_SETTINGS,
          jiraBaseUrl: jiraSite,
          jiraEmail
        });
        settingsStore.put({
          id: "jira-context",
          jiraSite,
          authorAccountId,
          jiraEmail,
          syncedAt: "2026-07-24T09:00:00.000Z"
        });
        notesStore.put({
          containerId: "GENERAL",
          notes: []
        });
        notesStore.put({
          containerId: logicalContainerId,
          jira: {
            key: logicalContainerId,
            summary: "Legacy matching note",
            url: `${jiraSite}/browse/${logicalContainerId}`
          },
          notes: [
            {
              id: "legacy-note",
              type: "text",
              done: false,
              text: "Migrate me",
              createdAt: "2026-07-24T09:00:00.000Z",
              updatedAt: "2026-07-24T09:00:00.000Z"
            }
          ]
        });
        notesStore.put({
          containerId: storageKey,
          logicalContainerId,
          jiraSite,
          authorAccountId,
          jira: {
            key: logicalContainerId,
            summary: "Existing scoped note",
            url: `${jiraSite}/browse/${logicalContainerId}`
          },
          notes: [
            {
              id: "scoped-note",
              type: "todo",
              done: false,
              text: "Keep me too",
              createdAt: "2026-07-24T09:01:00.000Z",
              updatedAt: "2026-07-24T09:01:00.000Z"
            }
          ]
        });
        notesStore.put({
          containerId: "NOTES-FOREIGN",
          jira: {
            key: "NOTES-FOREIGN",
            summary: "Foreign site note",
            url: "https://foreign-notes.atlassian.net/browse/NOTES-FOREIGN"
          },
          notes: []
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });

    const scope = await getWorkspaceNoteJiraScope();
    expect(scope).toEqual({ jiraSite, authorAccountId });
    const migrated = await getWorkspaceNoteBuckets(scope);
    expect(migrated.map((bucket) => bucket.containerId)).toEqual([
      "GENERAL",
      logicalContainerId
    ]);
    expect(
      migrated.find((bucket) => bucket.containerId === logicalContainerId)?.notes
    ).toEqual([
      expect.objectContaining({ id: "legacy-note" }),
      expect.objectContaining({ id: "scoped-note" })
    ]);
    expect(await getNoteNotebooks()).toEqual([]);

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("jira-week-tracker");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    expect(db.version).toBe(16);
    expect([...db.objectStoreNames]).toContain("prAnalytics");
    expect([...db.objectStoreNames]).toContain("workspaceNotes");
    expect([...db.objectStoreNames]).toContain("noteNotebooks");
    expect([...db.objectStoreNames]).toContain("personalNotes");
    const rawBuckets = await new Promise<Array<{ containerId: string }>>(
      (resolve, reject) => {
        const transaction = db.transaction("workspaceNotes", "readonly");
        const request = transaction.objectStore("workspaceNotes").getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      }
    );
    expect(rawBuckets.map((bucket) => bucket.containerId)).toContain(storageKey);
    expect(rawBuckets.map((bucket) => bucket.containerId)).not.toContain(
      logicalContainerId
    );
    expect(rawBuckets.map((bucket) => bucket.containerId)).toContain(
      "NOTES-FOREIGN"
    );
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        ["settings", "workspaceNotes"],
        "readwrite"
      );
      transaction.objectStore("settings").clear();
      transaction.objectStore("workspaceNotes").clear();
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
    db.close();
  });
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

describe("Notes workspace persistence", () => {
  const notesScope: WorkspaceNoteJiraScope = {
    jiraSite: "https://notes-storage.atlassian.net",
    authorAccountId: "notes-account"
  };

  const bucket: WorkspaceNoteBucket = {
    containerId: "NOTES-900",
    jira: {
      key: "NOTES-900",
      summary: "Persist local ticket notes",
      url: "https://notes-storage.atlassian.net/browse/NOTES-900",
      statusName: "In Progress",
      statusCategory: "indeterminate",
      issueType: { name: "Task", hierarchyLevel: 0 }
    },
    notes: [
      {
        id: "workspace-note-1",
        type: "todo",
        done: false,
        text: "Keep this on device",
        createdAt: "2026-07-24T09:00:00.000Z",
        updatedAt: "2026-07-24T09:00:00.000Z"
      }
    ]
  };

  const notebooks: NoteNotebook[] = [
    {
      id: "notebook:one-on-one",
      title: "1:1 with Lena",
      createdAt: "2026-07-24T09:00:00.000Z",
      updatedAt: "2026-07-24T09:00:00.000Z"
    }
  ];

  it("stores note buckets independently by flat container id", async () => {
    await saveWorkspaceNoteBucket(bucket, notesScope);
    await saveWorkspaceNoteBucket({
      containerId: "GENERAL",
      document: {
        text: "Loose thoughts\n\nA second paragraph",
        editorState: '{"root":{"type":"root","children":[]}}',
        updatedAt: "2026-07-24T10:00:00.000Z"
      },
      notes: [{ ...bucket.notes[0], id: "workspace-note-general" }]
    });

    const stored = await getWorkspaceNoteBuckets(notesScope);
    expect(stored.find((item) => item.containerId === bucket.containerId)).toEqual(
      bucket
    );
    expect(stored.find((item) => item.containerId === "GENERAL")?.notes[0].id).toBe(
      "workspace-note-general"
    );
    expect(stored.find((item) => item.containerId === "GENERAL")?.document).toEqual({
      text: "Loose thoughts\n\nA second paragraph",
      editorState: '{"root":{"type":"root","children":[]}}',
      updatedAt: "2026-07-24T10:00:00.000Z"
    });

    await deleteWorkspaceNoteBucket(bucket.containerId, notesScope);
    expect(
      (await getWorkspaceNoteBuckets(notesScope)).find(
        (item) => item.containerId === bucket.containerId
      )
    ).toBeUndefined();
  });

  it("stores both sides of a note move in one batch", async () => {
    const source: WorkspaceNoteBucket = {
      ...bucket,
      containerId: "NOTES-MOVE-SOURCE",
      notes: []
    };
    const target: WorkspaceNoteBucket = {
      containerId: "GENERAL",
      notes: [{ ...bucket.notes[0], id: "workspace-note-moved" }]
    };

    await saveWorkspaceNoteBuckets([source, target], notesScope);

    const stored = await getWorkspaceNoteBuckets(notesScope);
    expect(
      stored.find((item) => item.containerId === source.containerId)?.notes
    ).toEqual([]);
    expect(
      stored.find((item) => item.containerId === target.containerId)?.notes[0].id
    ).toBe("workspace-note-moved");
  });

  it("persists the flat notebook list separately", async () => {
    await saveNoteNotebooks(notebooks);
    expect(await getNoteNotebooks()).toEqual(notebooks);

    const renamed = [{ ...notebooks[0], title: "Weekly 1:1" }];
    await saveNoteNotebooks(renamed);
    expect(await getNoteNotebooks()).toEqual(renamed);
  });

  it("isolates equal Jira keys by site and account while sharing General", async () => {
    const scopes: WorkspaceNoteJiraScope[] = [
      {
        jiraSite: "https://notes-isolation-a.atlassian.net",
        authorAccountId: "account-a"
      },
      {
        jiraSite: "https://notes-isolation-b.atlassian.net",
        authorAccountId: "account-a"
      },
      {
        jiraSite: "https://notes-isolation-a.atlassian.net",
        authorAccountId: "account-b"
      }
    ];
    const containerId = "NOTES-ISOLATED";
    for (const [index, scope] of scopes.entries()) {
      await saveWorkspaceNoteBucket(
        {
          containerId,
          jira: {
            key: containerId,
            summary: `Scoped ticket ${index}`,
            url: `${scope.jiraSite}/browse/${containerId}`
          },
          notes: [
            {
              ...bucket.notes[0],
              id: `isolated-note-${index}`,
              text: `Scope ${index}`
            }
          ]
        },
        scope
      );
    }
    await saveWorkspaceNoteBucket({
      containerId: "GENERAL",
      notes: [
        {
          ...bucket.notes[0],
          id: "shared-general-note",
          text: "Shared General"
        }
      ]
    });

    for (const [index, scope] of scopes.entries()) {
      const stored = await getWorkspaceNoteBuckets(scope);
      expect(
        stored.find((item) => item.containerId === containerId)?.notes
      ).toEqual([expect.objectContaining({ id: `isolated-note-${index}` })]);
      expect(
        stored.find((item) => item.containerId === "GENERAL")?.notes
      ).toEqual([expect.objectContaining({ id: "shared-general-note" })]);
    }

    await deleteWorkspaceNoteBucket(containerId, scopes[0]);
    expect(
      (await getWorkspaceNoteBuckets(scopes[0])).find(
        (item) => item.containerId === containerId
      )
    ).toBeUndefined();
    expect(
      (await getWorkspaceNoteBuckets(scopes[1])).find(
        (item) => item.containerId === containerId
      )?.notes[0].id
    ).toBe("isolated-note-1");
  });

  it("keeps Jira writes atomic when no explicit account scope is available", async () => {
    const originalGeneral: WorkspaceNoteBucket = {
      containerId: "GENERAL",
      notes: [
        {
          ...bucket.notes[0],
          id: "atomic-general-original",
          text: "Original General"
        }
      ]
    };
    await saveWorkspaceNoteBucket(originalGeneral);

    await expect(saveWorkspaceNoteBucket(bucket, null)).rejects.toThrow(
      "Sync Jira once"
    );
    await expect(
      saveWorkspaceNoteBuckets(
        [
          bucket,
          {
            ...originalGeneral,
            notes: [
              {
                ...bucket.notes[0],
                id: "atomic-general-overwrite",
                text: "Must not be stored"
              }
            ]
          }
        ],
        null
      )
    ).rejects.toThrow("Sync Jira once");

    const globalsOnly = await getWorkspaceNoteBuckets(null);
    expect(globalsOnly).toEqual([originalGeneral]);
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
  scanEndExclusiveISO: "2026-08-10T00:00:00.000Z",
  worklogSyncCursorMs: new Date(syncedAt).getTime() - 60_000
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
      scanEndExclusiveISO: "2026-08-10T00:00:00.000Z",
      worklogSyncCursorMs: new Date("2026-07-28T11:59:00.000Z").getTime()
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

describe("Notes ticket activity index", () => {
  it("aggregates the active Jira context by key using the latest started worklog snapshot", async () => {
    const site = "https://notes-activity.atlassian.net";
    const older = {
      ...source("notes-older", site, "2026-07-21T09:00:00.000Z"),
      issueKey: "NOTES-42",
      issueSummary: "Older ticket title",
      issueType: { name: "Task", hierarchyLevel: 0 },
      timeSpentSeconds: 1800
    };
    const newer = {
      ...source("notes-newer", site, "2026-07-24T11:00:00.000Z"),
      issueKey: "NOTES-42",
      issueSummary: "Current ticket title",
      issueType: { name: "Story", hierarchyLevel: 0 },
      epic: {
        id: "epic-1",
        key: "NOTES-1",
        summary: "Notes workspace",
        url: `${site}/browse/NOTES-1`
      },
      timeSpentSeconds: 5400
    };
    const other = {
      ...source("notes-other", site, "2026-07-23T10:00:00.000Z"),
      issueKey: "NOTES-7",
      issueSummary: "Another ticket",
      timeSpentSeconds: 900
    };

    await saveSettings({
      ...DEFAULT_SETTINGS,
      jiraBaseUrl: site,
      jiraEmail: "notes@example.com"
    });
    await saveSyncResult(
      syncResult(
        "2026-07-20",
        site,
        "2026-07-24T12:00:00.000Z",
        [older, newer, other]
      )
    );

    const activity = (await getNoteTicketActivity()).filter((item) =>
      item.key.startsWith("NOTES-")
    );

    expect(activity.map((item) => item.key)).toEqual(["NOTES-42", "NOTES-7"]);
    expect(activity[0]).toEqual({
      key: "NOTES-42",
      summary: "Current ticket title",
      url: newer.issueUrl,
      issueType: { name: "Story", hierarchyLevel: 0 },
      epic: {
        id: "epic-1",
        key: "NOTES-1",
        summary: "Notes workspace",
        url: `${site}/browse/NOTES-1`
      },
      lastWorkedAt: "2026-07-24T11:00:00.000Z",
      loggedSeconds: 7200
    });
    expect(activity[1]).toMatchObject({
      key: "NOTES-7",
      lastWorkedAt: "2026-07-23T10:00:00.000Z",
      loggedSeconds: 900
    });
  });

  it("returns no ledger activity when configured Jira identity no longer matches", async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      jiraBaseUrl: "https://notes-activity.atlassian.net",
      jiraEmail: "someone-else@example.com"
    });

    expect(await getNoteTicketActivity()).toEqual([]);
  });
});
