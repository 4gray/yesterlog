// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, AppUpdateInfo } from "../../shared/types";
import { AppSettingsRoute, type AppSettingsRouteProps } from "./AppSettingsRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { settingsViewProps } = vi.hoisted(() => ({
  settingsViewProps: [] as Record<string, unknown>[]
}));

vi.mock("../components/SettingsView", () => ({
  SettingsView: (props: Record<string, unknown>) => {
    settingsViewProps.push(props);
    return (
      <section
        data-testid="settings-view"
        data-theme={String(props.effectiveTheme)}
        data-week={String(props.weekRangeLabel)}
        data-testing={String(props.isTesting)}
        data-testing-bitbucket={String(props.isTestingBitbucket)}
        data-importing={String(props.isImportingPersonalNotes)}
      >
        <button type="button" onClick={() => (props.onSave as () => void)()}>
          save
        </button>
        <button type="button" onClick={() => (props.onSelectTheme as (theme: string) => void)("light")}>
          theme
        </button>
        <button type="button" onClick={() => (props.onExportWeekCsv as () => void)()}>
          export
        </button>
        <button type="button" onClick={() => (props.onImportPersonalNotes as () => void)()}>
          import
        </button>
      </section>
    );
  }
}));

const settingsDraft: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "person@example.com",
  bitbucketApiToken: "bb-token",
  bitbucketWorkspace: "workspace",
  bitbucketRepositories: "repo",
  bitbucketReviewBucketIssueKey: "REV-1",
  weeklyTargetHours: 32,
  workingDays: [1, 2, 3, 4],
  reminderTime: "17:30",
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
};

const updateInfo: AppUpdateInfo = {
  currentVersion: "1.3.2",
  latestVersion: "1.4.0",
  releasePageUrl: "https://github.com/4gray/time-bro/releases/tag/v1.4.0",
  checkedAt: "2026-06-25T08:00:00.000Z",
  updateAvailable: true
};

const noop = () => undefined;

const baseProps = (): AppSettingsRouteProps => ({
  settingsDraft,
  setSettingsDraft: noop,
  isDirty: false,
  handleSaveSettings: noop,
  handleTestConnection: noop,
  handleTestBitbucketConnection: noop,
  isTesting: false,
  isTestingBitbucket: false,
  effectiveTheme: "dark",
  selectTheme: noop,
  updateInfo,
  isCheckingUpdates: false,
  checkForUpdatesFromSettings: noop,
  openCurrentReleaseNotes: noop,
  openCurrentUpdateDownload: noop,
  openReleasePage: noop,
  weekRangeLabel: "Jun 15-21",
  handleExportWeekCsv: noop,
  handleImportPersonalNotes: noop,
  isImportingPersonalNotes: false,
  recurringEvents: [],
  handleSaveRecurringEvent: noop,
  handleDeleteRecurringEvent: noop,
  handleToggleRecurringEvent: noop
});

let container: HTMLDivElement;
let root: Root;

const renderRoute = (props: Partial<AppSettingsRouteProps> = {}) => {
  act(() => {
    root.render(<AppSettingsRoute {...baseProps()} {...props} />);
  });
};

beforeEach(() => {
  settingsViewProps.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppSettingsRoute", () => {
  it("maps app-level settings state to SettingsView props", () => {
    renderRoute({ isTesting: true, isTestingBitbucket: true, isImportingPersonalNotes: true });

    const rendered = container.querySelector("[data-testid='settings-view']");
    expect(rendered?.getAttribute("data-theme")).toBe("dark");
    expect(rendered?.getAttribute("data-week")).toBe("Jun 15-21");
    expect(rendered?.getAttribute("data-testing")).toBe("true");
    expect(rendered?.getAttribute("data-testing-bitbucket")).toBe("true");
    expect(rendered?.getAttribute("data-importing")).toBe("true");
    expect(settingsViewProps[0]?.draft).toBe(settingsDraft);
    expect(settingsViewProps[0]?.updateInfo).toBe(updateInfo);
  });

  it("passes SettingsView actions through unchanged", () => {
    const handleSaveSettings = vi.fn();
    const selectTheme = vi.fn();
    const handleExportWeekCsv = vi.fn();
    const handleImportPersonalNotes = vi.fn();
    renderRoute({
      handleSaveSettings,
      selectTheme,
      handleExportWeekCsv,
      handleImportPersonalNotes
    });

    act(() => {
      container.querySelectorAll("button")[0]?.click();
      container.querySelectorAll("button")[1]?.click();
      container.querySelectorAll("button")[2]?.click();
      container.querySelectorAll("button")[3]?.click();
    });

    expect(handleSaveSettings).toHaveBeenCalledTimes(1);
    expect(selectTheme).toHaveBeenCalledWith("light");
    expect(handleExportWeekCsv).toHaveBeenCalledTimes(1);
    expect(handleImportPersonalNotes).toHaveBeenCalledTimes(1);
  });
});
