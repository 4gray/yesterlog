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
          <div className="welcome-logo">tb</div>
          <span>
            Time<span>Bro</span>
          </span>
        </div>

        <div className="welcome-headline">
          <div className="welcome-kicker">Hey there</div>
          <h1>Let's get your hours sorted.</h1>
          <p>
            TimeBro keeps an eye on your week and gives you a nudge when a day is looking a little light.
          </p>
        </div>

        <div className="welcome-values">
          <div>
            <span className="welcome-value-icon is-blue">
              <Zap size={15} />
            </span>
            <span>
              <strong>Log without the faff</strong>
              <small>Ticket to worklog in a couple of keystrokes.</small>
            </span>
          </div>
          <div>
            <span className="welcome-value-icon is-green">
              <LineChart size={15} />
            </span>
            <span>
              <strong>Spot the gaps early</strong>
              <small>See what is still missing before the week is gone.</small>
            </span>
          </div>
          <div>
            <span className="welcome-value-icon is-local">
              <LockKeyhole size={14} />
            </span>
            <span>
              <strong>Your notes, your eyes only</strong>
              <small>Off-ticket notes stay right here on your machine.</small>
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
              <h2>You are all set!</h2>
              <p>TimeBro is hooked up and ready to watch your hours.</p>

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
                Enter TimeBro <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <>
              <div className="welcome-form-title">
                <span>Connect Jira</span>
                <h2>Hook up your Jira</h2>
                <p>Pop in your details and TimeBro takes it from there. Everything stays on your device.</p>
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
                <span>In Atlassian, head to Security, API tokens, Create, then paste it here.</span>
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
