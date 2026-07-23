// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppSettings,
  BitbucketReviewSession,
  BitbucketReviewSyncResult,
  SyncResult
} from "../../shared/types";
import {
  useBitbucketReviewLogging,
  type BitbucketReviewLoggingClient
} from "./useBitbucketReviewLogging";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "person@example.com",
  bitbucketApiToken: "token",
  bitbucketWorkspace: "yesterlog",
  bitbucketRepositories: "app",
  bitbucketReviewBucketIssueKey: "REV-1",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
};

const syncResult = (): SyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-18T08:00:00.000Z",
  accountId: "account-1",
  trackedSeconds: 0,
  issueCount: 0,
  worklogCount: 0,
  daySummaries: {}
});

const buildSession = (id: string, overrides: Partial<BitbucketReviewSession> = {}): BitbucketReviewSession => ({
  id,
  workspace: "yesterlog",
  repositorySlug: "app",
  repositoryName: "Yesterlog App",
  pullRequestId: Number(id.replace(/\D/g, "")) || 1,
  pullRequestTitle: `${id} review`,
  pullRequestUrl: `https://bitbucket.example/pull-requests/${id}`,
  pullRequestState: "OPEN",
  jiraIssueKey: "TB-22",
  dateKey: "2026-06-18",
  startedISO: "2026-06-18T10:00:00.000Z",
  endedISO: "2026-06-18T10:30:00.000Z",
  estimatedSeconds: 1800,
  reviewStateLabel: "COMMENTED",
  commentCount: 2,
  activityCount: 3,
  confidence: "high",
  events: [],
  status: "unlogged",
  ...overrides
});

const buildResult = (sessions: BitbucketReviewSession[] = [buildSession("s1")]): BitbucketReviewSyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-18T08:00:00.000Z",
  accountId: "account-1",
  workspace: "yesterlog",
  repositoryCount: 1,
  pullRequestCount: sessions.length,
  sessionCount: sessions.length,
  sessions
});

type ReviewLoggingApi = ReturnType<typeof useBitbucketReviewLogging>;

let container: HTMLDivElement;
let root: Root;
let api: ReviewLoggingApi | undefined;
let addWorklog: ReturnType<typeof vi.fn<BitbucketReviewLoggingClient["addWorklog"]>>;
let saveBitbucketReviewResult: ReturnType<typeof vi.fn<(result: BitbucketReviewSyncResult) => Promise<void>>>;
let runSync: ReturnType<typeof vi.fn<(settingsForSync?: AppSettings, options?: { queueAfterCurrent?: boolean }) => Promise<SyncResult | undefined>>>;
let loadTickets: ReturnType<typeof vi.fn<(settingsForLoad?: AppSettings) => Promise<void>>>;
let onReviewResult: ReturnType<typeof vi.fn<(result: BitbucketReviewSyncResult) => void>>;
let setLogError: ReturnType<typeof vi.fn<(message: string | undefined) => void>>;
let showInfo: ReturnType<typeof vi.fn<(message: string) => void>>;
let showSuccess: ReturnType<typeof vi.fn<(message: string) => void>>;
let showError: ReturnType<typeof vi.fn<(message: string) => void>>;
let client: BitbucketReviewLoggingClient;

function Harness({
  sourceResult = buildResult(),
  isDemo = false
}: {
  sourceResult?: BitbucketReviewSyncResult;
  isDemo?: boolean;
}) {
  api = useBitbucketReviewLogging({
    settings,
    sourceResult,
    isDemo,
    client,
    saveBitbucketReviewResult,
    runSync,
    loadTickets,
    onReviewResult,
    setLogError,
    showInfo,
    showSuccess,
    showError
  });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Review logging hook was not rendered.");
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
  addWorklog = vi.fn();
  saveBitbucketReviewResult = vi.fn(async () => undefined);
  runSync = vi.fn(async () => syncResult());
  loadTickets = vi.fn(async () => undefined);
  onReviewResult = vi.fn();
  setLogError = vi.fn();
  showInfo = vi.fn();
  showSuccess = vi.fn();
  showError = vi.fn();
  client = { addWorklog };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useBitbucketReviewLogging", () => {
  it("reports an empty selection without logging", async () => {
    renderHarness();

    await expect(getApi().handleLogReviewSessions([], "reviewed-ticket")).resolves.toBe(false);

    expect(showInfo).toHaveBeenCalledWith("No review sessions selected.");
    expect(addWorklog).not.toHaveBeenCalled();
    expect(getApi().isLoggingReview).toBe(false);
  });

  it("reports selected sessions that are already logged", async () => {
    const logged = buildSession("s1", {
      status: "logged",
      logged: {
        issueKey: "TB-22",
        worklogId: "wl-1",
        loggedAt: "2026-06-18T10:30:00.000Z",
        targetMode: "reviewed-ticket"
      }
    });
    renderHarness({ sourceResult: buildResult([logged]) });

    await expect(getApi().handleLogReviewSessions(["s1"], "reviewed-ticket")).resolves.toBe(false);

    expect(showInfo).toHaveBeenCalledWith("Selected review sessions are already logged.");
    expect(addWorklog).not.toHaveBeenCalled();
  });

  it("marks demo sessions logged without calling Jira", async () => {
    const result = buildResult([buildSession("s1"), buildSession("s2", { jiraIssueKey: undefined })]);
    renderHarness({ sourceResult: result, isDemo: true });

    await act(async () => {
      await expect(getApi().handleLogReviewSessions(["s1", "s2"], "reviewed-ticket", { s1: 900 })).resolves.toBe(true);
    });

    expect(addWorklog).not.toHaveBeenCalled();
    expect(saveBitbucketReviewResult).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();
    expect(loadTickets).not.toHaveBeenCalled();
    expect(onReviewResult).toHaveBeenCalledTimes(1);
    expect(onReviewResult.mock.calls[0][0].sessions.map((session) => session.status)).toEqual(["logged", "unlogged"]);
    expect(onReviewResult.mock.calls[0][0].sessions[0].logged).toMatchObject({
      timeSpentSeconds: 900,
      estimatedSecondsAtLog: 1800
    });
    expect(showSuccess).toHaveBeenCalledWith("Demo logged 1 review sessions.");
    expect(getApi().isLoggingReview).toBe(false);
  });

  it("logs review sessions to Jira, persists the updated ledger, syncs, and refreshes tickets", async () => {
    const sessions = [
      buildSession("s1", { estimatedSeconds: 1800 }),
      buildSession("s2", { jiraIssueKey: "TB-23", estimatedSeconds: 2400 })
    ];
    addWorklog.mockResolvedValueOnce({
      ok: true,
      worklogId: "wl-1",
      issueKey: "TB-22",
      timeSpentSeconds: 900
    });
    addWorklog.mockResolvedValueOnce({
      ok: true,
      worklogId: "wl-2",
      issueKey: "TB-23",
      timeSpentSeconds: 2400
    });
    renderHarness({ sourceResult: buildResult(sessions) });

    await act(async () => {
      await expect(
        getApi().handleLogReviewSessions(
          ["s1", "s2"],
          "reviewed-ticket",
          { s1: 900 },
          { s1: "2026-06-18T08:30:00.000Z" }
        )
      ).resolves.toBe(true);
    });

    expect(addWorklog).toHaveBeenNthCalledWith(1, {
      settings,
      issueKey: "TB-22",
      timeSpentSeconds: 900,
      startedISO: "2026-06-18T08:30:00.000Z",
      comment: expect.stringContaining("Reviewed Bitbucket PR #1: s1 review")
    });
    expect(addWorklog).toHaveBeenNthCalledWith(2, {
      settings,
      issueKey: "TB-23",
      timeSpentSeconds: 2400,
      startedISO: "2026-06-18T10:00:00.000Z",
      comment: expect.stringContaining("Reviewed Bitbucket PR #2: s2 review")
    });
    expect(saveBitbucketReviewResult).toHaveBeenCalledTimes(1);
    expect(onReviewResult).toHaveBeenCalledTimes(1);
    expect(onReviewResult.mock.calls[0][0].sessions.map((session) => session.logged?.worklogId)).toEqual([
      "wl-1",
      "wl-2"
    ]);
    expect(onReviewResult.mock.calls[0][0].sessions.map((session) => session.logged?.timeSpentSeconds)).toEqual([
      900,
      2400
    ]);
    expect(onReviewResult.mock.calls[0][0].sessions.map((session) => session.logged?.estimatedSecondsAtLog)).toEqual([
      1800,
      2400
    ]);
    expect(showSuccess).toHaveBeenCalledWith("Logged 2 review sessions to Jira.");
    expect(runSync).toHaveBeenCalledWith(settings, { queueAfterCurrent: true });
    expect(loadTickets).toHaveBeenCalledTimes(1);
    expect(getApi().isLoggingReview).toBe(false);
  });

  it("uses the review bucket target when selected", async () => {
    addWorklog.mockResolvedValue({
      ok: true,
      worklogId: "wl-bucket",
      issueKey: "REV-1",
      timeSpentSeconds: 1800
    });
    renderHarness();

    await act(async () => {
      await expect(getApi().handleLogReviewSessions(["s1"], "review-bucket")).resolves.toBe(true);
    });

    expect(addWorklog).toHaveBeenCalledWith(expect.objectContaining({ issueKey: "REV-1" }));
    expect(onReviewResult.mock.calls[0][0].sessions[0].logged).toMatchObject({
      issueKey: "REV-1",
      targetMode: "review-bucket"
    });
  });

  it("reports when selected sessions have no Jira target", async () => {
    renderHarness({ sourceResult: buildResult([buildSession("s1", { jiraIssueKey: undefined })]) });

    await act(async () => {
      await expect(getApi().handleLogReviewSessions(["s1"], "reviewed-ticket")).resolves.toBe(false);
    });

    expect(addWorklog).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith("No selected review sessions have a Jira target.");
    expect(saveBitbucketReviewResult).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();
    expect(loadTickets).not.toHaveBeenCalled();
  });

  it("persists successful logs before reporting a later failure", async () => {
    const sessions = [buildSession("s1"), buildSession("s2", { jiraIssueKey: "TB-23" })];
    addWorklog
      .mockResolvedValueOnce({
        ok: true,
        worklogId: "wl-1",
        issueKey: "TB-22",
        timeSpentSeconds: 1800
      })
      .mockRejectedValueOnce(new Error("Jira failed on the second session"));
    renderHarness({ sourceResult: buildResult(sessions) });

    await act(async () => {
      await expect(getApi().handleLogReviewSessions(["s1", "s2"], "reviewed-ticket")).resolves.toBe(false);
    });

    expect(saveBitbucketReviewResult).toHaveBeenCalledTimes(1);
    expect(onReviewResult.mock.calls[0][0].sessions.map((session) => session.status)).toEqual(["logged", "unlogged"]);
    expect(showSuccess).toHaveBeenCalledWith("Logged 1 review session to Jira.");
    expect(setLogError).toHaveBeenCalledWith("Jira failed on the second session");
    expect(showError).toHaveBeenCalledWith("Jira failed on the second session");
    expect(runSync).toHaveBeenCalledWith(settings, { queueAfterCurrent: true });
    expect(loadTickets).toHaveBeenCalledTimes(1);
    expect(getApi().isLoggingReview).toBe(false);
  });
});
