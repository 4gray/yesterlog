// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, JiraTicket, JiraWorklog, SyncResult, WorklogAllocationPreference } from "../../shared/types";
import { useJiraWorklogs, type JiraWorklogPayload, type JiraWorklogsClient } from "./useJiraWorklogs";

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

const ticket: JiraTicket = {
  id: "10022",
  key: "TB-22",
  summary: "Wire immediate worklog refresh",
  projectKey: "TB",
  projectName: "TimeBro",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  issueType: { name: "Task" },
  url: "https://example.atlassian.net/browse/TB-22"
};

const editingWorklog: JiraWorklog = {
  id: "20001",
  issueId: "10022",
  issueKey: "TB-22",
  issueSummary: "Wire immediate worklog refresh",
  issueUrl: "https://example.atlassian.net/browse/TB-22",
  authorAccountId: "account-1",
  started: "2026-06-18T08:00:00.000Z",
  timeSpentSeconds: 1800,
  comment: "Existing work"
};

const payload: JiraWorklogPayload = {
  issueKey: "TB-22",
  ticket,
  timeSpentSeconds: 1800,
  startedISO: "2026-06-18T11:00:00.000Z",
  comment: "Added through the modal"
};

const syncResult = (overrides: Partial<SyncResult> = {}): SyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-18T08:00:00.000Z",
  accountId: "account-1",
  jiraSite: "https://example.atlassian.net",
  displayName: "Dev User",
  trackedSeconds: 0,
  issueCount: 0,
  worklogCount: 0,
  daySummaries: {},
  ...overrides
});

type JiraWorklogsApi = ReturnType<typeof useJiraWorklogs>;

let container: HTMLDivElement;
let root: Root;
let api: JiraWorklogsApi | undefined;
let activeEditingWorklog: JiraWorklog | undefined;
let addWorklog: ReturnType<typeof vi.fn<JiraWorklogsClient["addWorklog"]>>;
let updateWorklog: ReturnType<typeof vi.fn<JiraWorklogsClient["updateWorklog"]>>;
let deleteWorklog: ReturnType<typeof vi.fn<JiraWorklogsClient["deleteWorklog"]>>;
let saveSyncResult: ReturnType<typeof vi.fn<(result: SyncResult) => Promise<void>>>;
let saveWorklogAllocationPreference: ReturnType<typeof vi.fn<(preference: WorklogAllocationPreference) => Promise<void>>>;
let deleteWorklogAllocationPreference: ReturnType<typeof vi.fn<(preferenceKey: string) => Promise<void>>>;
let onWorklogAllocationPreference: ReturnType<typeof vi.fn<(preference: WorklogAllocationPreference) => void>>;
let onWorklogAllocationPreferenceRemoved: ReturnType<typeof vi.fn<(preferenceKey: string) => void>>;
let runSync: ReturnType<typeof vi.fn<(settingsForSync?: AppSettings, options?: { queueAfterCurrent?: boolean }) => Promise<SyncResult | undefined>>>;
let loadTickets: ReturnType<typeof vi.fn<(settingsForLoad?: AppSettings) => Promise<void>>>;
let onSyncResult: ReturnType<typeof vi.fn<(result: SyncResult) => void>>;
let showSuccess: ReturnType<typeof vi.fn<(message: string) => void>>;
let showError: ReturnType<typeof vi.fn<(message: string) => void>>;
let client: JiraWorklogsClient;

function Harness({
  isDemo = false,
  currentSyncResult = syncResult(),
  currentEditingWorklog = editingWorklog
}: {
  isDemo?: boolean;
  currentSyncResult?: SyncResult;
  currentEditingWorklog?: JiraWorklog | null;
}) {
  const [editingWorklogValue, setEditingWorklog] = useState<JiraWorklog | undefined>(
    currentEditingWorklog ?? undefined
  );

  activeEditingWorklog = editingWorklogValue;
  api = useJiraWorklogs({
    settings,
    syncResult: currentSyncResult,
    editingWorklog: editingWorklogValue,
    isDemo,
    client,
    saveSyncResult,
    saveWorklogAllocationPreference,
    deleteWorklogAllocationPreference,
    onWorklogAllocationPreference,
    onWorklogAllocationPreferenceRemoved,
    runSync,
    loadTickets,
    onSyncResult,
    setEditingWorklog,
    showSuccess,
    showError
  });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Jira worklogs hook was not rendered.");
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
  activeEditingWorklog = undefined;
  addWorklog = vi.fn();
  updateWorklog = vi.fn();
  deleteWorklog = vi.fn();
  saveSyncResult = vi.fn(async () => undefined);
  saveWorklogAllocationPreference = vi.fn(async () => undefined);
  deleteWorklogAllocationPreference = vi.fn(async () => undefined);
  onWorklogAllocationPreference = vi.fn();
  onWorklogAllocationPreferenceRemoved = vi.fn();
  runSync = vi.fn(async () => syncResult());
  loadTickets = vi.fn(async () => undefined);
  onSyncResult = vi.fn();
  showSuccess = vi.fn();
  showError = vi.fn();
  client = {
    addWorklog,
    updateWorklog,
    deleteWorklog
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useJiraWorklogs", () => {
  it("logs demo work without calling Jira", async () => {
    renderHarness({ isDemo: true });

    await act(async () => {
      await expect(getApi().handleAddWorklog(payload)).resolves.toBe(true);
    });

    expect(addWorklog).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();
    expect(loadTickets).not.toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith("Demo logged 0h 30m to TB-22.");
    expect(getApi().isLogging).toBe(false);
  });

  it("creates a Jira worklog, queues sync, saves an optimistic merge, and refreshes tickets", async () => {
    const baseSync = syncResult();
    const freshSync = syncResult({ syncedAt: "2026-06-18T11:00:00.000Z" });
    addWorklog.mockResolvedValue({
      ok: true,
      worklogId: "20002",
      issueKey: "TB-22",
      timeSpentSeconds: 1800
    });
    runSync.mockResolvedValue(freshSync);
    renderHarness({ currentSyncResult: baseSync });

    await act(async () => {
      await expect(getApi().handleAddWorklog(payload)).resolves.toBe(true);
    });

    expect(addWorklog).toHaveBeenCalledWith({
      settings,
      issueKey: "TB-22",
      timeSpentSeconds: 1800,
      startedISO: "2026-06-18T11:00:00.000Z",
      comment: "Added through the modal"
    });
    expect(showSuccess).toHaveBeenCalledWith("Logged 0h 30m to TB-22.");
    expect(runSync).toHaveBeenCalledWith(settings, { queueAfterCurrent: true });
    expect(saveSyncResult).toHaveBeenCalledTimes(1);
    expect(onSyncResult).toHaveBeenCalledTimes(1);
    expect(onSyncResult.mock.calls[0][0]).toMatchObject({
      trackedSeconds: 1800,
      worklogCount: 1,
      issueCount: 1
    });
    expect(onSyncResult.mock.calls[0][0].daySummaries["2026-06-18"].worklogs[0]).toMatchObject({
      id: "20002",
      issueKey: "TB-22",
      timeSpentSeconds: 1800,
      comment: "Added through the modal"
    });
    expect(loadTickets).toHaveBeenCalledTimes(1);
    expect(getApi().logError).toBeUndefined();
    expect(getApi().isLogging).toBe(false);
  });

  it("does not save an optimistic merge when the fresh sync already contains the created worklog", async () => {
    const freshSync = syncResult({
      trackedSeconds: 1800,
      issueCount: 1,
      worklogCount: 1,
      daySummaries: {
        "2026-06-18": {
          trackedSeconds: 1800,
          issues: [],
          worklogs: [{ ...editingWorklog, id: "20002", started: payload.startedISO }]
        }
      }
    });
    addWorklog.mockResolvedValue({
      ok: true,
      worklogId: "20002",
      issueKey: "TB-22",
      timeSpentSeconds: 1800
    });
    runSync.mockResolvedValue(freshSync);
    renderHarness({ currentSyncResult: syncResult() });

    await act(async () => {
      await expect(getApi().handleAddWorklog(payload)).resolves.toBe(true);
    });

    expect(saveSyncResult).not.toHaveBeenCalled();
    expect(onSyncResult).not.toHaveBeenCalled();
    expect(loadTickets).toHaveBeenCalledTimes(1);
  });

  it("stores an exact local distribution preference without sending it to Jira", async () => {
    addWorklog.mockResolvedValue({
      ok: true,
      worklogId: "bulk-20002",
      issueKey: "TB-22",
      timeSpentSeconds: 80 * 3600
    });
    renderHarness({ currentSyncResult: syncResult() });

    await act(async () => {
      await expect(
        getApi().handleAddWorklog({
          ...payload,
          timeSpentSeconds: 80 * 3600,
          allocationDirection: "backward"
        })
      ).resolves.toBe(true);
    });

    expect(addWorklog).toHaveBeenCalledWith({
      settings,
      issueKey: "TB-22",
      timeSpentSeconds: 80 * 3600,
      startedISO: payload.startedISO,
      comment: payload.comment
    });
    expect(saveWorklogAllocationPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        preferenceKey: JSON.stringify(["https://example.atlassian.net", "account-1", "bulk-20002"]),
        jiraSite: "https://example.atlassian.net",
        authorAccountId: "account-1",
        worklogId: "bulk-20002",
        direction: "backward"
      })
    );
    expect(onWorklogAllocationPreference).toHaveBeenCalledWith(
      expect.objectContaining({ worklogId: "bulk-20002", direction: "backward" })
    );
  });

  it("stores the chosen direction after the first sync supplies the current site account", async () => {
    addWorklog.mockResolvedValue({
      ok: true,
      worklogId: "bulk-first-sync",
      issueKey: "TB-22",
      timeSpentSeconds: 80 * 3600
    });
    runSync.mockResolvedValue(syncResult());
    renderHarness({
      currentEditingWorklog: null,
      currentSyncResult: syncResult({
        jiraSite: "https://old.atlassian.net",
        accountId: "old-account"
      })
    });

    await act(async () => {
      await expect(
        getApi().handleAddWorklog({
          ...payload,
          timeSpentSeconds: 80 * 3600,
          allocationDirection: "backward"
        })
      ).resolves.toBe(true);
    });

    expect(saveWorklogAllocationPreference).toHaveBeenCalledTimes(1);
    expect(saveWorklogAllocationPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        preferenceKey: JSON.stringify([
          "https://example.atlassian.net",
          "account-1",
          "bulk-first-sync"
        ]),
        jiraSite: "https://example.atlassian.net",
        authorAccountId: "account-1",
        direction: "backward"
      })
    );
  });

  it("keeps a successful Jira write successful when the local direction cannot be saved", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    addWorklog.mockResolvedValue({
      ok: true,
      worklogId: "bulk-20003",
      issueKey: "TB-22",
      timeSpentSeconds: 80 * 3600
    });
    saveWorklogAllocationPreference.mockRejectedValue(new Error("IndexedDB unavailable"));
    renderHarness({ currentSyncResult: syncResult() });

    await act(async () => {
      await expect(
        getApi().handleAddWorklog({
          ...payload,
          timeSpentSeconds: 80 * 3600,
          allocationDirection: "forward"
        })
      ).resolves.toBe(true);
    });

    expect(addWorklog).toHaveBeenCalledTimes(1);
    expect(showSuccess).toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
    expect(onWorklogAllocationPreference).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "Unable to save the local bulk-worklog direction.",
      expect.any(Error)
    );
  });

  it("removes a stale bulk preference when an update becomes a normal worklog", async () => {
    updateWorklog.mockResolvedValue({
      ok: true,
      worklogId: editingWorklog.id,
      issueKey: editingWorklog.issueKey,
      timeSpentSeconds: 7 * 3600
    });
    renderHarness({ currentSyncResult: syncResult() });

    await act(async () => {
      await expect(
        getApi().handleUpdateWorklog({
          ...payload,
          timeSpentSeconds: 7 * 3600,
          allocationDirection: undefined
        })
      ).resolves.toBe(true);
    });

    const preferenceKey = JSON.stringify([
      "https://example.atlassian.net",
      "account-1",
      editingWorklog.id
    ]);
    expect(deleteWorklogAllocationPreference).toHaveBeenCalledWith(preferenceKey);
    expect(onWorklogAllocationPreferenceRemoved).toHaveBeenCalledWith(preferenceKey);
    expect(saveWorklogAllocationPreference).not.toHaveBeenCalled();
  });

  it("reports Jira add failures", async () => {
    addWorklog.mockRejectedValue(new Error("Jira refused the worklog"));
    renderHarness();

    await act(async () => {
      await expect(getApi().handleAddWorklog(payload)).resolves.toBe(false);
    });

    expect(showError).toHaveBeenCalledWith("Jira refused the worklog");
    expect(getApi().logError).toBe("Jira refused the worklog");
    expect(runSync).not.toHaveBeenCalled();
    expect(loadTickets).not.toHaveBeenCalled();
    expect(getApi().isLogging).toBe(false);
  });

  it("updates the editing worklog issue and refreshes after sync", async () => {
    updateWorklog.mockResolvedValue({
      ok: true,
      worklogId: "20001",
      issueKey: "TB-22",
      timeSpentSeconds: 3600
    });
    renderHarness();

    await act(async () => {
      await expect(getApi().handleUpdateWorklog({ ...payload, issueKey: "IGNORED-1", timeSpentSeconds: 3600 })).resolves.toBe(true);
    });

    expect(updateWorklog).toHaveBeenCalledWith({
      settings,
      issueKey: "TB-22",
      worklogId: "20001",
      timeSpentSeconds: 3600,
      startedISO: payload.startedISO,
      comment: payload.comment
    });
    expect(showSuccess).toHaveBeenCalledWith("Updated 1h on TB-22.");
    expect(runSync).toHaveBeenCalledWith(settings, { queueAfterCurrent: true });
    expect(loadTickets).toHaveBeenCalledTimes(1);
    expect(getApi().isLogging).toBe(false);
  });

  it("skips update and delete when no worklog is being edited", async () => {
    renderHarness({ currentEditingWorklog: null });

    await expect(getApi().handleUpdateWorklog(payload)).resolves.toBe(false);
    await expect(getApi().handleDeleteWorklog()).resolves.toBe(false);

    expect(updateWorklog).not.toHaveBeenCalled();
    expect(deleteWorklog).not.toHaveBeenCalled();
  });

  it("deletes a demo worklog and clears edit state", async () => {
    renderHarness({ isDemo: true });

    await act(async () => {
      await expect(getApi().handleDeleteWorklog()).resolves.toBe(true);
    });

    expect(deleteWorklog).not.toHaveBeenCalled();
    expect(activeEditingWorklog).toBeUndefined();
    expect(showSuccess).toHaveBeenCalledWith("Demo deleted worklog from TB-22.");
    expect(getApi().isDeletingWorklog).toBe(false);
  });

  it("deletes a Jira worklog and refreshes after sync", async () => {
    deleteWorklog.mockResolvedValue({
      ok: true,
      worklogId: "20001",
      issueKey: "TB-22"
    });
    renderHarness();

    await act(async () => {
      await expect(getApi().handleDeleteWorklog()).resolves.toBe(true);
    });

    expect(deleteWorklog).toHaveBeenCalledWith({
      settings,
      issueKey: "TB-22",
      worklogId: "20001"
    });
    expect(showSuccess).toHaveBeenCalledWith("Deleted worklog from TB-22.");
    expect(runSync).toHaveBeenCalledWith(settings, { queueAfterCurrent: true });
    expect(loadTickets).toHaveBeenCalledTimes(1);
    expect(getApi().isDeletingWorklog).toBe(false);
  });

  it("reports delete failures", async () => {
    deleteWorklog.mockRejectedValue(new Error("Cannot delete worklog"));
    renderHarness();

    await act(async () => {
      await expect(getApi().handleDeleteWorklog()).resolves.toBe(false);
    });

    expect(showError).toHaveBeenCalledWith("Cannot delete worklog");
    expect(getApi().logError).toBe("Cannot delete worklog");
    expect(runSync).not.toHaveBeenCalled();
    expect(loadTickets).not.toHaveBeenCalled();
    expect(getApi().isDeletingWorklog).toBe(false);
  });
});
