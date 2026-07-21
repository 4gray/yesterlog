import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Check, CloudUpload, MessageSquare, Palmtree, Pencil, PenLine, Plus, Undo2 } from "lucide-react";
import type {
  DayTrackingSummary,
  JiraTicket,
  JiraWorklog,
  PersonalNote,
  RecurringEntry,
  SyncResult,
  WeekState
} from "../../shared/types";
import {
  formatDuration,
  formatHours,
  fromLocalDateKey,
  toLocalDateKey
} from "../utils/date";
import { formatShortcut } from "../utils/platform";
import { dayActivitySeconds } from "../domain/activity";
import {
  buildCommittedItems,
  minuteToLabel,
  overlapsCommitted,
  type CalendarItem
} from "../domain/dayCalendar";
import { getWorklogDisplaySeconds, getWorklogDisplayStarted } from "../domain/worklogAllocation";
import { ActiveWorkDock } from "./ActiveWorkDock";
import type { AddTimePrefill } from "./AddTimeModal";
import { buildDockColorMap, DOCK_PALETTE } from "./activeWork";
import { TimeSplit } from "./TimeSplit";
import { QuickLogSheet, type QuickLogContext } from "./QuickLogSheet";
import { TicketKeyLink } from "./TicketKeyLink";
import { useActiveWorkDrag, type DropTarget } from "./useActiveWorkDrag";
import { useActiveWorkDock } from "./useActiveWorkDock";
import { WeekHeader } from "./WeekHeader";
import { WeekTimeline } from "./WeekTimeline";
import { WeekViewStrip } from "./WeekViewStrip";
import type { WeekViewMode } from "./useWeekViewMode";
import type { RecurringMovePatch } from "../app/useRecurringActions";
import { resolveRelativeSyncLabel, type AppSyncState } from "../app/syncStatus";
import { getWeekBounds } from "../domain/week";
import {
  PendingRecurringCard,
  RecurringEntryRow,
  type RecurringConfirmPayload
} from "./WeekRecurringRows";

const LANE_HOURS = [0.5, 1, 2, 4] as const;

export interface DockLogPayload {
  issueKey: string;
  ticket: JiraTicket;
  timeSpentSeconds: number;
  startedISO: string;
  comment?: string;
}

interface WeekViewProps {
  weekState: WeekState;
  syncResult?: SyncResult;
  currentDate?: Date;
  timelineFocusTime?: string;
  timelineCenterOnNow?: boolean;
  isSyncing: boolean;
  isConfigured: boolean;
  syncState: AppSyncState;
  viewMode: WeekViewMode;
  onViewModeChange: (mode: WeekViewMode) => void;
  onOpenCommandPalette: () => void;
  dockTickets?: JiraTicket[];
  activeTicketCount?: number;
  isLogging?: boolean;
  onSync: () => void;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
  onAddTime: (date?: Date, prefill?: AddTimePrefill) => void;
  onMoveWorklog: (worklog: JiraWorklog, patch: { startedISO: string; timeSpentSeconds: number }) => Promise<boolean>;
  onMoveRecurring: (entry: RecurringEntry, patch: RecurringMovePatch) => Promise<boolean>;
  onEditWorklog: (worklog: JiraWorklog) => void;
  onEditPersonalNote: (note: PersonalNote) => void;
  onToggleSkipped: (dateKey: string) => void;
  onDockLog?: (payload: DockLogPayload) => Promise<boolean>;
  onConfirmRecurring?: (payload: RecurringConfirmPayload) => Promise<boolean> | void;
  onSkipRecurring?: (eventId: string, dateKey: string) => Promise<boolean> | void;
  onDeleteRecurring?: (eventId: string, dateKey: string) => Promise<boolean> | void;
}

interface QuickLogStartOptions {
  dateKey: string;
  currentDate: Date;
  timeSpentSeconds: number;
  startedMinutes?: number;
}

export const quickLogStartedAt = ({
  dateKey,
  currentDate,
  timeSpentSeconds,
  startedMinutes
}: QuickLogStartOptions) => {
  const started = fromLocalDateKey(dateKey);

  if (startedMinutes != null) {
    started.setHours(Math.floor(startedMinutes / 60), startedMinutes % 60, 0, 0);
    return started;
  }

  started.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);
  started.setTime(started.getTime() - timeSpentSeconds * 1000);
  return started;
};

interface QuickLogAvailabilityOptions extends QuickLogStartOptions {
  committedItems: CalendarItem[];
  timelineEndMinutes?: number;
}

export const isQuickLogIntervalAvailable = ({
  dateKey,
  currentDate,
  timeSpentSeconds,
  startedMinutes,
  committedItems,
  timelineEndMinutes
}: QuickLogAvailabilityOptions) => {
  const started = quickLogStartedAt({ dateKey, currentDate, timeSpentSeconds, startedMinutes });
  if (toLocalDateKey(started) !== dateKey) {
    return false;
  }

  const startMinutes = started.getHours() * 60 + started.getMinutes();
  const durationMinutes = Math.max(15, Math.round(timeSpentSeconds / 60));
  if (timelineEndMinutes != null && startMinutes + durationMinutes > timelineEndMinutes) {
    return false;
  }

  return !overlapsCommitted(startMinutes, startMinutes + durationMinutes, committedItems);
};

const PALETTE = [
  { seg: "#5b8cff", text: "#8fb0ff" },
  { seg: "#3bb7a8", text: "#6bd0c2" },
  { seg: "#9d7bf0", text: "#bda6f5" },
  { seg: "#e0a44a", text: "#edc488" },
  { seg: "#3ecf8e", text: "#7fe3b6" },
  { seg: "#e87f9b", text: "#f3a8bd" }
];

const pad = (value: number) => String(value).padStart(2, "0");
const hm = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

// Stable color per ticket key, assigned in order of first appearance this week.
const buildColorMap = (days: DayTrackingSummary[]) => {
  const map = new Map<string, (typeof PALETTE)[number]>();
  let index = 0;
  for (const day of days) {
    for (const issue of day.issues) {
      if (!map.has(issue.key)) {
        map.set(issue.key, PALETTE[index % PALETTE.length]);
        index += 1;
      }
    }
  }
  return map;
};

const DayColumn = ({
  day,
  todayKey,
  colorOf,
  worklogsByKey,
  onAddTime,
  onEditWorklog,
  onEditPersonalNote,
  onToggleSkipped,
  onConfirmRecurring,
  onSkipRecurring,
  onDeleteRecurring
}: {
  day: DayTrackingSummary;
  todayKey: string;
  colorOf: (key: string) => (typeof PALETTE)[number];
  worklogsByKey: Map<string, JiraWorklog[]>;
  onAddTime: (date?: Date) => void;
  onEditWorklog: (worklog: JiraWorklog) => void;
  onEditPersonalNote: (note: PersonalNote) => void;
  onToggleSkipped: (dateKey: string) => void;
  onConfirmRecurring?: (payload: RecurringConfirmPayload) => Promise<boolean> | void;
  onSkipRecurring?: (eventId: string, dateKey: string) => Promise<boolean> | void;
  onDeleteRecurring?: (eventId: string, dateKey: string) => Promise<boolean> | void;
}) => {
  const date = fromLocalDateKey(day.dateKey);
  const isFuture = day.dateKey > todayKey;
  const noteHours = day.personalNotes.reduce((sum, note) => sum + note.timeSpentSeconds / 3600, 0);
  const recurringHours = day.recurringEntries.reduce((sum, entry) => sum + entry.timeSpentSeconds / 3600, 0);
  const totalLogged = day.trackedHours;
  // Billable (Jira worklogs) vs local (meetings + firefighting) — the same axis
  // the day rings split on, surfaced as a glanceable "is it in Jira yet?" read.
  const activity = dayActivitySeconds(day);
  const billableHours = activity.ticket / 3600;
  const meetingHours = activity.meeting / 3600;
  const fireHours = activity.fire / 3600;
  const localHours = meetingHours + fireHours;
  const hasSplit = totalLogged > 0.01;
  const remaining = Math.max(day.targetHours - totalLogged, 0);
  const emptyColor = isFuture ? "var(--line-soft)" : "var(--line)";
  const canConfirmRecurring = Boolean(onConfirmRecurring && onSkipRecurring);
  const pendingRecurring = canConfirmRecurring ? day.pendingRecurring : [];
  const hasRows = day.issues.length > 0 || day.personalNotes.length > 0 || day.recurringEntries.length > 0;
  const canAddTime = day.isConfiguredWorkingDay && !day.isSkipped;

  const trackedClass =
    day.targetHours > 0 && day.trackedHours >= day.targetHours
      ? "is-complete"
      : day.trackedHours > 0
        ? "is-partial"
        : isFuture
          ? "is-future"
          : "is-empty";

  // Resolve each issue row's worklog/comment detail once so the hover popover
  // (rendered in a fixed portal to escape the scrollable log list) can look it up.
  const logEntries = day.issues.map((issue) => {
    const color = colorOf(issue.key);
    const logs = worklogsByKey.get(issue.key) ?? [];
    const comments = issue.comments?.length
      ? issue.comments
      : Array.from(new Set(logs.map((log) => log.comment).filter((comment): comment is string => Boolean(comment))));
    const range = logs.length
      ? `${hm(new Date(Math.min(...logs.map((log) => new Date(getWorklogDisplayStarted(log)).getTime()))))} — ${hm(
          new Date(Math.max(...logs.map((log) => new Date(getWorklogDisplayStarted(log)).getTime() + getWorklogDisplaySeconds(log) * 1000)))
        )}`
      : undefined;
    return { issue, color, logs, comments, range, hasPop: comments.length > 0 || logs.length > 1 };
  });

  const [pop, setPop] = useState<{ key: string; left: number; bottom: number } | null>(null);
  const openPop = (key: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const width = 248;
    const left = Math.min(Math.max(rect.left, 10), window.innerWidth - width - 10);
    const bottom = window.innerHeight - rect.top + 9;
    setPop({ key, left, bottom });
  };
  const closePop = () => setPop(null);
  const activeEntry = pop ? logEntries.find((entry) => entry.issue.key === pop.key && entry.hasPop) : undefined;

  // Billable-split detail, rendered in a fixed portal like the worklog popover
  // so it escapes the column's overflow:hidden clip.
  const [splitPop, setSplitPop] = useState<{ left: number; bottom: number } | null>(null);
  const openSplit = (anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const width = 244;
    const left = Math.min(Math.max(rect.left, 10), window.innerWidth - width - 10);
    const bottom = window.innerHeight - rect.top + 9;
    setSplitPop({ left, bottom });
  };
  const closeSplit = () => setSplitPop(null);

  return (
    <div
      data-drop-day={day.dateKey}
      className={`day-col ${day.isToday ? "is-today" : ""} ${isFuture ? "is-future" : ""} ${day.isSkipped ? "is-skipped" : ""}`}
    >
      <div className="day-col-head">
        <div>
          <div className="day-name">{day.isToday ? "TODAY" : day.weekdayName.slice(0, 3).toUpperCase()}</div>
          <div className="day-date">{date.getDate()}</div>
        </div>
        <div className="day-head-actions">
          {day.isConfiguredWorkingDay && (
            <button
              type="button"
              className="day-skip"
              onClick={() => onToggleSkipped(day.dateKey)}
              aria-pressed={day.isSkipped}
              title={day.isSkipped ? "Restore day" : "Mark as vacation"}
              aria-label={
                day.isSkipped ? `Restore ${day.weekdayName}` : `Mark ${day.weekdayName} as vacation`
              }
            >
              {day.isSkipped ? <Undo2 size={14} strokeWidth={2.1} /> : <Palmtree size={14} strokeWidth={2.1} />}
            </button>
          )}
          {canAddTime && (
            <button
              type="button"
              className={`day-add ${day.isToday ? "is-today" : ""}`}
              onClick={() => onAddTime(date)}
              title="Log time"
              aria-label={`Log time for ${day.weekdayName}`}
            >
              <Plus size={14} strokeWidth={day.isToday ? 2.6 : 2.3} />
            </button>
          )}
        </div>
      </div>

      {day.isSkipped ? (
        <div className="day-vacation">
          <Palmtree className="day-vacation-icon" size={48} strokeWidth={1.4} aria-hidden />
          <span className="day-vacation-label">OFF · VACATION</span>
        </div>
      ) : (
        <>
          <div
            className="day-track"
            tabIndex={hasSplit ? 0 : undefined}
            onMouseEnter={hasSplit ? (event) => openSplit(event.currentTarget) : undefined}
            onMouseLeave={hasSplit ? closeSplit : undefined}
            onFocus={hasSplit ? (event) => openSplit(event.currentTarget) : undefined}
            onBlur={hasSplit ? closeSplit : undefined}
            aria-label={
              hasSplit
                ? `${formatDuration(billableHours)} billable in Jira, ${formatDuration(localHours)} local`
                : undefined
            }
          >
            <div className="day-hours">
              <span className={`tracked ${trackedClass}`}>{formatHours(day.trackedHours)}</span>
              <span className="target">/ {formatHours(day.targetHours)}</span>
            </div>

            <div className="seg-bar">
              {day.issues.map((issue) => (
                <span
                  key={issue.key}
                  className="seg"
                  style={{ flexGrow: Math.max(issue.loggedSeconds / 3600, 0.001), background: colorOf(issue.key).seg }}
                />
              ))}
              {noteHours > 0.01 && <span className="seg is-local-note" style={{ flexGrow: noteHours }} />}
              {recurringHours > 0.01 && <span className="seg is-recurring" style={{ flexGrow: recurringHours }} />}
              {remaining > 0.01 && <span className="seg" style={{ flexGrow: remaining, background: emptyColor }} />}
              {totalLogged < 0.01 && <span className="seg" style={{ flexGrow: day.targetHours || 8, background: emptyColor }} />}
            </div>

            {hasSplit && <TimeSplit billableHours={billableHours} localHours={localHours} className="day-split" />}
          </div>

          {pendingRecurring.length > 0 && onConfirmRecurring && onSkipRecurring && (
            <div className="rec-pending-list">
              {pendingRecurring.map((pending) => (
                <PendingRecurringCard
                  key={`${pending.eventId}-${pending.dateKey}`}
                  pending={pending}
                  onConfirm={onConfirmRecurring}
                  onSkip={onSkipRecurring}
                />
              ))}
            </div>
          )}

          {hasRows ? (
            <div className="day-logs">
              {logEntries.map(({ issue, color, logs, comments, hasPop }) => (
                <div
                  className={`wl day-log ${comments.length ? "has-pop" : ""} ${
                    pop?.key === issue.key ? "is-popped" : ""
                  }`}
                  key={issue.key}
                  tabIndex={hasPop ? 0 : undefined}
                  onMouseEnter={hasPop ? (event) => openPop(issue.key, event.currentTarget) : undefined}
                  onMouseLeave={hasPop ? closePop : undefined}
                  onFocus={hasPop ? (event) => openPop(issue.key, event.currentTarget) : undefined}
                  onBlur={hasPop ? closePop : undefined}
                >
                  <div className="day-log-head">
                    <span className="seg-dot" style={{ background: color.seg }} />
                    <TicketKeyLink
                      issueKey={issue.key}
                      url={issue.url}
                      issueType={issue.issueType}
                      keyClassName="day-log-key"
                      style={{ color: color.text }}
                    />
                    <span className="day-log-spacer" />
                    {comments.length > 0 && <MessageSquare size={12} stroke="#6b7280" strokeWidth={1.8} />}
                    {logs.some((log) => log.allocation) && <span className="day-log-bulk">BULK</span>}
                    <span className="day-log-dur">{formatHours(issue.loggedSeconds / 3600)}</span>
                    <span className="day-log-action-slot">
                      {logs.length === 1 && (
                        <button
                          type="button"
                          className="day-log-edit"
                          onClick={() => onEditWorklog(logs[0])}
                          title="Edit worklog"
                          aria-label={`Edit worklog for ${issue.key}`}
                        >
                          <Pencil size={12} strokeWidth={2} />
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="day-log-summary">{issue.summary}</div>
                </div>
              ))}
              {day.personalNotes.map((note) => (
                <div className="day-note-row" key={note.id}>
                  <div className="day-log-head">
                    <PenLine size={12} stroke="var(--dim)" strokeWidth={1.9} />
                    <span className="local-note-label">NOTE</span>
                    <span className="day-log-spacer" />
                    <span className="day-log-dur">{formatDuration(note.timeSpentSeconds / 3600)}</span>
                    <span className="day-log-action-slot">
                      <button
                        type="button"
                        className="day-log-edit"
                        onClick={() => onEditPersonalNote(note)}
                        title="Edit personal note"
                        aria-label="Edit personal note"
                      >
                        <Pencil size={12} strokeWidth={2} />
                      </button>
                    </span>
                  </div>
                  {note.title?.trim() && <div className="day-note-title">{note.title}</div>}
                  <div className="day-note-text">{note.text}</div>
                </div>
              ))}
              {day.recurringEntries.map((entry) => (
                <RecurringEntryRow
                  key={`${entry.eventId}-${entry.dateKey}`}
                  entry={entry}
                  onSave={onConfirmRecurring}
                  onDelete={onDeleteRecurring}
                />
              ))}
              <div className="day-spacer" />
            </div>
          ) : pendingRecurring.length > 0 ? (
            <div className="day-spacer" />
          ) : day.isToday && day.isConfiguredWorkingDay ? (
            <>
              <div className="day-spacer" />
              <button type="button" className="day-cta" onClick={() => onAddTime(date)}>
                <span className="day-cta-title">
                  Log time
                  <br />
                  for today
                </span>
                <span className="kbd">{formatShortcut("K", { shift: true })}</span>
              </button>
            </>
          ) : isFuture ? (
            <>
              <div className="day-upcoming">UPCOMING</div>
              <div className="day-spacer" />
            </>
          ) : (
            <div className="day-spacer" />
          )}
        </>
      )}

      {activeEntry &&
        pop &&
        createPortal(
          <div className="wl-pop wl-pop-fixed" style={{ left: pop.left, bottom: pop.bottom }}>
            <div className="wl-pop-head">
              <span className="seg-dot" style={{ background: activeEntry.color.seg }} />
              <TicketKeyLink
                issueKey={activeEntry.issue.key}
                url={activeEntry.issue.url}
                issueType={activeEntry.issue.issueType}
                showJiraLink={false}
                keyClassName="day-log-key"
                style={{ color: activeEntry.color.text }}
              />
              <span className="day-log-spacer" />
              <span className="wl-pop-dur">{formatHours(activeEntry.issue.loggedSeconds / 3600)}</span>
            </div>
            <div className="wl-pop-summary">{activeEntry.issue.summary}</div>
            {activeEntry.range && <div className="wl-pop-range">{activeEntry.range}</div>}
            {activeEntry.logs.length > 0
              ? activeEntry.logs.map((log) => {
                  const start = new Date(log.started);
                  const end = new Date(start.getTime() + log.timeSpentSeconds * 1000);

                  return (
                    <div className="wl-pop-worklog" key={log.id}>
                      <div className="wl-pop-worklog-head">
                        <span>
                          {hm(start)}–{hm(end)} · {formatHours(log.timeSpentSeconds / 3600)}
                        </span>
                      </div>
                      {log.comment && (
                        <div className="wl-pop-comment">
                          <MessageSquare size={12} stroke="#5d636f" strokeWidth={1.7} />
                          <span>{log.comment}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              : activeEntry.comments.map((comment, index) => (
                  <div className="wl-pop-comment" key={`${activeEntry.issue.key}-comment-${index}`}>
                    <MessageSquare size={12} stroke="#5d636f" strokeWidth={1.7} />
                    <span>{comment}</span>
                  </div>
                ))}
          </div>,
          document.body
        )}

      {splitPop &&
        createPortal(
          <div className="split-pop wl-pop-fixed" style={{ left: splitPop.left, bottom: splitPop.bottom }}>
            <div className="split-pop-head">
              <span className="split-pop-title">
                {day.isToday ? "Today" : day.weekdayName} {date.getDate()}
              </span>
              <span className="split-pop-total">
                {formatHours(day.trackedHours)} / {formatHours(day.targetHours)}
              </span>
            </div>
            <div className="split-pop-row">
              <span className="split-pop-dot is-billable" />
              <span className="split-pop-label">
                Billable <em>in Jira</em>
              </span>
              <span className="split-pop-val">{formatDuration(billableHours)}</span>
            </div>
            <div className="split-pop-row">
              <span className="split-pop-dot is-local" />
              <span className="split-pop-label">
                Local <em>not synced</em>
              </span>
              <span className="split-pop-val is-local">{formatDuration(localHours)}</span>
            </div>
            {(meetingHours > 0.01 || fireHours > 0.01) && (
              <div className="split-pop-sub">
                {meetingHours > 0.01 && (
                  <span>
                    <span className="split-pop-dot is-meeting" />
                    Meetings {formatDuration(meetingHours)}
                  </span>
                )}
                {fireHours > 0.01 && (
                  <span>
                    <span className="split-pop-dot is-fire" />
                    Firefighting {formatDuration(fireHours)}
                  </span>
                )}
              </div>
            )}
            <div className={`split-pop-foot ${localHours > 0.01 ? "is-nudge" : "is-clear"}`}>
              {localHours > 0.01 ? (
                <>
                  <CloudUpload size={14} strokeWidth={1.9} />
                  <span>{formatDuration(localHours)} isn’t in Jira yet — log it to make the day fully billable.</span>
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={2.2} />
                  <span>Every tracked hour is in Jira.</span>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export const WeekView = ({
  weekState,
  syncResult,
  currentDate,
  timelineFocusTime,
  timelineCenterOnNow,
  isSyncing,
  isConfigured,
  syncState,
  viewMode,
  onViewModeChange,
  onOpenCommandPalette,
  dockTickets = [],
  activeTicketCount,
  isLogging = false,
  onSync,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek,
  onAddTime,
  onMoveWorklog,
  onMoveRecurring,
  onEditWorklog,
  onEditPersonalNote,
  onToggleSkipped,
  onDockLog,
  onConfirmRecurring,
  onSkipRecurring,
  onDeleteRecurring
}: WeekViewProps) => {
  const weekStart = fromLocalDateKey(weekState.weekKey);
  const now = currentDate ?? new Date();
  const todayKey = toLocalDateKey(now);
  const currentWeekStart = getWeekBounds(now).weekStart;
  // One label for both toolbar levels: the strip shows it, the header's sync
  // tooltip echoes it. `now` ticks, so "SYNCED 2M AGO" stays honest.
  const relativeSyncLabel = resolveRelativeSyncLabel(syncState, now, syncResult);
  const colorMap = buildColorMap(weekState.days);
  const colorOf = (key: string) => colorMap.get(key) ?? PALETTE[0];

  const { open: dockOpen, shownCount: dockShown, toggleOpen: toggleDock, loadMore: loadMoreDock } = useActiveWorkDock(
    dockTickets.length
  );
  const [quickLog, setQuickLog] = useState<QuickLogContext | null>(null);

  const dockColorMap = useMemo(() => buildDockColorMap(dockTickets), [dockTickets]);
  const dropDayMeta = useMemo(() => {
    const map = new Map<string, { droppable: boolean; label: string; shortLabel: string; blockedReason: string }>();
    for (const day of weekState.days) {
      const date = fromLocalDateKey(day.dateKey);
      const weekdayShort = day.weekdayName.slice(0, 3).toUpperCase();
      const monthShort = date.toLocaleString(undefined, { month: "short" }).toUpperCase();
      map.set(day.dateKey, {
        droppable: day.isConfiguredWorkingDay && !day.isSkipped && day.dateKey <= todayKey,
        label: `${weekdayShort} · ${date.getDate()} ${monthShort}`,
        shortLabel: `${weekdayShort} ${date.getDate()}`,
        blockedReason: day.isSkipped ? "vacation" : day.dateKey > todayKey ? "future day" : "non-working day"
      });
    }
    return map;
  }, [todayKey, weekState.days]);

  const committedByDay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildCommittedItems>>();
    for (const day of weekState.days) {
      const worklogs = syncResult?.daySummaries[day.dateKey]?.worklogs ?? [];
      map.set(day.dateKey, buildCommittedItems(worklogs, day.personalNotes, day.recurringEntries));
    }
    return map;
  }, [syncResult, weekState.days]);

  const isDroppable = useCallback(
    (dateKey: string, startedMinutes?: number, hours?: number, timelineEndMinutes?: number) => {
      if (!dropDayMeta.get(dateKey)?.droppable) {
        return false;
      }
      if (startedMinutes == null) {
        return true;
      }
      const durationMinutes = Math.max(15, Math.round((hours ?? 1) * 60));
      if (timelineEndMinutes != null && startedMinutes + durationMinutes > timelineEndMinutes) {
        return false;
      }
      return !overlapsCommitted(
        startedMinutes,
        startedMinutes + durationMinutes,
        committedByDay.get(dateKey) ?? []
      );
    },
    [committedByDay, dropDayMeta]
  );

  const handleDrop = useCallback(
    ({ ticket, dateKey, hours, startedMinutes, timelineEndMinutes }: DropTarget) => {
      const meta = dropDayMeta.get(dateKey);
      setQuickLog({
        ticketKey: ticket.key,
        ticketSummary: ticket.summary,
        dateKey,
        dayLabel: `${meta?.label ?? dateKey}${startedMinutes == null ? "" : ` · ${minuteToLabel(startedMinutes)}`}`,
        hours: hours || 1,
        startedMinutes,
        timelineEndMinutes,
        comment: ""
      });
    },
    [dropDayMeta]
  );

  const {
    dragging,
    hoverDay,
    hoverHours,
    hoverRect,
    hoverStartedMinutes,
    hoverSlotRect,
    isHoverBlocked,
    ghostRef,
    beginGrab
  } = useActiveWorkDrag({
    isDroppable,
    onDrop: handleDrop
  });

  const quickLogTicket = quickLog ? dockTickets.find((ticket) => ticket.key === quickLog.ticketKey) : undefined;
  const quickLogColor = quickLog
    ? dockColorMap.get(quickLog.ticketKey) ?? DOCK_PALETTE[0]
    : DOCK_PALETTE[0];
  const quickLogIntervalAvailable = quickLog
    ? Boolean(dropDayMeta.get(quickLog.dateKey)?.droppable) &&
      isQuickLogIntervalAvailable({
        dateKey: quickLog.dateKey,
        currentDate: now,
        timeSpentSeconds: Math.round(quickLog.hours * 3600),
        startedMinutes: quickLog.startedMinutes,
        committedItems: committedByDay.get(quickLog.dateKey) ?? [],
        timelineEndMinutes: quickLog.timelineEndMinutes
      })
    : true;
  const quickLogValidationMessage =
    quickLog && !quickLogIntervalAvailable
      ? "Choose a shorter duration or another time — this interval is unavailable."
      : undefined;

  const confirmQuickLog = useCallback(async () => {
    if (!quickLog || !quickLogTicket || !onDockLog || quickLogValidationMessage) {
      return;
    }
    const timeSpentSeconds = Math.round(quickLog.hours * 3600);
    const started = quickLogStartedAt({
      dateKey: quickLog.dateKey,
      currentDate: now,
      timeSpentSeconds,
      startedMinutes: quickLog.startedMinutes
    });
    const success = await onDockLog({
      issueKey: quickLogTicket.key,
      ticket: quickLogTicket,
      timeSpentSeconds,
      startedISO: started.toISOString(),
      comment: quickLog.comment.trim() || undefined
    });
    if (success) {
      setQuickLog(null);
    }
  }, [now, onDockLog, quickLog, quickLogTicket, quickLogValidationMessage]);

  const ghostColor = dragging ? dockColorMap.get(dragging.key) ?? DOCK_PALETTE[0] : DOCK_PALETTE[0];
  const hoverMeta = hoverDay ? dropDayMeta.get(hoverDay) : undefined;
  const hoverBlockedReason = hoverMeta?.droppable ? "occupied time" : hoverMeta?.blockedReason ?? "read-only";
  const showLanes = Boolean(viewMode === "summary" && dragging && hoverDay && hoverRect && !isHoverBlocked);
  const showTimelineSlot = Boolean(
    viewMode === "timeline" && dragging && hoverDay && hoverSlotRect && !isHoverBlocked
  );
  const showBlocked = Boolean(dragging && hoverDay && hoverRect && isHoverBlocked);
  const dropTagRect = viewMode === "timeline" && hoverSlotRect ? hoverSlotRect : hoverRect;

  return (
    <div className="view">
      <WeekHeader
        weekStart={weekStart}
        remainingWeekHours={weekState.remainingWeekHours}
        trackedWeekHours={weekState.trackedWeekHours}
        billableWeekHours={weekState.jiraTrackedWeekHours}
        weeklyTargetHours={weekState.weeklyTargetHours}
        isConfigured={isConfigured}
        syncState={syncState}
        syncLabel={relativeSyncLabel}
        onSync={onSync}
        onAddTime={onAddTime}
        onOpenCommandPalette={onOpenCommandPalette}
      />

      <WeekViewStrip
        weekStart={weekStart}
        currentWeekStart={currentWeekStart}
        syncState={syncState}
        syncLabel={relativeSyncLabel}
        isConfigured={isConfigured}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onSync={onSync}
        onPreviousWeek={onPreviousWeek}
        onCurrentWeek={onCurrentWeek}
        onNextWeek={onNextWeek}
      />

      {viewMode === "summary" ? (
        <div className={`week-grid ${weekState.days.length >= 6 ? "is-compact" : ""}`}>
          {weekState.days.map((day) => {
            const worklogsByKey = new Map<string, JiraWorklog[]>();
            for (const log of syncResult?.daySummaries[day.dateKey]?.worklogs ?? []) {
              const list = worklogsByKey.get(log.issueKey) ?? [];
              list.push(log);
              worklogsByKey.set(log.issueKey, list);
            }
            return (
              <DayColumn
                key={day.dateKey}
                day={day}
                todayKey={todayKey}
                colorOf={colorOf}
                worklogsByKey={worklogsByKey}
                onAddTime={onAddTime}
                onEditWorklog={onEditWorklog}
                onEditPersonalNote={onEditPersonalNote}
                onToggleSkipped={onToggleSkipped}
                onConfirmRecurring={onConfirmRecurring}
                onSkipRecurring={onSkipRecurring}
                onDeleteRecurring={onDeleteRecurring}
              />
            );
          })}
        </div>
      ) : (
        <WeekTimeline
          weekState={weekState}
          syncResult={syncResult}
          currentDate={now}
          todayKey={todayKey}
          timelineFocusTime={timelineFocusTime}
          timelineCenterOnNow={timelineCenterOnNow}
          onAddTime={onAddTime}
          onMoveWorklog={onMoveWorklog}
          onMoveRecurring={onMoveRecurring}
          onEditWorklog={onEditWorklog}
          onEditPersonalNote={onEditPersonalNote}
          onToggleSkipped={onToggleSkipped}
          onConfirmRecurring={onConfirmRecurring}
          onSkipRecurring={onSkipRecurring}
        />
      )}

      {dockTickets.length > 0 && onDockLog && (
        <ActiveWorkDock
          tickets={dockTickets}
          activeCount={activeTicketCount ?? dockTickets.length}
          open={dockOpen}
          shownCount={dockShown}
          draggingKey={dragging?.key ?? null}
          now={now}
          dragTarget={viewMode === "timeline" ? "timeline" : "day"}
          onToggleOpen={toggleDock}
          onLoadMore={loadMoreDock}
          onGrabCard={beginGrab}
        />
      )}

      {dragging && (
        <>
          <div
            ref={ghostRef}
            className="dock-ghost"
            style={{ transform: "translate(-9999px, -9999px)" }}
            aria-hidden="true"
          >
            <div className="dock-ghost-top">
              <span className="dock-card-dot" style={{ background: ghostColor.seg }} />
              <span className="dock-ghost-key" style={{ color: ghostColor.text }}>
                {dragging.key}
              </span>
            </div>
            <div className="dock-ghost-title">{dragging.summary}</div>
          </div>

          {showLanes && hoverRect && (
            <div
              className="drop-lanes"
              style={{ left: hoverRect.left, top: hoverRect.top, width: hoverRect.width, height: hoverRect.height }}
            >
              {LANE_HOURS.map((value) => (
                <div
                  key={value}
                  data-drop-day={hoverDay ?? ""}
                  data-drop-hours={value}
                  className={`drop-lane ${hoverHours === value ? "is-active" : ""}`}
                >
                  {value === 0.5 ? "0.5" : value}
                  <span className="drop-lane-unit">h</span>
                </div>
              ))}
            </div>
          )}

          {showTimelineSlot && hoverSlotRect && (
            <div
              className="timeline-drop-slot"
              style={{
                left: hoverSlotRect.left,
                top: hoverSlotRect.top,
                width: hoverSlotRect.width,
                height: hoverSlotRect.height
              }}
            >
              <span>{hoverStartedMinutes == null ? "1h" : `${minuteToLabel(hoverStartedMinutes)} · 1h`}</span>
            </div>
          )}

          {showBlocked && hoverRect && (
            <div
              className="drop-blocked"
              style={{ left: hoverRect.left, top: hoverRect.top, width: hoverRect.width, height: hoverRect.height }}
            >
              <div>
                <Ban size={20} strokeWidth={1.8} />
                <div className="drop-blocked-label">
                  Can’t log to {hoverMeta?.shortLabel ?? "this day"} — {hoverBlockedReason}
                </div>
              </div>
            </div>
          )}

          {dropTagRect && (viewMode === "summary" || isHoverBlocked) && (
            <div className="drop-tag" style={{ left: dropTagRect.left + 8, top: dropTagRect.top + 8 }}>
              {hoverMeta?.shortLabel}
              {viewMode === "timeline" && hoverStartedMinutes != null ? ` · ${minuteToLabel(hoverStartedMinutes)}` : ""}
            </div>
          )}
        </>
      )}

      {quickLog && (
        <QuickLogSheet
          context={quickLog}
          color={quickLogColor}
          isLogging={isLogging}
          validationMessage={quickLogValidationMessage}
          onChangeHours={(hours) => setQuickLog((current) => (current ? { ...current, hours } : current))}
          onChangeComment={(comment) => setQuickLog((current) => (current ? { ...current, comment } : current))}
          onCancel={() => setQuickLog(null)}
          onConfirm={confirmQuickLog}
        />
      )}
    </div>
  );
};
