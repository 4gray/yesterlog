import { Loader2, Plus, RotateCw } from "lucide-react";
import { formatHours, formatWeekRangeCompact, getIsoWeekNumber } from "../utils/date";
import { WeekNavigator } from "./WeekNavigator";

const RING_RADIUS = 33;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface WeekHeaderProps {
  weekStart: Date;
  remainingWeekHours: number;
  trackedWeekHours: number;
  weeklyTargetHours: number;
  isSyncing: boolean;
  isConfigured: boolean;
  onSync: () => void;
  onAddTime: () => void;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
}

export const WeekHeader = ({
  weekStart,
  remainingWeekHours,
  trackedWeekHours,
  weeklyTargetHours,
  isSyncing,
  isConfigured,
  onSync,
  onAddTime,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek
}: WeekHeaderProps) => {
  const weekNumber = getIsoWeekNumber(weekStart);
  const rangeLabel = formatWeekRangeCompact(weekStart);
  const pct = weeklyTargetHours > 0 ? Math.min((trackedWeekHours / weeklyTargetHours) * 100, 100) : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - pct / 100);

  return (
    <div className="week-header">
      <div className="week-headline">
        <div className="ring" aria-label={`${Math.round(pct)} percent of weekly target`}>
          <svg width="78" height="78" viewBox="0 0 78 78" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="39" cy="39" r={RING_RADIUS} fill="none" stroke="var(--line)" strokeWidth="7" />
            <circle
              cx="39"
              cy="39"
              r={RING_RADIUS}
              fill="none"
              stroke="var(--blue)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="ring-label">
            {Math.round(pct)}
            <span className="ring-pct">%</span>
          </div>
        </div>
        <div>
          <div className="eyebrow">
            WEEK {weekNumber} — {rangeLabel}
          </div>
          <div className="week-figure">
            {formatHours(remainingWeekHours)}
            <span className="unit"> left</span>
            <span className="week-figure-sub">
              {" "}
              · {formatHours(trackedWeekHours)} / {formatHours(weeklyTargetHours)}
            </span>
          </div>
        </div>
      </div>

      <div className="week-actions">
        <button
          type="button"
          className="sync-button"
          onClick={onSync}
          disabled={isSyncing || !isConfigured}
          title={isConfigured ? "Sync with Jira" : "Connect Jira in settings to sync"}
        >
          {isSyncing ? <Loader2 className="spin" size={14} /> : <RotateCw size={14} strokeWidth={2} />}
          SYNC
        </button>
        <button type="button" className="add-time-button" onClick={() => onAddTime()}>
          <Plus size={14} strokeWidth={2.6} />
          ADD TIME
        </button>
        <div className="week-divider" />
        <WeekNavigator
          onPreviousWeek={onPreviousWeek}
          onCurrentWeek={onCurrentWeek}
          onNextWeek={onNextWeek}
        />
      </div>
    </div>
  );
};
