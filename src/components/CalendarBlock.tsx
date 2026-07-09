import { memo, type PointerEvent as ReactPointerEvent } from "react";
import { formatClock } from "../utils/date";
import { minuteToLabel, type CalendarItem } from "../domain/dayCalendar";
import type { DragKind } from "./useDayCalendarInteraction";

interface CalendarBlockProps {
  item: CalendarItem;
  /** Pixel geometry (numbers, not an object, so React.memo can compare by value). */
  top: number;
  height: number;
  left: string;
  width: string;
  /** Effective start/end for the label — the live draft range while dragging. */
  labelStartMin: number;
  labelEndMin: number;
  dragging?: boolean;
  draggable?: boolean;
  onSelect: (item: CalendarItem) => void;
  /** Stable drag starter (worklogs only); receives the gesture kind. */
  onBlockDrag?: (event: ReactPointerEvent<HTMLElement>, item: CalendarItem, kind: DragKind) => void;
}

const titleFor = (item: CalendarItem) => {
  if (item.worklog) {
    return item.worklog.issueKey;
  }
  if (item.note) {
    return item.note.title?.trim() || item.note.text || "Local note";
  }
  if (item.recurring) {
    return item.recurring.title;
  }
  if (item.signal) {
    return item.signal.key || "Detected";
  }
  return "";
};

const detailFor = (item: CalendarItem) => {
  if (item.worklog) {
    return item.worklog.issueSummary;
  }
  if (item.note) {
    return item.note.title?.trim() ? item.note.text : undefined;
  }
  if (item.recurring) {
    return item.recurring.note;
  }
  if (item.signal) {
    return item.signal.title;
  }
  return undefined;
};

/**
 * A single positioned block on the day grid. Worklogs are draggable (move) with
 * top/bottom resize handles; notes and ghosts fall back to click-to-edit / promote.
 * Memoized: non-dragged blocks skip re-render while another block is being dragged.
 */
const CalendarBlockImpl = ({
  item,
  top,
  height,
  left,
  width,
  labelStartMin,
  labelEndMin,
  dragging,
  draggable,
  onSelect,
  onBlockDrag
}: CalendarBlockProps) => {
  const durationSeconds = Math.round((labelEndMin - labelStartMin) * 60);
  const compact = height < 34;
  const title = titleFor(item);
  const detail = detailFor(item);
  const canDrag = Boolean(draggable && onBlockDrag);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`cal-block cal-block--${item.colorRole} cal-block--${item.kind}${compact ? " is-compact" : ""}${canDrag ? " is-draggable" : ""}${dragging ? " is-dragging" : ""}`}
      style={{ top: `${top}px`, height: `${Math.max(height, 1)}px`, left, width }}
      title={detail ? `${title} · ${detail}` : title}
      // Draggable blocks start a move on pointerdown; static blocks (notes/ghosts) still
      // stop propagation so the pointerdown doesn't reach the track and start a create.
      onPointerDown={canDrag ? (event) => onBlockDrag!(event, item, "move") : (event) => event.stopPropagation()}
      onClick={canDrag ? undefined : () => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
    >
      {canDrag && (
        <span
          className="cal-resize cal-resize--top"
          aria-hidden="true"
          onPointerDown={(event) => onBlockDrag!(event, item, "resize-start")}
        />
      )}
      <span className="cal-block-head">
        <span className="cal-block-title">{title}</span>
        {detail && !compact && <span className="cal-block-detail">{detail}</span>}
      </span>
      <span className="cal-block-meta">
        {minuteToLabel(labelStartMin)}–{minuteToLabel(labelEndMin)} · {formatClock(durationSeconds)}
      </span>
      {canDrag && (
        <span
          className="cal-resize cal-resize--bottom"
          aria-hidden="true"
          onPointerDown={(event) => onBlockDrag!(event, item, "resize-end")}
        />
      )}
    </div>
  );
};

export const CalendarBlock = memo(CalendarBlockImpl);
