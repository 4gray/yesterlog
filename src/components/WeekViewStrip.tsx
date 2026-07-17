import { SYNC_DOT_STATE, type AppSyncState } from "../app/syncStatus";
import { formatWeekRangeCompact } from "../utils/date";
import type { WeekViewMode } from "./useWeekViewMode";
import { WeekNavigator } from "./WeekNavigator";

export interface WeekViewStripProps {
  weekStart: Date;
  /** The week containing "now" — drives whether TODAY is offered. */
  currentWeekStart: Date;
  syncState: AppSyncState;
  /** Elapsed last-synced label, e.g. "SYNCED 2M AGO". */
  syncLabel: string;
  isConfigured: boolean;
  viewMode: WeekViewMode;
  onViewModeChange: (mode: WeekViewMode) => void;
  onSync: () => void;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
}

const VIEW_MODES: { mode: WeekViewMode; label: string; title: string }[] = [
  { mode: "summary", label: "SUMMARY", title: "Show compact day summaries" },
  { mode: "timeline", label: "TIMELINE", title: "Show days on a shared timeline" }
];

/**
 * Level 2 of the toolbar: the view controls, sitting directly above the grid
 * they drive. Week nav + TODAY on the left; sync status and the layout toggle
 * on the right.
 */
export const WeekViewStrip = ({
  weekStart,
  currentWeekStart,
  syncState,
  syncLabel,
  isConfigured,
  viewMode,
  onViewModeChange,
  onSync,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek
}: WeekViewStripProps) => {
  const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();

  return (
    <div className="week-strip">
      <WeekNavigator
        rangeLabel={formatWeekRangeCompact(weekStart)}
        showToday={!isCurrentWeek}
        onPreviousWeek={onPreviousWeek}
        onCurrentWeek={onCurrentWeek}
        onNextWeek={onNextWeek}
      />

      <div className="week-strip-right">
        <button
          type="button"
          className="week-strip-sync"
          onClick={onSync}
          disabled={syncState === "syncing" || !isConfigured}
          title={isConfigured ? "Click to sync now" : "Connect Jira in settings to sync"}
        >
          <span className={`sync-dot ${SYNC_DOT_STATE[syncState]}`} />
          {syncLabel}
        </button>

        <div className="week-view-switch" role="group" aria-label="Week view layout">
          {VIEW_MODES.map(({ mode, label, title }) => (
            <button
              key={mode}
              type="button"
              className={viewMode === mode ? "is-active" : ""}
              aria-pressed={viewMode === mode}
              title={title}
              onClick={() => onViewModeChange(mode)}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
