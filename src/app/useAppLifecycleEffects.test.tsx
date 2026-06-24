// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppSettings,
  BitbucketReviewSyncResult,
  ReminderScheduleResult,
  SyncResult
} from "../../shared/types";
import {
  type AppLifecycleClient,
  useAppLifecycleEffects
} from "./useAppLifecycleEffects";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "person@example.com",
  bitbucketApiToken: "token",
  bitbucketWorkspace: "timebro",
  bitbucketRepositories: "app",
  bitbucketReviewBucketIssueKey: "REV-1",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true
};

const syncResult: SyncResult = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-17T12:00:00.000Z",
  accountId: "account-1",
  trackedSeconds: 0,
  issueCount: 0,
  worklogCount: 0,
  daySummaries: {}
};

const reviewResult: BitbucketReviewSyncResult = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-17T12:00:00.000Z",
  workspace: "timebro",
  repositoryCount: 1,
  pullRequestCount: 0,
  sessionCount: 0,
  sessions: []
};

const scheduledReminder: ReminderScheduleResult = {
  scheduled: true,
  reason: "scheduled",
  fireAt: "2026-06-17T14:30:00.000Z"
};

interface HarnessProps {
  isDemo?: boolean;
  isBooting?: boolean;
  isConfigured?: boolean;
  isBitbucketReady?: boolean;
  currentSettings?: AppSettings;
  weekKey?: string;
  skippedDates?: string[];
  remainingWeekHours?: number;
  todayDateKey?: string;
}

let container: HTMLDivElement;
let root: Root;
let runSync: ReturnType<typeof vi.fn<() => Promise<SyncResult | undefined>>>;
let runReviewSync: ReturnType<typeof vi.fn<() => Promise<BitbucketReviewSyncResult | undefined>>>;
let scheduleReminder: ReturnType<typeof vi.fn<AppLifecycleClient["scheduleReminder"]>>;
let client: AppLifecycleClient;

function Harness({
  isDemo = false,
  isBooting = false,
  isConfigured = true,
  isBitbucketReady = false,
  currentSettings = settings,
  weekKey = "2026-06-15",
  skippedDates = ["2026-06-19"],
  remainingWeekHours = 7,
  todayDateKey = "2026-06-17"
}: HarnessProps) {
  useAppLifecycleEffects({
    isDemo,
    isBooting,
    isConfigured,
    isBitbucketReady,
    settings: currentSettings,
    weekKey,
    skippedDates,
    remainingWeekHours,
    todayDateKey,
    runSync,
    runReviewSync,
    client
  });
  return null;
}

const renderHarness = (props: HarnessProps = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

const flushAsyncEffects = async () => {
  for (let index = 0; index < 4; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

beforeEach(() => {
  runSync = vi.fn(async () => syncResult);
  runReviewSync = vi.fn(async () => reviewResult);
  scheduleReminder = vi.fn(async () => scheduledReminder);
  client = { scheduleReminder };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useAppLifecycleEffects", () => {
  it("skips startup sync and reminders in demo mode", async () => {
    renderHarness({ isDemo: true, isBitbucketReady: true });
    await flushAsyncEffects();

    expect(runSync).not.toHaveBeenCalled();
    expect(runReviewSync).not.toHaveBeenCalled();
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it("waits for boot to finish, then runs Jira sync followed by Bitbucket review sync once", async () => {
    renderHarness({ isBooting: true, isBitbucketReady: true });
    await flushAsyncEffects();

    expect(runSync).not.toHaveBeenCalled();
    expect(runReviewSync).not.toHaveBeenCalled();

    renderHarness({ isBooting: false, isBitbucketReady: true });
    await flushAsyncEffects();

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(runReviewSync).toHaveBeenCalledTimes(1);
    expect(runSync.mock.invocationCallOrder[0]).toBeLessThan(runReviewSync.mock.invocationCallOrder[0]);

    renderHarness({ isBooting: false, isBitbucketReady: true, remainingWeekHours: 5 });
    await flushAsyncEffects();

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(runReviewSync).toHaveBeenCalledTimes(1);
  });

  it("runs only Jira startup sync when Bitbucket is not ready", async () => {
    renderHarness({ isBitbucketReady: false });
    await flushAsyncEffects();

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(runReviewSync).not.toHaveBeenCalled();
  });

  it("marks startup checked even when Jira is not configured", async () => {
    renderHarness({ isConfigured: false });
    await flushAsyncEffects();

    renderHarness({ isConfigured: true });
    await flushAsyncEffects();

    expect(runSync).not.toHaveBeenCalled();
    expect(runReviewSync).not.toHaveBeenCalled();
  });

  it("schedules reminders outside demo mode with the current week payload", async () => {
    renderHarness({
      skippedDates: ["2026-06-18", "2026-06-19"],
      remainingWeekHours: 3,
      todayDateKey: "2026-06-18"
    });
    await flushAsyncEffects();

    expect(scheduleReminder).toHaveBeenCalledWith({
      settings,
      weekKey: "2026-06-15",
      skippedDates: ["2026-06-18", "2026-06-19"],
      remainingWeekHours: 3,
      todayDateKey: "2026-06-18"
    });
  });

  it("logs unsupported reminder messages from the native client", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    scheduleReminder.mockResolvedValue({
      scheduled: false,
      reason: "unsupported",
      message: "Reminders are not available on this platform."
    });

    renderHarness();
    await flushAsyncEffects();

    expect(warn).toHaveBeenCalledWith("Reminders are not available on this platform.");
  });

  it("logs reminder scheduling failures without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = new Error("Native bridge failed");
    scheduleReminder.mockRejectedValue(error);

    renderHarness();
    await flushAsyncEffects();

    expect(warn).toHaveBeenCalledWith("Unable to schedule reminder.", error);
  });
});
