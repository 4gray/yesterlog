// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppSettings,
  BitbucketConnectionResult,
  JiraConnectionResult,
  SyncResult
} from "../../shared/types";
import {
  useSettingsActions,
  type SettingsActionsClient
} from "./useSettingsActions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "person@example.com",
  bitbucketApiToken: "bb-token",
  bitbucketWorkspace: "timebro",
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

const messySettings: AppSettings = {
  ...settings,
  jiraBaseUrl: " timebro-demo/ ",
  jiraEmail: " person@example.com ",
  bitbucketEmail: " reviewer@example.com ",
  bitbucketApiToken: " bb-token ",
  bitbucketWorkspace: " timebro ",
  bitbucketRepositories: " app\napp, api ",
  bitbucketReviewBucketIssueKey: " rev-77 ",
  weeklyTargetHours: 0,
  workingDays: []
};

const syncResult = (): SyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-17T10:00:00.000Z",
  accountId: "account-1",
  trackedSeconds: 0,
  issueCount: 0,
  worklogCount: 0,
  daySummaries: {}
});

type SettingsActionsApi = ReturnType<typeof useSettingsActions>;

let container: HTMLDivElement;
let root: Root;
let api: SettingsActionsApi | undefined;
let testJiraConnection: ReturnType<typeof vi.fn<SettingsActionsClient["testJiraConnection"]>>;
let testBitbucketConnection: ReturnType<typeof vi.fn<SettingsActionsClient["testBitbucketConnection"]>>;
let saveSettings: ReturnType<typeof vi.fn<(nextSettings: AppSettings) => Promise<void>>>;
let runSync: ReturnType<typeof vi.fn<(nextSettings?: AppSettings) => Promise<SyncResult | undefined>>>;
let loadTickets: ReturnType<typeof vi.fn<(nextSettings?: AppSettings) => Promise<void>>>;
let setSettings: ReturnType<typeof vi.fn<(nextSettings: AppSettings) => void>>;
let setSettingsDraft: ReturnType<typeof vi.fn<(nextSettings: AppSettings) => void>>;
let setWelcomeConnected: ReturnType<typeof vi.fn<(connected: boolean) => void>>;
let showSuccess: ReturnType<typeof vi.fn<(message: string) => void>>;
let showError: ReturnType<typeof vi.fn<(message: string) => void>>;
let client: SettingsActionsClient;

function Harness({
  settingsDraft = settings,
  isDemo = false,
  demoSyncResult
}: {
  settingsDraft?: AppSettings;
  isDemo?: boolean;
  demoSyncResult?: SyncResult;
}) {
  api = useSettingsActions({
    settingsDraft,
    isDemo,
    demoSyncResult,
    client,
    saveSettings,
    runSync,
    loadTickets,
    setSettings,
    setSettingsDraft,
    setWelcomeConnected,
    showSuccess,
    showError
  });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Settings actions hook was not rendered.");
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
  testJiraConnection = vi.fn();
  testBitbucketConnection = vi.fn();
  saveSettings = vi.fn(async () => undefined);
  runSync = vi.fn(async () => syncResult());
  loadTickets = vi.fn(async () => undefined);
  setSettings = vi.fn();
  setSettingsDraft = vi.fn();
  setWelcomeConnected = vi.fn();
  showSuccess = vi.fn();
  showError = vi.fn();
  client = {
    testJiraConnection,
    testBitbucketConnection
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

describe("useSettingsActions", () => {
  it("normalizes and persists saved settings outside demo mode", async () => {
    renderHarness({ settingsDraft: messySettings });

    await act(async () => {
      await getApi().handleSaveSettings();
    });

    const expectedSettings: AppSettings = {
      ...messySettings,
      jiraBaseUrl: "https://timebro-demo.atlassian.net",
      jiraEmail: "person@example.com",
      bitbucketEmail: "reviewer@example.com",
      bitbucketApiToken: "bb-token",
      bitbucketWorkspace: "timebro",
      bitbucketRepositories: "app, api",
      bitbucketReviewBucketIssueKey: "REV-77",
      weeklyTargetHours: 40,
      workingDays: [1, 2, 3, 4, 5]
    };
    expect(saveSettings).toHaveBeenCalledWith(expectedSettings);
    expect(setSettings).toHaveBeenCalledWith(expectedSettings);
    expect(setSettingsDraft).toHaveBeenCalledWith(expectedSettings);
    expect(showSuccess).toHaveBeenCalledWith("Settings saved locally.");
  });

  it("preserves configured weekend working days when saving settings", async () => {
    renderHarness({
      settingsDraft: {
        ...settings,
        workingDays: [7, 6, 6, 1]
      }
    });

    await act(async () => {
      await getApi().handleSaveSettings();
    });

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        workingDays: [1, 6, 7]
      })
    );
  });

  it("updates demo settings without writing to storage", async () => {
    renderHarness({ settingsDraft: messySettings, isDemo: true });

    await act(async () => {
      await getApi().handleSaveSettings();
    });

    expect(saveSettings).not.toHaveBeenCalled();
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettingsDraft).toHaveBeenCalledTimes(1);
    expect(showSuccess).toHaveBeenCalledWith("Demo settings updated for this preview.");
  });

  it("connects from the welcome screen, saves settings, syncs, and refreshes tickets", async () => {
    const result: JiraConnectionResult = {
      ok: true,
      accountId: "account-1",
      displayName: "Time Keeper",
      message: "Connected as Time Keeper."
    };
    testJiraConnection.mockResolvedValue(result);
    renderHarness({ settingsDraft: { ...settings, weeklyTargetHours: 0, workingDays: [] } });

    await act(async () => {
      await expect(
        getApi().handleWelcomeConnect({
          jiraBaseUrl: " team ",
          jiraEmail: " keeper@example.com ",
          jiraApiToken: "jira-token"
        })
      ).resolves.toBe(result);
    });

    const expectedSettings = {
      ...settings,
      jiraBaseUrl: "https://team.atlassian.net",
      jiraEmail: "keeper@example.com",
      jiraApiToken: "jira-token",
      weeklyTargetHours: 40,
      workingDays: [1, 2, 3, 4, 5]
    };
    expect(testJiraConnection).toHaveBeenCalledWith(expectedSettings);
    expect(saveSettings).toHaveBeenCalledWith(expectedSettings);
    expect(runSync).toHaveBeenCalledWith(expectedSettings);
    expect(setSettings).toHaveBeenCalledWith(expectedSettings);
    expect(setSettingsDraft).toHaveBeenCalledWith(expectedSettings);
    expect(setWelcomeConnected).toHaveBeenCalledWith(true);
    expect(loadTickets).toHaveBeenCalledWith(expectedSettings);
    expect(showSuccess).toHaveBeenCalledWith("Connected as Time Keeper.");
  });

  it("reports welcome connection failures without mutating app state", async () => {
    const result: JiraConnectionResult = {
      ok: false,
      message: "Invalid Jira token."
    };
    testJiraConnection.mockResolvedValue(result);
    renderHarness();

    await act(async () => {
      await expect(
        getApi().handleWelcomeConnect({
          jiraBaseUrl: "team",
          jiraEmail: "keeper@example.com",
          jiraApiToken: "bad-token"
        })
      ).resolves.toBe(result);
    });

    expect(showError).toHaveBeenCalledWith("Invalid Jira token.");
    expect(saveSettings).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();
    expect(setWelcomeConnected).not.toHaveBeenCalled();
    expect(loadTickets).not.toHaveBeenCalled();
  });

  it("tests Jira connections through the native client", async () => {
    const result: JiraConnectionResult = {
      ok: true,
      accountId: "account-1",
      message: "Connected."
    };
    testJiraConnection.mockResolvedValue(result);
    renderHarness({ settingsDraft: messySettings });

    await act(async () => {
      await getApi().handleTestConnection();
    });

    expect(testJiraConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        jiraBaseUrl: "https://timebro-demo.atlassian.net",
        jiraEmail: "person@example.com"
      })
    );
    expect(showSuccess).toHaveBeenCalledWith("Connected.");
    expect(showError).not.toHaveBeenCalled();
    expect(getApi().isTesting).toBe(false);
  });

  it("uses the demo sync identity without calling the native client", async () => {
    renderHarness({
      isDemo: true,
      demoSyncResult: {
        ...syncResult(),
        accountId: "demo-account",
        displayName: "Demo Timekeeper"
      }
    });

    await act(async () => {
      await getApi().handleTestConnection();
    });

    expect(testJiraConnection).not.toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith("Connected as Demo Timekeeper.");
    expect(getApi().isTesting).toBe(false);
  });

  it("tests Bitbucket connections with normalized Bitbucket fields", async () => {
    const result: BitbucketConnectionResult = {
      ok: false,
      message: "Bitbucket token rejected."
    };
    testBitbucketConnection.mockResolvedValue(result);
    renderHarness({ settingsDraft: messySettings });

    await act(async () => {
      await getApi().handleTestBitbucketConnection();
    });

    expect(testBitbucketConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        bitbucketEmail: "reviewer@example.com",
        bitbucketApiToken: "bb-token",
        bitbucketWorkspace: "timebro",
        bitbucketRepositories: "app, api"
      })
    );
    expect(showError).toHaveBeenCalledWith("Bitbucket token rejected.");
    expect(showSuccess).not.toHaveBeenCalled();
    expect(getApi().isTestingBitbucket).toBe(false);
  });

  it("uses the demo Bitbucket success without calling the native client", async () => {
    renderHarness({ isDemo: true, settingsDraft: messySettings });

    await act(async () => {
      await getApi().handleTestBitbucketConnection();
    });

    expect(testBitbucketConnection).not.toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith("Connected to Bitbucket as Demo Reviewer; found Explorer Web.");
    expect(getApi().isTestingBitbucket).toBe(false);
  });
});
