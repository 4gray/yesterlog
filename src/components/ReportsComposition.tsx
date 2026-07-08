import { useMemo } from "react";
import type { WeekState } from "../../shared/types";
import { buildComposition } from "../domain/reportsInsights";
import { formatDuration } from "../utils/date";
import { LegendChip, ReportEmpty, ReportPageHeader, ReportPanel } from "./reportsShared";
import { WeekNavigator } from "./WeekNavigator";

interface ReportsCompositionProps {
  weekState: WeekState;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
}

const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    <circle cx="12" cy="12" r="4" />
  </svg>
);

export const ReportsComposition = ({
  weekState,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek
}: ReportsCompositionProps) => {
  const report = useMemo(() => buildComposition(weekState), [weekState]);
  const navigator = (
    <WeekNavigator onPreviousWeek={onPreviousWeek} onCurrentWeek={onCurrentWeek} onNextWeek={onNextWeek} />
  );

  const header = (
    <ReportPageHeader
      eyebrow="REPORTS — COMPOSITION"
      figure={report.invisiblePct}
      unit="% invisible"
      accent="var(--purple)"
      caption="reconstructed from tickets, meetings & notes"
      controls={navigator}
    />
  );

  if (!report.hasData) {
    return (
      <>
        {header}
        <div className="report-body">
          <ReportEmpty>No tracked time this week yet — log or sync work to see how the week split.</ReportEmpty>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="report-body">
        {/* Hero insight band */}
        <div className="report-hero is-purple">
          <div className="report-hero-lead">
            <div className="report-hero-title">
              {report.invisiblePct}% of your week was <span className="is-purple">invisible work</span>.
            </div>
            <div className="report-hero-sub">
              Meetings, review and firefighting that no timesheet would have caught — reconstructed from tickets, your
              calendar and personal notes.
            </div>
          </div>
          <div className="report-hero-figures">
            <div className="report-hero-figure">
              <div className="report-hero-num is-purple">{report.invisiblePct}%</div>
              <div className="report-hero-cap">invisible</div>
            </div>
            <div className="report-hero-figure">
              <div className="report-hero-num">{report.visiblePct}%</div>
              <div className="report-hero-cap">hands-on code</div>
            </div>
          </div>
        </div>

        <div className="report-columns">
          {/* Where the week went */}
          <ReportPanel className="is-wide" title={`WHERE THE WEEK WENT · ${formatDuration(report.totalHours)}`}>
            <div className="comp-hbar">
              {report.categories
                .filter((category) => category.hours > 0)
                .map((category) => (
                  <span key={category.key} style={{ width: `${category.pct}%`, background: category.color }} />
                ))}
            </div>
            <div className="comp-rows">
              {report.categories.map((category) => (
                <div className={`comp-row${category.hours <= 0 ? " is-zero" : ""}`} key={category.key}>
                  <span className="comp-row-dot" style={{ background: category.color }} />
                  <span className="comp-row-label">{category.label}</span>
                  <span className="comp-row-hours">{formatDuration(category.hours)}</span>
                  <span className="comp-row-pct">{Math.round(category.pct)}%</span>
                </div>
              ))}
            </div>
            {report.topInvisible ? (
              <div className="comp-footnote">
                <span className="comp-footnote-chip" style={{ color: "var(--purple)", background: "color-mix(in srgb, var(--purple) 14%, transparent)" }}>
                  <SparkleIcon />
                </span>
                <span>
                  {report.topInvisible.label} alone was{" "}
                  <b style={{ color: "var(--purple)" }}>{formatDuration(report.topInvisible.hours)}</b> — reconstructed,
                  and off every timesheet.
                </span>
              </div>
            ) : null}
          </ReportPanel>

          {/* Composition by day */}
          <ReportPanel
            title="COMPOSITION BY DAY"
            aux="share of visible vs invisible"
          >
            <div className="comp-days">
              {report.days.map((day) => {
                const isEmpty = day.totalHours <= 0;
                return (
                  <div className="comp-day-col" key={day.dateKey}>
                    <div className={`comp-day-bar${isEmpty ? " is-empty" : ""}`}>
                      {!isEmpty ? (
                        <>
                          <span className="comp-day-invisible" style={{ height: `${day.invisiblePct}%` }} />
                          <span className="comp-day-visible" style={{ height: `${100 - day.invisiblePct}%` }} />
                        </>
                      ) : null}
                    </div>
                    <span className={`comp-day-label${day.isWorst ? " is-worst" : ""}${day.isToday ? " is-today" : ""}`}>
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {report.worstDay && report.worstDay.totalHours > 0 ? (
              <div className="comp-footnote is-plain">
                <span className="is-worst-text">{report.worstDay.weekday}</span> was{" "}
                {Math.round(report.worstDay.invisiblePct)}% invisible — almost no code shipped.
              </div>
            ) : null}
          </ReportPanel>
        </div>
      </div>
    </>
  );
};
