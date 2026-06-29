import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, MessageSquare, Pencil, PenLine, Plus } from "lucide-react";
import type {
  DayTrackingSummary,
  JiraTicket,
  JiraWorklog,
  PersonalNote,
  SyncResult,
  WeekState
} from "../../shared/types";
import {
  formatDuration,
  formatHours,
  fromLocalDateKey,
  toLocalDateKey
} from "../utils/date";
import { ActiveWorkDock } from "./ActiveWorkDock";
import { buildDockColorMap, DOCK_PALETTE } from "./activeWork";
import { QuickLogSheet, type QuickLogContext } from "./QuickLogSheet";
import { TicketKeyLink } from "./TicketKeyLink";
import { useActiveWorkDrag, type DropTarget } from "./useActiveWorkDrag";
import { WeekHeader } from "./WeekHeader";
import {
  PendingRecurringCard,
  RecurringEntryRow,
  type RecurringConfirmPayload
} from "./WeekRecurringRows";

const DOCK_OPEN_STORAGE_KEY = "timebro-active-dock";
const DOCK_INITIAL_SHOWN = 6;
const DOCK_PAGE_SIZE = 4;
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
  isSyncing: boolean;
  isConfigured: boolean;
  dockTickets?: JiraTicket[];
  activeTicketCount?: number;
  isLogging?: boolean;
  onSync: () => void;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
  onAddTime: (date?: Date) => void;
  onEditWorklog: (worklog: JiraWorklog) => void;
  onEditPersonalNote: (note: PersonalNote) => void;
  onToggleSkipped: (dateKey: string) => void;
  onDockLog?: (payload: DockLogPayload) => Promise<boolean>;
  onConfirmRecurring?: (payload: RecurringConfirmPayload) => Promise<boolean> | void;
  onSkipRecurring?: (eventId: string, dateKey: string) => Promise<boolean> | void;
  onDeleteRecurring?: (eventId: string, dateKey: string) => Promise<boolean> | void;
}

const readDockOpen = () => {
  try {
    const stored = localStorage.getItem(DOCK_OPEN_STORAGE_KEY);
    return stored == null ? true : stored === "1";
  } catch {
    return true;
  }
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
      ? `${hm(new Date(Math.min(...logs.map((log) => new Date(log.started).getTime()))))} — ${hm(
          new Date(Math.max(...logs.map((log) => new Date(log.started).getTime() + log.timeSpentSeconds * 1000)))
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

      {day.isSkipped ? (
        <>
          <div className="day-vacation">OFF · VACATION</div>
          <div className="day-spacer" />
        </>
      ) : (
        <>
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
                <span className="kbd">⌘K</span>
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

      {day.isConfiguredWorkingDay && (
        <button
          type="button"
          className="day-skip"
          onClick={() => onToggleSkipped(day.dateKey)}
          aria-pressed={day.isSkipped}
        >
          {day.isSkipped ? "↩ Restore day" : "+ Mark vacation"}
        </button>
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
    </div>
  );
};

export const WeekView = ({
  weekState,
  syncResult,
  currentDate,
  isSyncing,
  isConfigured,
  dockTickets = [],
  activeTicketCount,
  isLogging = false,
  onSync,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek,
  onAddTime,
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
  const colorMap = buildColorMap(weekState.days);
  const colorOf = (key: string) => colorMap.get(key) ?? PALETTE[0];

  const [dockOpen, setDockOpen] = useState(readDockOpen);
  const [dockShown, setDockShown] = useState(DOCK_INITIAL_SHOWN);
  const [quickLog, setQuickLog] = useState<QuickLogContext | null>(null);

  const dockColorMap = useMemo(() => buildDockColorMap(dockTickets), [dockTickets]);
  const dropDayMeta = useMemo(() => {
    const map = new Map<string, { droppable: boolean; label: string; shortLabel: string }>();
    for (const day of weekState.days) {
      const date = fromLocalDateKey(day.dateKey);
      const weekdayShort = day.weekdayName.slice(0, 3).toUpperCase();
      const monthShort = date.toLocaleString(undefined, { month: "short" }).toUpperCase();
      map.set(day.dateKey, {
        droppable: day.isConfiguredWorkingDay && !day.isSkipped && day.dateKey <= todayKey,
        label: `${weekdayShort} · ${date.getDate()} ${monthShort}`,
        shortLabel: `${weekdayShort} ${date.getDate()}`
      });
    }
    return map;
  }, [todayKey, weekState.days]);

  const isDroppable = useCallback((dateKey: string) => dropDayMeta.get(dateKey)?.droppable ?? false, [dropDayMeta]);

  const handleDrop = useCallback(
    ({ ticket, dateKey, hours }: DropTarget) => {
      const meta = dropDayMeta.get(dateKey);
      setQuickLog({
        ticketKey: ticket.key,
        ticketSummary: ticket.summary,
        dateKey,
        dayLabel: meta?.label ?? dateKey,
        hours: hours || 1,
        comment: ""
      });
    },
    [dropDayMeta]
  );

  const { dragging, hoverDay, hoverHours, hoverRect, isHoverBlocked, ghostRef, beginGrab } = useActiveWorkDrag({
    isDroppable,
    onDrop: handleDrop
  });

  const toggleDock = useCallback(() => {
    setDockOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem(DOCK_OPEN_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const loadMoreDock = useCallback(
    () => setDockShown((current) => Math.min(dockTickets.length, current + DOCK_PAGE_SIZE)),
    [dockTickets.length]
  );

  const quickLogTicket = quickLog ? dockTickets.find((ticket) => ticket.key === quickLog.ticketKey) : undefined;
  const quickLogColor = quickLog
    ? dockColorMap.get(quickLog.ticketKey) ?? DOCK_PALETTE[0]
    : DOCK_PALETTE[0];

  const confirmQuickLog = useCallback(async () => {
    if (!quickLog || !quickLogTicket || !onDockLog) {
      return;
    }
    const started = fromLocalDateKey(quickLog.dateKey);
    started.setHours(now.getHours(), now.getMinutes(), 0, 0);
    const success = await onDockLog({
      issueKey: quickLogTicket.key,
      ticket: quickLogTicket,
      timeSpentSeconds: Math.round(quickLog.hours * 3600),
      startedISO: started.toISOString(),
      comment: quickLog.comment.trim() || undefined
    });
    if (success) {
      setQuickLog(null);
    }
  }, [now, onDockLog, quickLog, quickLogTicket]);

  const ghostColor = dragging ? dockColorMap.get(dragging.key) ?? DOCK_PALETTE[0] : DOCK_PALETTE[0];
  const hoverMeta = hoverDay ? dropDayMeta.get(hoverDay) : undefined;
  const showLanes = Boolean(dragging && hoverDay && hoverRect && !isHoverBlocked);
  const showBlocked = Boolean(dragging && hoverDay && hoverRect && isHoverBlocked);

  return (
    <div className="view">
      <WeekHeader
        weekStart={weekStart}
        remainingWeekHours={weekState.remainingWeekHours}
        trackedWeekHours={weekState.trackedWeekHours}
        weeklyTargetHours={weekState.weeklyTargetHours}
        isSyncing={isSyncing}
        isConfigured={isConfigured}
        onSync={onSync}
        onAddTime={onAddTime}
        onPreviousWeek={onPreviousWeek}
        onCurrentWeek={onCurrentWeek}
        onNextWeek={onNextWeek}
      />

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

      {dockTickets.length > 0 && onDockLog && (
        <ActiveWorkDock
          tickets={dockTickets}
          activeCount={activeTicketCount ?? dockTickets.length}
          open={dockOpen}
          shownCount={dockShown}
          draggingKey={dragging?.key ?? null}
          now={now}
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

          {showBlocked && hoverRect && (
            <div
              className="drop-blocked"
              style={{ left: hoverRect.left, top: hoverRect.top, width: hoverRect.width, height: hoverRect.height }}
            >
              <div>
                <Ban size={20} strokeWidth={1.8} />
                <div className="drop-blocked-label">Can’t log to {hoverMeta?.shortLabel ?? "this day"} — future day</div>
              </div>
            </div>
          )}

          {hoverRect && (
            <div className="drop-tag" style={{ left: hoverRect.left + 8, top: hoverRect.top + 8 }}>
              {hoverMeta?.shortLabel}
            </div>
          )}
        </>
      )}

      {quickLog && (
        <QuickLogSheet
          context={quickLog}
          color={quickLogColor}
          isLogging={isLogging}
          onChangeHours={(hours) => setQuickLog((current) => (current ? { ...current, hours } : current))}
          onChangeComment={(comment) => setQuickLog((current) => (current ? { ...current, comment } : current))}
          onCancel={() => setQuickLog(null)}
          onConfirm={confirmQuickLog}
        />
      )}
    </div>
  );
};
