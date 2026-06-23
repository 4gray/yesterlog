import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, CircleHelp, ExternalLink, Loader2, RotateCw, X } from "lucide-react";
import type {
  AppSettings,
  BitbucketReviewSession,
  BitbucketReviewSyncResult,
  BitbucketReviewTargetMode,
  JiraIssueTypeInfo
} from "../../shared/types";
import { getReviewStats, getReviewTargetIssueKey } from "../domain/bitbucketReview";
import {
  formatClock,
  formatDuration,
  formatHm24,
  formatWeekRangeCompact,
  fromLocalDateKey,
  getIsoWeekNumber
} from "../utils/date";
import { TicketKeyLink } from "./TicketKeyLink";
import { WeekNavigator } from "./WeekNavigator";

interface ReviewViewProps {
  weekKey: string;
  weekStartISO: string;
  settings: AppSettings;
  result?: BitbucketReviewSyncResult;
  issueUrlsByKey: Record<string, string>;
  issueTypesByKey: Record<string, JiraIssueTypeInfo>;
  isConfigured: boolean;
  isSyncing: boolean;
  isLogging: boolean;
  targetMode: BitbucketReviewTargetMode;
  onTargetModeChange: (mode: BitbucketReviewTargetMode) => void;
  onSync: () => void;
  onLogSessions: (
    sessionIds: string[],
    targetMode: BitbucketReviewTargetMode,
    durationOverrides: Record<string, number>
  ) => Promise<boolean>;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
}

const groupSessionsByDate = (sessions: BitbucketReviewSession[]) => {
  const groups = new Map<string, BitbucketReviewSession[]>();

  for (const session of sessions) {
    const group = groups.get(session.dateKey) ?? [];
    group.push(session);
    groups.set(session.dateKey, group);
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
};

const confidenceCopy: Record<BitbucketReviewSession["confidence"], string> = {
  high: "HIGH",
  medium: "MED",
  low: "LOW"
};

const getDayTotalSeconds = (sessions: BitbucketReviewSession[]) =>
  sessions.reduce((sum, session) => sum + session.estimatedSeconds, 0);

const EMPTY_REVIEW_SESSIONS: BitbucketReviewSession[] = [];

const areSameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

type ReviewOwnershipFilter = "reviewed-by-me" | "my-pull-requests";

type ReviewDialogState =
  | { kind: "log" }
  | { kind: "target"; mode: BitbucketReviewTargetMode }
  | { kind: "estimate-info" }
  | undefined;

type ReviewDurationUnit = "m" | "h";

const ownershipFilterCopy: Record<ReviewOwnershipFilter, string> = {
  "reviewed-by-me": "REVIEWED BY ME",
  "my-pull-requests": "MY PRS"
};

const reviewDurationPresets = [
  { label: "30m", seconds: 30 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "2h", seconds: 2 * 60 * 60 }
];

const targetModeCopy: Record<BitbucketReviewTargetMode, string> = {
  "reviewed-ticket": "THE REVIEWED TICKET",
  "review-bucket": "CODE REVIEW BUCKET"
};

const getTargetModeHint = (settings: AppSettings, mode: BitbucketReviewTargetMode) =>
  mode === "review-bucket"
    ? settings.bitbucketReviewBucketIssueKey.trim().toUpperCase() || "review bucket"
    : "each review -> its PR ticket";

const getSessionAuthorLabel = (session: BitbucketReviewSession) => {
  if (session.isPullRequestAuthor) {
    return "author: you";
  }

  return `author: ${session.pullRequestAuthorDisplayName?.trim() || "unknown"}`;
};

const filterReviewSessions = (sessions: BitbucketReviewSession[], filter: ReviewOwnershipFilter) =>
  filter === "my-pull-requests"
    ? sessions.filter((session) => session.isPullRequestAuthor)
    : sessions.filter((session) => !session.isPullRequestAuthor);

const buildFilteredResult = (
  result: BitbucketReviewSyncResult | undefined,
  sessions: BitbucketReviewSession[]
): BitbucketReviewSyncResult | undefined =>
  result
    ? {
        ...result,
        sessionCount: sessions.length,
        sessions
      }
    : undefined;

const applyReviewDurationOverrides = (
  sessions: BitbucketReviewSession[],
  durationOverrides: Record<string, number>
) =>
  sessions.map((session) => {
    const overrideSeconds = durationOverrides[session.id];
    return overrideSeconds && overrideSeconds > 0
      ? {
          ...session,
          estimatedSeconds: overrideSeconds
        }
      : session;
  });

const reviewCustomDurationToSeconds = (amountText: string, unit: ReviewDurationUnit) => {
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return Math.round(amount * (unit === "m" ? 60 : 3600));
};

interface ReviewSessionTargetPreview {
  session: BitbucketReviewSession;
  targetIssueKey?: string;
}

const buildTargetPreview = (
  sessions: BitbucketReviewSession[],
  settings: AppSettings,
  mode: BitbucketReviewTargetMode
): ReviewSessionTargetPreview[] =>
  sessions.map((session) => ({
    session,
    targetIssueKey: getReviewTargetIssueKey(session, settings, mode)
  }));

interface ReviewDialogFrameProps {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  footerHint: string;
  actions: ReactNode;
}

const ReviewDialogFrame = ({ title, eyebrow, onClose, children, footerHint, actions }: ReviewDialogFrameProps) => (
  <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-backdrop" onClick={onClose} />
    <div className="modal-panel review-dialog-panel">
      <div className="modal-head">
        <div className="modal-title-row">
          <span className="modal-title">{title}</span>
          {eyebrow ? <span className="modal-day">{eyebrow}</span> : null}
        </div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={14} strokeWidth={2.2} />
        </button>
      </div>
      <div className="modal-body review-dialog-body">{children}</div>
      <div className="modal-foot">
        <span className="modal-foot-hint">{footerHint}</span>
        <div className="modal-foot-actions">{actions}</div>
      </div>
    </div>
  </div>
);

interface ReviewPreviewListProps {
  items: ReviewSessionTargetPreview[];
  issueUrlsByKey: Record<string, string>;
  issueTypesByKey: Record<string, JiraIssueTypeInfo>;
  emptyText: string;
}

const ReviewPreviewList = ({ items, issueUrlsByKey, issueTypesByKey, emptyText }: ReviewPreviewListProps) => {
  if (items.length === 0) {
    return <div className="review-dialog-empty">{emptyText}</div>;
  }

  return (
    <div className="review-dialog-list">
      {items.map(({ session, targetIssueKey }) => (
        <div className="review-dialog-item" key={session.id}>
          <div className="review-dialog-item-main">
            <span className="review-dialog-pr">PR #{session.pullRequestId}</span>
            <strong>{session.pullRequestTitle}</strong>
            <span>
              {session.repositoryName} · {getSessionAuthorLabel(session)}
            </span>
          </div>
          <div className="review-dialog-item-meta">
            <strong>{formatClock(session.estimatedSeconds)}</strong>
            {targetIssueKey ? (
              <TicketKeyLink
                issueKey={targetIssueKey}
                url={issueUrlsByKey[targetIssueKey]}
                issueType={issueTypesByKey[targetIssueKey]}
                keyClassName="review-issue-key"
              />
            ) : (
              <span className="review-missing-target">NO JIRA TARGET</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

interface ReviewBulkDurationEditorProps {
  items: ReviewSessionTargetPreview[];
  onApplySeconds: (seconds: number) => void;
}

const ReviewBulkDurationEditor = ({ items, onApplySeconds }: ReviewBulkDurationEditorProps) => {
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("1");
  const [customUnit, setCustomUnit] = useState<ReviewDurationUnit>("h");
  const itemSeconds = items.map((item) => item.session.estimatedSeconds);
  const totalSeconds = itemSeconds.reduce((sum, seconds) => sum + seconds, 0);
  const commonSeconds =
    itemSeconds.length > 0 && itemSeconds.every((seconds) => seconds === itemSeconds[0]) ? itemSeconds[0] : undefined;
  const customSeconds = reviewCustomDurationToSeconds(customAmount, customUnit);
  const canApplyCustom = customSeconds > 0 && items.length > 0;

  return (
    <div className="review-duration-editor">
      <div>
        <div className="review-duration-editor-label">SET ALL REVIEW TIME</div>
        <div className="review-duration-editor-total">
          {formatClock(totalSeconds)} across {items.length} {items.length === 1 ? "session" : "sessions"}
        </div>
      </div>

      <div className="review-duration-editor-controls">
        {reviewDurationPresets.map((preset) => (
          <button
            type="button"
            key={preset.label}
            className={commonSeconds === preset.seconds ? "active" : ""}
            onClick={() => onApplySeconds(preset.seconds)}
            disabled={items.length === 0}
          >
            {preset.label}
          </button>
        ))}
        <button type="button" className={customOpen ? "active" : ""} onClick={() => setCustomOpen((current) => !current)}>
          Custom
        </button>
      </div>

      {customOpen ? (
        <div className="review-duration-custom">
          <input
            type="number"
            min={customUnit === "m" ? "1" : "0.25"}
            step={customUnit === "m" ? "5" : "0.25"}
            inputMode="decimal"
            value={customAmount}
            onChange={(event) => setCustomAmount(event.target.value)}
            aria-label="Custom review duration amount"
          />
          <div className="review-duration-unit-toggle" aria-label="Custom review duration unit">
            {(["m", "h"] as const).map((unit) => (
              <button
                type="button"
                key={unit}
                className={customUnit === unit ? "active" : ""}
                aria-pressed={customUnit === unit}
                onClick={() => setCustomUnit(unit)}
              >
                {unit.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className="review-duration-apply" onClick={() => onApplySeconds(customSeconds)} disabled={!canApplyCustom}>
            APPLY
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const ReviewView = ({
  weekKey,
  weekStartISO,
  settings,
  result,
  issueUrlsByKey,
  issueTypesByKey,
  isConfigured,
  isSyncing,
  isLogging,
  targetMode,
  onTargetModeChange,
  onSync,
  onLogSessions,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek
}: ReviewViewProps) => {
  const sessions = result?.sessions ?? EMPTY_REVIEW_SESSIONS;
  const [ownershipFilter, setOwnershipFilter] = useState<ReviewOwnershipFilter>("reviewed-by-me");
  const [dialog, setDialog] = useState<ReviewDialogState>();
  const [durationOverrides, setDurationOverrides] = useState<Record<string, number>>({});
  const effectiveSessions = useMemo(
    () => applyReviewDurationOverrides(sessions, durationOverrides),
    [durationOverrides, sessions]
  );
  const visibleSessions = useMemo(() => filterReviewSessions(effectiveSessions, ownershipFilter), [effectiveSessions, ownershipFilter]);
  const visibleResult = useMemo(() => buildFilteredResult(result, visibleSessions), [result, visibleSessions]);
  const stats = getReviewStats(visibleResult);
  const weekStart = fromLocalDateKey(weekKey);
  const weekNumber = getIsoWeekNumber(weekStart);
  const rangeLabel = formatWeekRangeCompact(weekStart);
  const groupedSessions = useMemo(() => groupSessionsByDate(visibleSessions), [visibleSessions]);
  const selectableIds = useMemo(
    () =>
      visibleSessions
        .filter((session) => session.status !== "logged" && getReviewTargetIssueKey(session, settings, targetMode))
        .map((session) => session.id),
    [visibleSessions, settings, targetMode]
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() => selectableIds);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedSessions = visibleSessions.filter((session) => selectedSet.has(session.id));
  const selectedSeconds = selectedSessions.reduce((sum, session) => sum + session.estimatedSeconds, 0);
  const unloggedVisibleSessions = visibleSessions.filter((session) => session.status !== "logged");
  const hasBucket = Boolean(settings.bitbucketReviewBucketIssueKey.trim());
  const logPreview = useMemo(
    () => buildTargetPreview(selectedSessions, settings, targetMode),
    [selectedSessions, settings, targetMode]
  );
  const pendingTargetMode = dialog?.kind === "target" ? dialog.mode : targetMode;
  const targetPreviewSessions = selectedSessions.length > 0 ? selectedSessions : unloggedVisibleSessions;
  const targetPreview = useMemo(
    () => buildTargetPreview(targetPreviewSessions, settings, pendingTargetMode),
    [pendingTargetMode, settings, targetPreviewSessions]
  );
  const canConfirmLog = logPreview.length > 0 && logPreview.every((item) => item.targetIssueKey);

  useEffect(() => {
    setSelectedIds((current) => (areSameIds(current, selectableIds) ? current : selectableIds));
  }, [selectableIds]);

  useEffect(() => {
    const knownSessionIds = new Set(sessions.map((session) => session.id));
    setDurationOverrides((current) => {
      const nextEntries = Object.entries(current).filter(([sessionId]) => knownSessionIds.has(sessionId));
      return nextEntries.length === Object.keys(current).length ? current : Object.fromEntries(nextEntries);
    });
  }, [sessions]);

  const toggleSession = (sessionId: string) => {
    setSelectedIds((current) =>
      current.includes(sessionId) ? current.filter((candidate) => candidate !== sessionId) : [...current, sessionId]
    );
  };

  const applyDurationToPreview = (items: ReviewSessionTargetPreview[], seconds: number) => {
    if (items.length === 0 || seconds <= 0) {
      return;
    }

    setDurationOverrides((current) => {
      const next = { ...current };
      for (const item of items) {
        next[item.session.id] = seconds;
      }
      return next;
    });
  };

  const openLogDialog = () => {
    if (selectedIds.length === 0) {
      return;
    }

    setDialog({ kind: "log" });
  };

  const confirmLog = async () => {
    if (!canConfirmLog) {
      return;
    }

    const loggedIds = selectedIds;
    const ok = await onLogSessions(loggedIds, targetMode, durationOverrides);
    if (ok) {
      setSelectedIds([]);
      setDurationOverrides((current) => {
        const next = { ...current };
        for (const sessionId of loggedIds) {
          delete next[sessionId];
        }
        return next;
      });
      setDialog(undefined);
    }
  };

  const openTargetDialog = (mode: BitbucketReviewTargetMode) => {
    setDialog({ kind: "target", mode });
  };

  const confirmTargetMode = () => {
    if (dialog?.kind !== "target") {
      return;
    }

    onTargetModeChange(dialog.mode);
    setDialog(undefined);
  };

  return (
    <div className="view view-scroll">
      <div className="review-header">
        <div>
          <div className="eyebrow">REVIEW — WEEK {weekNumber}</div>
          <div className="review-figure-row">
            <div className="big-figure">
              {formatDuration(stats.unloggedSeconds / 3600)}
              <span className="unit"> review</span>
            </div>
            <span className="sub">
              · {stats.unloggedCount} of {stats.sessionCount} sessions not yet logged
            </span>
          </div>
          <div className="review-meta">{rangeLabel}</div>
        </div>

        <div className="review-actions">
          <button
            type="button"
            className="sync-button"
            onClick={onSync}
            disabled={isSyncing || !isConfigured}
            title={isConfigured ? "Sync Bitbucket reviews" : "Connect Bitbucket in settings to sync reviews"}
          >
            {isSyncing ? <Loader2 className="spin" size={14} /> : <RotateCw size={14} strokeWidth={2} />}
            SYNC
          </button>
          <button
            type="button"
            className="review-log-button"
            onClick={openLogDialog}
            disabled={isLogging || selectedIds.length === 0}
          >
            {isLogging ? <Loader2 className="spin" size={15} /> : <Check size={15} strokeWidth={2.4} />}
            LOG {selectedIds.length} {selectedIds.length === 1 ? "SESSION" : "SESSIONS"}
          </button>
          <div className="week-divider" />
          <WeekNavigator onPreviousWeek={onPreviousWeek} onCurrentWeek={onCurrentWeek} onNextWeek={onNextWeek} />
        </div>
      </div>

      <div className="review-kpis">
        <div className="review-kpi">
          <div className="kpi-label">REVIEW TIME</div>
          <div className="kpi-value">{formatDuration(stats.estimatedSeconds / 3600)}</div>
          <div className="kpi-note">from Bitbucket activity</div>
        </div>
        <div className="review-kpi">
          <div className="kpi-label">PRS REVIEWED</div>
          <div className="kpi-value">{stats.reviewedPullRequestCount}</div>
          <div className="kpi-note">across {stats.repositoryCount} repos</div>
        </div>
        <div className="review-kpi">
          <div className="kpi-label">SELECTED</div>
          <div className="kpi-value">{formatDuration(selectedSeconds / 3600)}</div>
          <div className="kpi-note">{selectedIds.length} sessions queued</div>
        </div>
        <div className="review-kpi">
          <div className="kpi-label">AVG PER SESSION</div>
          <div className="kpi-value">{formatClock(stats.averageSecondsPerSession)}</div>
          <div className="kpi-note">estimated spans</div>
        </div>
      </div>

      <div className="review-filter-row">
        <span className="review-filter-label">SHOW</span>
        <div className="review-filter-toggle" aria-label="Review ownership filter">
          {(["reviewed-by-me", "my-pull-requests"] as const).map((filter) => (
            <button
              type="button"
              key={filter}
              className={ownershipFilter === filter ? "active" : ""}
              aria-pressed={ownershipFilter === filter}
              onClick={() => setOwnershipFilter(filter)}
            >
              {ownershipFilterCopy[filter]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="review-info-button"
          onClick={() => setDialog({ kind: "estimate-info" })}
          title="How review time is estimated"
          aria-label="How review time is estimated"
        >
          <CircleHelp size={15} strokeWidth={2} />
        </button>
        <span className="review-filter-hint">
          {ownershipFilter === "my-pull-requests" ? "PRs you created" : "PRs where your Bitbucket review activity was found"}
        </span>
      </div>

      <div className="review-target-row">
        <span className="review-target-label">LOG REVIEW TIME TO</span>
        <div className="review-target-toggle" aria-label="Review worklog target">
          <button
            type="button"
            className={targetMode === "reviewed-ticket" ? "active" : ""}
            onClick={() => openTargetDialog("reviewed-ticket")}
          >
            THE REVIEWED TICKET
          </button>
          <button
            type="button"
            className={targetMode === "review-bucket" ? "active" : ""}
            onClick={() => openTargetDialog("review-bucket")}
            disabled={!hasBucket}
            title={hasBucket ? "Log to review bucket issue" : "Set a review bucket issue in Settings"}
          >
            CODE REVIEW BUCKET
          </button>
        </div>
        <span className="review-target-hint">
          {getTargetModeHint(settings, targetMode)}
        </span>
      </div>

      <div className="review-list">
        {!isConfigured ? (
          <div className="review-empty">Connect Bitbucket in Settings to unlock Review.</div>
        ) : !result ? (
          <div className="review-empty">Sync Bitbucket reviews for this week.</div>
        ) : sessions.length === 0 ? (
          <div className="review-empty">No Bitbucket review sessions found for this week.</div>
        ) : visibleSessions.length === 0 ? (
          <div className="review-empty">No review sessions match {ownershipFilterCopy[ownershipFilter].toLowerCase()}.</div>
        ) : (
          groupedSessions.map(([dateKey, daySessions]) => {
            const date = fromLocalDateKey(dateKey);
            return (
              <div className="review-day" key={dateKey}>
                <div className="review-day-head">
                  <span>
                    {new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date).toUpperCase()} ·{" "}
                    {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date).toUpperCase()}
                  </span>
                  <strong>{formatClock(getDayTotalSeconds(daySessions))}</strong>
                </div>

                {daySessions.map((session) => {
                  const targetIssueKey = getReviewTargetIssueKey(session, settings, targetMode);
                  const isLogged = session.status === "logged";
                  const isSelectable = Boolean(targetIssueKey && !isLogged);
                  const start = new Date(session.startedISO);
                  const end = new Date(session.endedISO);
                  const authorLabel = getSessionAuthorLabel(session);

                  return (
                    <div className={`review-session ${isLogged ? "is-logged" : ""}`} key={session.id}>
                      <button
                        type="button"
                        className={`review-check ${selectedSet.has(session.id) || isLogged ? "active" : ""}`}
                        onClick={() => toggleSession(session.id)}
                        disabled={!isSelectable}
                        aria-pressed={selectedSet.has(session.id)}
                        aria-label={isLogged ? `Review session for PR ${session.pullRequestId} logged` : `Select PR ${session.pullRequestId}`}
                      >
                        <Check size={13} strokeWidth={2.4} />
                      </button>

                      <div className="review-session-main">
                        <div className="review-session-top">
                          <a href={session.pullRequestUrl} target="_blank" rel="noreferrer" className="review-pr">
                            PR #{session.pullRequestId}
                            <ExternalLink size={12} strokeWidth={1.8} />
                          </a>
                          <span className={`review-state is-${isLogged ? "logged" : session.reviewStateLabel.toLowerCase()}`}>
                            {isLogged ? "LOGGED" : session.reviewStateLabel}
                          </span>
                          <span className={`review-confidence is-${session.confidence}`}>{confidenceCopy[session.confidence]}</span>
                        </div>

                        <div className="review-title">{session.pullRequestTitle}</div>
                        <div className="review-details">
                          <span>{session.repositoryName}</span>
                          <span>{authorLabel}</span>
                          <span>{session.commentCount} comments</span>
                          <span>
                            {targetIssueKey ? (
                              <TicketKeyLink
                                issueKey={targetIssueKey}
                                url={issueUrlsByKey[targetIssueKey]}
                                issueType={issueTypesByKey[targetIssueKey]}
                                keyClassName="review-issue-key"
                              />
                            ) : (
                              <span className="review-missing-target">NO JIRA KEY</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="review-session-time">
                        <strong>{formatClock(session.estimatedSeconds)}</strong>
                        <span>
                          {formatHm24(start)}-{formatHm24(end)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {dialog?.kind === "log" ? (
        <ReviewDialogFrame
          title="Confirm Jira worklogs"
          eyebrow={formatDuration(selectedSeconds / 3600)}
          onClose={() => setDialog(undefined)}
          footerHint="NO JIRA WORKLOGS ARE CREATED UNTIL YOU CONFIRM"
          actions={
            <>
              <button type="button" className="modal-cancel" onClick={() => setDialog(undefined)} disabled={isLogging}>
                CANCEL
              </button>
              <button type="button" className="primary-button" onClick={confirmLog} disabled={!canConfirmLog || isLogging}>
                {isLogging ? <Loader2 className="spin" size={15} /> : null}
                CREATE {logPreview.length} {logPreview.length === 1 ? "WORKLOG" : "WORKLOGS"}
              </button>
            </>
          }
        >
          <p className="review-dialog-copy">
            TimeBro will create Jira worklogs for the selected Bitbucket review sessions using the current target mode:
            <strong> {targetModeCopy[targetMode]}</strong>.
          </p>
          <ReviewBulkDurationEditor items={logPreview} onApplySeconds={(seconds) => applyDurationToPreview(logPreview, seconds)} />
          <ReviewPreviewList
            items={logPreview}
            issueUrlsByKey={issueUrlsByKey}
            issueTypesByKey={issueTypesByKey}
            emptyText="No selected review sessions."
          />
        </ReviewDialogFrame>
      ) : null}

      {dialog?.kind === "target" ? (
        <ReviewDialogFrame
          title="Confirm review target"
          eyebrow={targetModeCopy[dialog.mode]}
          onClose={() => setDialog(undefined)}
          footerHint="THIS ONLY CHANGES THE TARGET MODE; IT DOES NOT WRITE TO JIRA"
          actions={
            <>
              <button type="button" className="modal-cancel" onClick={() => setDialog(undefined)}>
                CANCEL
              </button>
              <button type="button" className="primary-button" onClick={confirmTargetMode}>
                {dialog.mode === targetMode ? "KEEP TARGET" : "USE TARGET"}
              </button>
            </>
          }
        >
          <p className="review-dialog-copy">
            Future review logging will use <strong>{targetModeCopy[dialog.mode]}</strong>. The preview below shows where the
            currently selected sessions will go; if nothing is selected, it shows all visible unlogged sessions.
          </p>
          <ReviewBulkDurationEditor items={targetPreview} onApplySeconds={(seconds) => applyDurationToPreview(targetPreview, seconds)} />
          <ReviewPreviewList
            items={targetPreview}
            issueUrlsByKey={issueUrlsByKey}
            issueTypesByKey={issueTypesByKey}
            emptyText="No visible unlogged review sessions."
          />
        </ReviewDialogFrame>
      ) : null}

      {dialog?.kind === "estimate-info" ? (
        <ReviewDialogFrame
          title="Review time estimate"
          eyebrow="BITBUCKET ACTIVITY"
          onClose={() => setDialog(undefined)}
          footerHint="ESTIMATES ARE REVIEWABLE BEFORE ANY JIRA WRITE"
          actions={
            <button type="button" className="primary-button" onClick={() => setDialog(undefined)}>
              GOT IT
            </button>
          }
        >
          <div className="review-estimate-steps">
            <p>
              Time is estimated from your Bitbucket PR activity for each pull request and day: comments, approvals,
              requested changes, and PR updates.
            </p>
            <ol>
              <li>Events are grouped by PR and local day inside the selected week.</li>
              <li>The session starts five minutes before your first activity event.</li>
              <li>The estimate is the first-to-last activity span plus ten minutes.</li>
              <li>Minimums keep tiny review traces visible: 20m with no comments, 25m with comments, 40m for six or more comments.</li>
              <li>Every session is capped at 2h and gets a confidence label from the amount of activity and whether there was a review decision.</li>
            </ol>
          </div>
        </ReviewDialogFrame>
      ) : null}
    </div>
  );
};
