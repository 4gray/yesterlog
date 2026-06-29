import {
  Activity,
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitCommit,
  GitPullRequest,
  LineChart,
  Loader2,
  Lock,
  Minus,
  Moon,
  Plus,
  PlusCircle,
  RefreshCw,
  Send,
  Sparkles,
  X,
  Zap,
  type LucideIcon
} from "lucide-react";
import { useState, type CSSProperties, type DragEvent } from "react";
import type {
  ReconstructConfidence,
  ReconstructDay,
  ReconstructSummary,
  SignalKind,
  TimelineRow
} from "../domain/reconstruct";
import { formatReconDuration } from "../domain/reconstruct";

export interface ReconstructDateLabels {
  /** "WEDNESDAY 17 JUNE" */
  longLabel: string;
  /** "WED 17 JUN" */
  shortLabel: string;
}

export interface ReconstructViewProps {
  day: ReconstructDay;
  summary: ReconstructSummary;
  dateLabels: ReconstructDateLabels;
  /** True only when the optional local model is enabled AND reachable/ready. */
  aiOn: boolean;
  /** Full model tag, e.g. "llama3.1:8b". */
  aiModel: string;
  isEnhancing: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  onStepBack: () => void;
  onStepForward: () => void;
  onOpenSettings: () => void;
  /** AI on → re-draft with the model; AI off → rule-based auto-distribute (core path). */
  onPrimaryAction: () => void;
  /** Cancel an in-flight AI draft. */
  onStopAi: () => void;
  /** Log entries for this day (opens the existing Add Time write flow). */
  onLogTime: () => void;
  /** Background sync state for Jira worklogs + Bitbucket reviews/commits. */
  syncState: "synced" | "stale" | "syncing";
  /** Human label for the last sync, e.g. "SYNCED 6:47 PM" or "SYNCING…". */
  syncLabel: string;
  /** Re-sync this week's signals from Jira + Bitbucket. */
  onSync: () => void;
  /** Place a signal onto the timeline at a working hour (drag/drop or bulk). */
  onPlaceSignal: (signalId: string, hour: number) => void;
  /** Return a placed signal to the rail. */
  onUnplaceSignal: (signalId: string) => void;
  /** Place every still-unplaced signal at once. */
  onPlaceAll: () => void;
  /** Nudge a placed entry's duration by ±minutes. */
  onAdjustDuration: (signalId: string, deltaMinutes: number) => void;
}

const HOUR_DND_MIME = "application/x-recon-signal";

const hourOf = (label: string) => Number.parseInt(label.slice(0, 2), 10);

/** "13:00" + 125min → "13:00–15:05" so a multi-hour entry's real span is visible. */
const spanLabel = (hourLabel: string, minutes: number): string => {
  const start = hourOf(hourLabel) * 60;
  if (!Number.isFinite(start) || minutes <= 0) {
    return "";
  }
  const end = start + minutes;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${hourLabel}–${fmt(end)}`;
};

const SIGNAL_ACCENT: Record<SignalKind, string> = {
  commit: "var(--blue-soft)",
  pr: "var(--purple)",
  pipe: "var(--amber-soft)",
  jira: "var(--teal)"
};

const SIGNAL_ICON: Record<SignalKind, LucideIcon> = {
  commit: GitCommit,
  pr: GitPullRequest,
  pipe: Activity,
  jira: LineChart
};

const CONFIDENCE: Record<ReconstructConfidence, { label: string; color: string }> = {
  high: { label: "HIGH", color: "var(--teal)" },
  med: { label: "MED", color: "var(--amber-soft)" },
  low: { label: "LOW", color: "var(--muted)" }
};

const accentStyle = (kind: SignalKind | undefined): CSSProperties =>
  ({ "--accent": kind ? SIGNAL_ACCENT[kind] : "var(--border-strong)" } as CSSProperties);

const SignalGlyph = ({ kind, size = 16 }: { kind: SignalKind; size?: number }) => {
  const Icon = SIGNAL_ICON[kind];
  return <Icon size={size} strokeWidth={1.9} />;
};

export const ReconstructView = ({
  day,
  summary,
  dateLabels,
  aiOn,
  aiModel,
  isEnhancing,
  canStepBack,
  canStepForward,
  onStepBack,
  onStepForward,
  onOpenSettings,
  onPrimaryAction,
  onStopAi,
  onLogTime,
  syncState,
  syncLabel,
  onSync,
  onPlaceSignal,
  onUnplaceSignal,
  onPlaceAll,
  onAdjustDuration
}: ReconstructViewProps) => {
  const modelShort = aiModel.split(":")[0] || aiModel;
  const isWeekend = day.kind === "weekend";
  const isComplete = day.kind === "complete";
  const isActive = !isWeekend && !isComplete;
  const showTimeline = isActive || isComplete;
  const isSyncing = syncState === "syncing";

  const [dragOverHour, setDragOverHour] = useState<number | null>(null);
  const [railDragOver, setRailDragOver] = useState(false);

  const unplacedIds = new Set(day.unplacedSignalIds);
  const railSignals = day.signals.filter((signal) => signal.isMarker || unplacedIds.has(signal.id));

  const startDrag = (event: DragEvent, signalId: string) => {
    event.dataTransfer.setData(HOUR_DND_MIME, signalId);
    event.dataTransfer.setData("text/plain", signalId);
    event.dataTransfer.effectAllowed = "move";
  };
  const dropOnHour = (event: DragEvent, hour: number) => {
    event.preventDefault();
    const signalId = event.dataTransfer.getData(HOUR_DND_MIME) || event.dataTransfer.getData("text/plain");
    setDragOverHour(null);
    if (signalId) {
      onPlaceSignal(signalId, hour);
    }
  };
  const dropOnRail = (event: DragEvent) => {
    event.preventDefault();
    const signalId = event.dataTransfer.getData(HOUR_DND_MIME) || event.dataTransfer.getData("text/plain");
    setRailDragOver(false);
    if (signalId) {
      onUnplaceSignal(signalId);
    }
  };

  return (
    <div className="view recon-view">
      {/* ---- header ---- */}
      <header className="recon-header">
        <div className="recon-headline">
          <div className="eyebrow">RECONSTRUCT — {dateLabels.longLabel}</div>
          <div className="recon-total">
            <span className="recon-total-num">
              {summary.bigLabel} <span className="recon-total-word">{summary.bigWord}</span>
            </span>
            <span className="recon-total-sub">{summary.sub}</span>
          </div>
        </div>

        <div className="recon-controls">
          <div className="recon-stepper">
            <button
              type="button"
              className="recon-step"
              onClick={onStepBack}
              disabled={!canStepBack}
              title={canStepBack ? "Previous day" : "Start of the worklog sync window"}
              aria-label="Previous day"
            >
              <ChevronLeft size={15} strokeWidth={2} />
            </button>
            <span className="recon-day-pill">
              <Calendar size={14} strokeWidth={1.7} />
              {dateLabels.shortLabel}
            </span>
            <button
              type="button"
              className="recon-step"
              onClick={onStepForward}
              disabled={!canStepForward}
              title={canStepForward ? "Next day" : "Today — can't reconstruct the future"}
              aria-label="Next day"
            >
              <ChevronRight size={15} strokeWidth={2} />
            </button>
            <span className={`recon-day-tag ${summary.dayTag === "TODAY" ? "is-today" : ""}`}>{summary.dayTag}</span>
          </div>

          <div className="recon-divider" />

          <button
            type="button"
            className={`recon-refresh is-${syncState}`}
            onClick={onSync}
            disabled={isSyncing}
            title={
              isSyncing
                ? "Syncing your activity…"
                : syncState === "stale"
                  ? "Not synced yet — sync now"
                  : `${syncLabel} · click to sync now`
            }
            aria-label="Sync activity"
          >
            <RefreshCw size={14} strokeWidth={1.9} className={isSyncing ? "spin" : undefined} />
          </button>

          <button
            type="button"
            className={`recon-ai-pill ${aiOn ? "is-on" : "is-off"}`}
            onClick={onOpenSettings}
            title="Local AI status — open Settings"
          >
            <Sparkles size={13} strokeWidth={1.9} />
            <span>{aiOn ? `LOCAL AI · ${modelShort}` : "LOCAL AI OFF"}</span>
          </button>

          {isActive && isEnhancing ? (
            <button type="button" className="recon-primary is-stop" onClick={onStopAi} title="Stop drafting">
              <Loader2 size={15} strokeWidth={2} className="spin" />
              Stop drafting
            </button>
          ) : isActive ? (
            <button type="button" className={`recon-primary ${aiOn ? "is-ai" : ""}`} onClick={onPrimaryAction}>
              {aiOn ? <Sparkles size={15} strokeWidth={2} /> : <Zap size={15} strokeWidth={2} />}
              {aiOn ? "Auto-draft all" : "Auto-distribute"}
            </button>
          ) : null}
        </div>
      </header>

      {/* ---- banner ---- */}
      {isComplete && (
        <div className="recon-banner is-complete">
          <CheckCircle2 size={16} strokeWidth={2} />
          <span>
            This day already adds up to <strong>{formatReconDuration(day.targetMinutes)}</strong> — every block is
            logged in Jira. Nothing to reconstruct. Use <span className="mono">‹ ›</span> to pick another day.
          </span>
        </div>
      )}
      {isWeekend && (
        <div className="recon-banner is-rest">
          <Moon size={16} strokeWidth={1.9} />
          <span>
            <strong>Weekend — no work expected.</strong> Nothing to reconstruct. Step to a workday with{" "}
            <span className="mono">‹ ›</span>, or log time anyway if you worked.
          </span>
          <span className="recon-banner-spacer" />
          <button type="button" className="recon-ghost-btn" onClick={onLogTime}>
            LOG TIME ANYWAY
          </button>
        </div>
      )}
      {isActive && aiOn && (
        <div className="recon-banner is-ai">
          <Bot size={16} strokeWidth={1.9} />
          <span>
            Drafts written <strong>on-device by {aiModel}</strong> via Ollama — your commits, diffs and ticket text
            never leave this machine. Review every line before sending to Jira.
          </span>
          <span className="recon-banner-spacer" />
          <span className="recon-localhost">
            <span className="recon-localhost-dot" />
            localhost:11434
          </span>
        </div>
      )}
      {isActive && !aiOn && (
        <div className="recon-banner is-off">
          <AlertTriangle size={16} strokeWidth={1.9} />
          <span>
            <strong>Local AI is off.</strong> Reconstructing from raw signals only — no written notes or gap
            suggestions. Connect a local Ollama model to auto-draft worklog descriptions, all on your device.
          </span>
          <span className="recon-banner-spacer" />
          <button type="button" className="recon-setup-btn" onClick={onOpenSettings}>
            SET UP LOCAL AI
          </button>
        </div>
      )}

      {/* ---- body ---- */}
      <div className="recon-body">
        {/* signals rail (drop here to return a placed entry) */}
        <aside
          className={`recon-rail ${railDragOver ? "is-drop" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setRailDragOver(true);
          }}
          onDragLeave={() => setRailDragOver(false)}
          onDrop={dropOnRail}
        >
          <div className="recon-rail-head">
            <span className="recon-rail-title">SIGNALS FROM API</span>
            <span className="recon-rail-count">{summary.unplacedLabel}</span>
          </div>
          <p className="recon-rail-help">
            Durations are <span className="recon-em">estimates</span> from commit and PR timestamps.{" "}
            <span className="recon-em">Drag a card onto an hour</span> to place it, or place them all at once.
          </p>

          <div className="recon-rail-list">
            {railSignals.map((signal) => {
              const conf = CONFIDENCE[signal.confidence];
              return (
                <div
                  className={`recon-sig ${signal.isMarker ? "is-marker-card" : ""}`}
                  key={signal.id}
                  style={accentStyle(signal.kind)}
                  draggable={!signal.isMarker}
                  onDragStart={signal.isMarker ? undefined : (event) => startDrag(event, signal.id)}
                >
                  <div className="recon-sig-top">
                    <span className="recon-icon-tile">
                      <SignalGlyph kind={signal.kind} />
                    </span>
                    <div className="recon-sig-headline">
                      {signal.key && <span className="recon-key">{signal.key}</span>}
                      <span className="recon-sig-title">{signal.title}</span>
                    </div>
                    <span className={`recon-dur ${signal.isMarker ? "is-marker" : ""}`}>
                      {signal.isMarker ? "marker" : formatReconDuration(signal.durationMinutes, { estimate: true })}
                    </span>
                  </div>
                  <div className="recon-sig-meta">
                    <span className="recon-sig-sub">{signal.sub}</span>
                    <span className="recon-conf" style={{ color: conf.color }}>
                      <span className="recon-conf-dot" style={{ background: conf.color }} />
                      {conf.label}
                    </span>
                    {!signal.isMarker && (
                      <button
                        type="button"
                        className="recon-sig-place"
                        onClick={() => onPlaceSignal(signal.id, signal.startHour)}
                        title="Place on the timeline"
                      >
                        Place
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {railSignals.length === 0 && isActive && isSyncing && (
              <div className="recon-rail-empty">
                <span className="recon-rail-empty-icon">
                  <Loader2 size={18} strokeWidth={2} className="spin" />
                </span>
                <div className="recon-rail-empty-title">Syncing your activity…</div>
                <div className="recon-rail-empty-text">Checking Jira and Bitbucket for this day.</div>
              </div>
            )}

            {day.signals.length === 0 && isActive && syncState === "stale" && (
              <div className="recon-rail-empty">
                <span className="recon-rail-empty-icon">
                  <RefreshCw size={18} strokeWidth={2} />
                </span>
                <div className="recon-rail-empty-title">Not synced yet</div>
                <div className="recon-rail-empty-text">
                  Sync your Jira and Bitbucket activity to reconstruct this day.
                </div>
                <button type="button" className="recon-rail-sync-btn" onClick={onSync}>
                  <RefreshCw size={14} strokeWidth={1.9} />
                  Sync now
                </button>
              </div>
            )}

            {railSignals.length === 0 && (isWeekend || (!isSyncing && syncState !== "stale")) && (
              <div className="recon-rail-empty">
                <span className="recon-rail-empty-icon">
                  <PlusCircle size={18} strokeWidth={2} />
                </span>
                <div className="recon-rail-empty-title">
                  {isWeekend ? "No activity this day" : "All signals placed"}
                </div>
                <div className="recon-rail-empty-text">
                  {isWeekend
                    ? "No commits, PRs or CI runs detected — expected on a day off."
                    : "Every signal is on the timeline. Drag an entry back here to unplace it."}
                </div>
              </div>
            )}
          </div>

          {isActive && railSignals.some((signal) => !signal.isMarker) && (
            <div className="recon-rail-foot">
              <button type="button" className="recon-rail-btn" onClick={onPlaceAll}>
                <Zap size={16} strokeWidth={1.9} />
                Place everything
              </button>
            </div>
          )}
        </aside>

        {/* timeline */}
        <section className="recon-timeline">
          <div className="recon-tl-head">
            <span className="recon-rail-title">WORKING DAY · 09:00 → 18:00</span>
            <div className="recon-legend">
              <span style={accentStyle("commit")}>
                <i className="recon-swatch" />
                commits
              </span>
              <span style={accentStyle("pr")}>
                <i className="recon-swatch" />
                PR
              </span>
              <span style={accentStyle("pipe")}>
                <i className="recon-swatch" />
                CI
              </span>
              <span style={{ "--accent": "var(--border-strong)" } as CSSProperties}>
                <i className="recon-swatch" />
                in Jira
              </span>
              <span style={{ "--accent": "var(--accent)" } as CSSProperties}>
                <i className="recon-swatch" />
                local
              </span>
            </div>
          </div>

          {isActive && (day.loggedMinutes > 0 || day.localMinutes > 0) && (
            <div className="recon-logged-note">
              <Lock size={15} strokeWidth={1.9} />
              <span>
                {day.loggedMinutes > 0 && (
                  <>
                    <span className="mono recon-teal">{formatReconDuration(day.loggedMinutes)}</span> already in Jira
                  </>
                )}
                {day.loggedMinutes > 0 && day.localMinutes > 0 && " · "}
                {day.localMinutes > 0 && (
                  <>
                    <span className="mono recon-teal">{formatReconDuration(day.localMinutes)}</span> local/private
                  </>
                )}{" "}
                — counted before filling gaps, never offered twice.
              </span>
            </div>
          )}

          {showTimeline && (
            <div className="recon-tl-list">
              {day.rows.map((row, index) => {
                const hour = hourOf(row.hour);
                return (
                  <TimelineRowView
                    key={`${row.hour}-${index}`}
                    row={row}
                    aiOn={aiOn}
                    modelShort={modelShort}
                    onLogTime={onLogTime}
                    isDropTarget={dragOverHour === hour}
                    onRowDragStart={row.signalId ? (event) => startDrag(event, row.signalId!) : undefined}
                    onRowDragOver={(event) => {
                      event.preventDefault();
                      setDragOverHour(hour);
                    }}
                    onRowDragLeave={() => setDragOverHour((current) => (current === hour ? null : current))}
                    onRowDrop={(event) => dropOnHour(event, hour)}
                    onRemove={row.signalId ? () => onUnplaceSignal(row.signalId!) : undefined}
                    onAdjustDuration={
                      row.signalId ? (delta) => onAdjustDuration(row.signalId!, delta) : undefined
                    }
                  />
                );
              })}
            </div>
          )}

          {isWeekend && (
            <div className="recon-rest-panel">
              <span className="recon-rest-icon">
                <Moon size={28} strokeWidth={1.7} />
              </span>
              <div className="recon-rest-title">Enjoy the weekend</div>
              <p className="recon-rest-text">
                No work is expected on this day, so there&rsquo;s nothing to reconstruct. If you did work, use{" "}
                <span className="mono">Log time anyway</span> above to add an entry by hand.
              </p>
            </div>
          )}

          {showTimeline && (
            <div className="recon-foot">
              <div className={`recon-foot-status ${isComplete ? "is-done" : ""}`}>
                {isComplete ? <Check size={15} strokeWidth={2.2} /> : <AlertTriangle size={15} strokeWidth={1.9} />}
                <span className="mono recon-foot-gap">{summary.gapLabel}</span> {summary.footerTail}
              </div>
              <div className="recon-foot-actions">
                <button
                  type="button"
                  className="recon-send-btn"
                  onClick={onLogTime}
                  disabled={isComplete}
                  title={isComplete ? summary.sendBtnLabel : "Open the Add Time flow to log these entries"}
                >
                  <Send size={15} strokeWidth={2.2} />
                  {summary.sendBtnLabel}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

interface TimelineRowViewProps {
  row: TimelineRow;
  aiOn: boolean;
  modelShort: string;
  onLogTime: () => void;
  isDropTarget: boolean;
  onRowDragStart?: (event: DragEvent) => void;
  onRowDragOver: (event: DragEvent) => void;
  onRowDragLeave: () => void;
  onRowDrop: (event: DragEvent) => void;
  onRemove?: () => void;
  onAdjustDuration?: (deltaMinutes: number) => void;
}

const TimelineRowView = ({
  row,
  aiOn,
  modelShort,
  onLogTime,
  isDropTarget,
  onRowDragStart,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onRemove,
  onAdjustDuration
}: TimelineRowViewProps) => {
  const showAiDraft = aiOn && Boolean(row.aiDraft);
  const showAiGap = aiOn && Boolean(row.gapText) && row.kind === "empty";
  const isDraggable = row.kind === "filled" && Boolean(row.signalId);
  const lockedBadge = row.lockedSource === "jira" ? "in Jira" : "local";

  return (
    <div className="recon-tl-row">
      <span className="recon-tl-hour">{row.hour}</span>
      <div
        className={`recon-tl-cell is-${row.kind} ${isDropTarget ? "is-drop" : ""} ${isDraggable ? "is-draggable" : ""} ${showAiDraft ? "is-ai-drafted" : ""}`}
        style={accentStyle(row.signalKind)}
        draggable={isDraggable}
        onDragStart={onRowDragStart}
        onDragOver={onRowDragOver}
        onDragLeave={onRowDragLeave}
        onDrop={onRowDrop}
      >
        {row.kind === "filled" && (
          <>
            <span className="recon-bar" />
            <span className="recon-icon-tile">
              {row.signalKind ? <SignalGlyph kind={row.signalKind} size={15} /> : <GitCommit size={15} />}
            </span>
            <div className="recon-tl-main">
              <div className="recon-tl-headline">
                {row.key && <span className="recon-key">{row.key}</span>}
                <span className="recon-tl-title">{row.title}</span>
              </div>
              <div className="recon-tl-desc">{showAiDraft ? row.aiDraft : row.naiveDescription}</div>
              <div className="recon-tl-meta-row">
                <span className="recon-tl-span">{spanLabel(row.hour, row.durationMinutes)}</span>
                {showAiDraft && (
                  <span className="recon-drafted-tag">
                    <Sparkles size={10} strokeWidth={2} />
                    DRAFTED · {modelShort}
                  </span>
                )}
              </div>
            </div>
            {onAdjustDuration ? (
              <span className="recon-dur-edit">
                <button type="button" onClick={() => onAdjustDuration(-15)} title="−15 min" aria-label="Decrease duration">
                  <Minus size={13} strokeWidth={2.4} />
                </button>
                <span className="recon-tl-dur">{formatReconDuration(row.durationMinutes)}</span>
                <button type="button" onClick={() => onAdjustDuration(15)} title="+15 min" aria-label="Increase duration">
                  <Plus size={13} strokeWidth={2.4} />
                </button>
              </span>
            ) : (
              <span className="recon-tl-dur">{formatReconDuration(row.durationMinutes)}</span>
            )}
            {onRemove && (
              <button type="button" className="recon-tl-remove" onClick={onRemove} title="Return to the rail">
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </>
        )}

        {row.kind === "locked" && (
          <>
            <span className="recon-bar is-locked" />
            <span className={`recon-icon-tile is-locked ${row.lockedSource === "jira" ? "" : "is-local"}`}>
              {row.lockedSource === "personal-note" ? (
                <FileText size={15} strokeWidth={1.9} />
              ) : row.lockedSource === "recurring" ? (
                <Calendar size={15} strokeWidth={1.9} />
              ) : (
                <Lock size={15} strokeWidth={1.9} />
              )}
            </span>
            <div className="recon-tl-main">
              <div className="recon-tl-title is-muted">{row.title}</div>
              <div className="recon-tl-sub">{row.sub}</div>
            </div>
            <span className={`recon-tl-dur is-locked ${row.lockedSource === "jira" ? "is-jira" : "is-local"}`}>
              {lockedBadge}
            </span>
          </>
        )}

        {row.kind === "empty" && (
          <div className="recon-gap">
            {showAiGap ? (
              <>
                <span className="recon-icon-tile is-ai">
                  <Sparkles size={14} strokeWidth={2} />
                </span>
                <span className="recon-gap-text">{row.gapText}</span>
                <button type="button" className="recon-gap-cta" onClick={onLogTime}>
                  {row.gapCta ?? "Add"}
                </button>
              </>
            ) : (
              <>
                <PlusCircle size={15} strokeWidth={1.8} />
                <span className="recon-gap-text">Gap — no signals. Add an entry by hand.</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
