import { Search } from "lucide-react";
import type { MonthState } from "../domain/month";
import { formatDuration, formatHours, fromLocalDateKey } from "../utils/date";
import { MonthNavigator } from "./MonthNavigator";

interface MonthViewProps {
  monthState: MonthState;
  onSelectWeek: (date: Date) => void;
  onPreviousMonth: () => void;
  onCurrentMonth: () => void;
  onNextMonth: () => void;
}

const COLUMN_LABELS = ["MON", "TUE", "WED", "THU", "FRI"];

export const MonthView = ({
  monthState,
  onSelectWeek,
  onPreviousMonth,
  onCurrentMonth,
  onNextMonth
}: MonthViewProps) => {
  const firstGapWeek = monthState.weeks.find((week) => week.days.some((day) => day.status === "gap"));

  const handleJumpToGap = () => {
    if (firstGapWeek) {
      onSelectWeek(fromLocalDateKey(firstGapWeek.weekKey));
    }
  };

  return (
    <div className="view view-scroll month-view">
      <div className="month-header">
        <div>
          <div className="eyebrow">MONTH — {monthState.monthLabel}</div>
          <div className="month-figure-row">
            <div className="big-figure">
              {formatHours(monthState.trackedHours).replace("h", "")}
              <span className="unit">h / {formatHours(monthState.targetHours)}</span>
            </div>
            {monthState.gapCount > 0 ? (
              <span className="month-gap-badge">
                <span className="month-gap-dot" />
                {monthState.gapCount} {monthState.gapCount === 1 ? "gap" : "gaps"} · {monthState.hoursToFill}h to fill
              </span>
            ) : (
              monthState.targetHours > 0 && (
                <span className="month-gap-badge is-clear">
                  <span className="month-gap-dot" />
                  No gaps to fill
                </span>
              )
            )}
          </div>
        </div>

        <div className="month-actions">
          {firstGapWeek && (
            <button type="button" className="month-gap-jump" onClick={handleJumpToGap}>
              <Search size={14} />
              JUMP TO NEXT GAP
            </button>
          )}
          <MonthNavigator
            label={monthState.monthLabel}
            onPreviousMonth={onPreviousMonth}
            onCurrentMonth={onCurrentMonth}
            onNextMonth={onNextMonth}
          />
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">LOGGED</div>
          <div className="kpi-value">
            {formatHours(monthState.trackedHours).replace("h", "")}
            <span className="unit">h</span>
          </div>
          <div className="kpi-note">{monthState.loggedPct}% of month target</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">WEEKS ON TARGET</div>
          <div className="kpi-value">
            {monthState.weeksOnTarget} <span className="unit">/ {monthState.closedWeekCount}</span>
          </div>
          <div className={`kpi-note ${monthState.weeksOnTarget > 0 ? "is-green" : ""}`}>
            {monthState.firstMetWeekLabel
              ? `${monthState.firstMetWeekLabel} hit target`
              : "No full weeks yet"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">GAPS TO FILL</div>
          <div className={`kpi-value ${monthState.gapCount > 0 ? "is-amber" : ""}`}>{monthState.gapCount}</div>
          <div className="kpi-note">past days under {monthState.gapThresholdHours}h</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">AVG / FULL WEEK</div>
          <div className="kpi-value">{formatDuration(monthState.averageFullWeekHours)}</div>
          <div className="kpi-note">
            across {monthState.fullWeekCount} closed {monthState.fullWeekCount === 1 ? "week" : "weeks"}
          </div>
        </div>
      </div>

      <div className="month-colhead">
        <div className="month-colhead-spacer" />
        <div className="month-colhead-days">
          {COLUMN_LABELS.map((label) => (
            <span key={label} className="month-colhead-day">
              {label}
            </span>
          ))}
        </div>
        <div className="month-colhead-total">WEEK TOTAL</div>
      </div>

      <div className="month-weeks">
        {monthState.weeks.map((week) => (
          <div key={week.weekKey} className={`month-week ${week.isCurrent ? "is-current" : ""}`}>
            <div className="month-week-label">
              <span className={`month-week-name status-${week.status}`}>{week.label}</span>
              {week.isCurrent && <span className="month-week-now">NOW</span>}
            </div>

            <div className="month-week-days">
              {week.days.map((day) =>
                day.status === "other" ? (
                  <div key={day.dateKey} className="month-day is-other" aria-hidden="true" />
                ) : day.status === "future" ? (
                  <div key={day.dateKey} className="month-day is-future">
                    <div className="month-day-top">
                      <span className="month-day-num">{day.dayNumber}</span>
                    </div>
                    <div className="month-day-track">
                      <span className="month-day-fill" style={{ width: 0 }} />
                    </div>
                  </div>
                ) : (
                  <button
                    key={day.dateKey}
                    type="button"
                    className={`month-day is-clickable status-${day.status}`}
                    onClick={() => onSelectWeek(fromLocalDateKey(day.dateKey))}
                    title={`${day.dateKey} — ${formatHours(day.trackedHours)} logged`}
                  >
                    <div className="month-day-top">
                      <span className="month-day-num">{day.dayNumber}</span>
                      <span className="month-day-hours">
                        {day.status === "today" ? "TODAY" : formatHours(day.trackedHours)}
                      </span>
                    </div>
                    <div className="month-day-track">
                      <span className="month-day-fill" style={{ width: `${Math.max(day.fillPct, 4)}%` }} />
                    </div>
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              className={`month-week-total status-${week.status}`}
              onClick={() => onSelectWeek(fromLocalDateKey(week.weekKey))}
              title={`Open ${week.label} in the week view`}
            >
              <div className="month-week-range">{week.rangeLabel}</div>
              <div className="month-week-figures">
                <span className="month-week-total-num">{formatHours(week.trackedHours)}</span>
                <span className="month-week-total-target">/ {formatHours(week.targetHours)}</span>
                <span className="month-week-spacer" />
                <span className={`month-week-delta status-${week.status}`}>{week.deltaLabel}</span>
              </div>
              <div className="month-week-track">
                <span className="month-week-fill" style={{ width: `${week.fillPct}%` }} />
              </div>
            </button>
          </div>
        ))}
      </div>

      <div className="month-legend">
        <span className="month-legend-item">
          <span className="month-legend-swatch status-full" /> on target (≥{Math.round(monthState.gapThresholdHours + 1)}h)
        </span>
        <span className="month-legend-item">
          <span className="month-legend-swatch status-under" /> under target
        </span>
        <span className="month-legend-item">
          <span className="month-legend-swatch status-gap" /> gap — past day under {monthState.gapThresholdHours}h
        </span>
        <span className="month-legend-item">
          <span className="month-legend-swatch status-today" /> today
        </span>
        <span className="month-legend-item">
          <span className="month-legend-swatch is-dashed" /> upcoming / other month
        </span>
        <span className="month-legend-spacer" />
        <span className="month-legend-hint">CLICK ANY DAY → OPENS ITS WEEK</span>
      </div>
    </div>
  );
};
