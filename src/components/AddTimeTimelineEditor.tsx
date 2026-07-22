import { useEffect, useMemo, useRef } from "react";
import { ArrowDownToLine, ArrowUpFromLine, MoveVertical } from "lucide-react";
import type { JiraTicket, JiraWorklog, PersonalNote, RecurringEntry } from "../../shared/types";
import {
  buildCommittedItems,
  clockTimeToMinutes,
  hourMarks,
  initialTimelineScrollTop,
  layoutColumns,
  layoutHeight,
  minuteToLabel,
  minuteToY,
  overlapsCommitted,
  rectForRange,
  type CalendarItem,
  type DayLayout,
  type Range
} from "../domain/dayCalendar";
import { getWorklogDisplayStarted } from "../domain/worklogAllocation";
import { formatClock, toLocalDateKey } from "../utils/date";
import { useDayCalendarInteraction } from "./useDayCalendarInteraction";

export interface AddTimeTimelineEditorProps {
  dateKey: string;
  time: string;
  durationSeconds: number;
  ticket?: JiraTicket;
  worklogs?: JiraWorklog[];
  personalNotes?: PersonalNote[];
  recurringEntries?: RecurringEntry[];
  editingWorklogId?: string;
  onChange: (range: Range) => void;
}

const TIMELINE_LAYOUT: DayLayout = { startMin: 0, endMin: 24 * 60, pxPerHour: 52 };
const DRAFT_ID = "add-time:draft";
const MIN_BLOCK_HEIGHT = 24;

const worklogDateKey = (worklog: JiraWorklog) => {
  const started = new Date(getWorklogDisplayStarted(worklog));
  return Number.isNaN(started.getTime()) ? undefined : toLocalDateKey(started);
};

const itemTitle = (item: CalendarItem) => {
  if (item.worklog) {
    return item.worklog.issueKey;
  }
  if (item.note) {
    return item.note.title?.trim() || item.note.text || "Personal note";
  }
  return item.recurring?.title ?? "Logged time";
};

const itemDetail = (item: CalendarItem) => {
  if (item.worklog) {
    return item.worklog.issueSummary;
  }
  if (item.note?.title?.trim()) {
    return item.note.text;
  }
  return item.recurring?.note;
};

const endLabel = (endMin: number) => `${minuteToLabel(endMin)}${endMin >= 24 * 60 ? " +1d" : ""}`;

/**
 * A compact, synchronized cut-out of the Today timeline for the Add Time dialog.
 * Existing entries are read-only context; the blue draft is the form's start and
 * duration rendered as a movable/resizable calendar block.
 */
export const AddTimeTimelineEditor = ({
  dateKey,
  time,
  durationSeconds,
  ticket,
  worklogs = [],
  personalNotes = [],
  recurringEntries = [],
  editingWorklogId,
  onChange
}: AddTimeTimelineEditorProps) => {
  const startMin = clockTimeToMinutes(time);
  const endMin = startMin + durationSeconds / 60;
  const contextItems = useMemo(
    () =>
      buildCommittedItems(
        worklogs.filter((worklog) => worklog.id !== editingWorklogId && worklogDateKey(worklog) === dateKey),
        personalNotes.filter((note) => note.dateKey === dateKey),
        recurringEntries.filter((entry) => entry.dateKey === dateKey)
      ),
    [dateKey, editingWorklogId, personalNotes, recurringEntries, worklogs]
  );
  const positionedContext = useMemo(() => layoutColumns(contextItems), [contextItems]);
  const draftItem = useMemo<CalendarItem>(
    () => ({
      id: DRAFT_ID,
      kind: "draft",
      startMin,
      endMin,
      colorRole: "accent",
      layer: "committed"
    }),
    [endMin, startMin]
  );
  const interactionItems = useMemo(() => [...contextItems, draftItem], [contextItems, draftItem]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const marks = useMemo(() => hourMarks(TIMELINE_LAYOUT), []);
  const height = layoutHeight(TIMELINE_LAYOUT);

  const { draft, startBlockDrag } = useDayCalendarInteraction({
    layout: TIMELINE_LAYOUT,
    items: interactionItems,
    trackRef,
    onCreate: () => undefined,
    onCommitMove: (_item, range) => onChange(range),
    onSelect: () => undefined
  });

  const liveRange = draft?.itemId === DRAFT_ID ? draft.range : { startMin, endMin };
  const liveRect = rectForRange(liveRange.startMin, liveRange.endMin, TIMELINE_LAYOUT);
  const hasConflict = overlapsCommitted(liveRange.startMin, liveRange.endMin, contextItems);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = initialTimelineScrollTop(
      startMin,
      TIMELINE_LAYOUT,
      scrollRef.current.clientHeight,
      "focus"
    );
  }, [dateKey, startMin]);

  return (
    <section className="add-time-timeline" aria-label="Visual time range editor">
      <div className="add-time-timeline-head">
        <div>
          <span className="modal-label">DAY MAP</span>
          <strong aria-live="polite">
            {minuteToLabel(liveRange.startMin)} <span aria-hidden="true">→</span> {endLabel(liveRange.endMin)}
            <em>{formatClock(Math.round((liveRange.endMin - liveRange.startMin) * 60))}</em>
          </strong>
        </div>
        <span className="add-time-timeline-hint">
          <MoveVertical size={12} aria-hidden="true" /> DRAG · RESIZE EDGES · 15 MIN
        </span>
      </div>

      <div className="add-time-timeline-viewport" ref={scrollRef}>
        <div className="add-time-timeline-body" style={{ height: `${height}px` }}>
          <div className="add-time-timeline-gutter" aria-hidden="true">
            {marks.map((mark) => (
              <span key={mark.min} style={{ top: `${minuteToY(mark.min, TIMELINE_LAYOUT)}px` }}>
                {mark.label}
              </span>
            ))}
          </div>
          <div className="add-time-timeline-track" ref={trackRef}>
            {marks.map((mark) => (
              <span
                className="add-time-timeline-line"
                key={mark.min}
                style={{ top: `${minuteToY(mark.min, TIMELINE_LAYOUT)}px` }}
                aria-hidden="true"
              />
            ))}

            {positionedContext.map(({ item, column, columns }) => {
              const rect = rectForRange(item.startMin, item.endMin, TIMELINE_LAYOUT);
              const widthPct = 100 / columns;
              const detail = itemDetail(item);
              return (
                <div
                  key={item.id}
                  className={`add-time-timeline-existing is-${item.colorRole}`}
                  style={{
                    top: `${rect.top}px`,
                    height: `${Math.max(16, rect.height)}px`,
                    left: `calc(${column * widthPct}% + 6px)`,
                    width: `calc(${widthPct}% - ${columns > 1 ? 8 : 12}px)`
                  }}
                  title={`${itemTitle(item)} · ${minuteToLabel(item.startMin)}–${minuteToLabel(item.endMin)}`}
                >
                  <strong>{itemTitle(item)}</strong>
                  {rect.height >= 34 && detail && <span>{detail}</span>}
                  <em>{minuteToLabel(item.startMin)}–{minuteToLabel(item.endMin)}</em>
                </div>
              );
            })}

            <div
              className={`add-time-timeline-draft${draft ? " is-dragging" : ""}${hasConflict ? " is-conflict" : ""}`}
              style={{ top: `${liveRect.top}px`, height: `${Math.max(MIN_BLOCK_HEIGHT, liveRect.height)}px` }}
              onPointerDown={(event) => startBlockDrag(event, draftItem, "move")}
              role="group"
              aria-label={`Draft ${minuteToLabel(liveRange.startMin)} to ${endLabel(liveRange.endMin)}`}
            >
              <button
                type="button"
                className="add-time-timeline-handle is-top"
                aria-label="Resize from start"
                title="Drag to change the start"
                onPointerDown={(event) => startBlockDrag(event, draftItem, "resize-start")}
              >
                <ArrowUpFromLine size={12} aria-hidden="true" />
              </button>
              <div className="add-time-timeline-draft-copy">
                <strong>{ticket?.key ?? "NEW TIME"}</strong>
                <span>{ticket?.summary ?? "Choose a ticket"}</span>
                <em>
                  {minuteToLabel(liveRange.startMin)}–{endLabel(liveRange.endMin)}
                </em>
              </div>
              <button
                type="button"
                className="add-time-timeline-handle is-bottom"
                aria-label="Resize until end"
                title="Drag to change the end"
                onPointerDown={(event) => startBlockDrag(event, draftItem, "resize-end")}
              >
                <ArrowDownToLine size={12} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {hasConflict && <div className="add-time-timeline-conflict">This slot overlaps existing time. Move or resize it.</div>}
    </section>
  );
};
