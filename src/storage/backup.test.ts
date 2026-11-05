// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_DB_VERSION, BACKUP_STORE_KEYS, RESTORE_PREFERENCES_KEY,
  parseBackup, validateBackup, type AppBackup, type BackupStores } from "../domain/backup";
import { createDemoScenario } from "../demo/fixtures";
import { demoPrAnalytics } from "../demo/prAnalytics";
import { buildDefaultRecurringEvents } from "../domain/recurring";
import { buildDeterministicRecap, recapIntervalForDate } from "../domain/recapWorkspace";
import { DEFAULT_SETTINGS } from "../domain/week";
import { applyRestoredPreferences, createBackupSnapshot, getSettings, getWorkspaceNoteBuckets,
  restoreBackupSnapshot, reuseVerifiedAnalyticsCache, savePersonalNotes, saveSettings, saveSyncResult } from "./db";
import { analyticsConnectionKey } from "../../shared/prAnalytics";
import { beginDataTransfer, endDataTransfer, registerDataFlusher, trackDataOperation } from "./dataTransfer";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const now = "2026-06-18T12:00:00.000Z";
const fixture = (): AppBackup => {
  const demo = (today: string) => createDemoScenario({ enabled: true, view: "week", reportTab: "summary",
    theme: "dark", seed: "backup", today: new Date(today), updateAvailable: false });
  const first = demo(now), second = demo("2026-07-09T12:00:00.000Z");
  const site = first.settings.jiraBaseUrl;
  const account = first.syncResult.accountId;
  const logs = Object.values(first.syncResult.daySummaries).flatMap((bucket) => bucket.worklogs);
  const analytics = demoPrAnalytics(first.settings, { start: new Date("2026-06-01"), end: new Date("2026-07-01") });
  const recap = buildDeterministicRecap({ interval: recapIntervalForDate("week", first.today),
    syncResults: [first.syncResult], personalNotes: first.personalNotes, reviewResults: [first.bitbucketReviewResult],
    activityResults: [], recurringEntries: [], reconstructDrafts: {} }, 1, new Date(now));
  const stores: BackupStores = {
    settings: [{ id: "default", ...first.settings, jiraApiToken: "SECRET-JIRA", bitbucketApiToken: "SECRET-BB",
      aiEnabled: true, claudeCliPath: "/linux/claude", codexCliPath: "/linux/codex" },
    { id: "jira-context", jiraSite: site, authorAccountId: account, jiraEmail: first.settings.jiraEmail, syncedAt: now, jiraApiToken: "CONTEXT-SECRET" }],
    weekOverrides: [{ ...first.weekOverride }, { ...second.weekOverride }], syncResults: [{ ...first.syncResult }, { ...second.syncResult }],
    jiraActivityResults: [{ ...(first.jiraActivityResult ?? {
      weekKey: first.syncResult.weekKey, weekStartISO: first.syncResult.weekStartISO,
      weekEndExclusiveISO: first.syncResult.weekEndExclusiveISO, syncedAt: now,
      accountId: account, issueCount: 1, activityCount: 1,
      activities: [{ id: "activity", kind: "comment", issueId: "1", issueKey: "YLOG-1",
        issueSummary: "An issue", actorAccountId: account, dateKey: "2026-06-18", occurredAt: now,
        title: "Commented", description: "Review this", estimatedSeconds: 900, confidence: "high" }]
    }) }], favorites: [{ id: "default", keys: first.favoriteKeys }],
    personalNotes: [first, second].map((d) => ({ weekKey: d.syncResult.weekKey, notes: d.personalNotes })),
    bitbucketReviewResults: [{ ...first.bitbucketReviewResult }, { ...second.bitbucketReviewResult }],
    prAnalytics: [{ cacheKey: JSON.stringify([analyticsConnectionKey(first.settings), "old-token-hash"]), accountKey: "demo-me", repositories: analytics }],
    recurringEvents: [{ id: "default", events: buildDefaultRecurringEvents(now) }],
    recurringOccurrences: [first, second].map((d) => ({ weekKey: d.syncResult.weekKey, occurrences: d.recurringOccurrences })),
    reconstructDrafts: [{ dateKey: "2026-06-18", placements: { signal: 600 }, durations: { signal: 45 } }],
    reconstructAiDrafts: [{ dateKey: "2026-06-18", drafts: { entries: { signal: "AI draft" }, gaps: { "12": "Planning" } } }],
    recapDrafts: [{ intervalKey: recap.interval.key, activeVersion: 1, versions: [recap] }],
    savedRecaps: [{ id: "saved", savedAt: now, format: "manager", detail: "balanced", version: recap }],
    worklogAllocationPreferences: [{ preferenceKey: "allocation", jiraSite: site, authorAccountId: account,
      worklogId: logs[0].id, direction: "backward", createdAt: now, updatedAt: now }],
    jiraWorklogs: logs.map((worklog) => ({ cacheKey: JSON.stringify([site, worklog.id]), jiraSite: site, authorAccountId: account, worklog })),
    workspaceNotes: [
      { containerId: "GENERAL", document: { text: "**Rich text**", editorState: '{"root":{"children":[]}}', updatedAt: now }, notes: [] },
      { containerId: JSON.stringify(["jira", site, account, "YLOG-1"]), logicalContainerId: "YLOG-1", jiraSite: site,
        authorAccountId: account, notes: [{ id: "todo", type: "todo", done: false, text: "Finish this", createdAt: now, updatedAt: now }] },
      { containerId: JSON.stringify(["jira", site, "another-account", "YLOG-1"]), logicalContainerId: "YLOG-1", jiraSite: site,
        authorAccountId: "another-account", notes: [{ id: "private", type: "text", done: false, text: "Other account", createdAt: now, updatedAt: now }] },
      { containerId: "notebook:book", notes: [] }, { containerId: "LEGACY-1", notes: [] }
    ],
    noteNotebooks: [{ id: "default", notebooks: [{ id: "book", title: "My book", createdAt: now, updatedAt: now }] }]
  };
  return { format: "yesterlog-backup", version: 1, appVersion: "3.4.0", dbVersion: BACKUP_DB_VERSION,
    exportedAt: now, stores, preferences: { "yesterlog-theme": "dark", "yesterlog-week-view-mode": "timeline",
      [`yesterlog:pr-analytics:${analyticsConnectionKey(first.settings)}`]: '{"author":"me"}' } };
};

const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("jira-week-tracker", BACKUP_DB_VERSION);
  request.onupgradeneeded = () => {
    for (const [name, keyPath] of Object.entries(BACKUP_STORE_KEYS)) request.result.createObjectStore(name, { keyPath });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const seed = async (stores?: BackupStores) => {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(Object.keys(BACKUP_STORE_KEYS), "readwrite");
    for (const name of Object.keys(BACKUP_STORE_KEYS) as (keyof BackupStores)[]) {
      tx.objectStore(name).clear();
      for (const row of stores?.[name] ?? []) tx.objectStore(name).put(row);
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
};

beforeEach(async () => { endDataTransfer(); vi.restoreAllMocks(); await getSettings(); await seed(); });

describe("portable full backup", () => {
  it("covers every store created by the production database schema", async () => {
    const db = await database();
    expect([...db.objectStoreNames]).toEqual(Object.keys(BACKUP_STORE_KEYS).sort());
    db.close();
  });

  it("exports every store across weeks and accounts, strips credentials, and round-trips raw records", async () => {
    const original = fixture();
    expect(Object.values(original.stores).every((rows) => rows.length > 0)).toBe(true);
    await seed(original.stores);
    const preferences = new MemoryStorage();
    for (const [key, value] of Object.entries(original.preferences)) preferences.setItem(key, value);
    preferences.setItem("yesterlog-update-info", "device-specific");
    preferences.setItem("unrelated", "do not export");
    const backup = await createBackupSnapshot("3.4.0", preferences);
    const serialized = JSON.stringify(backup);
    expect(serialized).not.toMatch(/SECRET-JIRA|SECRET-BB|CONTEXT-SECRET|\/linux\/|jiraApiToken|bitbucketApiToken|device-specific|do not export/);
    expect(backup.preferences).toEqual(original.preferences);
    expect(backup.stores.workspaceNotes).toEqual(expect.arrayContaining(original.stores.workspaceNotes));
    expect(backup.stores.personalNotes).toEqual(original.stores.personalNotes);
    await seed();
    await saveSettings({ ...DEFAULT_SETTINGS, jiraApiToken: "TARGET-TOKEN", bitbucketApiToken: "TARGET-BB" });
    await restoreBackupSnapshot(parseBackup(serialized));
    preferences.setItem("yesterlog-active-dock", "1");
    await applyRestoredPreferences(preferences);
    const result = await createBackupSnapshot("3.4.0", preferences);
    expect(result.stores).toEqual(backup.stores);
    expect(result.preferences).toEqual(backup.preferences);
    expect(preferences.getItem("unrelated")).toBe("do not export");
    expect(preferences.getItem("yesterlog-update-info")).toBe("device-specific");
    expect(preferences.getItem("yesterlog-active-dock")).toBeNull();
    expect(await getSettings()).toMatchObject({ jiraApiToken: "", bitbucketApiToken: "", aiEnabled: false,
      claudeCliPath: "claude", codexCliPath: "codex" });
    const visible = await getWorkspaceNoteBuckets();
    expect(visible.some((bucket) => bucket.notes.some((note) => note.id === "todo"))).toBe(true);
    expect(visible.some((bucket) => bucket.notes.some((note) => note.id === "private"))).toBe(false);
    await restoreBackupSnapshot(backup);
    await applyRestoredPreferences(preferences);
    expect((await createBackupSnapshot("3.4.0", preferences)).stores).toEqual(backup.stores);
  });

  it.each([
    ["unknown format", (b: AppBackup) => { (b as { format: string }).format = "other"; }],
    ["future version", (b: AppBackup) => { (b as { version: number }).version = 2; }],
    ["unsupported database", (b: AppBackup) => { b.dbVersion++; }],
    ["missing store", (b: AppBackup) => { delete (b.stores as Partial<BackupStores>).workspaceNotes; }],
    ["unknown store", (b: AppBackup) => { Object.assign(b.stores, { unknown: [] }); }],
    ["duplicate key", (b: AppBackup) => { b.stores.personalNotes.push(b.stores.personalNotes[0]); }],
    ["malformed nested note", (b: AppBackup) => { b.stores.workspaceNotes[0].notes = [{ id: "broken" }]; }],
    ["bad date", (b: AppBackup) => { b.stores.reconstructDrafts[0].dateKey = "2026-02-30"; }],
    ["bad optional metadata", (b: AppBackup) => { b.stores.syncResults[0].diagnostics = { mode: "full" }; }],
    ["bad workspace scope", (b: AppBackup) => { b.stores.workspaceNotes[1].authorAccountId = "wrong-account"; }],
    ["bad worklog scope", (b: AppBackup) => { b.stores.jiraWorklogs[0].authorAccountId = "wrong-account"; }],
    ["null preferences", (b: AppBackup) => { b.preferences["yesterlog-recap-preferences"] = "null"; }],
    ["malformed preferences", (b: AppBackup) => { b.preferences["yesterlog-recap-preferences"] = "{broken"; }],
    ["bad preferences", (b: AppBackup) => { b.preferences["yesterlog-update-info"] = "injected"; }]
  ])("rejects %s before changing existing data", async (_, mutate) => {
    await saveSettings({ ...DEFAULT_SETTINGS, jiraEmail: "preserved@example.com" });
    const backup = fixture();
    mutate(backup);
    await expect(restoreBackupSnapshot(backup)).rejects.toThrow();
    expect((await getSettings()).jiraEmail).toBe("preserved@example.com");
  });

  it("rejects malformed JSON", () => expect(() => parseBackup("{broken")).toThrow("not valid JSON"));

  it("rolls back every cleared store when one insertion fails", async () => {
    await seed(fixture().stores);
    const before = await createBackupSnapshot("3.4.0", new MemoryStorage());
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === "workspaceNotes") throw new DOMException("Disk full", "QuotaExceededError");
      return add.call(this, value, key);
    });
    await expect(restoreBackupSnapshot(fixture())).rejects.toThrow("Disk full");
    vi.restoreAllMocks();
    expect((await createBackupSnapshot("3.4.0", new MemoryStorage())).stores).toEqual(before.stores);
  });

  it("retries staged preferences after a partial localStorage failure", async () => {
    await restoreBackupSnapshot(fixture());
    const preferences = new MemoryStorage();
    const setItem = preferences.setItem.bind(preferences);
    vi.spyOn(preferences, "setItem").mockImplementationOnce(setItem)
      .mockImplementationOnce(() => { throw new Error("Storage unavailable"); });
    await expect(applyRestoredPreferences(preferences)).rejects.toThrow("Storage unavailable");
    vi.restoreAllMocks();
    await applyRestoredPreferences(preferences);
    expect(preferences.getItem("yesterlog-theme")).toBe("dark");
    const db = await database();
    const pending = await new Promise((resolve) => {
      const request = db.transaction("settings").objectStore("settings").get(RESTORE_PREFERENCES_KEY);
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    expect(pending).toBeUndefined();
  });

  it("rebinds analytics only within the verified account/connection and selects the latest repository", async () => {
    const original = fixture();
    const connection = analyticsConnectionKey(original.stores.settings[0] as unknown as typeof DEFAULT_SETTINGS);
    const older = original.stores.prAnalytics[0];
    const latest = structuredClone(older);
    latest.cacheKey = JSON.stringify([connection, "another-token-hash"]);
    for (const repository of latest.repositories as { syncedAt: string }[]) repository.syncedAt = "2026-08-01T00:00:00.000Z";
    original.stores.prAnalytics.push(latest);
    await seed(original.stores);
    expect(await reuseVerifiedAnalyticsCache(connection, "new-key", "different-account")).toBeUndefined();
    expect(await reuseVerifiedAnalyticsCache("different-connection", "new-key", "demo-me")).toBeUndefined();
    const restored = await reuseVerifiedAnalyticsCache(connection, "new-key", "demo-me");
    expect(restored?.repositories.length).toBe((latest.repositories as unknown[]).length);
    expect(restored?.repositories.every((r) => r.syncedAt === "2026-08-01T00:00:00.000Z")).toBe(true);
  });
});

describe("transfer coordination", () => {
  it("flushes autosaves and drains a network request and its subsequent write before freezing", async () => {
    let finish!: () => void;
    const network = trackDataOperation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const save = network.then(() => savePersonalNotes("2026-06-15", []));
    const flush = vi.fn(async () => { await saveSettings({ ...DEFAULT_SETTINGS, jiraEmail: "flushed@example.com" }); });
    const unregister = registerDataFlusher(flush);
    try {
      const transfer = beginDataTransfer();
      finish();
      await transfer;
      await save;
      expect(flush).toHaveBeenCalledOnce();
      expect((await getSettings()).jiraEmail).toBe("flushed@example.com");
      await expect(saveSettings(DEFAULT_SETTINGS)).rejects.toThrow("transfer is in progress");
      await expect(trackDataOperation(async () => 1)).rejects.toThrow("transfer is in progress");
      const snapshot = await createBackupSnapshot("3.4.0", new MemoryStorage());
      expect(snapshot.stores.personalNotes).toEqual([{ weekKey: "2026-06-15", notes: [] }]);
    } finally { unregister(); endDataTransfer(); }
    await expect(saveSettings(DEFAULT_SETTINGS)).resolves.toBeUndefined();
  });

  it("waits for the Jira ledger even when a parallel week save fails", async () => {
    const backup = fixture();
    await restoreBackupSnapshot(backup);
    const result = backup.stores.syncResults[0] as unknown as Parameters<typeof saveSyncResult>[0];
    result.jiraSite = String(backup.stores.settings[0].jiraBaseUrl);
    result.sourceWorklogs = backup.stores.jiraWorklogs.map((entry) => entry.worklog) as typeof result.sourceWorklogs;
    const held = { result: [], onsuccess: null } as unknown as IDBRequest;
    const getAll = IDBObjectStore.prototype.getAll;
    let ledgerReadStarted = false;
    let markLedgerStarted!: () => void;
    const ledgerStarted = new Promise<void>((resolve) => { markLedgerStarted = resolve; });
    vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === "jiraWorklogs" && !ledgerReadStarted) {
        ledgerReadStarted = true;
        markLedgerStarted();
        return held;
      }
      return getAll.apply(this, args);
    });
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === "syncResults") throw new Error("Week save failed");
      return put.apply(this, args);
    });
    const saving = saveSyncResult(result).catch((error: Error) => error.message);
    await ledgerStarted;
    expect(ledgerReadStarted).toBe(true);
    let finished = false;
    const transfer = beginDataTransfer().then(() => { finished = true; }, () => { finished = true; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(finished).toBe(false);
    } finally {
      held.onsuccess?.call(held, new Event("success"));
      expect(await saving).toBe("Week save failed");
      await transfer;
      endDataTransfer();
    }
  });

  it("does not freeze the app if an autosave fails", async () => {
    const unregister = registerDataFlusher(async () => { throw new Error("Save failed"); });
    await expect(beginDataTransfer()).rejects.toThrow("Save failed");
    unregister();
    await expect(saveSettings(DEFAULT_SETTINGS)).resolves.toBeUndefined();
  });
});
