import { useEffect, useMemo, useRef } from "react";
import { LockKeyhole, Palmtree, Plus, Undo2 } from "lucide-react";
import type {
  DayTrackingSummary,
  JiraWorklog,
  PersonalNote,
  RecurringEntry,
  SyncResult,
  WeekState
} from "../../shared/types";
import {
  buildCommittedItems,
  buildPendingRecurringItems,
  clockTimeToMinutes,
  computeDayWindow,
  hourMarks,
  initialTimelineScrollTop,
  layoutHeight,
  minutesFromMidnight,
  minuteToY
} from "../domain/dayCalendar";
import { formatHours, fromLocalDateKey } from "../utils/date";
import type { AddTimePrefill } from "./AddTimeModal";
import { DayCalendar } from "./DayCalendar";
import type { RecurringConfirmPayload } from "./WeekRecurringRows";
import type { RecurringMovePatch } from "../app/useRecurringActions";

interface WeekTimelineProps {
  weekState: WeekState;
  syncResult?: SyncResult;
  currentDate: Date;
  todayKey: string;
  timelineFocusTime?: string;
  timelineCenterOnNow?: boolean;
  onAddTime: (date?: Date, prefill?: AddTimePrefill) => void;
  onMoveWorklog: (worklog: JiraWorklog, patch: { startedISO: string; timeSpentSeconds: number }) => Promise<boolean>;
  onMoveRecurring: (entry: RecurringEntry, patch: RecurringMovePatch) => Promise<boolean>;
  onEditWorklog: (worklog: JiraWorklog) => void;
  onEditPersonalNote: (note: PersonalNote) => void;
  onToggleSkipped: (dateKey: string) => void;
  onConfirmRecurring?: (payload: RecurringConfirmPayload) => Promise<boolean> | void;
  onSkipRecurring?: (eventId: string, dateKey: string) => Promise<boolean> | void;
}

const noGhostPromotion = () => undefined;
const noRecurringConfirm = () => undefined;
const noRecurringSkip = () => undefined;

const TimelineDayHeader = ({
  day,
  todayKey,
  onAddTime,
  onToggleSkipped
}: {
  day: DayTrackingSummary;
  todayKey: string;
  onAddTime: (date?: Date, prefill?: AddTimePrefill) => void;
  onToggleSkipped: (dateKey: string) => void;
}) => {
  const date = fromLocalDateKey(day.dateKey);
  const isFuture = day.dateKey > todayKey;
  const canCreate = day.isConfiguredWorkingDay && !day.isSkipped && !isFuture;
  const progress = day.targetHours > 0 ? Math.min(day.trackedHours / day.targetHours, 1) : 0;
  const progressClass = day.trackedHours >= day.targetHours && day.targetHours > 0 ? "is-complete" : "is-partial";

  return (
    <div
      className={`week-tl-day-head${day.isToday ? " is-today" : ""}${isFuture ? " is-future" : ""}${day.isSkipped ? " is-skipped" : ""}`}
    >
      <div className="week-tl-day-title">
        <span className="week-tl-day-name">{day.isToday ? "TODAY" : day.weekdayName.slice(0, 3).toUpperCase()}</span>
        <span className="week-tl-day-date">{date.getDate()}</span>
      </div>
      <div className="week-tl-day-actions">
        {day.isConfiguredWorkingDay && (
          <button
            type="button"
            className="week-tl-icon-button is-vacation"
            onClick={() => onToggleSkipped(day.dateKey)}
            aria-pressed={day.isSkipped}
            aria-label={day.isSkipped ? `Restore ${day.weekdayName}` : `Mark ${day.weekdayName} as vacation`}
            title={day.isSkipped ? "Restore day" : "Mark as vacation"}
          >
            {day.isSkipped ? <Undo2 size={13} strokeWidth={2.1} /> : <Palmtree size={13} strokeWidth={2.1} />}
          </button>
        )}
        {canCreate && (
          <button
            type="button"
            className={`week-tl-icon-button is-add${day.isToday ? " is-today" : ""}`}
            onClick={() => onAddTime(date)}
            aria-label={`Log time for ${day.weekdayName}`}
            title="Log time"
          >
            <Plus size={13} strokeWidth={2.4} />
          </button>
        )}
      </div>
      <div className="week-tl-day-total">
        <strong>{day.isSkipped ? "—" : formatHours(day.trackedHours)}</strong>
        <span>/ {formatHours(day.targetHours)}</span>
      </div>
      <div className="week-tl-progress" aria-hidden="true">
        {!day.isSkipped && <span className={progressClass} style={{ width: `${progress * 100}%` }} />}
      </div>
    </div>
  );
};

/** Five Day-calendar interaction surfaces aligned to one shared vertical time scale. */
export const WeekTimeline = ({
  weekState,
  syncResult,
  currentDate,
  todayKey,
  timelineFocusTime,
  timelineCenterOnNow = true,
  onAddTime,
  onMoveWorklog,
  onMoveRecurring,
  onEditWorklog,
  onEditPersonalNote,
  onToggleSkipped,
  onConfirmRecurring,
  onSkipRecurring
}: WeekTimelineProps) => {
  const dayData = useMemo(
    () =>
      weekState.days.map((day) => {
        const worklogs = syncResult?.daySummaries[day.dateKey]?.worklogs ?? [];
        const pending = onConfirmRecurring && onSkipRecurring ? day.pendingRecurring : [];
        return {
          day,
          worklogs,
          pending,
          items: buildCommittedItems(worklogs, day.personalNotes, day.recurringEntries),
          pendingItems: buildPendingRecurringItems(pending)
        };
      }),
    [onConfirmRecurring, onSkipRecurring, syncResult, weekState.days]
  );
  const layout = useMemo(
    () => computeDayWindow(dayData.flatMap(({ items, pendingItems }) => [...items, ...pendingItems]), { pxPerHour: 54 }),
    [dayData]
  );
  const marks = useMemo(() => hourMarks(layout), [layout]);
  const height = layoutHeight(layout);
  const gridTemplateColumns = `52px repeat(${Math.max(weekState.days.length, 1)}, minmax(172px, 1fr))`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const containsToday = weekState.days.some((day) => day.dateKey === todayKey);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    const focusOnNow = containsToday && timelineCenterOnNow;
    const bodyOffset = headRef.current?.offsetHeight ?? 90;
    scrollRef.current.scrollTop =
      bodyOffset +
      initialTimelineScrollTop(
        focusOnNow ? minutesFromMidnight(currentDate) : clockTimeToMinutes(timelineFocusTime),
        layout,
        scrollRef.current.clientHeight,
        focusOnNow ? "now" : "focus"
      );
  }, [
    containsToday,
    currentDate,
    layout.endMin,
    layout.pxPerHour,
    layout.startMin,
    timelineCenterOnNow,
    timelineFocusTime,
    weekState.weekKey
  ]);

  return (
    <div className="week-timeline" aria-label="Week timeline">
      <div className="week-timeline-scroll" ref={scrollRef}>
        <div className="week-timeline-canvas">
          <div className="week-timeline-head" ref={headRef} style={{ gridTemplateColumns }}>
            <div className="week-tl-gutter-head">TIME</div>
            {weekState.days.map((day) => (
              <TimelineDayHeader
                key={day.dateKey}
                day={day}
                todayKey={todayKey}
                onAddTime={onAddTime}
                onToggleSkipped={onToggleSkipped}
              />
            ))}
          </div>

          <div className="week-timeline-body" style={{ gridTemplateColumns, height: `${height}px` }}>
            <div className="week-tl-gutter" aria-hidden="true">
              {marks.map((mark) => (
                <span key={mark.min} style={{ top: `${minuteToY(mark.min, layout)}px` }}>
                  {mark.label}
                </span>
              ))}
            </div>

            {dayData.map(({ day, worklogs, pending, items }) => {
              const isFuture = day.dateKey > todayKey;
              const readOnly = isFuture || day.isSkipped || !day.isConfiguredWorkingDay;
              const date = fromLocalDateKey(day.dateKey);
              return (
                <div
                  key={day.dateKey}
                  className={`week-tl-day${day.isToday ? " is-today" : ""}${isFuture ? " is-future" : ""}${day.isSkipped ? " is-skipped" : ""}`}
                >
                  {day.isSkipped ? (
                    <div className="week-tl-vacation" data-drop-day={day.dateKey}>
                      <Palmtree size={42} strokeWidth={1.35} aria-hidden="true" />
                      <span>OFF · VACATION</span>
                    </div>
                  ) : (
                    <DayCalendar
                      date={date}
                      now={currentDate}
                      worklogs={worklogs}
                      notes={day.personalNotes}
                      recurring={day.recurringEntries}
                      pending={pending}
                      ghosts={[]}
                      layoutOverride={layout}
                      embedded
                      readOnly={readOnly}
                      dropDateKey={day.dateKey}
                      onCreateAt={(prefill) => onAddTime(date, prefill)}
                      onMoveWorklog={onMoveWorklog}
                      onMoveRecurring={onMoveRecurring}
                      onPromoteGhost={noGhostPromotion}
                      onConfirmRecurring={onConfirmRecurring ?? noRecurringConfirm}
                      onSkipRecurring={onSkipRecurring ?? noRecurringSkip}
                      onEditWorklog={onEditWorklog}
                      onEditPersonalNote={onEditPersonalNote}
                    />
                  )}
                  {isFuture && !day.isSkipped && items.length === 0 && (
                    <div className="week-tl-readonly" aria-label="Future day, read-only">
                      <LockKeyhole size={17} strokeWidth={1.6} />
                      <span>Future day</span>
                      <small>Read-only until this day begins</small>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
