import { useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import type { AppSettings } from "../../shared/types";
import { analyzePrReviewFlow } from "../api/prReviewFlow";
import { formatAnalyticsDuration as duration, type AnalyticsRange } from "../domain/prAnalytics";
import { analyticsRangeLabel } from "../domain/prAnalyticsPeriods";
import type { ReviewFlowEvidence, ReviewFlowExplanation, ReviewMetric } from "../domain/prReviewFlow";
import { elapsedHours } from "../domain/prAnalytics";

interface Props {
  settings: AppSettings;
  evidence: ReviewFlowEvidence;
  range: AnalyticsRange;
  previousRange: AnalyticsRange;
  repository: string;
  author: string;
  isDemo: boolean;
  previousComplete: boolean;
  syncing: boolean;
  onLoadHistory: () => void;
}
const names: Record<ReviewMetric, string> = {
  merge: "Time to merge",
  response: "First response",
  review: "Review → merge",
  longMerges: "Merges taking over 7 days"
};
export function PrReviewFlow({
  settings,
  evidence,
  range,
  previousRange,
  repository,
  author,
  isDemo,
  previousComplete,
  syncing,
  onLoadHistory
}: Props) {
  const [result, setResult] = useState<ReviewFlowExplanation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<ReviewMetric>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  if (!settings.aiEnabled && !isDemo) return null;
  const provider = settings.aiProvider ?? "ollama";
  const providerLabel =
    provider === "ollama"
      ? "Ollama · configured endpoint"
      : provider === "codex-cli"
        ? "Codex CLI · OpenAI"
        : "Claude CLI · Anthropic";
  const analyze = async () => {
    if (busy || evidence.blocked || syncing) return;
    setBusy(true);
    setError(false);
    setCollapsed(false);
    const next = isDemo
      ? {
          headline: "Review flow across the two periods",
          observations: [
            {
              metric: "merge" as const,
              text: "Compare the median with p75 to see whether longer-running PRs differ from the typical merge. The measurements below come from the selected periods."
            },
            {
              metric: "response" as const,
              text: "First response and time to merge describe different cohorts. Use the linked PRs to inspect longer waits before drawing conclusions."
            }
          ],
          suggestion:
            "Inspect the longest-running PRs for repeated hand-offs or deliberate release holds before changing the process."
        }
      : await analyzePrReviewFlow(settings, evidence);
    if (!alive.current) return;
    setBusy(false);
    setResult(next);
    setError(!next);
  };
  const measured = (metric: ReviewMetric, period: "current" | "previous") => {
    const value = evidence.payload[period][metric];
    return typeof value === "number"
      ? `${value} PRs`
      : `${duration(value.medianHours ?? undefined)} · p75 ${duration(value.p75Hours ?? undefined)} · n=${value.n}`;
  };
  return (
    <section className="pa-ai" aria-label="AI review flow">
      <div className="pa-panel-heading">
        <div>
          <h2>
            Review flow <span className="pa-badge">{isDemo ? "Sample explanation" : "Optional AI"}</span>
          </h2>
          <p>
            {repository} · {author === "me" ? "PRs authored by you" : "All authors"} · {providerLabel}
          </p>
        </div>
        <div className="pa-table-controls">
          {result && (
            <button
              className="pa-button"
              type="button"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? "Show analysis" : "Collapse"}
              <ChevronDown size={13} />
            </button>
          )}
          <button
            type="button"
            className="pa-button"
            disabled={busy || syncing || Boolean(evidence.blocked)}
            onClick={() => void analyze()}
          >
            <Sparkles size={13} />
            {busy ? "Analyzing…" : result ? "Analyze again" : "Analyze review flow"}
          </button>
        </div>
      </div>
      <p className="pa-ai-basis">
        {analyticsRangeLabel(range)} · compared with {analyticsRangeLabel(previousRange)}
      </p>
      {evidence.payload.includesToday && (
        <p className="pa-ai-basis">Includes today: comparisons are provisional until the day ends.</p>
      )}
      {evidence.blocked && (
        <p className="pa-ai-basis">
          {evidence.blocked}{" "}
          {!previousComplete && (
            <button type="button" className="pa-button" disabled={syncing} onClick={onLoadHistory}>
              Load previous period
            </button>
          )}
        </p>
      )}
      {!collapsed && (
        <>
          <div role="status" aria-live="polite">
            {busy
              ? "Waiting for the configured AI provider. Metrics remain available."
              : error
                ? "Analysis unavailable. Check the AI provider in Settings and try again; your metrics are unchanged."
                : ""}
          </div>
          {result && (
            <div className="pa-ai-result">
              <h3>{result.headline}</h3>
              <div className="pa-ai-observations">
                {result.observations.map((observation, index) => (
                  <div key={index}>
                    <h4>{names[observation.metric]}</h4>
                    <p>{observation.text}</p>
                    <small>
                      Current: {measured(observation.metric, "current")}
                      <br />
                      Previous: {measured(observation.metric, "previous")}
                    </small>
                    {evidence.references[observation.metric].length > 0 && (
                      <button
                        className="pa-ai-evidence-link"
                        type="button"
                        aria-expanded={selected === observation.metric}
                        onClick={() =>
                          setSelected(selected === observation.metric ? undefined : observation.metric)
                        }
                      >
                        Inspect {evidence.references[observation.metric].length} supporting PRs
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="pa-ai-suggestion">
                <h4>Suggested check</h4>
                <p>{result.suggestion}</p>
              </div>
              {selected && (
                <div className="pa-ai-evidence">
                  <h4>{names[selected]} · longest measured PRs in the current period</h4>
                  <ul>
                    {evidence.references[selected].map((p) => (
                      <li key={p.key}>
                        {isDemo ? (
                          <span>
                            {p.repository} #{p.id} · {p.title}
                          </span>
                        ) : (
                          <a href={p.url} target="_blank" rel="noreferrer">
                            {p.repository} #{p.id} · {p.title}
                          </a>
                        )}
                        <strong>
                          {duration(
                            selected === "response"
                              ? elapsedHours(p.createdAt, p.firstResponseAt)
                              : selected === "review"
                                ? elapsedHours(p.firstResponseAt, p.mergedAt)
                                : elapsedHours(p.createdAt, p.mergedAt)
                          )}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <details className="pa-ai-disclosure">
        <summary>Data and comparison basis</summary>
        <p>
          {isDemo
            ? "Demo mode never calls an AI provider. "
            : provider === "ollama"
              ? "Analysis uses your configured Ollama endpoint. "
              : `Analysis sends aggregates to ${provider === "codex-cli" ? "OpenAI" : "Anthropic"} through your configured CLI. `}
          Only counts, duration summaries and coverage are included; no PR titles, comments, code, repository
          names, identities or links are sent. Supporting PRs are resolved locally.
        </p>
        <p>
          Equal {evidence.payload.calendarDays}-day periods in local time. First response uses created PRs;
          merge timings use merged PRs. Calendar durations include weekends and rework. AI explanations may be
          mistaken; verify the linked evidence. Results stay in this view and are cleared when the scope, data
          or provider changes.
        </p>
      </details>
    </section>
  );
}
