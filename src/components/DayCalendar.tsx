import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JiraWorklog, PendingRecurringOccurrence, PersonalNote, RecurringEntry } from "../../shared/types";
import { formatClock, toLocalDateKey } from "../utils/date";
import {
  buildCommittedItems,
  buildPendingRecurringItems,
  computeDayWindow,
  findGaps,
  hourMarks,
  layoutColumns,
  layoutHeight,
  minutesFromMidnight,
  minuteToLabel,
  minuteToY,
  rectForRange,
  startedISOForMinute,
  type CalendarItem,
  type Range
} from "../domain/dayCalendar";
import type { ReconstructSignal } from "../domain/reconstruct";
import type { RecurringConfirmPayload } from "../app/useRecurringActions";
import type { AddTimePrefill } from "./AddTimeModal";
import { CalendarBlock } from "./CalendarBlock";
import { useDayCalendarInteraction } from "./useDayCalendarInteraction";

interface DayCalendarProps {
  date: Date;
  worklogs: JiraWorklog[];
  notes: PersonalNote[];
  /** Confirmed recurring rituals (standups, planning…) for the day, as committed blocks. */
  recurring: RecurringEntry[];
  /** Scheduled-but-unconfirmed recurring rituals for the day, as suggestion blocks. */
  pending: PendingRecurringOccurrence[];
  /** Detected-but-unlogged activity (ghost layer). */
  ghosts: CalendarItem[];
  pxPerHour?: number;
  /** Open the Add-Time popup for a new entry (empty-slot drag/click, or a rail ticket). */
  onCreateAt: (prefill: AddTimePrefill) => void;
  /** Commit a drag move/resize of an existing worklog (optimistic). */
  onMoveWorklog: (worklog: JiraWorklog, patch: { startedISO: string; timeSpentSeconds: number }) => Promise<boolean>;
  /** Promote a ghost to a real worklog (opens the prefilled popup). */
  onPromoteGhost: (signal: ReconstructSignal, startedISO: string) => void;
  /** Confirm a pending recurring ritual with its defaults (mirrors the Week card's ✓). */
  onConfirmRecurring: (payload: RecurringConfirmPayload) => Promise<boolean> | void;
  /** Skip a pending recurring ritual for the day (mirrors the Week card's ✗). */
  onSkipRecurring: (eventId: string, dateKey: string) => Promise<boolean> | void;
  onEditWorklog: (worklog: JiraWorklog) => void;
  onEditPersonalNote: (note: PersonalNote) => void;
}

/** Ghosts live in a right-side band so they stay visible even over logged blocks. */
const GHOST_BAND_LEFT_PCT = 60;
const GHOST_BAND_WIDTH_PCT = 38;
/** Minimum visible block height (px) when there is room for it. */
const MIN_BLOCK_PX = 16;

const rangeToSeconds = (range: Range) => Math.round((range.endMin - range.startMin) * 60);

/** Only surface gaps at least this long as "log this gap" affordances. */
const GAP_MIN_MINUTES = 30;

/**
 * Google-Calendar-style single-day timeline. Worklogs and notes render as proportional,
 * column-packed blocks on an hour grid. Drag an empty slot to create, drag a worklog to
 * move it, drag its edges to resize; click a block to edit.
 */
export const DayCalendar = ({
  date,
  worklogs,
  notes,
  recurring,
  pending,
  ghosts,
  pxPerHour,
  onCreateAt,
  onMoveWorklog,
  onPromoteGhost,
  onConfirmRecurring,
  onSkipRecurring,
  onEditWorklog,
  onEditPersonalNote
}: DayCalendarProps) => {
  const items = useMemo(() => buildCommittedItems(worklogs, notes, recurring), [worklogs, notes, recurring]);
  const pendingItems = useMemo(() => buildPendingRecurringItems(pending), [pending]);
  const positioned = useMemo(() => layoutColumns(items), [items]);
  const positionedGhosts = useMemo(() => layoutColumns(ghosts), [ghosts]);
  // Window must account for ghosts and pending suggestions too, or activity outside the
  // logged span clamps to the grid edge and renders at the wrong time.
  const layout = useMemo(
    () => computeDayWindow([...items, ...ghosts, ...pendingItems], { pxPerHour }),
    [items, ghosts, pendingItems, pxPerHour]
  );
  const marks = useMemo(() => hourMarks(layout), [layout]);
  const height = layoutHeight(layout);

  // How far each committed block may extend before the next block in its column, so the
  // MIN_BLOCK_PX floor never makes a short block overlap (and hide the resize handle of)
  // an adjacent one.
  const capMinById = useMemo(() => {
    const map = new Map<string, number>();
    for (const { item, column } of positioned) {
      let cap = layout.endMin;
      for (const other of positioned) {
        if (other.column === column && other.item.startMin >= item.endMin && other.item.startMin < cap) {
          cap = other.item.startMin;
        }
      }
      map.set(item.id, cap);
    }
    return map;
  }, [positioned, layout.endMin]);

  // Interior holes between the first and last logged block — the "you forgot to log
  // this" moments worth surfacing (leading/trailing empty space is obvious and skipped).
  const gaps = useMemo(() => {
    if (items.length === 0) {
      return [];
    }
    const firstStart = Math.min(...items.map((item) => item.startMin));
    const lastEnd = Math.max(...items.map((item) => item.endMin));
    return findGaps(items, firstStart, lastEnd, GAP_MIN_MINUTES);
  }, [items]);

  const isToday = toLocalDateKey(date) === toLocalDateKey(new Date());
  const [nowMin, setNowMin] = useState(() => minutesFromMidnight(new Date()));
  useEffect(() => {
    if (!isToday) {
      return;
    }
    const tick = () => setNowMin(minutesFromMidnight(new Date()));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [isToday]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isToday || !scrollRef.current) {
      return;
    }
    const target = minuteToY(nowMin, layout) - scrollRef.current.clientHeight / 3;
    scrollRef.current.scrollTop = Math.max(0, target);
    // Run once on mount for the initial framing; live ticks shouldn't yank the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectItem = useCallback(
    (item: CalendarItem) => {
      if (item.worklog) {
        onEditWorklog(item.worklog);
      } else if (item.note) {
        onEditPersonalNote(item.note);
      }
    },
    [onEditWorklog, onEditPersonalNote]
  );

  const promoteGhostItem = useCallback(
    (item: CalendarItem) => {
      if (item.signal) {
        onPromoteGhost(item.signal, startedISOForMinute(date, item.startMin));
      }
    },
    [date, onPromoteGhost]
  );

  const confirmPending = useCallback(
    (pendingOccurrence: PendingRecurringOccurrence) => {
      void onConfirmRecurring({
        eventId: pendingOccurrence.eventId,
        dateKey: pendingOccurrence.dateKey,
        timeSpentSeconds: pendingOccurrence.defaultDurationMinutes * 60,
        note: pendingOccurrence.defaultNote?.trim() || undefined
      });
    },
    [onConfirmRecurring]
  );

  const { draft, startCreate, startBlockDrag } = useDayCalendarInteraction({
    layout,
    items,
    trackRef,
    onCreate: (range) =>
      onCreateAt({ startedISO: startedISOForMinute(date, range.startMin), timeSpentSeconds: rangeToSeconds(range) }),
    onCommitMove: (item, range) => {
      if (!item.worklog) {
        return;
      }
      // Preserve the untouched edge: when the start didn't move (resize-end), keep the
      // original started (seconds and all) so only the duration changes.
      const startUnchanged = range.startMin === item.startMin;
      const startedISO = startUnchanged ? item.worklog.started : startedISOForMinute(date, range.startMin);
      const baseStartMin = startUnchanged ? item.startMin : range.startMin;
      const timeSpentSeconds = Math.max(60, Math.round((range.endMin - baseStartMin) * 60));
      void onMoveWorklog(item.worklog, { startedISO, timeSpentSeconds });
    },
    onSelect: selectItem
  });

  const nowY = minuteToY(nowMin, layout);
  const showNow = isToday && nowMin >= layout.startMin && nowMin <= layout.endMin;
  const draftRect = draft?.kind === "create" ? rectForRange(draft.range.startMin, draft.range.endMin, layout) : null;

  return (
    <div className="cal">
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-body" style={{ height: `${height}px` }}>
          <div className="cal-gutter">
            {marks.map((mark) => (
              <div className="cal-hour" key={mark.min} style={{ top: `${minuteToY(mark.min, layout)}px` }}>
                {mark.label}
              </div>
            ))}
          </div>
          <div
            className="cal-track"
            ref={trackRef}
            onPointerDown={startCreate}
            role="presentation"
            title="Drag an empty slot to log time"
          >
            {marks.map((mark) => (
              <div className="cal-line" key={mark.min} style={{ top: `${minuteToY(mark.min, layout)}px` }} />
            ))}
            {showNow && (
              <div className="cal-now" style={{ top: `${nowY}px` }} aria-hidden="true">
                <span className="cal-now-dot" />
              </div>
            )}
            {gaps.map((gap) => {
              const rect = rectForRange(gap.startMin, gap.endMin, layout);
              return (
                <div key={`gap:${gap.startMin}`} className="cal-gap" style={{ top: `${rect.top}px`, height: `${rect.height}px` }}>
                  <button
                    type="button"
                    className="cal-gap-fill"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCreateAt({
                        startedISO: startedISOForMinute(date, gap.startMin),
                        timeSpentSeconds: rangeToSeconds(gap)
                      });
                    }}
                  >
                    + Log this {minuteToLabel(gap.startMin)}–{minuteToLabel(gap.endMin)} gap
                  </button>
                </div>
              );
            })}
            {positioned.map(({ item, column, columns }) => {
              const widthPct = 100 / columns;
              const isDragging = draft?.itemId === item.id;
              const range = isDragging ? draft!.range : { startMin: item.startMin, endMin: item.endMin };
              const rect = rectForRange(range.startMin, range.endMin, layout);
              const capBottom = minuteToY(capMinById.get(item.id) ?? layout.endMin, layout);
              const blockHeight = isDragging
                ? Math.max(rect.height, MIN_BLOCK_PX)
                : Math.max(4, Math.min(Math.max(rect.height, MIN_BLOCK_PX), capBottom - rect.top));
              return (
                <CalendarBlock
                  key={item.id}
                  item={item}
                  top={rect.top}
                  height={blockHeight}
                  left={`calc(${column * widthPct}% + 4px)`}
                  width={`calc(${widthPct}% - ${columns > 1 ? 6 : 14}px)`}
                  labelStartMin={range.startMin}
                  labelEndMin={range.endMin}
                  dragging={isDragging}
                  draggable={item.kind === "worklog"}
                  onSelect={selectItem}
                  onBlockDrag={item.kind === "worklog" ? startBlockDrag : undefined}
                />
              );
            })}
            {/* Pending rituals overlay the committed lane (translucent + dashed) so a
                scheduled-but-unconfirmed standup stays visible even when a worklog overlaps
                its slot — matching how the Week view always lists it. Click confirms with
                defaults; the corner ✗ skips it for the day. */}
            {pendingItems.map((item) => {
              const occurrence = item.pending!;
              const rect = rectForRange(item.startMin, item.endMin, layout);
              const durationLabel = formatClock(Math.round((item.endMin - item.startMin) * 60));
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className="cal-block cal-block--meeting cal-block--recurring-pending"
                  style={{ top: `${rect.top}px`, height: `${Math.max(rect.height, MIN_BLOCK_PX)}px`, left: "4px", width: "calc(100% - 14px)" }}
                  title={`Confirm ${occurrence.title} · ${durationLabel}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => confirmPending(occurrence)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      confirmPending(occurrence);
                    }
                  }}
                >
                  <span className="cal-block-head">
                    <span className="cal-block-title">{occurrence.title}</span>
                  </span>
                  <span className="cal-block-meta">
                    {minuteToLabel(item.startMin)}–{minuteToLabel(item.endMin)} · {durationLabel}
                  </span>
                  <button
                    type="button"
                    className="cal-pending-skip"
                    aria-label={`Skip ${occurrence.title} today`}
                    title="Skip today"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      void onSkipRecurring(occurrence.eventId, occurrence.dateKey);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {positionedGhosts.map(({ item, column, columns }) => {
              const colWidth = GHOST_BAND_WIDTH_PCT / columns;
              const rect = rectForRange(item.startMin, item.endMin, layout);
              return (
                <CalendarBlock
                  key={item.id}
                  item={item}
                  top={rect.top}
                  height={Math.max(rect.height, MIN_BLOCK_PX)}
                  left={`calc(${GHOST_BAND_LEFT_PCT + column * colWidth}% + 2px)`}
                  width={`calc(${colWidth}% - 4px)`}
                  labelStartMin={item.startMin}
                  labelEndMin={item.endMin}
                  onSelect={promoteGhostItem}
                />
              );
            })}
            {draftRect && (
              <div
                className="cal-block cal-block--draft"
                style={{ top: `${draftRect.top}px`, height: `${Math.max(draftRect.height, MIN_BLOCK_PX)}px`, left: "4px", width: "calc(100% - 14px)" }}
              >
                <span className="cal-block-meta">
                  {minuteToLabel(draft!.range.startMin)}–{minuteToLabel(draft!.range.endMin)}
                </span>
              </div>
            )}
            {items.length === 0 && !draft && <div className="cal-empty">No time logged yet — drag a slot to start.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
