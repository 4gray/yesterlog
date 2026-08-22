import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LineChart,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Upload,
  Zap
} from "lucide-react";
import type { AppSettings, JiraConnectionResult } from "../../shared/types";

export type WelcomeConnectPayload = Pick<AppSettings, "jiraBaseUrl" | "jiraEmail" | "jiraApiToken">;

interface WelcomeViewProps {
  initialSettings: AppSettings;
  isConnected: boolean;
  connectedSettings: AppSettings;
  onConnect: (payload: WelcomeConnectPayload) => Promise<JiraConnectionResult>;
  onEnterApp: () => void;
}

const API_TOKEN_URL = "https://id.atlassian.com/manage-profile/security/api-tokens";

const siteShort = (url: string) => url.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") || "your-team.atlassian.net";

export const WelcomeView = ({
  initialSettings,
  isConnected,
  connectedSettings,
  onConnect,
  onEnterApp
}: WelcomeViewProps) => {
  const [jiraBaseUrl, setJiraBaseUrl] = useState(initialSettings.jiraBaseUrl);
  const [jiraEmail, setJiraEmail] = useState(initialSettings.jiraEmail);
  const [jiraApiToken, setJiraApiToken] = useState(initialSettings.jiraApiToken);
  const [showToken, setShowToken] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const canSubmit = Boolean(jiraBaseUrl.trim() && jiraEmail.trim() && jiraApiToken.trim() && !isVerifying);

  const connect = async () => {
    if (!canSubmit) {
      setError("Enter your site, email, and API token.");
      return;
    }

    setIsVerifying(true);
    setError(undefined);

    try {
      const result = await onConnect({ jiraBaseUrl, jiraEmail, jiraApiToken });
      if (!result.ok) {
        setError(result.message);
      }
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to connect to Jira.");
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void connect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="welcome-shell">
      <section className="welcome-copy">
        <div className="welcome-glow" />
        <div className="welcome-brand">
          <div className="welcome-logo">yl</div>
          <span>
            Yester<span>log</span>
          </span>
        </div>

        <div className="welcome-headline">
          <div className="welcome-kicker">Welcome</div>
          <h1>Log your Jira time as you go.</h1>
          <p>
            Yesterlog tracks your week against your target and shows which days still need time logged.
          </p>
        </div>

        <div className="welcome-values">
          <div>
            <span className="welcome-value-icon is-blue">
              <Zap size={15} />
            </span>
            <span>
              <strong>Fast logging</strong>
              <small>Ticket to worklog in a couple of keystrokes.</small>
            </span>
          </div>
          <div>
            <span className="welcome-value-icon is-green">
              <LineChart size={15} />
            </span>
            <span>
              <strong>Gap tracking</strong>
              <small>See which days are short before the week closes.</small>
            </span>
          </div>
          <div>
            <span className="welcome-value-icon is-local">
              <LockKeyhole size={14} />
            </span>
            <span>
              <strong>Local notes</strong>
              <small>Off-ticket notes never leave your machine.</small>
            </span>
          </div>
          <div>
            <span className="welcome-value-icon is-blue">
              <Upload size={14} />
            </span>
            <span>
              <strong>Upgrading?</strong>
              <small>Personal notes can be imported later from Settings.</small>
            </span>
          </div>
        </div>
      </section>

      <section className="welcome-connect">
        <div className="welcome-card">
          {isConnected ? (
            <div className="welcome-success">
              <div className="welcome-success-icon">
                <Check size={30} />
              </div>
              <h2>You're all set.</h2>
              <p>Jira is connected. Your worklogs will sync from here.</p>

              <div className="welcome-linked">
                <div className="welcome-linked-icon">
                  <Eye size={17} />
                </div>
                <div>
                  <strong>{siteShort(connectedSettings.jiraBaseUrl)}</strong>
                  <span>{connectedSettings.jiraEmail}</span>
                </div>
                <em>LINKED</em>
              </div>

              <button type="button" className="welcome-primary" onClick={onEnterApp}>
                Enter Yesterlog <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <>
              <div className="welcome-form-title">
                <span>Connect Jira</span>
                <h2>Connect your Jira account</h2>
                <p>Enter your site, email, and API token. Credentials stay on this device.</p>
              </div>

              <label className="welcome-field">
                <span>Jira site URL</span>
                <input
                  value={jiraBaseUrl}
                  onChange={(event) => setJiraBaseUrl(event.target.value)}
                  placeholder="https://your-team.atlassian.net"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <label className="welcome-field">
                <span>Account email</span>
                <input
                  type="email"
                  value={jiraEmail}
                  onChange={(event) => setJiraEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <label className="welcome-field">
                <span>
                  API token
                  <a href={API_TOKEN_URL} target="_blank" rel="noreferrer">
                    Create a token <ExternalLink size={11} />
                  </a>
                </span>
                <div className="welcome-token">
                  <input
                    type={showToken ? "text" : "password"}
                    value={jiraApiToken}
                    onChange={(event) => setJiraApiToken(event.target.value)}
                    placeholder="Paste your API token"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="button" onClick={() => setShowToken((visible) => !visible)} aria-label="Show or hide API token">
                    {showToken ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>

              {error && (
                <div className="welcome-error" role="alert">
                  {error}
                </div>
              )}

              <button type="button" className="welcome-primary" onClick={connect} disabled={!canSubmit}>
                {isVerifying ? <Loader2 className="spin" size={15} /> : <ShieldCheck size={16} />}
                Connect Jira
              </button>

              <div className="welcome-help">
                <KeyRound size={14} />
                <span>In Atlassian, head to Security, API tokens, then use Create token, the option without scopes.</span>
              </div>

              <div className="welcome-privacy">
                <LockKeyhole size={14} />
                <span>Your token stays local and is sent only to your Jira Cloud site.</span>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
