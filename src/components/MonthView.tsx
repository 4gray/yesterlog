import { Bookmark, Search, Sparkles } from "lucide-react";
import type { SavedRecap } from "../../shared/types";
import type { MonthState } from "../domain/month";
import { activitySegmentsFromHours } from "../domain/activity";
import { formatDuration, formatHours, fromLocalDateKey } from "../utils/date";
import { DayRing } from "./DayRing";
import { MonthNavigator } from "./MonthNavigator";
import { ProgressRing } from "./ProgressRing";

interface MonthViewProps {
  monthState: MonthState;
  onSelectWeek: (date: Date) => void;
  onPreviousMonth: () => void;
  onCurrentMonth: () => void;
  onNextMonth: () => void;
  savedRecaps?: SavedRecap[];
  onOpenRecap?: () => void;
  onOpenSavedRecap?: (saved: SavedRecap) => void;
}

export const MonthView = ({
  monthState,
  onSelectWeek,
  onPreviousMonth,
  onCurrentMonth,
  onNextMonth,
  savedRecaps = [],
  onOpenRecap = () => undefined,
  onOpenSavedRecap = () => undefined
}: MonthViewProps) => {
  const firstGapWeek = monthState.weeks.find((week) => week.days.some((day) => day.status === "gap"));

  const handleJumpToGap = () => {
    if (firstGapWeek) {
      onSelectWeek(fromLocalDateKey(firstGapWeek.weekKey));
    }
  };

  const pct =
    monthState.targetHours > 0 ? Math.min((monthState.trackedHours / monthState.targetHours) * 100, 100) : 0;
  const monthSavedRecaps = savedRecaps.filter((saved) => saved.version.interval.key === `month:${monthState.monthKey}`);

  return (
    <div className="view view-scroll month-view">
      <div className="month-header">
        <div className="week-headline">
          <ProgressRing pct={pct} ariaLabel={`${Math.round(pct)} percent of monthly target`} />
          <div>
            <div className="eyebrow">MONTH — {monthState.monthLabel}</div>
            <div className="month-figure-row">
              <div className="week-figure">
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
        </div>

        <div className="month-actions">
          <button type="button" className="calendar-recap-link" onClick={onOpenRecap}>
            <Sparkles size={14} />
            RECAP THIS MONTH
          </button>
          {monthSavedRecaps.length > 0 && (
            <button
              type="button"
              className="calendar-recap-marker"
              onClick={() => onOpenSavedRecap(monthSavedRecaps[0])}
              aria-label={`Open latest of ${monthSavedRecaps.length} saved recaps for this month`}
            >
              <Bookmark size={12} fill="currentColor" />
              {monthSavedRecaps.length}
            </button>
          )}
          {firstGapWeek && (
            <>
              <button type="button" className="month-gap-jump" onClick={handleJumpToGap}>
                <Search size={14} />
                JUMP TO NEXT GAP
              </button>
              <div className="week-divider" />
            </>
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
          {monthState.dayColumns.map((day) => (
            <span key={day.weekday} className="month-colhead-day">
              {day.label}
            </span>
          ))}
        </div>
        <div className="month-colhead-total">WEEK TOTAL</div>
      </div>

      <div className="month-weeks">
        {monthState.weeks.map((week) => {
          const weekSavedRecaps = savedRecaps.filter((saved) => saved.version.interval.key === `week:${week.weekKey}`);
          return (
          <div key={week.weekKey} className={`month-week ${week.isCurrent ? "is-current" : ""}`}>
            <div className="month-week-label">
              <span className={`month-week-name status-${week.status}`}>{week.label}</span>
              {week.isCurrent && <span className="month-week-now">NOW</span>}
              {weekSavedRecaps.length > 0 && (
                <button
                  type="button"
                  className="month-week-recap-marker"
                  onClick={() => onOpenSavedRecap(weekSavedRecaps[0])}
                  aria-label={`Open latest of ${weekSavedRecaps.length} saved recaps for ${week.label}`}
                >
                  <Bookmark size={11} fill="currentColor" />
                  {weekSavedRecaps.length}
                </button>
              )}
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
                    className={`month-day is-clickable has-ring status-${day.status}`}
                    onClick={() => onSelectWeek(fromLocalDateKey(day.dateKey))}
                    title={`${day.dateKey} — ${formatHours(day.trackedHours)} logged`}
                  >
                    <div className="month-day-info">
                      <span className="month-day-num">{day.dayNumber}</span>
                      <span className="month-day-hours">
                        {day.status === "today" ? "TODAY" : formatHours(day.trackedHours)}
                      </span>
                    </div>
                    <DayRing
                      className="month-day-ring"
                      segments={activitySegmentsFromHours({
                        ticket: day.ticketHours,
                        meeting: day.meetingHours,
                        fire: day.fireHours
                      })}
                      targetHours={day.targetHours || day.trackedHours}
                      size={44}
                      stroke={6}
                      gapDegrees={0}
                      trackColor="var(--line-soft)"
                      ariaLabel={`${formatHours(day.trackedHours)} logged`}
                    />
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
          );
        })}
      </div>

      <div className="month-legend">
        <span className="month-legend-item">
          <span className="ring-legend-dot" style={{ background: "var(--ring-ticket)" }} /> tickets
        </span>
        <span className="month-legend-item">
          <span className="ring-legend-dot" style={{ background: "var(--ring-meeting)" }} /> meetings
        </span>
        <span className="month-legend-item">
          <span className="ring-legend-dot" style={{ background: "var(--ring-fire)" }} /> firefighting
        </span>
        <span className="month-legend-divider" />
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
