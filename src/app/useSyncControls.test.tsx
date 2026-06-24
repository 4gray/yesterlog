// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, SyncResult } from "../../shared/types";
import { useSyncControls } from "./useSyncControls";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "reviewer@example.com",
  bitbucketApiToken: "bb-token",
  bitbucketWorkspace: "timebro",
  bitbucketRepositories: "app",
  bitbucketReviewBucketIssueKey: "REV-1",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true
};

const jiraOnlySettings: AppSettings = {
  ...settings,
  bitbucketEmail: "",
  bitbucketApiToken: "",
  bitbucketWorkspace: "",
  bitbucketRepositories: "",
  bitbucketReviewBucketIssueKey: ""
};

const syncResult: SyncResult = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-17T12:00:00.000Z",
  accountId: "account-1",
  displayName: "Person Example",
  trackedSeconds: 0,
  issueCount: 0,
  worklogCount: 0,
  daySummaries: {}
};

type SyncControlsApi = ReturnType<typeof useSyncControls>;

let container: HTMLDivElement;
let root: Root;
let api: SyncControlsApi | undefined;
let runSync: ReturnType<typeof vi.fn<() => Promise<void>>>;
let runReviewSync: ReturnType<typeof vi.fn<(settings?: AppSettings) => Promise<void>>>;

interface HarnessProps {
  currentSettings?: AppSettings;
  currentSyncResult?: SyncResult;
  isSyncing?: boolean;
  isSyncingReviews?: boolean;
}

function Harness({
  currentSettings = settings,
  currentSyncResult,
  isSyncing = false,
  isSyncingReviews = false
}: HarnessProps) {
  api = useSyncControls({
    settings: currentSettings,
    syncResult: currentSyncResult,
    isSyncing,
    isSyncingReviews,
    runSync,
    runReviewSync
  });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Sync controls hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: HarnessProps = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

beforeEach(() => {
  api = undefined;
  runSync = vi.fn(async () => undefined);
  runReviewSync = vi.fn(async () => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useSyncControls", () => {
  it("reports stale, synced, and syncing labels from current sync state", () => {
    renderHarness();

    expect(getApi().syncState).toBe("stale");
    expect(getApi().syncLabel).toBe("NOT SYNCED");

    renderHarness({ currentSyncResult: syncResult });

    expect(getApi().syncState).toBe("synced");
    expect(getApi().syncLabel).toMatch(/^SYNCED /);

    renderHarness({ currentSyncResult: syncResult, isSyncingReviews: true });

    expect(getApi().syncState).toBe("syncing");
    expect(getApi().syncLabel).toBe("SYNCING…");

    renderHarness({ isSyncing: true });

    expect(getApi().syncState).toBe("syncing");
    expect(getApi().syncLabel).toBe("SYNCING…");
  });

  it("runs Jira sync before Bitbucket review sync when Bitbucket is configured", async () => {
    renderHarness();

    await act(async () => {
      await getApi().handleSync();
    });

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(runReviewSync).toHaveBeenCalledTimes(1);
    expect(runReviewSync).toHaveBeenCalledWith(settings);
    expect(runSync.mock.invocationCallOrder[0]).toBeLessThan(runReviewSync.mock.invocationCallOrder[0]);
  });

  it("skips Bitbucket review sync when Bitbucket settings are incomplete", async () => {
    renderHarness({ currentSettings: jiraOnlySettings });

    await act(async () => {
      await getApi().handleSync();
    });

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(runReviewSync).not.toHaveBeenCalled();
  });

  it("does not run Bitbucket review sync when Jira sync rejects", async () => {
    runSync.mockRejectedValueOnce(new Error("Jira unavailable"));
    renderHarness();

    await expect(getApi().handleSync()).rejects.toThrow("Jira unavailable");

    expect(runReviewSync).not.toHaveBeenCalled();
  });
});
