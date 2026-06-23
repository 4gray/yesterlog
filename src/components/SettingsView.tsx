import {
  Bell,
  BadgeInfo,
  CalendarDays,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  GitPullRequest,
  KeyRound,
  LockKeyhole,
  Loader2,
  Moon,
  RefreshCw,
  Save,
  ShieldCheck,
  SunMedium,
  TestTube2,
  Upload
} from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import type { AppSettings, AppUpdateInfo, WeekdayNumber } from "../../shared/types";
import type { ThemeMode } from "./Sidebar";

interface SettingsViewProps {
  draft: AppSettings;
  onDraftChange: (settings: AppSettings) => void;
  onSave: () => void;
  onTestConnection: () => void;
  onTestBitbucketConnection: () => void;
  isTesting: boolean;
  isTestingBitbucket: boolean;
  effectiveTheme: ThemeMode;
  onSelectTheme: (theme: ThemeMode) => void;
  updateInfo?: AppUpdateInfo;
  isCheckingUpdates: boolean;
  onCheckForUpdates: () => void;
  onOpenReleasePage: (url?: string) => void;
  weekRangeLabel: string;
  onExportWeekCsv: () => void;
  onImportPersonalNotes: (file: File) => Promise<void> | void;
  isImportingPersonalNotes: boolean;
}

const WEEKDAYS: Array<{ value: WeekdayNumber; label: string }> = [
  { value: 1, label: "MON" },
  { value: 2, label: "TUE" },
  { value: 3, label: "WED" },
  { value: 4, label: "THU" },
  { value: 5, label: "FRI" }
];

const API_TOKEN_URL = "https://id.atlassian.com/manage-profile/security/api-tokens";
const BITBUCKET_SCOPES_URL = "https://support.atlassian.com/bitbucket-cloud/docs/api-token-permissions/";

const BITBUCKET_REQUIRED_SCOPES = [
  { area: "User", level: "Read", apiScope: "read:user:bitbucket" },
  { area: "Workspace", level: "Read", apiScope: "read:workspace:bitbucket" },
  { area: "Repository", level: "Read", apiScope: "read:repository:bitbucket" },
  { area: "Pull request", level: "Read", apiScope: "read:pullrequest:bitbucket" }
];

const formatReleaseVersion = (version?: string) => {
  const trimmed = version?.trim();
  return trimmed ? `v${trimmed.replace(/^v/i, "")}` : "UNKNOWN";
};

const formatCheckedAt = (checkedAt?: string) => {
  if (!checkedAt) {
    return "NOT CHECKED YET";
  }

  return `CHECKED ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(checkedAt)).toUpperCase()}`;
};

const getUpdateStatus = (updateInfo: AppUpdateInfo | undefined, isCheckingUpdates: boolean) => {
  if (isCheckingUpdates) {
    return "Checking GitHub Releases...";
  }

  if (!updateInfo) {
    return "Release status has not been checked yet.";
  }

  if (updateInfo.error) {
    return updateInfo.error;
  }

  if (updateInfo.updateAvailable && updateInfo.latestVersion) {
    return `${formatReleaseVersion(updateInfo.latestVersion)} is available.`;
  }

  return "TimeBro is up to date.";
};

export const SettingsView = ({
  draft,
  onDraftChange,
  onSave,
  onTestConnection,
  onTestBitbucketConnection,
  isTesting,
  isTestingBitbucket,
  effectiveTheme,
  onSelectTheme,
  updateInfo,
  isCheckingUpdates,
  onCheckForUpdates,
  onOpenReleasePage,
  weekRangeLabel,
  onExportWeekCsv,
  onImportPersonalNotes,
  isImportingPersonalNotes
}: SettingsViewProps) => {
  const [showJiraApiToken, setShowJiraApiToken] = useState(false);
  const [showBitbucketApiToken, setShowBitbucketApiToken] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const updateField = <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => {
    onDraftChange({
      ...draft,
      [key]: value
    });
  };

  const toggleWorkingDay = (day: WeekdayNumber) => {
    const workingDays = draft.workingDays.includes(day)
      ? draft.workingDays.filter((candidate) => candidate !== day)
      : [...draft.workingDays, day].sort();

    updateField("workingDays", workingDays as WeekdayNumber[]);
  };

  const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) {
      void onImportPersonalNotes(file);
    }
  };

  return (
    <div className="view settings-view">
      <div className="settings-header">
        <div>
          <div className="eyebrow">SETTINGS</div>
          <h1 className="settings-title">Connect &amp; configure</h1>
          <div className="settings-subtitle">Connect Jira, set weekly expectations, and schedule local reminders.</div>
        </div>

        <button className="primary-button" type="button" onClick={onSave}>
          <Save size={16} />
          Save settings
        </button>
      </div>

      <section className="settings-grid">
        <form className="settings-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="section-title">
            <ShieldCheck size={16} />
            <span>Jira Cloud sign-in</span>
          </div>

          <div className="auth-primer">
            <div className="auth-primer-icon">
              <KeyRound size={18} />
            </div>
            <div>
              <strong>No Jira admin needed</strong>
              <p>
                Use your normal developer account plus a regular Atlassian API token. The app can only read worklogs
                your user is already allowed to see.
              </p>
            </div>
          </div>

          <label>
            <span>Jira site</span>
            <input
              type="text"
              placeholder="mycompany or mycompany.atlassian.net"
              value={draft.jiraBaseUrl}
              onChange={(event) => updateField("jiraBaseUrl", event.target.value)}
            />
            <small className="field-hint-text">Pasting the full URL also works.</small>
          </label>

          <label>
            <span>Jira email</span>
            <input
              type="email"
              placeholder="you@company.com"
              value={draft.jiraEmail}
              onChange={(event) => updateField("jiraEmail", event.target.value)}
            />
          </label>

          <label>
            <span>Jira API token</span>
            <div className="settings-token">
              <input
                type={showJiraApiToken ? "text" : "password"}
                placeholder="Paste a token from your Atlassian account"
                value={draft.jiraApiToken}
                onChange={(event) => updateField("jiraApiToken", event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowJiraApiToken((visible) => !visible)}
                aria-label={showJiraApiToken ? "Hide Jira API token" : "Show Jira API token"}
                aria-pressed={showJiraApiToken}
                title={showJiraApiToken ? "Hide token" : "Show token"}
              >
                {showJiraApiToken ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <small className="field-hint-text">
              In Atlassian, choose Create token without scopes. Do not use the scoped token flow for TimeBro.
            </small>
          </label>

          <div className="privacy-promise">
            <LockKeyhole size={17} />
            <p>Credentials stay in IndexedDB and are sent only to your Jira Cloud site during test or sync.</p>
          </div>

          <div className="inline-actions">
            <a className="secondary-button" href={API_TOKEN_URL} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Create API token
            </a>
            <button className="secondary-button" type="button" onClick={onTestConnection} disabled={isTesting}>
              {isTesting ? <Loader2 className="spin" size={16} /> : <TestTube2 size={16} />}
              Test Jira connection
            </button>
          </div>

        </form>

        <form className="settings-panel" onSubmit={(event) => event.preventDefault()}>
          <div className="section-title">
            <GitPullRequest size={16} />
            <span>Bitbucket Cloud review</span>
          </div>

          <div className="auth-primer">
            <div className="auth-primer-icon">
              <GitPullRequest size={18} />
            </div>
            <div>
              <strong>Optional review ledger</strong>
              <p>
                Add a scoped Bitbucket token to surface PR review sessions. TimeBro only reads Bitbucket activity and
                never writes back to Bitbucket.
              </p>
            </div>
          </div>

          <label>
            <span>Bitbucket email</span>
            <input
              type="email"
              placeholder="you@company.com"
              value={draft.bitbucketEmail}
              onChange={(event) => updateField("bitbucketEmail", event.target.value)}
            />
          </label>

          <label>
            <span>Bitbucket API token</span>
            <div className="settings-token">
              <input
                type={showBitbucketApiToken ? "text" : "password"}
                placeholder="Paste a scoped Bitbucket token"
                value={draft.bitbucketApiToken}
                onChange={(event) => updateField("bitbucketApiToken", event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowBitbucketApiToken((visible) => !visible)}
                aria-label={showBitbucketApiToken ? "Hide Bitbucket API token" : "Show Bitbucket API token"}
                aria-pressed={showBitbucketApiToken}
                title={showBitbucketApiToken ? "Hide token" : "Show token"}
              >
                {showBitbucketApiToken ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <small className="field-hint-text">
              Choose Create API token with scopes, select Bitbucket Cloud, then grant only the read scopes below.
            </small>
          </label>

          <div className="scope-guide">
            <div className="scope-guide-title">Bitbucket token setup</div>
            <ol>
              <li>Open Create API token.</li>
              <li>Choose Create API token with scopes.</li>
              <li>Select Bitbucket Cloud as the app.</li>
              <li>Optionally restrict the token to your Bitbucket workspace.</li>
              <li>Select these permissions only:</li>
            </ol>
            <div className="scope-list" aria-label="Required Bitbucket API token scopes">
              {BITBUCKET_REQUIRED_SCOPES.map((scope) => (
                <div className="scope-row" key={scope.apiScope}>
                  <span>{scope.area}</span>
                  <strong>{scope.level}</strong>
                  <code>{scope.apiScope}</code>
                </div>
              ))}
            </div>
            <p>No Write, Admin, or Delete scopes are needed for Review.</p>
          </div>

          <label>
            <span>Workspace</span>
            <input
              type="text"
              placeholder="workspace-slug"
              value={draft.bitbucketWorkspace}
              onChange={(event) => updateField("bitbucketWorkspace", event.target.value)}
              spellCheck={false}
            />
          </label>

          <label>
            <span>Repositories</span>
            <input
              type="text"
              placeholder="explorer-web, explorer-core"
              value={draft.bitbucketRepositories}
              onChange={(event) => updateField("bitbucketRepositories", event.target.value)}
              spellCheck={false}
            />
            <small className="field-hint-text">Comma or newline separated repository slugs.</small>
          </label>

          <label>
            <span>Review bucket issue</span>
            <input
              type="text"
              placeholder="TEAM-123 (optional)"
              value={draft.bitbucketReviewBucketIssueKey}
              onChange={(event) => updateField("bitbucketReviewBucketIssueKey", event.target.value)}
              spellCheck={false}
            />
            <small className="field-hint-text">Used only when Review logs to a shared code-review Jira ticket.</small>
          </label>

          <div className="privacy-promise">
            <LockKeyhole size={17} />
            <p>Bitbucket credentials stay in IndexedDB and are sent only to api.bitbucket.org during test or review sync.</p>
          </div>

          <div className="inline-actions">
            <a className="secondary-button" href={API_TOKEN_URL} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Create API token
            </a>
            <a className="secondary-button" href={BITBUCKET_SCOPES_URL} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              View scopes
            </a>
            <button
              className="secondary-button"
              type="button"
              onClick={onTestBitbucketConnection}
              disabled={isTestingBitbucket}
            >
              {isTestingBitbucket ? <Loader2 className="spin" size={16} /> : <TestTube2 size={16} />}
              Test Bitbucket
            </button>
          </div>
        </form>

        <div className="settings-panel">
          <div className="section-title">
            <CalendarDays size={16} />
            <span>Weekly target</span>
          </div>

          <label>
            <span>Target hours</span>
            <input
              type="number"
              min="1"
              max="80"
              step="0.5"
              value={draft.weeklyTargetHours}
              onChange={(event) => updateField("weeklyTargetHours", Number(event.target.value))}
            />
          </label>

          <div className="field-group">
            <span>Working days</span>
            <div className="weekday-selector">
              {WEEKDAYS.map((day) => (
                <button
                  className={draft.workingDays.includes(day.value) ? "active" : ""}
                  key={day.value}
                  type="button"
                  onClick={() => toggleWorkingDay(day.value)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-panel">
          <div className="section-title">
            <Bell size={16} />
            <span>Reminder</span>
          </div>

          <label className="switch-row">
            <span>
              <strong>Daily reminder</strong>
              <small>Skip vacation days and completed weeks.</small>
            </span>
            <button
              className={`switch ${draft.remindersEnabled ? "on" : ""}`}
              type="button"
              aria-pressed={draft.remindersEnabled}
              onClick={() => updateField("remindersEnabled", !draft.remindersEnabled)}
            >
              <span />
            </button>
          </label>

          <label>
            <span>Reminder time</span>
            <input
              type="time"
              value={draft.reminderTime}
              onChange={(event) => updateField("reminderTime", event.target.value)}
            />
          </label>
        </div>

        <div className="settings-panel">
          <div className="section-title">
            <SunMedium size={16} />
            <span>Appearance</span>
          </div>

          <div className="appearance-row">
            <div>
              <strong>Theme</strong>
              <small>Follows your system setting until you pick one.</small>
            </div>
          </div>

          <div className="theme-chips">
            <button
              type="button"
              className={`theme-chip ${effectiveTheme === "light" ? "active" : ""}`}
              aria-pressed={effectiveTheme === "light"}
              onClick={() => onSelectTheme("light")}
            >
              <SunMedium size={14} />
              LIGHT
            </button>
            <button
              type="button"
              className={`theme-chip ${effectiveTheme === "dark" ? "active" : ""}`}
              aria-pressed={effectiveTheme === "dark"}
              onClick={() => onSelectTheme("dark")}
            >
              <Moon size={14} />
              DARK
            </button>
          </div>
        </div>

        <div className="settings-panel">
          <div className="section-title">
            <Database size={16} />
            <span>Data</span>
          </div>

          <div className="data-transfer-row">
            <div>
              <strong>Current week CSV</strong>
              <small>{weekRangeLabel}</small>
            </div>
            <button className="secondary-button" type="button" onClick={onExportWeekCsv}>
              <Download size={16} />
              Export CSV
            </button>
          </div>

          <div className="data-transfer-row">
            <div>
              <strong>Personal notes</strong>
              <small>Imports local notes from exported weekly CSV files.</small>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={handleImportFileChange}
            />
            <button
              className="secondary-button"
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={isImportingPersonalNotes}
            >
              {isImportingPersonalNotes ? <Loader2 className="spin" size={16} /> : <Upload size={16} />}
              {isImportingPersonalNotes ? "Importing" : "Import CSV"}
            </button>
          </div>
        </div>

        <div className="settings-panel">
          <div className="section-title">
            <BadgeInfo size={16} />
            <span>Version</span>
          </div>

          <div className="version-grid">
            <div className="version-stat">
              <span>Current</span>
              <strong>{formatReleaseVersion(updateInfo?.currentVersion)}</strong>
            </div>
            <div className="version-stat">
              <span>Latest</span>
              <strong>{formatReleaseVersion(updateInfo?.latestVersion)}</strong>
            </div>
          </div>

          <div
            className={`update-status ${
              updateInfo?.error ? "error" : updateInfo?.updateAvailable ? "available" : updateInfo ? "current" : ""
            }`}
          >
            <strong>{getUpdateStatus(updateInfo, isCheckingUpdates)}</strong>
            <small>{formatCheckedAt(updateInfo?.checkedAt)}</small>
          </div>

          <div className="inline-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onCheckForUpdates}
              disabled={isCheckingUpdates}
            >
              {isCheckingUpdates ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Check updates
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onOpenReleasePage(updateInfo?.releasePageUrl)}
            >
              <ExternalLink size={16} />
              GitHub Releases
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
