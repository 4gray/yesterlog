import type { JiraWorklog, PendingRecurringOccurrence, PersonalNote, RecurringEntry } from "../../shared/types";
import type { ReconstructSignal } from "./reconstruct";
import { getWorklogDisplaySeconds, getWorklogDisplayStarted } from "./worklogAllocation";

/**
 * Day-calendar geometry — the pure, DOM-free core of the Today calendar view.
 *
 * Everything the calendar needs to place blocks and resolve drag interactions lives
 * here as deterministic functions: minutes↔pixels mapping, snapping, the strict
 * non-overlapping timeline (worklogs + notes share one "committed" lane), gap
 * fitting for move/resize, day-window auto-fit, and worklog/note → item mappers.
 *
 * Time is expressed as **local minutes from midnight** (0..1440). Worklog/note start
 * instants are read in the viewer's local timezone, matching how the entries list
 * already renders `formatHm24(new Date(worklog.started))`.
 */

export const MINUTES_PER_DAY = 24 * 60;

export type CalendarItemKind = "worklog" | "note" | "recurring" | "recurring-pending" | "ghost" | "draft";
export type CalendarColorRole = "accent" | "meeting" | "fire" | "muted";
export type CalendarLayer = "committed" | "ghost";

export interface CalendarItem {
  /** Stable, layer-prefixed id (e.g. `wl:123`, `note:abc`) — unique across sources. */
  id: string;
  kind: CalendarItemKind;
  /** Local minutes from midnight. */
  startMin: number;
  /** Exclusive end in local minutes from midnight (may exceed MINUTES_PER_DAY pre-clamp). */
  endMin: number;
  colorRole: CalendarColorRole;
  layer: CalendarLayer;
  worklog?: JiraWorklog;
  note?: PersonalNote;
  recurring?: RecurringEntry;
  pending?: PendingRecurringOccurrence;
  signal?: ReconstructSignal;
}

export interface DayLayout {
  /** Visible window start (minutes from midnight). */
  startMin: number;
  /** Visible window end (minutes from midnight). */
  endMin: number;
  pxPerHour: number;
}

export interface Rect {
  top: number;
  height: number;
}

export interface Range {
  startMin: number;
  endMin: number;
}

export interface HourMark {
  min: number;
  label: string;
}

export const DEFAULT_PX_PER_HOUR = 60;
export const DEFAULT_SNAP_MINUTES = 15;
export const DEFAULT_WINDOW_START_MIN = 7 * 60; // 07:00
export const DEFAULT_WINDOW_END_MIN = 20 * 60; // 20:00
/** A brand-new draft's default length, and the smallest a block may be resized to. */
export const DEFAULT_DRAFT_MINUTES = 30;
export const MIN_ITEM_MINUTES = 5;

export const pxPerMinute = (layout: DayLayout) => layout.pxPerHour / 60;

/** Local minutes from midnight for an instant, including the seconds fraction. */
export const minutesFromMidnight = (date: Date): number =>
  date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;

export const clampMinute = (min: number, lo = 0, hi = MINUTES_PER_DAY) => Math.max(lo, Math.min(hi, min));

export const snapMinute = (min: number, step = DEFAULT_SNAP_MINUTES) => Math.round(min / step) * step;

export const minuteToY = (min: number, layout: DayLayout) => (min - layout.startMin) * pxPerMinute(layout);

export const yToMinute = (y: number, layout: DayLayout) => layout.startMin + y / pxPerMinute(layout);

/** Total pixel height of the grid for a layout window. */
export const layoutHeight = (layout: DayLayout) => (layout.endMin - layout.startMin) * pxPerMinute(layout);

/**
 * Pixel rect for a [startMin, endMin) range, clamped to the visible window so blocks
 * that spill past the edges are clipped rather than drawn off-grid.
 */
export const rectForRange = (startMin: number, endMin: number, layout: DayLayout): Rect => {
  const top = minuteToY(clampMinute(startMin, layout.startMin, layout.endMin), layout);
  const bottom = minuteToY(clampMinute(endMin, layout.startMin, layout.endMin), layout);
  return { top, height: Math.max(0, bottom - top) };
};

export const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

const committedBlocks = (items: CalendarItem[], excludeId?: string) =>
  items.filter((item) => item.layer === "committed" && item.id !== excludeId);

/** Does [startMin, endMin) collide with any committed block (other than excludeId)? */
export const overlapsCommitted = (startMin: number, endMin: number, items: CalendarItem[], excludeId?: string) =>
  committedBlocks(items, excludeId).some((item) => rangesOverlap(startMin, endMin, item.startMin, item.endMin));

/**
 * Largest end a range starting at `startMin` can reach before hitting the next
 * committed block — the ceiling for a resize-from-bottom.
 */
export const ceilingForStart = (
  startMin: number,
  items: CalendarItem[],
  excludeId: string | undefined,
  dayEnd = MINUTES_PER_DAY
) => {
  let ceiling = dayEnd;
  for (const item of committedBlocks(items, excludeId)) {
    if (item.startMin >= startMin && item.startMin < ceiling) {
      ceiling = item.startMin;
    }
  }
  return ceiling;
};

/**
 * Smallest start a range ending at `endMin` can begin from without hitting the
 * previous committed block — the floor for a resize-from-top.
 */
export const floorForEnd = (
  endMin: number,
  items: CalendarItem[],
  excludeId: string | undefined,
  dayStart = 0
) => {
  let floor = dayStart;
  for (const item of committedBlocks(items, excludeId)) {
    if (item.endMin <= endMin && item.endMin > floor) {
      floor = item.endMin;
    }
  }
  return floor;
};

/**
 * Fit a fixed-duration block at `desiredStart` into the free gap it lands in.
 * Returns the clamped range, or `null` when `desiredStart` is inside a committed
 * block or its gap is too small to hold `durationMin`. Used when moving a block.
 */
export const fitMove = (
  desiredStart: number,
  durationMin: number,
  items: CalendarItem[],
  excludeId: string | undefined,
  dayStart = 0,
  dayEnd = MINUTES_PER_DAY
): Range | null => {
  const blocks = committedBlocks(items, excludeId)
    .map((item) => ({ start: item.startMin, end: item.endMin }))
    .sort((a, b) => a.start - b.start);

  let gapStart = dayStart;
  let gapEnd = dayEnd;
  for (const block of blocks) {
    if (block.end <= desiredStart) {
      gapStart = Math.max(gapStart, block.end);
    } else if (block.start >= desiredStart) {
      gapEnd = Math.min(gapEnd, block.start);
      break;
    } else {
      return null; // desiredStart lands inside a committed block
    }
  }

  if (gapEnd - gapStart < durationMin) {
    return null;
  }

  const startMin = Math.max(gapStart, Math.min(desiredStart, gapEnd - durationMin));
  return { startMin, endMin: startMin + durationMin };
};

/**
 * Resize the bottom edge of a block: keep `startMin`, move the end to `desiredEnd`,
 * snapped and clamped to at least MIN_ITEM_MINUTES and no further than the next
 * committed block.
 */
export const fitResizeEnd = (
  startMin: number,
  desiredEnd: number,
  items: CalendarItem[],
  excludeId: string | undefined,
  snap = DEFAULT_SNAP_MINUTES,
  dayEnd = MINUTES_PER_DAY
): Range => {
  const ceiling = ceilingForStart(startMin, items, excludeId, dayEnd);
  const snapped = snapMinute(desiredEnd, snap);
  // When the next block is closer than MIN_ITEM_MINUTES, the floor would exceed the
  // ceiling; clamp the floor down so the end can never overrun the neighbor.
  const endMin = clampMinute(snapped, Math.min(startMin + MIN_ITEM_MINUTES, ceiling), ceiling);
  return { startMin, endMin };
};

/**
 * Resize the top edge of a block: keep `endMin`, move the start to `desiredStart`,
 * snapped and clamped no earlier than the previous committed block.
 */
export const fitResizeStart = (
  desiredStart: number,
  endMin: number,
  items: CalendarItem[],
  excludeId: string | undefined,
  snap = DEFAULT_SNAP_MINUTES,
  dayStart = 0
): Range => {
  const floor = floorForEnd(endMin, items, excludeId, dayStart);
  const snapped = snapMinute(desiredStart, snap);
  const startMin = clampMinute(snapped, floor, Math.max(endMin - MIN_ITEM_MINUTES, floor));
  return { startMin, endMin };
};

/**
 * The visible day window: defaults to 07:00–20:00, expanded outward (hour-aligned)
 * to include every item's span, clamped to the full day.
 */
export const computeDayWindow = (
  items: CalendarItem[],
  opts?: { pxPerHour?: number }
): DayLayout => {
  let startMin = DEFAULT_WINDOW_START_MIN;
  let endMin = DEFAULT_WINDOW_END_MIN;

  for (const item of items) {
    if (item.endMin <= item.startMin) {
      continue;
    }
    startMin = Math.min(startMin, Math.floor(item.startMin / 60) * 60);
    endMin = Math.max(endMin, Math.ceil(item.endMin / 60) * 60);
  }

  startMin = clampMinute(startMin);
  endMin = clampMinute(endMin);
  if (endMin - startMin < 60) {
    endMin = Math.min(MINUTES_PER_DAY, startMin + 60);
  }

  return { startMin, endMin, pxPerHour: opts?.pxPerHour ?? DEFAULT_PX_PER_HOUR };
};

export interface Gap {
  startMin: number;
  endMin: number;
}

/**
 * Free ranges within [windowStart, windowEnd) not covered by any committed item, at
 * least `minMinutes` long. Committed items are merged first so overlapping blocks don't
 * produce phantom slivers. Used for the "log this gap" affordance — pass the first
 * block's start and last block's end as the window to get only the interior holes.
 */
export const findGaps = (
  items: CalendarItem[],
  windowStart: number,
  windowEnd: number,
  minMinutes = DEFAULT_SNAP_MINUTES
): Gap[] => {
  const blocks = items
    .filter((item) => item.layer === "committed")
    .map((item) => ({ start: Math.max(item.startMin, windowStart), end: Math.min(item.endMin, windowEnd) }))
    .filter((block) => block.end > block.start)
    .sort((a, b) => a.start - b.start);

  const gaps: Gap[] = [];
  let cursor = windowStart;
  for (const block of blocks) {
    if (block.start > cursor) {
      gaps.push({ startMin: cursor, endMin: block.start });
    }
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < windowEnd) {
    gaps.push({ startMin: cursor, endMin: windowEnd });
  }

  return gaps.filter((gap) => gap.endMin - gap.startMin >= minMinutes);
};

/**
 * 24h "H:MM" label for a minute-of-day (e.g. 570 → "9:30"). Truncates to the whole
 * minute (drops the seconds fraction) to match `formatHm24`'s `getMinutes()`, so a
 * worklog started at 09:30:40 reads "9:30" here and in the Review view alike.
 */
export const minuteToLabel = (min: number) => {
  const total = ((Math.floor(min) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Whole-hour gridlines within the window, e.g. `{ min: 540, label: "09" }`. */
export const hourMarks = (layout: DayLayout): HourMark[] => {
  const marks: HourMark[] = [];
  const firstHour = Math.ceil(layout.startMin / 60);
  const lastHour = Math.floor(layout.endMin / 60);
  for (let hour = firstHour; hour <= lastHour; hour++) {
    // Midnight (1440) is hour 24 → label "00", never the out-of-range "24".
    marks.push({ min: hour * 60, label: String(hour % 24).padStart(2, "0") });
  }
  return marks;
};

export const worklogToItem = (worklog: JiraWorklog): CalendarItem => {
  const startMin = minutesFromMidnight(new Date(getWorklogDisplayStarted(worklog)));
  const allocationSuffix = worklog.allocation
    ? `:${worklog.allocation.dateKey}:${worklog.allocation.partIndex}`
    : "";
  return {
    id: `wl:${worklog.id}${allocationSuffix}`,
    kind: "worklog",
    startMin,
    endMin: startMin + getWorklogDisplaySeconds(worklog) / 60,
    colorRole: "accent",
    layer: "committed",
    worklog
  };
};

export const noteToItem = (note: PersonalNote): CalendarItem => {
  const startMin = minutesFromMidnight(new Date(note.startedISO));
  return {
    id: `note:${note.id}`,
    kind: "note",
    startMin,
    endMin: startMin + note.timeSpentSeconds / 60,
    colorRole: note.category === "meeting" ? "meeting" : "fire",
    layer: "committed",
    note
  };
};

/** Local minutes from midnight for a recurring event's "HH:MM" wall-clock time. */
const minutesFromLocalTime = (localTime: string): number => {
  const [hours, minutes] = localTime.split(":");
  return clampMinute((Number(hours) || 0) * 60 + (Number(minutes) || 0));
};

/**
 * A confirmed recurring ritual (standup, planning…) as a committed block. Its wall-clock
 * `localTime` maps straight to minutes-from-midnight — the same local frame worklogs use —
 * so it slots into the committed lane alongside them. Colored as a meeting (matching the
 * day ring, which folds recurring time into the Meetings segment).
 */
export const recurringToItem = (entry: RecurringEntry): CalendarItem => {
  const startMin = minutesFromLocalTime(entry.localTime);
  return {
    id: `rec:${entry.eventId}`,
    kind: "recurring",
    startMin,
    endMin: startMin + entry.timeSpentSeconds / 60,
    colorRole: "meeting",
    layer: "committed",
    recurring: entry
  };
};

/** Worklogs + notes + confirmed recurring rituals as one sorted committed lane. */
export const buildCommittedItems = (
  worklogs: JiraWorklog[],
  notes: PersonalNote[],
  recurring: RecurringEntry[] = []
): CalendarItem[] =>
  [...worklogs.map(worklogToItem), ...notes.map(noteToItem), ...recurring.map(recurringToItem)].sort(
    (a, b) => a.startMin - b.startMin
  );

/**
 * A recurring ritual scheduled today but not yet confirmed — a suggestion, not committed
 * time. Placed at its scheduled `localTime` for its default duration, on the non-committed
 * ghost layer so it never blocks logging or column-packs as real time. Click confirms it
 * (it becomes a {@link recurringToItem} block); the corner action skips it for the day.
 */
export const pendingRecurringToItem = (pending: PendingRecurringOccurrence): CalendarItem => {
  const startMin = minutesFromLocalTime(pending.localTime);
  return {
    id: `pending:${pending.eventId}`,
    kind: "recurring-pending",
    startMin,
    endMin: startMin + pending.defaultDurationMinutes,
    colorRole: "meeting",
    layer: "ghost",
    pending
  };
};

/** Today's unconfirmed recurring rituals as a sorted suggestion lane. */
export const buildPendingRecurringItems = (pending: PendingRecurringOccurrence[]): CalendarItem[] =>
  pending.map(pendingRecurringToItem).sort((a, b) => a.startMin - b.startMin);

/**
 * Detected-but-unlogged activity as a faint background "ghost" layer. Keeps only
 * placeable signals (real duration, not instant markers) whose ticket isn't already
 * logged today, so we never suggest time you've accounted for. Placed on the hour from
 * the signal's `startHour` (signals are hour-granular).
 */
export const buildGhostItems = (signals: ReconstructSignal[], loggedKeys: Set<string>): CalendarItem[] =>
  signals
    .filter((signal) => !signal.isMarker && signal.durationMinutes > 0 && (signal.key === "" || !loggedKeys.has(signal.key)))
    .map((signal) => {
      const startMin = clampMinute(signal.startHour * 60, 0, MINUTES_PER_DAY);
      return {
        id: `ghost:${signal.id}`,
        kind: "ghost" as const,
        startMin,
        endMin: startMin + signal.durationMinutes,
        colorRole: "muted" as const,
        layer: "ghost" as const,
        signal
      };
    })
    .sort((a, b) => a.startMin - b.startMin);

export interface PositionedItem {
  item: CalendarItem;
  /** 0-based column within its overlap cluster. */
  column: number;
  /** Total columns in the cluster — every member shares this so widths align. */
  columns: number;
}

/**
 * Pack overlapping items into side-by-side columns (Google-Calendar style). Worklogs
 * are a strict non-overlapping lane, but notes/meetings legitimately overlap them, so
 * concurrent entries share the width instead of painting over each other. Items are
 * grouped into overlap clusters; within a cluster each gets the lowest free column and
 * every member reports the cluster's max concurrency as `columns`.
 */
export const layoutColumns = (items: CalendarItem[]): PositionedItem[] => {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result: PositionedItem[] = [];
  let cluster: Array<{ item: CalendarItem; column: number }> = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) {
      return;
    }
    const columns = Math.max(...cluster.map((entry) => entry.column + 1));
    for (const entry of cluster) {
      result.push({ item: entry.item, column: entry.column, columns });
    }
    cluster = [];
  };

  for (const item of sorted) {
    if (item.startMin >= clusterEnd) {
      flush();
      clusterEnd = item.endMin;
    } else {
      clusterEnd = Math.max(clusterEnd, item.endMin);
    }
    const taken = new Set(cluster.filter((entry) => entry.item.endMin > item.startMin).map((entry) => entry.column));
    let column = 0;
    while (taken.has(column)) {
      column += 1;
    }
    cluster.push({ item, column });
  }
  flush();

  return result;
};

/** Build a local ISO-ish start string (no `Z`) for a given day + minutes-from-midnight. */
export const startedISOForMinute = (day: Date, minute: number): string => {
  const clamped = clampMinute(minute);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  start.setMinutes(Math.round(clamped));
  return start.toISOString();
};
