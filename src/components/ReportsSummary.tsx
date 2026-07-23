import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  BitbucketReviewSyncResult,
  DayTrackingSummary,
  JiraEpicInfo,
  JiraIssueTypeInfo,
  WeekState
} from "../../shared/types";
import { activitySegments, dayActivitySeconds, sumActivitySeconds, weekBillableSplit } from "../domain/activity";
import { buildReportsReview } from "../domain/reportsReview";
import { buildReportsHistory, type KpiDelta } from "../domain/reportsTrend";
import { formatDuration, formatHours, fromLocalDateKey, getIsoWeekNumber } from "../utils/date";
import { DayRing } from "./DayRing";
import { TicketKeyLink } from "./TicketKeyLink";
import { TimeSplit } from "./TimeSplit";
import { WeekNavigator } from "./WeekNavigator";
import { Sparkles } from "lucide-react";
import { formatReviewEffortOrigin } from "./ReportsReviews";

interface ReportsSummaryProps {
  weekState: WeekState;
  weekStates?: WeekState[];
  reviewResult?: BitbucketReviewSyncResult;
  showReviewAnalytics?: boolean;
  onOpenReviewReport?: () => void;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
  onOpenRecap: () => void;
}

const clampPct = (value: number) => `${Math.min(Math.max(value, 0), 100)}%`;

const DeltaChip = ({
  value,
  unit,
  graded
}: {
  value?: KpiDelta;
  unit: "hours" | "pts" | "count";
  graded: boolean;
}) => {
  if (!value) {
    return null;
  }
  if (value.delta === 0) {
    return <div className="kpi-delta is-flat">no change vs last week</div>;
  }
  const up = value.delta > 0;
  const magnitude =
    unit === "hours"
      ? formatHours(Math.abs(value.delta))
      : unit === "pts"
        ? `${Math.abs(value.delta)}pts`
        : `${Math.abs(value.delta)}`;
  const tone = graded ? (up ? "is-up" : "is-down") : "is-flat";
  return (
    <div className={`kpi-delta ${tone}`} title="vs previous week">
      <span className="kpi-delta-arrow">{up ? "▲" : "▼"}</span>
      {up ? "+" : "−"}
      {magnitude}
    </div>
  );
};

const DayChart = ({ days, chartTarget }: { days: DayTrackingSummary[]; chartTarget: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; index: number } | null>(null);

  const moveTo = (index: number, event: ReactMouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, index });
  };
  const clear = () => setHover(null);
  const active = hover ? days[hover.index] : undefined;

  return (
    <div className="chart" ref={containerRef}>
      <div className="chart-target-line" />
      {days.map((day, index) => {
        const isComplete = day.targetHours > 0 && day.trackedHours >= day.targetHours;
        const isEmpty = day.trackedHours <= 0;
        const heightPct = clampPct((day.trackedHours / chartTarget) * 100);
        return (
          <div
            className={`chart-col ${hover?.index === index ? "is-hover" : ""}`}
            key={day.dateKey}
            onMouseEnter={(event) => moveTo(index, event)}
            onMouseMove={(event) => moveTo(index, event)}
            onMouseLeave={clear}
          >
            <div className="chart-bar-track">
              <div
                className={`chart-bar ${isComplete ? "is-complete" : ""} ${isEmpty ? "is-empty" : ""}`}
                style={{ height: isEmpty ? 4 : heightPct }}
              />
            </div>
            <span className={`chart-val ${isEmpty ? "is-dim" : ""}`}>{formatHours(day.trackedHours)}</span>
            <span className={`chart-day ${day.isToday ? "is-today" : ""}`}>
              {day.weekdayName.slice(0, 3).toUpperCase()}
            </span>
          </div>
        );
      })}
      {hover && active ? (
        <div className="chart-tip" style={{ left: hover.x, top: hover.y }}>
          <div className="chart-tip-title">{active.weekdayName}</div>
          <div className="chart-tip-row">
            <span className="tip-swatch is-tracked" />
            <span className="tip-label">Tracked</span>
            <b>{formatHours(active.trackedHours)}</b>
          </div>
          {active.targetHours > 0 ? (
            <div className="chart-tip-row">
              <span className="tip-swatch is-target" />
              <span className="tip-label">Target</span>
              <b>{formatHours(active.targetHours)}</b>
            </div>
          ) : null}
          <div
            className={`chart-tip-foot ${
              active.targetHours > 0 && active.trackedHours >= active.targetHours ? "is-on" : "is-under"
            }`}
          >
            {active.targetHours <= 0
              ? "non-working day"
              : active.trackedHours >= active.targetHours
                ? "on target"
                : `${formatHours(active.targetHours - active.trackedHours)} under target`}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const ReportsSummary = ({
  weekState,
  weekStates,
  reviewResult,
  showReviewAnalytics = false,
  onOpenReviewReport = () => undefined,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek,
  onOpenRecap
}: ReportsSummaryProps) => {
  const weekStart = fromLocalDateKey(weekState.weekKey);
  const weekNumber = getIsoWeekNumber(weekStart);
  const dailyTarget = weekState.dailyTargetHours;
  const chartTarget = dailyTarget || 8;
  const targetDayCount = weekState.days.length;

  const deltas = useMemo(
    () =>
      weekStates && weekStates.length > 0
        ? buildReportsHistory(weekStates, weekState.weekKey).deltas
        : undefined,
    [weekStates, weekState.weekKey]
  );
  const reviewReport = useMemo(() => buildReportsReview(reviewResult), [reviewResult]);

  const stats = useMemo(() => {
    const activeDays = weekState.days.filter((day) => day.trackedHours > 0);
    const completeDays = weekState.days.filter((day) => day.targetHours > 0 && day.trackedHours >= day.targetHours);
    const firstComplete = completeDays[0];

    const byTicket = new Map<
      string,
      {
        key: string;
        summary: string;
        url?: string;
        issueType?: JiraIssueTypeInfo;
        epic?: JiraEpicInfo;
        hours: number;
        isLocal?: boolean;
      }
    >();
    // Personal notes are grouped by title (falling back to their text) so each
    // distinct note shows as its own row — like tickets — instead of a single
    // aggregated "Personal notes" entry.
    const byNote = new Map<string, { groupKey: string; label: string; hours: number }>();
    for (const day of weekState.days) {
      for (const issue of day.issues) {
        const existing = byTicket.get(issue.key);
        if (existing) {
          existing.hours += issue.loggedSeconds / 3600;
          if (!existing.issueType && issue.issueType) {
            existing.issueType = issue.issueType;
          }
          if (!existing.epic && issue.epic) {
            existing.epic = issue.epic;
          }
        } else {
          byTicket.set(issue.key, {
            key: issue.key,
            summary: issue.summary,
            url: issue.url,
            issueType: issue.issueType,
            epic: issue.epic,
            hours: issue.loggedSeconds / 3600
          });
        }
      }

      for (const note of day.personalNotes) {
        const label = note.title?.trim() || note.text.trim() || "Personal note";
        const groupKey = label.toLowerCase();
        const existing = byNote.get(groupKey);
        if (existing) {
          existing.hours += note.timeSpentSeconds / 3600;
        } else {
          byNote.set(groupKey, { groupKey, label, hours: note.timeSpentSeconds / 3600 });
        }
      }
    }

    const ticketRows = [...byTicket.values()];
    const noteRows = [...byNote.values()].map((note) => ({
      key: `LOCAL::${note.groupKey}`,
      summary: note.label,
      url: undefined,
      issueType: undefined,
      epic: undefined,
      hours: note.hours,
      isLocal: true
    }));
    const tickets = [...ticketRows, ...noteRows].sort((a, b) => b.hours - a.hours);

    const projects = new Set(ticketRows.map((ticket) => ticket.key.split("-")[0]));

    return {
      dailyAverage: activeDays.length > 0 ? weekState.trackedWeekHours / activeDays.length : 0,
      activeDayCount: activeDays.length,
      completeDayCount: completeDays.length,
      firstCompleteName: firstComplete?.weekdayName,
      ticketCount: ticketRows.length,
      projectCount: projects.size,
      tickets
    };
  }, [weekState]);

  const total = weekState.trackedWeekHours;
  const remaining = weekState.weeklyTargetHours - total;
  const billablePct = total > 0 ? Math.round((weekState.jiraTrackedWeekHours / total) * 100) : 0;
  const localWeekHours = weekBillableSplit(weekState).localHours;
  const targetPct =
    weekState.weeklyTargetHours > 0 ? Math.min((total / weekState.weeklyTargetHours) * 100, 100) : 0;

  // Where the week went, by category — the aggregate of every day's ring.
  const weekRingSegments = activitySegments(sumActivitySeconds(weekState.days.map(dayActivitySeconds)));

  return (
    <>
      <div className="reports-header">
        <div className="week-headline">
          <DayRing
            className="day-ring--meter"
            segments={weekRingSegments}
            targetHours={weekState.weeklyTargetHours}
            size={78}
            stroke={9}
            ariaLabel={`${Math.round(targetPct)} percent of weekly target`}
          >
            <span className="day-ring-num">
              {Math.round(targetPct)}
              <span className="day-ring-pct">%</span>
            </span>
          </DayRing>
          <div>
            <div className="eyebrow">REPORTS — WEEK {weekNumber}</div>
            <div className="reports-figure-row">
              <div className="big-figure">
                {formatHours(total)}
                <span className="unit">
                  {" "}
                  / {formatHours(weekState.weeklyTargetHours)}
                </span>
              </div>
              {remaining > 0 ? (
                <span className="delta under">{formatHours(remaining)} under target</span>
              ) : (
                <span className="delta on">On target</span>
              )}
            </div>
            {total > 0.01 && (
              <TimeSplit
                billableHours={weekState.jiraTrackedWeekHours}
                localHours={localWeekHours}
                size="lg"
                className="reports-split"
              />
            )}
            <div className="ring-legend reports-ring-legend">
              {weekRingSegments.map((segment) => (
                <span key={segment.key} className={`ring-legend-item${segment.hours <= 0 ? " is-zero" : ""}`}>
                  <span className="ring-legend-dot" style={{ background: segment.color }} />
                  {segment.label}
                  <span className="ring-legend-hours">{formatDuration(segment.hours)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="reports-actions">
          <button type="button" className="report-recap-link" onClick={onOpenRecap}>
            <Sparkles size={14} />
            WRITE THE RECAP →
          </button>
          <WeekNavigator onPreviousWeek={onPreviousWeek} onCurrentWeek={onCurrentWeek} onNextWeek={onNextWeek} />
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">DAILY AVERAGE</div>
          <div className="kpi-value">{formatDuration(stats.dailyAverage)}</div>
          <DeltaChip value={deltas?.dailyAverage} unit="hours" graded={false} />
          <div className="kpi-note">across {stats.activeDayCount} active days</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">DAYS ON TARGET</div>
          <div className="kpi-value">
            {stats.completeDayCount} <span className="unit">/ {targetDayCount}</span>
          </div>
          <DeltaChip value={deltas?.daysOnTarget} unit="count" graded />
          <div className={`kpi-note ${stats.completeDayCount > 0 ? "is-green" : ""}`}>
            {stats.firstCompleteName ? `${stats.firstCompleteName} hit target` : "No full days yet"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">TICKETS TOUCHED</div>
          <div className="kpi-value">{stats.ticketCount}</div>
          <DeltaChip value={deltas?.ticketsTouched} unit="count" graded={false} />
          <div className="kpi-note">across {stats.projectCount || 0} projects</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">BILLABLE</div>
          <div className="kpi-value">
            {billablePct}
            <span className="unit">%</span>
          </div>
          <DeltaChip value={deltas?.billablePct} unit="pts" graded />
          <div className="kpi-note">
            {formatHours(weekState.jiraTrackedWeekHours)} Jira of {formatHours(total)}
          </div>
        </div>
      </div>

      <div className="reports-main">
        <div className="reports-charts">
          <div className="chart-panel is-only">
            <div className="panel-head">
              <span className="label-mono">HOURS PER DAY</span>
              <span className="panel-aux">TARGET {formatHours(dailyTarget)}</span>
            </div>
            <DayChart days={weekState.days} chartTarget={chartTarget} />
          </div>
        </div>

        <div className="ticket-panel">
          <div className="panel-head">
            <span className="label-mono">BY TICKET</span>
            <span className="panel-aux">{formatHours(total)} TOTAL</span>
          </div>
          {stats.tickets.length > 0 ? (
            <div className="breakdown">
              {stats.tickets.map((ticket) => {
                const pct = total > 0 ? (ticket.hours / total) * 100 : 0;
                return (
                  <div key={ticket.key}>
                    <div className="breakdown-top">
                      {ticket.isLocal ? (
                        <span className="breakdown-key is-local">LOCAL</span>
                      ) : (
                        <TicketKeyLink
                          issueKey={ticket.key}
                          url={ticket.url}
                          issueType={ticket.issueType}
                          epic={ticket.epic}
                          keyClassName="breakdown-key"
                        />
                      )}
                      <span className="breakdown-spacer" />
                      <span className="breakdown-hours">{formatHours(ticket.hours)}</span>
                      <span className="breakdown-pct">{Math.round(pct)}%</span>
                    </div>
                    <div className="breakdown-title" title={ticket.summary}>
                      {ticket.summary}
                    </div>
                    <div className="breakdown-meter">
                      <span style={{ width: clampPct(pct) }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-note">No worklogs synced for this week yet.</div>
          )}
        </div>
      </div>

      {showReviewAnalytics ? (
        <section className="review-summary-teaser" aria-label="Code review summary">
          <div className="review-summary-lead">
            <span className="review-summary-label">CODE REVIEW</span>
            {reviewResult ? (
              <>
                <strong>{formatDuration(reviewReport.peerReview.totalSeconds / 3600)}</strong>
                <span>review effort</span>
              </>
            ) : (
              <span className="review-summary-empty">No Bitbucket snapshot for this week</span>
            )}
          </div>
          {reviewResult ? (
            <div className="review-summary-facts">
              <div>
                <strong>{reviewReport.reviewedPullRequestCount}</strong>
                <span>PRs reviewed</span>
              </div>
              <div>
                <strong>{reviewReport.commentsByYou}</strong>
                <span>comments by you</span>
              </div>
              <div className="review-summary-origin">
                <strong>{formatReviewEffortOrigin(reviewReport.peerReview)}</strong>
                <span>not added to tracked time</span>
              </div>
            </div>
          ) : (
            <div className="review-summary-facts is-empty">
              Sync reviews from the Review screen to populate this read-only report.
            </div>
          )}
          <button type="button" className="review-summary-link" onClick={onOpenReviewReport}>
            View code review
          </button>
        </section>
      ) : null}
    </>
  );
};
