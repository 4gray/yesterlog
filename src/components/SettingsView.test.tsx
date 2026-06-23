import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import type { AppSettings, AppUpdateInfo } from "../../shared/types";
import { SettingsView } from "./SettingsView";

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "dev@example.com",
  jiraApiToken: "jira-token-123",
  bitbucketEmail: "dev@example.com",
  bitbucketApiToken: "bb-token-123",
  bitbucketWorkspace: "team",
  bitbucketRepositories: "explorer-web, explorer-core",
  bitbucketReviewBucketIssueKey: "TEAM-77",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "17:00",
  remindersEnabled: true
};

const updateInfo: AppUpdateInfo = {
  currentVersion: "1.0.0",
  latestVersion: "1.1.0",
  releaseName: "v1.1.0",
  releasePageUrl: "https://github.com/4gray/time-bro/releases/tag/v1.1.0",
  checkedAt: "2026-06-22T12:00:00.000Z",
  updateAvailable: true
};

const renderSettings = (overrides: Partial<ComponentProps<typeof SettingsView>> = {}) =>
  renderToStaticMarkup(
    <SettingsView
      draft={settings}
      onDraftChange={() => undefined}
      onSave={() => undefined}
      onTestConnection={() => undefined}
      onTestBitbucketConnection={() => undefined}
      isTesting={false}
      isTestingBitbucket={false}
      effectiveTheme="dark"
      onSelectTheme={() => undefined}
      updateInfo={updateInfo}
      isCheckingUpdates={false}
      onCheckForUpdates={() => undefined}
      onOpenReleasePage={() => undefined}
      weekRangeLabel="Jun 15 - 21, 2026"
      onExportWeekCsv={() => undefined}
      onImportPersonalNotes={() => undefined}
      isImportingPersonalNotes={false}
      {...overrides}
    />
  );

describe("SettingsView", () => {
  it("keeps the Jira token hidden by default and exposes a visibility toggle", () => {
    const markup = renderSettings();

    expect(markup).toContain("Jira API token");
    expect(markup).toContain("Create token without scopes");
    expect(markup).toContain('type="password"');
    expect(markup).toContain('aria-label="Show Jira API token"');
    expect(markup).toContain("jira-token-123");
  });

  it("renders optional Bitbucket review settings and required scope copy", () => {
    const markup = renderSettings();

    expect(markup).toContain("Bitbucket Cloud review");
    expect(markup).toContain("Choose Create API token with scopes");
    expect(markup).toContain("Select Bitbucket Cloud as the app.");
    expect(markup).toContain("read:user:bitbucket");
    expect(markup).toContain("read:workspace:bitbucket");
    expect(markup).toContain("read:repository:bitbucket");
    expect(markup).toContain("read:pullrequest:bitbucket");
    expect(markup).toContain("No Write, Admin, or Delete scopes are needed for Review.");
    expect(markup).toContain("Show Bitbucket API token");
    expect(markup).toContain("explorer-web, explorer-core");
    expect(markup).toContain("Test Bitbucket");
  });

  it("renders current and latest app versions", () => {
    const markup = renderSettings();

    expect(markup).toContain("Version");
    expect(markup).toContain("v1.0.0");
    expect(markup).toContain("v1.1.0");
    expect(markup).toContain("v1.1.0 is available.");
    expect(markup).toContain("GitHub Releases");
  });

  it("renders import and export controls in the data panel", () => {
    const markup = renderSettings();

    expect(markup).toContain("Data");
    expect(markup).toContain("Current week CSV");
    expect(markup).toContain("Jun 15 - 21, 2026");
    expect(markup).toContain("Export CSV");
    expect(markup).toContain("Personal notes");
    expect(markup).toContain("Import CSV");
  });
});
