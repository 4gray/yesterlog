import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { DayTrackingSummary, JiraEpicInfo, JiraIssueTypeInfo, WeekState } from "../../shared/types";
import {
  buildReportsHistory,
  MIN_TREND_WEEKS,
  type CompositionWeek,
  type KpiDelta,
  type TrendPoint
} from "../domain/reportsTrend";
import { formatDuration, formatHours, fromLocalDateKey, getIsoWeekNumber } from "../utils/date";
import { ProgressRing } from "./ProgressRing";
import { TicketKeyLink } from "./TicketKeyLink";
import { WeekNavigator } from "./WeekNavigator";

interface ReportsViewProps {
  weekState: WeekState;
  /** Trailing window of weeks (ascending, ending at weekState) for trends. */
  weekStates?: WeekState[];
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
}

type CompositionMode = "absolute" | "share";

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

const TrendChart = ({ points }: { points: TrendPoint[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; index: number } | null>(null);

  const geo = useMemo(() => {
    const vbW = 720;
    const vbH = 260;
    const padX = 14;
    const padT = 28;
    const padB = 30;
    const maxY = Math.max(1, ...points.map((point) => Math.max(point.trackedHours, point.targetHours))) * 1.12;
    const stepX = points.length > 1 ? (vbW - padX * 2) / (points.length - 1) : 0;
    const x = (index: number) => padX + index * stepX;
    const y = (value: number) => padT + (vbH - padT - padB) * (1 - value / maxY);
    return {
      vbW,
      vbH,
      stepX,
      trackedLine: points.map((point, index) => `${x(index).toFixed(1)},${y(point.trackedHours).toFixed(1)}`).join(" "),
      targetLine: points.map((point, index) => `${x(index).toFixed(1)},${y(point.targetHours).toFixed(1)}`).join(" "),
      dots: points.map((point, index) => ({
        ...point,
        cx: x(index),
        cy: y(point.trackedHours)
      }))
    };
  }, [points]);

  const moveTo = (index: number, event: ReactMouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, index });
  };
  const clear = () => setHover(null);
  const active = hover ? geo.dots[hover.index] : undefined;

  return (
    <div className="trend-chart" ref={containerRef}>
      <svg className="trend-svg" viewBox={`0 0 ${geo.vbW} ${geo.vbH}`} role="img" aria-label="Tracked hours per week against target">
        <polyline className="trend-target" points={geo.targetLine} />
        <polyline className="trend-line" points={geo.trackedLine} />
        {active ? <line className="trend-guide" x1={active.cx} y1={0} x2={active.cx} y2={geo.vbH} /> : null}
        {geo.dots.map((dot, index) => (
          <circle
            key={dot.weekKey}
            className={`trend-dot ${dot.onTarget ? "is-on" : "is-under"} ${dot.isCurrent ? "is-current" : ""} ${hover?.index === index ? "is-hover" : ""}`}
            cx={dot.cx}
            cy={dot.cy}
            r={hover?.index === index ? 9 : dot.isCurrent ? 8 : 6}
          />
        ))}
        {geo.dots.map((dot, index) => (
          <rect
            key={`hit-${dot.weekKey}`}
            className="trend-hit"
            x={dot.cx - (geo.stepX || geo.vbW) / 2}
            y={0}
            width={geo.stepX || geo.vbW}
            height={geo.vbH}
            onMouseEnter={(event) => moveTo(index, event)}
            onMouseMove={(event) => moveTo(index, event)}
            onMouseLeave={clear}
          />
        ))}
      </svg>
      {hover && active ? (
        <div className="chart-tip" style={{ left: hover.x, top: hover.y }}>
          <div className="chart-tip-title">{active.label}</div>
          <div className="chart-tip-row">
            <span className="tip-swatch is-tracked" />
            <span className="tip-label">Tracked</span>
            <b>{formatHours(active.trackedHours)}</b>
          </div>
          <div className="chart-tip-row">
            <span className="tip-swatch is-target" />
            <span className="tip-label">Target</span>
            <b>{formatHours(active.targetHours)}</b>
          </div>
          <div className={`chart-tip-foot ${active.onTarget ? "is-on" : "is-under"}`}>
            {active.onTarget
              ? "on target"
              : `${formatHours(Math.max(active.targetHours - active.trackedHours, 0))} under target`}
          </div>
        </div>
      ) : null}
      <div className="trend-axis">
        {points.map((point, index) => (
          <span
            key={point.weekKey}
            className={`${point.isCurrent ? "is-current" : ""} ${hover?.index === index ? "is-hover" : ""}`}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
};

const COMPOSITION_ROWS = [
  { key: "ticket", className: "seg-ticket", label: "Tickets", pick: (week: CompositionWeek) => week.ticketHours },
  { key: "meeting", className: "seg-meeting", label: "Meetings", pick: (week: CompositionWeek) => week.meetingHours },
  { key: "fire", className: "seg-fire", label: "Firefighting", pick: (week: CompositionWeek) => week.fireHours }
] as const;

const CompositionStrip = ({
  weeks,
  mode
}: {
  weeks: CompositionWeek[];
  mode: CompositionMode;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; week: CompositionWeek } | null>(null);
  const scaleMax = Math.max(1, ...weeks.map((week) => week.totalHours));

  const moveTo = (week: CompositionWeek, event: ReactMouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, week });
  };
  const clear = () => setHover(null);

  return (
    <div className="comp-chart" ref={containerRef}>
      {weeks.map((week) => {
        const denom = mode === "share" ? week.totalHours || 1 : scaleMax;
        const isHover = hover?.week.weekKey === week.weekKey;
        return (
          <div
            className={`comp-col ${week.isCurrent ? "is-current" : ""} ${isHover ? "is-hover" : ""}`}
            key={week.weekKey}
            onMouseEnter={(event) => moveTo(week, event)}
            onMouseMove={(event) => moveTo(week, event)}
            onMouseLeave={clear}
          >
            <div className="comp-bar">
              {COMPOSITION_ROWS.map((row) => (
                <span
                  key={row.key}
                  className={row.className}
                  style={{ height: `${(row.pick(week) / denom) * 100}%` }}
                />
              ))}
            </div>
            <span className="comp-day">{week.label}</span>
          </div>
        );
      })}
      {hover ? (
        <div className="chart-tip" style={{ left: hover.x, top: hover.y }}>
          <div className="chart-tip-title">
            {hover.week.label} · {formatHours(hover.week.totalHours)}
          </div>
          {COMPOSITION_ROWS.map((row) => {
            const hours = row.pick(hover.week);
            const pct = hover.week.totalHours > 0 ? Math.round((hours / hover.week.totalHours) * 100) : 0;
            return (
              <div className="chart-tip-row" key={row.key}>
                <span className={`tip-swatch ${row.className}`} />
                <span className="tip-label">{row.label}</span>
                <b>{formatHours(hours)}</b>
                <span className="tip-pct">{pct}%</span>
              </div>
            );
          })}
        </div>
      ) : null}
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

export const ReportsView = ({ weekState, weekStates, onPreviousWeek, onCurrentWeek, onNextWeek }: ReportsViewProps) => {
  const weekStart = fromLocalDateKey(weekState.weekKey);
  const weekNumber = getIsoWeekNumber(weekStart);
  const dailyTarget = weekState.dailyTargetHours;
  const chartTarget = dailyTarget || 8;
  const targetDayCount = weekState.days.length;
  const [compositionMode, setCompositionMode] = useState<CompositionMode>("absolute");

  const history = useMemo(
    () =>
      weekStates && weekStates.length > 0
        ? buildReportsHistory(weekStates, weekState.weekKey)
        : undefined,
    [weekStates, weekState.weekKey]
  );
  const deltas = history?.deltas;

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
  const targetPct =
    weekState.weeklyTargetHours > 0 ? Math.min((total / weekState.weeklyTargetHours) * 100, 100) : 0;

  return (
    <div className="view view-scroll">
      <div className="reports-header">
        <div className="week-headline">
          <ProgressRing pct={targetPct} ariaLabel={`${Math.round(targetPct)} percent of weekly target`} />
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
          </div>
        </div>

        <div className="reports-actions">
          <WeekNavigator
            onPreviousWeek={onPreviousWeek}
            onCurrentWeek={onCurrentWeek}
            onNextWeek={onNextWeek}
          />
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
          <div className="chart-panel">
            <div className="panel-head">
              <span className="label-mono">HOURS PER DAY</span>
              <span className="panel-aux">TARGET {formatHours(dailyTarget)}</span>
            </div>
            <DayChart days={weekState.days} chartTarget={chartTarget} />
          </div>

          {history ? (
            history.hasBaseline ? (
              <>
                <div className="trend-panel">
                  <div className="panel-head">
                    <span className="label-mono">WEEK OVER WEEK</span>
                    <span className="panel-aux">{history.trend.length} WEEKS · TRACKED VS TARGET</span>
                  </div>
                  <TrendChart points={history.trend} />
                </div>

                <div className="comp-panel">
                  <div className="panel-head">
                    <span className="label-mono">COMPOSITION</span>
                    <div className="comp-toggle">
                      <button
                        type="button"
                        className={compositionMode === "absolute" ? "is-active" : ""}
                        onClick={() => setCompositionMode("absolute")}
                      >
                        HOURS
                      </button>
                      <button
                        type="button"
                        className={compositionMode === "share" ? "is-active" : ""}
                        onClick={() => setCompositionMode("share")}
                      >
                        SHARE
                      </button>
                    </div>
                  </div>
                  <CompositionStrip weeks={history.composition} mode={compositionMode} />
                  <div className="comp-legend">
                    <span className="comp-legend-item">
                      <span className="comp-swatch seg-ticket" /> Tickets
                    </span>
                    <span className="comp-legend-item">
                      <span className="comp-swatch seg-meeting" /> Meetings
                    </span>
                    <span className="comp-legend-item">
                      <span className="comp-swatch seg-fire" /> Firefighting
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="reports-trends is-baseline">
                <div className="empty-note">
                  Building baseline — {history.populatedWeeks} of {MIN_TREND_WEEKS} weeks tracked. Week-over-week
                  trends appear once more weeks have data.
                </div>
              </div>
            )
          ) : null}
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
    </div>
  );
};
