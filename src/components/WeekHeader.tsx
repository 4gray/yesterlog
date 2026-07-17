import { Loader2, Plus, RotateCw } from "lucide-react";
import { formatHours, formatWeekRangeCompact, getIsoWeekNumber } from "../utils/date";
import { formatShortcut } from "../utils/platform";
import { CommandBar } from "./CommandBar";
import { ProgressRing } from "./ProgressRing";
import { TimeSplit } from "./TimeSplit";
import { SYNC_DOT_STATE, type AppSyncState } from "../app/syncStatus";

export interface WeekHeaderProps {
  weekStart: Date;
  remainingWeekHours: number;
  trackedWeekHours: number;
  /** Jira-synced (billable) hours this week; the rest of `trackedWeekHours` is local. */
  billableWeekHours: number;
  weeklyTargetHours: number;
  isConfigured: boolean;
  syncState: AppSyncState;
  /** Elapsed last-synced label, e.g. "SYNCED 2M AGO" — shown in the sync tooltip. */
  syncLabel: string;
  onSync: () => void;
  onAddTime: () => void;
  onOpenCommandPalette: () => void;
}

export const WeekHeader = ({
  weekStart,
  remainingWeekHours,
  trackedWeekHours,
  billableWeekHours,
  weeklyTargetHours,
  isConfigured,
  syncState,
  syncLabel,
  onSync,
  onAddTime,
  onOpenCommandPalette
}: WeekHeaderProps) => {
  const weekNumber = getIsoWeekNumber(weekStart);
  const rangeLabel = formatWeekRangeCompact(weekStart);
  const pct = weeklyTargetHours > 0 ? Math.min((trackedWeekHours / weeklyTargetHours) * 100, 100) : 0;
  // Derived from syncState, not a narrower isSyncing flag, so the icon can never
  // sit idle while the strip two rows down reports SYNCING….
  const isSyncing = syncState === "syncing";
  const syncTitle = isConfigured ? `Sync now · ${syncLabel.toLowerCase()}` : "Connect Jira in settings to sync";

  return (
    <div className="week-header">
      <div className="week-headline">
        <ProgressRing
          pct={pct}
          size={52}
          radius={22}
          stroke={4}
          className="is-compact"
          ariaLabel={`${Math.round(pct)} percent of weekly target`}
        />
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
          {trackedWeekHours > 0.01 && (
            <TimeSplit
              billableHours={billableWeekHours}
              localHours={Math.max(trackedWeekHours - billableWeekHours, 0)}
              size="lg"
              className="week-split"
            />
          )}
        </div>
      </div>

      <div className="week-actions">
        <CommandBar onOpen={onOpenCommandPalette} shortcutLabel={formatShortcut("K")} />
        <button
          type="button"
          className="sync-button"
          onClick={onSync}
          disabled={isSyncing || !isConfigured}
          title={syncTitle}
          aria-label={syncTitle}
        >
          {isSyncing ? <Loader2 className="spin" size={14} /> : <RotateCw size={14} strokeWidth={2} />}
          <span className={`sync-dot ${SYNC_DOT_STATE[syncState]}`} />
        </button>
        <button type="button" className="add-time-button" onClick={() => onAddTime()}>
          <Plus size={13} strokeWidth={2.4} />
          ADD TIME
        </button>
      </div>
    </div>
  );
};
