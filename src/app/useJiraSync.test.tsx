// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, SyncResult } from "../../shared/types";
import { useJiraSync, type JiraSyncClient } from "./useJiraSync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "",
  bitbucketApiToken: "",
  bitbucketWorkspace: "",
  bitbucketRepositories: "",
  bitbucketReviewBucketIssueKey: "",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
};

const syncResult = (overrides: Partial<SyncResult> = {}): SyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-17T10:00:00.000Z",
  accountId: "account-1",
  displayName: "Time Keeper",
  trackedSeconds: 3600,
  issueCount: 2,
  worklogCount: 3,
  daySummaries: {},
  ...overrides
});

type JiraSyncApi = ReturnType<typeof useJiraSync>;

let container: HTMLDivElement;
let root: Root;
let api: JiraSyncApi | undefined;
let syncJiraWorklogs: ReturnType<typeof vi.fn<JiraSyncClient["syncJiraWorklogs"]>>;
let saveSyncResult: ReturnType<typeof vi.fn<(result: SyncResult) => Promise<void>>>;
let onSyncResult: ReturnType<typeof vi.fn<(result: SyncResult) => void>>;
let showSuccess: ReturnType<typeof vi.fn<(message: string) => void>>;
let showError: ReturnType<typeof vi.fn<(message: string) => void>>;
let client: JiraSyncClient;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function Harness({
  currentSettings = settings,
  currentSyncResult,
  demoSyncResult
}: {
  currentSettings?: AppSettings;
  currentSyncResult?: SyncResult;
  demoSyncResult?: SyncResult;
}) {
  api = useJiraSync({
    settings: currentSettings,
    weekKey: "2026-06-15",
    weekStartISO: "2026-06-15T00:00:00.000Z",
    weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
    syncResult: currentSyncResult,
    demoSyncResult,
    client,
    saveSyncResult,
    onSyncResult,
    showSuccess,
    showError
  });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Jira sync hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: Parameters<typeof Harness>[0] = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

beforeEach(() => {
  api = undefined;
  syncJiraWorklogs = vi.fn();
  saveSyncResult = vi.fn(async () => undefined);
  onSyncResult = vi.fn();
  showSuccess = vi.fn();
  showError = vi.fn();
  client = { syncJiraWorklogs };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useJiraSync", () => {
  it("uses demo sync data without calling the native client", async () => {
    const demoResult = syncResult({ worklogCount: 9 });
    renderHarness({ demoSyncResult: demoResult });

    await expect(getApi().runSync()).resolves.toBe(demoResult);

    expect(syncJiraWorklogs).not.toHaveBeenCalled();
    expect(saveSyncResult).not.toHaveBeenCalled();
    expect(onSyncResult).toHaveBeenCalledWith(demoResult);
    expect(showSuccess).toHaveBeenCalledWith("Demo data refreshed from seeded fixtures.");
    expect(getApi().isSyncing).toBe(false);
  });

  it("rejects unconfigured Jira settings before syncing", async () => {
    renderHarness({
      currentSettings: {
        ...settings,
        jiraApiToken: ""
      }
    });

    await expect(getApi().runSync()).resolves.toBeUndefined();

    expect(syncJiraWorklogs).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith("Connect Jira in Settings before syncing.");
    expect(getApi().isSyncing).toBe(false);
  });

  it("syncs Jira worklogs, persists the result, and reports success", async () => {
    const result = syncResult({ issueCount: 4, worklogCount: 7 });
    syncJiraWorklogs.mockResolvedValue(result);
    renderHarness();

    await act(async () => {
      await expect(getApi().runSync()).resolves.toBe(result);
    });

    expect(syncJiraWorklogs).toHaveBeenCalledWith({
      settings,
      weekKey: "2026-06-15",
      weekStartISO: "2026-06-15T00:00:00.000Z",
      weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
      mode: "full"
    });
    expect(saveSyncResult).toHaveBeenCalledWith(result);
    expect(onSyncResult).toHaveBeenCalledWith(result);
    expect(showSuccess).toHaveBeenCalledWith("Synced 7 worklogs across 4 candidate issues.");
    expect(getApi().isSyncing).toBe(false);
  });

  it("uses Jira's delta feeds when a cached baseline has a cursor", async () => {
    const baseline = syncResult({
      jiraSite: "https://example.atlassian.net",
      sourceWorklogs: [],
      scanStartISO: "2026-03-17T00:00:00.000Z",
      scanEndExclusiveISO: "2026-06-18T00:00:00.000Z",
      worklogSyncCursorMs: 123_000
    });
    const result = syncResult({
      ...baseline,
      syncedAt: "2026-06-17T10:02:00.000Z",
      worklogSyncCursorMs: 124_000
    });
    syncJiraWorklogs.mockResolvedValue(result);
    renderHarness({ currentSyncResult: baseline });

    await act(async () => {
      await expect(getApi().runSync()).resolves.toBe(result);
    });

    expect(syncJiraWorklogs).toHaveBeenCalledWith({
      settings,
      weekKey: "2026-06-15",
      weekStartISO: "2026-06-15T00:00:00.000Z",
      weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
      mode: "delta",
      baseline: {
        weekKey: baseline.weekKey,
        weekStartISO: baseline.weekStartISO,
        weekEndExclusiveISO: baseline.weekEndExclusiveISO,
        accountId: baseline.accountId,
        jiraSite: baseline.jiraSite,
        sourceWorklogs: [],
        scanStartISO: baseline.scanStartISO,
        scanEndExclusiveISO: baseline.scanEndExclusiveISO,
        worklogSyncCursorMs: baseline.worklogSyncCursorMs
      }
    });
  });

  it("reports sync failures and resets the syncing flag", async () => {
    syncJiraWorklogs.mockRejectedValue(new Error("Jira unavailable"));
    renderHarness();

    await act(async () => {
      await expect(getApi().runSync()).resolves.toBeUndefined();
    });

    expect(showError).toHaveBeenCalledWith("Jira unavailable");
    expect(saveSyncResult).not.toHaveBeenCalled();
    expect(onSyncResult).not.toHaveBeenCalled();
    expect(getApi().isSyncing).toBe(false);
  });

  it("returns the current sync when a second non-queued sync starts while one is in flight", async () => {
    const firstSync = deferred<SyncResult>();
    const result = syncResult({ worklogCount: 1 });
    syncJiraWorklogs.mockReturnValue(firstSync.promise);
    renderHarness();

    const first = getApi().runSync();
    const second = getApi().runSync();

    expect(syncJiraWorklogs).toHaveBeenCalledTimes(1);
    firstSync.resolve(result);

    await act(async () => {
      await expect(first).resolves.toBe(result);
      await expect(second).resolves.toBe(result);
    });

    expect(saveSyncResult).toHaveBeenCalledTimes(1);
    expect(onSyncResult).toHaveBeenCalledTimes(1);
    expect(getApi().isSyncing).toBe(false);
  });

  it("queues a fresh sync after the current one when requested", async () => {
    const firstSync = deferred<SyncResult>();
    const secondSync = deferred<SyncResult>();
    const firstResult = syncResult({ syncedAt: "2026-06-17T10:00:00.000Z", worklogCount: 1 });
    const secondResult = syncResult({ syncedAt: "2026-06-17T10:01:00.000Z", worklogCount: 2 });
    syncJiraWorklogs.mockReturnValueOnce(firstSync.promise).mockReturnValueOnce(secondSync.promise);
    renderHarness();

    const first = getApi().runSync();
    const second = getApi().runSync(settings, { queueAfterCurrent: true });

    expect(syncJiraWorklogs).toHaveBeenCalledTimes(1);
    firstSync.resolve(firstResult);

    await act(async () => {
      await expect(first).resolves.toBe(firstResult);
      await Promise.resolve();
    });

    expect(syncJiraWorklogs).toHaveBeenCalledTimes(2);
    secondSync.resolve(secondResult);

    await act(async () => {
      await expect(second).resolves.toBe(secondResult);
    });

    expect(saveSyncResult).toHaveBeenNthCalledWith(1, firstResult);
    expect(saveSyncResult).toHaveBeenNthCalledWith(2, secondResult);
    expect(onSyncResult).toHaveBeenNthCalledWith(1, firstResult);
    expect(onSyncResult).toHaveBeenNthCalledWith(2, secondResult);
    expect(getApi().isSyncing).toBe(false);
  });

  it("coalesces repeated trailing refreshes and preserves a requested full sync", async () => {
    const firstSync = deferred<SyncResult>();
    const trailingSync = deferred<SyncResult>();
    const firstResult = syncResult({ worklogCount: 1 });
    const trailingResult = syncResult({ worklogCount: 2 });
    syncJiraWorklogs.mockReturnValueOnce(firstSync.promise).mockReturnValueOnce(trailingSync.promise);
    renderHarness();

    const first = getApi().runSync();
    const queuedDelta = getApi().runSync(settings, {
      queueAfterCurrent: true,
      mode: "delta",
      reconcile: (result) => ({ ...result, worklogCount: result.worklogCount + 1 })
    });
    const queuedFull = getApi().runSync(settings, {
      queueAfterCurrent: true,
      mode: "full",
      reconcile: (result) => ({ ...result, worklogCount: result.worklogCount + 10 })
    });
    const anotherDelta = getApi().runSync(settings, {
      queueAfterCurrent: true,
      mode: "delta",
      reconcile: (result) => ({ ...result, worklogCount: result.worklogCount + 100 })
    });

    expect(syncJiraWorklogs).toHaveBeenCalledTimes(1);
    firstSync.resolve(firstResult);
    await act(async () => {
      await first;
      await Promise.resolve();
    });

    expect(syncJiraWorklogs).toHaveBeenCalledTimes(2);
    expect(syncJiraWorklogs.mock.calls[1]?.[0]).toMatchObject({ mode: "full" });
    trailingSync.resolve(trailingResult);

    await act(async () => {
      await expect(queuedDelta).resolves.toMatchObject({ worklogCount: 113 });
      await expect(queuedFull).resolves.toMatchObject({ worklogCount: 113 });
      await expect(anotherDelta).resolves.toMatchObject({ worklogCount: 113 });
    });

    expect(syncJiraWorklogs).toHaveBeenCalledTimes(2);
    expect(saveSyncResult).toHaveBeenNthCalledWith(2, expect.objectContaining({ worklogCount: 113 }));
    expect(onSyncResult).toHaveBeenNthCalledWith(2, expect.objectContaining({ worklogCount: 113 }));
    expect(getApi().isSyncing).toBe(false);
  });
});
