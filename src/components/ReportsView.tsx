import { useMemo } from "react";
import type { JiraEpicInfo, JiraIssueTypeInfo, WeekState } from "../../shared/types";
import { formatDuration, formatHours, fromLocalDateKey, getIsoWeekNumber } from "../utils/date";
import { TicketKeyLink } from "./TicketKeyLink";

interface ReportsViewProps {
  weekState: WeekState;
  onCurrentWeek: () => void;
}

const clampPct = (value: number) => `${Math.min(Math.max(value, 0), 100)}%`;

const buildCsv = (weekState: WeekState) => {
  const rows: string[] = ["Date,Weekday,Issue,Summary,Hours"];
  for (const day of weekState.days) {
    if (day.issues.length === 0 && day.personalNotes.length === 0) {
      continue;
    }
    for (const issue of day.issues) {
      const summary = `"${issue.summary.replace(/"/g, '""')}"`;
      rows.push([day.dateKey, day.weekdayName, issue.key, summary, (issue.loggedSeconds / 3600).toFixed(2)].join(","));
    }
    for (const note of day.personalNotes) {
      const summary = `"${note.text.replace(/"/g, '""')}"`;
      rows.push([day.dateKey, day.weekdayName, "LOCAL-NOTE", summary, (note.timeSpentSeconds / 3600).toFixed(2)].join(","));
    }
  }
  return rows.join("\n");
};

export const ReportsView = ({ weekState, onCurrentWeek }: ReportsViewProps) => {
  const weekStart = fromLocalDateKey(weekState.weekKey);
  const weekNumber = getIsoWeekNumber(weekStart);
  const dailyTarget = weekState.dailyTargetHours || 8;

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
    let localNoteHours = 0;
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
      localNoteHours += day.personalNotes.reduce((sum, note) => sum + note.timeSpentSeconds / 3600, 0);
    }

    if (localNoteHours > 0) {
      byTicket.set("LOCAL-NOTE", {
        key: "LOCAL",
        summary: "Personal notes",
        hours: localNoteHours,
        isLocal: true
      });
    }
    const tickets = [...byTicket.values()].sort((a, b) => b.hours - a.hours);

    const projects = new Set(tickets.filter((ticket) => !ticket.isLocal).map((ticket) => ticket.key.split("-")[0]));

    return {
      dailyAverage: activeDays.length > 0 ? weekState.trackedWeekHours / activeDays.length : 0,
      activeDayCount: activeDays.length,
      completeDayCount: completeDays.length,
      firstCompleteName: firstComplete?.weekdayName,
      ticketCount: tickets.length,
      projectCount: projects.size,
      tickets
    };
  }, [weekState]);

  const total = weekState.trackedWeekHours;
  const remaining = weekState.weeklyTargetHours - total;
  const billablePct = total > 0 ? Math.round((weekState.jiraTrackedWeekHours / total) * 100) : 0;

  const handleExport = () => {
    const blob = new Blob([buildCsv(weekState)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stint-week-${weekState.weekKey}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view view-scroll">
      <div className="reports-header">
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

        <div className="reports-actions">
          <button type="button" className="pill" onClick={onCurrentWeek}>
            THIS WEEK
          </button>
          <button type="button" className="pill" onClick={handleExport}>
            EXPORT CSV
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">DAILY AVERAGE</div>
          <div className="kpi-value">{formatDuration(stats.dailyAverage)}</div>
          <div className="kpi-note">across {stats.activeDayCount} active days</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">DAYS ON TARGET</div>
          <div className="kpi-value">
            {stats.completeDayCount} <span className="unit">/ 5</span>
          </div>
          <div className={`kpi-note ${stats.completeDayCount > 0 ? "is-green" : ""}`}>
            {stats.firstCompleteName ? `${stats.firstCompleteName} hit target` : "No full days yet"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">TICKETS TOUCHED</div>
          <div className="kpi-value">{stats.ticketCount}</div>
          <div className="kpi-note">across {stats.projectCount || 0} projects</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">BILLABLE</div>
          <div className="kpi-value">
            {billablePct}
            <span className="unit">%</span>
          </div>
          <div className="kpi-note">
            {formatHours(weekState.jiraTrackedWeekHours)} Jira of {formatHours(total)}
          </div>
        </div>
      </div>

      <div className="reports-body">
        <div className="chart-panel">
          <div className="panel-head">
            <span className="label-mono">HOURS PER DAY</span>
            <span className="panel-aux">TARGET {formatHours(dailyTarget)}</span>
          </div>
          <div className="chart">
            <div className="chart-target-line" />
            {weekState.days.map((day) => {
              const isComplete = day.targetHours > 0 && day.trackedHours >= day.targetHours;
              const isEmpty = day.trackedHours <= 0;
              const heightPct = clampPct((day.trackedHours / dailyTarget) * 100);
              return (
                <div className="chart-col" key={day.dateKey}>
                  <div
                    className={`chart-bar ${isComplete ? "is-complete" : ""} ${isEmpty ? "is-empty" : ""}`}
                    style={{ height: isEmpty ? 4 : heightPct }}
                  />
                  <span className={`chart-val ${isEmpty ? "is-dim" : ""}`}>{formatHours(day.trackedHours)}</span>
                  <span className={`chart-day ${day.isToday ? "is-today" : ""}`}>
                    {day.weekdayName.slice(0, 3).toUpperCase()}
                  </span>
                </div>
              );
            })}
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
    </div>
  );
};
