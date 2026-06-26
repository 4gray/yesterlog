import {
  Bell,
  BadgeInfo,
  Bot,
  CalendarDays,
  Check,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  GitPullRequest,
  KeyRound,
  LockKeyhole,
  Loader2,
  Minus,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Repeat2,
  Save,
  ShieldCheck,
  Sparkles,
  SunMedium,
  TestTube2,
  Trash2,
  Upload,
  type LucideIcon
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import type { AppSettings, AppUpdateInfo, RecurringEvent, WeekdayNumber } from "../../shared/types";
import { probeOllama, type OllamaStatus } from "../api/ollama";
import type { ThemeMode } from "./Sidebar";

export interface RecurringEventDraft {
  id?: string;
  title: string;
  daysOfWeek: WeekdayNumber[];
  localTime: string;
  durationMinutes: number;
  defaultNote: string;
}

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
  onShowReleaseNotes: () => void;
  onDownloadUpdate: () => void;
  onOpenReleasePage: (url?: string) => void;
  weekRangeLabel: string;
  onExportWeekCsv: () => void;
  onImportPersonalNotes: (file: File) => Promise<void> | void;
  isImportingPersonalNotes: boolean;
  recurringEvents: RecurringEvent[];
  onSaveRecurringEvent: (draft: RecurringEventDraft) => void | Promise<void>;
  onDeleteRecurringEvent: (id: string) => void | Promise<void>;
  onToggleRecurringEvent: (id: string) => void | Promise<void>;
  /** Section shown first; defaults to "jira". Primarily a test/deep-link seam. */
  initialSection?: SettingsSection;
}

export type SettingsSection =
  | "jira"
  | "bitbucket"
  | "reconstruct"
  | "tracking"
  | "recurring"
  | "appearance"
  | "data"
  | "about";

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";

const RECURRING_DURATION_MINUTES = [10, 15, 30, 45, 60, 90] as const;

const recurringMinutesLabel = (minutes: number) => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, "0")}m`;
};

const EMPTY_RECURRING_FORM: RecurringEventDraft = {
  title: "",
  daysOfWeek: [1, 2, 3, 4, 5],
  localTime: "09:15",
  durationMinutes: 15,
  defaultNote: ""
};

interface SectionMeta {
  id: SettingsSection;
  label: string;
  hint: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

const SECTIONS: SectionMeta[] = [
  {
    id: "jira",
    label: "Jira",
    hint: "Cloud sign-in",
    title: "Jira connection",
    subtitle: "Connect your Atlassian account to sync worklogs.",
    icon: ShieldCheck
  },
  {
    id: "bitbucket",
    label: "Bitbucket",
    hint: "Review ledger",
    title: "Bitbucket connection",
    subtitle: "Surface pull request review sessions from Bitbucket Cloud.",
    icon: GitPullRequest
  },
  {
    id: "reconstruct",
    label: "Local AI",
    hint: "Optional model",
    title: "Day Reconstruction · Local AI",
    subtitle: "Reconstruction works without a model. Optionally connect a local Ollama model to polish the drafts.",
    icon: Bot
  },
  {
    id: "tracking",
    label: "Tracking",
    hint: "Targets & reminders",
    title: "Tracking",
    subtitle: "Set weekly expectations and schedule local reminders.",
    icon: CalendarDays
  },
  {
    id: "recurring",
    label: "Recurring",
    hint: "Local rituals",
    title: "Recurring local time",
    subtitle: "Regular rituals that never get a Jira ticket — offered each day as a soft local suggestion.",
    icon: Repeat2
  },
  {
    id: "appearance",
    label: "Appearance",
    hint: "Theme",
    title: "Appearance",
    subtitle: "Choose how TimeBro looks.",
    icon: SunMedium
  },
  {
    id: "data",
    label: "Data",
    hint: "Import & export",
    title: "Data",
    subtitle: "Move worklogs and personal notes in and out of TimeBro.",
    icon: Database
  },
  {
    id: "about",
    label: "About",
    hint: "Version & updates",
    title: "About",
    subtitle: "Check your version and look for updates.",
    icon: BadgeInfo
  }
];

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

const ChainStep = ({ label, done }: { label: string; done: boolean }) => (
  <span className="ai-chain-step">
    <span className={`ai-chain-dot ${done ? "is-done" : ""}`}>
      {done ? <Check size={11} strokeWidth={3} /> : <Minus size={10} strokeWidth={3} />}
    </span>
    {label}
  </span>
);

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
  onShowReleaseNotes,
  onDownloadUpdate,
  onOpenReleasePage,
  weekRangeLabel,
  onExportWeekCsv,
  onImportPersonalNotes,
  isImportingPersonalNotes,
  recurringEvents,
  onSaveRecurringEvent,
  onDeleteRecurringEvent,
  onToggleRecurringEvent,
  initialSection = "jira"
}: SettingsViewProps) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [showJiraApiToken, setShowJiraApiToken] = useState(false);
  const [showBitbucketApiToken, setShowBitbucketApiToken] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [recurringFormOpen, setRecurringFormOpen] = useState(false);
  const [recurringEditingId, setRecurringEditingId] = useState<string | undefined>();
  const [recurringForm, setRecurringForm] = useState<RecurringEventDraft>(EMPTY_RECURRING_FORM);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | undefined>();
  const [isProbingOllama, setIsProbingOllama] = useState(false);

  const handleTestOllama = async () => {
    setIsProbingOllama(true);
    try {
      setOllamaStatus(await probeOllama({ endpoint: draft.ollamaEndpoint, model: draft.ollamaModel }));
    } finally {
      setIsProbingOllama(false);
    }
  };

  // Auto-probe whenever the Local AI section is shown (or the endpoint/model changes), so
  // the pulled-model list and the activation chain are live without pressing Test connection.
  useEffect(() => {
    if (activeSection !== "reconstruct") {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsProbingOllama(true);
      void probeOllama({ endpoint: draft.ollamaEndpoint, model: draft.ollamaModel })
        .then((status) => {
          if (!cancelled) {
            setOllamaStatus(status);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsProbingOllama(false);
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, draft.ollamaEndpoint, draft.ollamaModel]);

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

  const openNewRecurring = () => {
    setRecurringEditingId(undefined);
    setRecurringForm(EMPTY_RECURRING_FORM);
    setRecurringFormOpen(true);
  };

  const openEditRecurring = (event: RecurringEvent) => {
    setRecurringEditingId(event.id);
    setRecurringForm({
      id: event.id,
      title: event.title,
      daysOfWeek: [...event.daysOfWeek],
      localTime: event.localTime,
      durationMinutes: event.durationMinutes,
      defaultNote: event.defaultNote
    });
    setRecurringFormOpen(true);
  };

  const closeRecurringForm = () => {
    setRecurringFormOpen(false);
    setRecurringEditingId(undefined);
  };

  const toggleRecurringDay = (day: WeekdayNumber) => {
    setRecurringForm((current) => {
      const daysOfWeek = current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((value) => value !== day)
        : ([...current.daysOfWeek, day].sort() as WeekdayNumber[]);
      return { ...current, daysOfWeek };
    });
  };

  const submitRecurringForm = async () => {
    const title = recurringForm.title.trim();
    if (!title || recurringForm.daysOfWeek.length === 0) {
      return;
    }
    await onSaveRecurringEvent({ ...recurringForm, title });
    closeRecurringForm();
  };

  const active = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0];

  const renderJira = () => (
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
  );

  const renderBitbucket = () => (
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
  );

  const renderReconstruct = () => {
    const reachable = ollamaStatus?.reachable ?? false;
    const modelReady = ollamaStatus?.modelReady ?? false;
    const enabled = draft.aiEnabled;
    const aiActive = reachable && modelReady && enabled;
    const modelOptions = Array.from(
      new Set([draft.ollamaModel, ...(ollamaStatus?.models ?? [])].filter(Boolean))
    );

    const coreItems = [
      "Collects commits, PRs, reviews, CI runs & Jira changelog",
      "Estimates duration from commit & PR timestamps",
      "Maps branch → ticket via FTDM-xxx keys",
      "Places blocks on the timeline & flags gaps",
      "Rule-based auto-distribute & confidence scoring"
    ];
    const aiItems = [
      "Turns fix npe / wip into clean worklog prose",
      "Collapses noisy commit runs into one entry",
      "Reasons about what a gap likely was",
      "Dedupes a commit + PR describing the same work",
      "Normalizes tone & classifies work type for reports"
    ];

    return (
      <div className="ai-card">
        <div className="ai-card-head">
          <Bot size={17} strokeWidth={1.8} />
          <span className="ai-card-title">LOCAL AI · OLLAMA</span>
          <span className="ai-card-spacer" />
          <span className="ai-pill-opt">OPTIONAL</span>
          <span className={`ai-pill-status ${aiActive ? "is-active" : ""}`}>
            <span className="ai-pill-dot" />
            {aiActive ? "ACTIVE" : "OFF"}
          </span>
        </div>

        <div className="ai-privacy">
          <span className="ai-privacy-icon">
            <ShieldCheck size={17} strokeWidth={1.8} />
          </span>
          <div>
            <strong>Stays on your machine</strong>
            <p>
              TimeBro talks to Ollama on <code>localhost</code> only. Your commits, diffs and ticket text are
              summarised on-device — no cloud, no API key, no telemetry. Same privacy promise as the rest of the app.
            </p>
          </div>
        </div>

        <div className="ai-fields">
          <label className="ai-field">
            <span>Ollama endpoint</span>
            <div className="ai-endpoint">
              <input
                type="text"
                className="ai-endpoint-input"
                value={draft.ollamaEndpoint}
                placeholder="http://localhost:11434"
                spellCheck={false}
                onChange={(event) => updateField("ollamaEndpoint", event.target.value)}
              />
              {ollamaStatus && (
                <span className={`ai-reach ${reachable ? "is-ok" : "is-bad"}`}>
                  <span className="ai-reach-dot" />
                  {reachable ? "REACHABLE" : "UNREACHABLE"}
                </span>
              )}
            </div>
            <small className="field-hint-text">Default Ollama port. Point it elsewhere if you run it on your LAN.</small>
          </label>

          <label className="ai-field">
            <span>Model</span>
            <div className="ai-model">
              <span className="ai-model-dot" aria-hidden="true" />
              <select
                className="ai-model-select"
                value={draft.ollamaModel}
                onChange={(event) => updateField("ollamaModel", event.target.value)}
              >
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
            <small className="field-hint-text">
              {ollamaStatus?.models?.length
                ? `Pulled: ${ollamaStatus.models.join(", ")}`
                : "Run a Test connection to list pulled models."}
            </small>
          </label>
        </div>

        <div className="ai-compare-label">RECONSTRUCTION WORKS WITHOUT AI</div>
        <div className="ai-compare">
          <div className="ai-col is-core">
            <div className="ai-col-head">
              <Check size={15} strokeWidth={2} />
              CORE · ALWAYS ON
            </div>
            <p>Built deterministically from Jira &amp; Bitbucket APIs — no model required:</p>
            <ul>
              {coreItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="ai-col is-ai">
            <div className="ai-col-head">
              <Sparkles size={15} strokeWidth={2} />
              WITH LOCAL AI · OPTIONAL
            </div>
            <p>A local model polishes the raw signals into something send-ready:</p>
            <ul>
              {aiItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="ai-toggle-row">
          <div>
            <strong>Use local AI for day reconstruction</strong>
            <small>Draft worklog descriptions, group related commits, and suggest fills for gaps. Off by default — you stay in control.</small>
          </div>
          <button
            type="button"
            className={`switch is-ai ${enabled ? "on" : ""}`}
            aria-pressed={enabled}
            aria-label={enabled ? "Disable local AI" : "Enable local AI"}
            onClick={() => updateField("aiEnabled", !enabled)}
          >
            <span />
          </button>
        </div>

        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={handleTestOllama} disabled={isProbingOllama}>
            {isProbingOllama ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            Test connection
          </button>
          <a className="secondary-button" href={OLLAMA_DOWNLOAD_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Install Ollama
          </a>
          <code className="ai-pull-hint">$ ollama pull llama3.1</code>
        </div>

        <div className="ai-chain">
          <ChainStep label="Endpoint reachable" done={reachable} />
          <span className="ai-chain-line" />
          <ChainStep label="Model ready" done={modelReady} />
          <span className="ai-chain-line" />
          <ChainStep label="Enabled" done={enabled} />
          <span className="ai-chain-line" />
          <span className={`ai-chain-result ${aiActive ? "is-active" : ""}`}>
            {aiActive ? "Reconstruction AI active" : "AI inactive"}
          </span>
        </div>
      </div>
    );
  };

  const renderTracking = () => (
    <>
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
    </>
  );

  const renderAppearance = () => (
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
  );

  const renderData = () => (
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
  );

  const renderAbout = () => (
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
        {updateInfo?.updateAvailable ? (
          <>
            <button className="secondary-button" type="button" onClick={onShowReleaseNotes}>
              <FileText size={16} />
              Release notes
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={onDownloadUpdate}
              disabled={!updateInfo.downloadUrl}
            >
              <Download size={16} />
              Download
            </button>
          </>
        ) : null}
      </div>
    </div>
  );

  const renderRecurring = () => {
    const saveLabel = recurringEditingId ? "Save event" : "Add event";

    return (
      <div className="settings-panel">
        <div className="section-title">
          <Repeat2 size={16} />
          <span>Recurring local time</span>
          <span className="recurring-count">{recurringEvents.length}</span>
          <span className="settings-panel-spacer" />
          <button type="button" className="recurring-new" onClick={openNewRecurring}>
            <Plus size={14} strokeWidth={2.4} />
            NEW EVENT
          </button>
        </div>

        <p className="recurring-intro">
          Regular rituals that never get a Jira ticket — daily, planning, refinement. Each working day TimeBro offers
          them as a soft suggestion you confirm, skip or adjust. Confirmed time counts as local tracked time only and
          is never synced to Jira.
        </p>

        {recurringFormOpen && (
          <div className="recurring-editor">
            <div className="recurring-editor-grid">
              <label className="recurring-field grow">
                <span>TITLE</span>
                <input
                  type="text"
                  placeholder="e.g. Daily Standup"
                  value={recurringForm.title}
                  onChange={(event) => setRecurringForm((current) => ({ ...current, title: event.target.value }))}
                  autoFocus
                />
              </label>
              <label className="recurring-field">
                <span>TIME</span>
                <input
                  type="time"
                  value={recurringForm.localTime}
                  onChange={(event) => setRecurringForm((current) => ({ ...current, localTime: event.target.value }))}
                />
              </label>
            </div>

            <div className="recurring-field-block">
              <span className="recurring-field-label">DAYS OF WEEK</span>
              <div className="recurring-day-picker">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={recurringForm.daysOfWeek.includes(day.value) ? "active" : ""}
                    aria-pressed={recurringForm.daysOfWeek.includes(day.value)}
                    onClick={() => toggleRecurringDay(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="recurring-field-block">
              <span className="recurring-field-label">
                DURATION <em>{recurringMinutesLabel(recurringForm.durationMinutes)}</em>
              </span>
              <div className="recurring-duration-picker">
                {RECURRING_DURATION_MINUTES.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={recurringForm.durationMinutes === minutes ? "active" : ""}
                    onClick={() => setRecurringForm((current) => ({ ...current, durationMinutes: minutes }))}
                  >
                    {recurringMinutesLabel(minutes)}
                  </button>
                ))}
              </div>
            </div>

            <label className="recurring-field-block">
              <span className="recurring-field-label">DEFAULT NOTE</span>
              <textarea
                className="note-textarea"
                placeholder="Pre-filled note for each logged occurrence…"
                value={recurringForm.defaultNote}
                onChange={(event) => setRecurringForm((current) => ({ ...current, defaultNote: event.target.value }))}
                rows={2}
              />
            </label>

            <div className="recurring-editor-actions">
              <button
                type="button"
                className="primary-button is-recurring"
                onClick={submitRecurringForm}
                disabled={!recurringForm.title.trim() || recurringForm.daysOfWeek.length === 0}
              >
                {saveLabel}
              </button>
              <button type="button" className="secondary-button" onClick={closeRecurringForm}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {recurringEvents.length === 0 ? (
          <div className="recurring-empty-list">
            No recurring events yet. Add one to have TimeBro suggest it each working day.
          </div>
        ) : (
          <div className="recurring-list">
            {recurringEvents.map((event) => (
              <div className={`recurring-row ${event.active ? "" : "is-inactive"}`} key={event.id}>
                <button
                  type="button"
                  className={`switch ${event.active ? "on" : ""}`}
                  aria-pressed={event.active}
                  aria-label={event.active ? `Disable ${event.title}` : `Enable ${event.title}`}
                  onClick={() => void onToggleRecurringEvent(event.id)}
                >
                  <span />
                </button>
                <div className="recurring-row-body">
                  <div className="recurring-row-head">
                    <strong>{event.title}</strong>
                    <span className="recurring-row-time">{event.localTime}</span>
                    <span className="recurring-row-sep" />
                    <span className="recurring-row-dur">{recurringMinutesLabel(event.durationMinutes)}</span>
                  </div>
                  <div className="recurring-row-days">
                    {WEEKDAYS.map((day) => (
                      <span
                        key={day.value}
                        className={event.daysOfWeek.includes(day.value) ? "active" : ""}
                      >
                        {day.label}
                      </span>
                    ))}
                  </div>
                  {event.defaultNote.trim() && <div className="recurring-row-note">{event.defaultNote}</div>}
                </div>
                <div className="recurring-row-actions">
                  <button type="button" onClick={() => openEditRecurring(event)} title="Edit" aria-label={`Edit ${event.title}`}>
                    <Pencil size={14} strokeWidth={1.9} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteRecurringEvent(event.id)}
                    title="Delete"
                    aria-label={`Delete ${event.title}`}
                  >
                    <Trash2 size={14} strokeWidth={1.9} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSection = () => {
    switch (activeSection) {
      case "jira":
        return renderJira();
      case "bitbucket":
        return renderBitbucket();
      case "reconstruct":
        return renderReconstruct();
      case "tracking":
        return renderTracking();
      case "recurring":
        return renderRecurring();
      case "appearance":
        return renderAppearance();
      case "data":
        return renderData();
      case "about":
        return renderAbout();
      default:
        return null;
    }
  };

  return (
    <div className="view settings-view">
      <div className="settings-header">
        <div>
          <div className="eyebrow">SETTINGS</div>
          <h1 className="settings-title">{active.title}</h1>
          <div className="settings-subtitle">{active.subtitle}</div>
        </div>

        <button className="primary-button" type="button" onClick={onSave}>
          <Save size={16} />
          Save settings
        </button>
      </div>

      <div className="settings-body">
        <nav className="settings-rail" aria-label="Settings sections">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;

            return (
              <button
                key={section.id}
                type="button"
                className={`settings-rail-item ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="settings-rail-icon">
                  <Icon size={16} />
                </span>
                <span className="settings-rail-text">
                  <strong>{section.label}</strong>
                  <small>{section.hint}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <section className="settings-content" aria-label={active.title}>
          <div className="settings-content-inner">{renderSection()}</div>
        </section>
      </div>
    </div>
  );
};
