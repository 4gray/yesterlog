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
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
};

const updateInfo: AppUpdateInfo = {
  currentVersion: "1.0.0",
  latestVersion: "1.1.0",
  releaseName: "v1.1.0",
  releaseNotes: "## Changed\n\n- Added the download button.",
  releasePageUrl: "https://github.com/4gray/time-bro/releases/tag/v1.1.0",
  downloadUrl: "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0-arm64.dmg",
  downloadName: "TimeBro-1.1.0-arm64.dmg",
  downloadPlatform: "macos",
  checkedAt: "2026-06-22T12:00:00.000Z",
  updateAvailable: true
};

const renderSettings = (overrides: Partial<ComponentProps<typeof SettingsView>> = {}) =>
  renderToStaticMarkup(
    <SettingsView
      draft={settings}
      onDraftChange={() => undefined}
      isDirty={false}
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
      onShowReleaseNotes={() => undefined}
      onDownloadUpdate={() => undefined}
      onInstallUpdate={() => undefined}
      onOpenReleasePage={() => undefined}
      weekRangeLabel="Jun 15 - 21, 2026"
      onExportWeekCsv={() => undefined}
      onImportPersonalNotes={() => undefined}
      isImportingPersonalNotes={false}
      recurringEvents={[]}
      onSaveRecurringEvent={() => undefined}
      onDeleteRecurringEvent={() => undefined}
      onToggleRecurringEvent={() => undefined}
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
    const markup = renderSettings({ initialSection: "bitbucket" });

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
    const markup = renderSettings({ initialSection: "about" });

    expect(markup).toContain("Version");
    expect(markup).toContain("v1.0.0");
    expect(markup).toContain("v1.1.0");
    expect(markup).toContain("v1.1.0 is available.");
    expect(markup).toContain("GitHub Releases");
    expect(markup).toContain("Current notes");
    expect(markup).toContain("Download");
  });

  it("renders automatic update actions when the package supports in-app installation", () => {
    const markup = renderSettings({
      initialSection: "about",
      updateInfo: {
        ...updateInfo,
        autoUpdate: {
          supported: true,
          phase: "idle",
          platform: "macos"
        }
      }
    });

    expect(markup).toContain("Automatic install is available for this macOS build.");
    expect(markup).toContain("Download update");
  });

  it("renders restart action after an automatic update download finishes", () => {
    const markup = renderSettings({
      initialSection: "about",
      updateInfo: {
        ...updateInfo,
        autoUpdate: {
          supported: true,
          phase: "downloaded",
          platform: "macos",
          progress: {
            percent: 100
          }
        }
      }
    });

    expect(markup).toContain("Update downloaded. Restart to install.");
    expect(markup).toContain("Restart to install");
  });

  it("renders import and export controls in the data panel", () => {
    const markup = renderSettings({ initialSection: "data" });

    expect(markup).toContain("Data");
    expect(markup).toContain("Current week CSV");
    expect(markup).toContain("Jun 15 - 21, 2026");
    expect(markup).toContain("Export CSV");
    expect(markup).toContain("Personal notes");
    expect(markup).toContain("Import CSV");
  });

  it("renders all seven working-day toggles and protects the last selected day", () => {
    const markup = renderSettings({
      initialSection: "tracking",
      draft: {
        ...settings,
        workingDays: [6]
      }
    });

    for (const label of ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("disabled");
    expect(markup).toContain("aria-pressed=\"true\"");
  });

  it("shows weekend days on recurring events", () => {
    const markup = renderSettings({
      initialSection: "recurring",
      recurringEvents: [
        {
          id: "rec-weekend",
          title: "Weekend support",
          daysOfWeek: [6, 7],
          localTime: "10:00",
          durationMinutes: 60,
          defaultNote: "Weekend coverage",
          active: true,
          createdAt: "2026-06-22T10:00:00.000Z",
          updatedAt: "2026-06-22T10:00:00.000Z"
        }
      ]
    });

    expect(markup).toContain("Weekend support");
    expect(markup).toContain("SAT");
    expect(markup).toContain("SUN");
  });

  it("exposes the optional Local AI subpage and frames it as not required", () => {
    const markup = renderSettings({ initialSection: "reconstruct" });

    expect(markup).toContain("LOCAL AI · OLLAMA");
    expect(markup).toContain("OPTIONAL");
    expect(markup).toContain("RECONSTRUCTION WORKS WITHOUT AI");
    expect(markup).toContain("CORE · ALWAYS ON");
    expect(markup).toContain("WITH LOCAL AI · OPTIONAL");
    expect(markup).toContain("Use local AI for day reconstruction");
    expect(markup).toContain("http://localhost:11434");
    // off by default → activation chain reports inactive
    expect(markup).toContain("AI inactive");
  });

  it("reflects the enabled toggle state in the Local AI subpage", () => {
    const enabled = { ...settings, aiEnabled: true };
    const markup = renderSettings({ initialSection: "reconstruct", draft: enabled });

    expect(markup).toContain("switch is-ai on");
  });
});
