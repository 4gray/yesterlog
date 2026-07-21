import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Loader2, Sparkles } from "lucide-react";
import type { AppSettings, DayTrackingSummary } from "../../shared/types";
import { activitySegments, dayActivitySeconds } from "../domain/activity";
import { buildRecap, recapToMarkdown, recapToPlainText } from "../domain/recap";
import { formatReconDuration } from "../domain/reconstruct";
import { SHORT_WEEKDAY_LABELS, formatDuration, fromLocalDateKey, isoWeekday } from "../utils/date";
import { useRecapPolish } from "../app/useRecapPolish";
import { DayRing } from "./DayRing";

interface RecapCardProps {
  /** The previous working day's resolved summary. Absent → the card is hidden. */
  daySummary?: DayTrackingSummary;
  /** App settings — the optional AI-polish config is read from here. */
  settings: AppSettings;
}

/** Max line items shown per group before collapsing into a "+ N more" rollup. */
const VISIBLE_PER_GROUP = 4;

// Minute-based ("8h 45m", "55m") — matches the copy text in recap.ts.
const dur = (seconds: number) => formatReconDuration(seconds / 60);

/**
 * "Yesterday" standup recap — a compact, collapsible read of the previous
 * working day, grouped Tickets / Meetings / Firefighting. Personal standup
 * prep: read-only, clipboard-only, no stored state. Lives at the top of the
 * Today rail, above "Touched today". The deterministic list is always present;
 * an optional on-device AI "Polish" overlays spoken prose and degrades to it.
 */
export const RecapCard = ({ daySummary, settings }: RecapCardProps) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(false);

  const model = useMemo(() => (daySummary ? buildRecap(daySummary) : null), [daySummary]);
  const deterministicText = useMemo(() => (model ? recapToPlainText(model) : ""), [model]);
  const { aiOn, polished, isPolishing, polish, reset, aiModel } = useRecapPolish(deterministicText, settings);
  const isLocalAi = (settings.aiProvider ?? "ollama") === "ollama";
  const polishedByLabel = isLocalAi
    ? `Polished on-device by ${aiModel}`
    : `Polished by ${aiModel} via the ${settings.aiProvider === "codex-cli" ? "codex" : "claude"} CLI`;

  // No prior working day resolved yet (e.g. the week's first working day before
  // the cross-week loader lands) — render nothing rather than an empty shell.
  if (!daySummary || !model) {
    return null;
  }

  const date = fromLocalDateKey(model.dateKey);
  const dateText = `${SHORT_WEEKDAY_LABELS[isoWeekday(date) - 1]} ${model.shortDateLabel}`.toUpperCase();
  const totalText = model.isEmpty ? "0h" : dur(model.totalSeconds);
  const segments = activitySegments(dayActivitySeconds(daySummary));
  const visibleGroups = model.groups.filter((group) => group.seconds > 0);
  const listVisible = !polished || showList;

  const copy = async (asMarkdown: boolean) => {
    // Copy always emits the deterministic text, regardless of the polish state.
    const text = asMarkdown ? recapToMarkdown(model) : deterministicText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Leave the label unchanged — never flash "Copied" on a rejected write.
    }
  };

  return (
    <div className="recap-card">
      <button
        type="button"
        className="recap-bar"
        aria-expanded={open}
        aria-controls="recap-body"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="recap-eyebrow">
          YESTERDAY <span className="recap-date">· {dateText}</span>
        </span>
        <span className="recap-spacer" />
        <DayRing
          segments={segments}
          targetHours={daySummary.targetHours}
          size={22}
          stroke={3}
          gapDegrees={2}
          ariaLabel={
            model.isEmpty
              ? "Yesterday: nothing tracked"
              : `Yesterday: ${formatDuration(daySummary.trackedHours)} tracked`
          }
        />
        <span className={`recap-total${model.isEmpty ? " is-empty" : ""}`}>{totalText}</span>
        <span className="recap-chevron" aria-hidden="true">
          {open ? <ChevronUp size={15} strokeWidth={1.8} /> : <ChevronDown size={15} strokeWidth={1.8} />}
        </span>
      </button>

      {open && (
        <div className="recap-body" id="recap-body" role="region" aria-label="Yesterday's recap">
          {model.isEmpty ? (
            <div className="recap-empty">Nothing tracked {model.weekdayLabel}.</div>
          ) : (
            <>
              {polished && (
                <div className="recap-prose-wrap" role="region" aria-label="Polished recap">
                  <p className="recap-prose">{polished}</p>
                  <div className="recap-prose-meta">
                    <Sparkles size={11} strokeWidth={1.8} aria-hidden="true" />
                    <span>{polishedByLabel}</span>
                    <button
                      type="button"
                      className="recap-show-list"
                      aria-expanded={showList}
                      onClick={() => setShowList((value) => !value)}
                    >
                      {showList ? "Hide list" : "Show list"}
                    </button>
                  </div>
                </div>
              )}

              {listVisible && (
                <div className="recap-list">
                  {visibleGroups.map((group) => {
                    const shown = group.lines.slice(0, VISIBLE_PER_GROUP);
                    const rest = group.lines.slice(VISIBLE_PER_GROUP);
                    const restSeconds = rest.reduce((sum, line) => sum + line.seconds, 0);
                    return (
                      <div className="recap-group" key={group.key}>
                        <div className="recap-group-head">
                          <span className="recap-group-dot" style={{ background: group.color }} />
                          <span className="recap-group-name">{group.label}</span>
                          <span className="recap-group-total">{dur(group.seconds)}</span>
                        </div>
                        {shown.map((line, index) => (
                          <div className="recap-item" key={`${group.key}-${line.key ?? line.summary}-${index}`}>
                            {line.key && <span className="recap-item-key">{line.key}</span>}
                            <span className="recap-item-summary" title={line.summary}>
                              {line.summary}
                            </span>
                            <span className="recap-item-dur">{dur(line.seconds)}</span>
                          </div>
                        ))}
                        {rest.length > 0 && (
                          <div className="recap-more">
                            + {rest.length} more · {dur(restSeconds)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="recap-actions">
                <button
                  type="button"
                  className={`recap-btn${copied ? " is-copied" : ""}`}
                  onClick={(event) => copy(event.altKey)}
                  aria-label="Copy yesterday's recap to clipboard"
                  title="Copy (Alt-click for Markdown)"
                >
                  {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.9} />}
                  {copied ? "COPIED" : "COPY"}
                </button>
                <span className="recap-spacer" />
                {aiOn && (
                  <button
                    type="button"
                    className={`recap-btn${polished ? " is-copied" : ""}`}
                    onClick={() => (polished ? reset() : polish())}
                    disabled={isPolishing}
                    aria-busy={isPolishing}
                    aria-pressed={Boolean(polished)}
                    aria-label="Polish recap into spoken sentences"
                  >
                    {isPolishing ? (
                      <Loader2 className="spin" size={13} />
                    ) : polished ? (
                      <Check size={13} strokeWidth={2} />
                    ) : (
                      <Sparkles size={13} strokeWidth={1.8} />
                    )}
                    {isPolishing ? "POLISHING…" : polished ? "POLISHED" : "POLISH"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
