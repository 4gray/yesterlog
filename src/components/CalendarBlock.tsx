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
  relocating?: boolean;
  preview?: boolean;
  /** Preview of an Option-drag duplicate: the original stays, this block is the new booking. */
  duplicatePreview?: boolean;
  /** The whole block can be moved by dragging its body. */
  draggable?: boolean;
  /** The corresponding edge can be dragged without making the body movable. */
  resizeStart?: boolean;
  resizeEnd?: boolean;
  /** Week's narrow overlap columns show only the strongest identifier. */
  minimal?: boolean;
  onSelect: (item: CalendarItem) => void;
  /** Stable drag starter for movable committed blocks; receives the gesture kind. */
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
 * A single positioned block on the day grid. Worklogs and confirmed recurring events
 * are draggable (move) with top/bottom resize handles; notes and ghosts fall back to
 * click-to-edit / promote.
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
  relocating,
  preview,
  duplicatePreview,
  draggable,
  resizeStart,
  resizeEnd,
  minimal,
  onSelect,
  onBlockDrag
}: CalendarBlockProps) => {
  const durationSeconds = Math.round((labelEndMin - labelStartMin) * 60);
  // Two stacked rows (head + meta) need ~46px with padding; anything shorter
  // renders the single-row layout so the meta line never gets half-clipped.
  const compact = height < 46;
  const title = titleFor(item);
  const detail = detailFor(item);
  const canMove = Boolean(draggable && onBlockDrag);
  const canResizeStart = Boolean(resizeStart && onBlockDrag);
  const canResizeEnd = Boolean(resizeEnd && onBlockDrag);
  const canResize = canResizeStart || canResizeEnd;
  const allocation = item.worklog?.allocation;

  return (
    <div
      role="button"
      tabIndex={preview ? -1 : 0}
      aria-hidden={preview || undefined}
      className={`cal-block cal-block--${item.colorRole} cal-block--${item.kind}${compact ? " is-compact" : ""}${minimal ? " is-minimal" : ""}${canMove ? " is-draggable" : ""}${canResize ? " is-resizable" : ""}${dragging ? " is-dragging" : ""}${relocating ? " is-relocating" : ""}${preview ? " is-cross-day-preview" : ""}${duplicatePreview ? " is-duplicate-preview" : ""}`}
      style={{ top: `${top}px`, height: `${Math.max(height, 1)}px`, left, width }}
      data-worklog-id={item.worklog && !allocation && !preview ? item.worklog.id : undefined}
      title={
        allocation
          ? `${title} · ${detail ?? "Jira worklog"} · ${allocation.isApproximate ? "estimated" : "chosen"} bulk allocation ${allocation.partIndex}/${allocation.partCount}`
          : detail
            ? `${title} · ${detail}`
            : title
      }
      // Draggable blocks start a move on pointerdown; static blocks (notes/ghosts) still
      // stop propagation so the pointerdown doesn't reach the track and start a create.
      onPointerDown={canMove ? (event) => onBlockDrag!(event, item, "move") : (event) => event.stopPropagation()}
      onClick={canMove ? undefined : () => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
    >
      {canResizeStart && (
        <span
          className="cal-resize cal-resize--top"
          aria-hidden="true"
          onPointerDown={(event) => onBlockDrag!(event, item, "resize-start")}
        />
      )}
      <span className="cal-block-head">
        <span className="cal-block-title">{title}</span>
        {duplicatePreview && <span className="cal-block-allocation is-book">+ BOOK</span>}
        {allocation && !compact && (
          <span className={`cal-block-allocation${allocation.isApproximate ? " is-estimate" : ""}`}>
            {allocation.isApproximate ? "EST." : "ALLOC."} {allocation.partIndex}/{allocation.partCount}
          </span>
        )}
        {detail && !compact && <span className="cal-block-detail">{detail}</span>}
      </span>
      <span className="cal-block-meta">
        {minuteToLabel(labelStartMin)}–{minuteToLabel(labelEndMin)} · {formatClock(durationSeconds)}
      </span>
      {canResizeEnd && (
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
