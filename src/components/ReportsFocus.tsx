import { useMemo } from "react";
import type { WeekState } from "../../shared/types";
import { buildFocus, type FocusRating } from "../domain/reportsInsights";
import { LegendChip, ReportEmpty, ReportInsight, ReportPageHeader, ReportPanel, formatMinutes } from "./reportsShared";
import { WeekNavigator } from "./WeekNavigator";

interface ReportsFocusProps {
  weekState: WeekState;
  weekStates?: WeekState[];
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
}

const RATING_TONE: Record<FocusRating, string> = {
  best: "is-good",
  good: "is-good",
  fair: "is-fair",
  choppy: "is-bad",
  none: "is-none"
};

const RATING_LABEL: Record<FocusRating, string> = {
  best: "best",
  good: "good",
  fair: "fair",
  choppy: "choppy",
  none: "—"
};

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
);

export const ReportsFocus = ({
  weekState,
  weekStates,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek
}: ReportsFocusProps) => {
  const report = useMemo(() => {
    const index = weekStates?.findIndex((week) => week.weekKey === weekState.weekKey) ?? -1;
    const previous = index > 0 ? weekStates?.[index - 1] : undefined;
    return buildFocus(weekState, previous);
  }, [weekState, weekStates]);

  const navigator = (
    <WeekNavigator onPreviousWeek={onPreviousWeek} onCurrentWeek={onCurrentWeek} onNextWeek={onNextWeek} />
  );
  const header = (
    <ReportPageHeader
      eyebrow="REPORTS — FOCUS"
      figure={report.deepSharePct}
      unit="% deep work"
      caption="the shape of the hours, not the sum"
      controls={navigator}
    />
  );

  if (!report.hasData) {
    return (
      <>
        {header}
        <div className="report-body">
          <ReportEmpty>No tracked time this week yet — log or sync work to see how focused it was.</ReportEmpty>
        </div>
      </>
    );
  }

  const switchesDelta = report.switchesDelta;

  return (
    <>
      {header}

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">LONGEST FOCUS BLOCK</div>
          <div className="kpi-value is-green">{formatMinutes(report.longestBlockMinutes)}</div>
          <div className="kpi-note">{report.longestBlockDayLabel ? `${report.longestBlockDayLabel} was deepest` : "—"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">DEEP-WORK SHARE</div>
          <div className="kpi-value">
            {report.deepSharePct}
            <span className="unit">%</span>
          </div>
          <div className="kpi-note">blocks ≥ 45 min</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">CONTEXT SWITCHES</div>
          <div className="kpi-value">
            {report.contextSwitches}
            {switchesDelta !== undefined && switchesDelta !== 0 ? (
              <span className={`kpi-inline-delta ${switchesDelta > 0 ? "is-bad" : "is-good"}`}>
                {switchesDelta > 0 ? "▲" : "▼"} {switchesDelta > 0 ? "+" : "−"}
                {Math.abs(switchesDelta)}
              </span>
            ) : null}
          </div>
          <div className="kpi-note">avg {report.avgSwitchesPerDay} / day</div>
        </div>
      </div>

      <div className="report-body">
        <ReportPanel
          title="DAILY FOCUS TIMELINE"
          legend={
            <>
              <LegendChip color="var(--blue)">deep block</LegendChip>
              <LegendChip color="var(--purple)">shallow / switch</LegendChip>
              <LegendChip outline>gap</LegendChip>
            </>
          }
        >
          <div className="focus-rows">
            {report.days.map((day) => (
              <div className="focus-row" key={day.dateKey}>
                <span className={`focus-row-day${day.isWorst ? " is-worst" : ""}${day.isToday ? " is-today" : ""}`}>
                  {day.label}
                </span>
                <div className="focus-strip">
                  {day.segments.length > 0 ? (
                    day.segments.map((segment, index) => (
                      <span
                        key={index}
                        className={`focus-seg is-${segment.kind}`}
                        style={{ width: `${segment.pct}%` }}
                      />
                    ))
                  ) : (
                    <span className="focus-seg is-gap" style={{ width: "100%" }} />
                  )}
                </div>
                <span className={`focus-rating ${RATING_TONE[day.rating]}`}>{RATING_LABEL[day.rating]}</span>
              </div>
            ))}
          </div>
        </ReportPanel>

        {report.worstDay && report.worstDay.activeMinutes > 0 ? (
          <ReportInsight accent="var(--amber)" icon={<AlertIcon />}>
            <span className="report-insight-strong">{report.worstDay.weekday}</span> was your most fragmented day —{" "}
            {report.worstDay.switches} context switches, longest block just {formatMinutes(report.worstDay.longestMinutes)}.
            Worth protecting a morning.
          </ReportInsight>
        ) : null}
      </div>
    </>
  );
};
