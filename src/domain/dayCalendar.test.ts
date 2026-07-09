import { describe, expect, it } from "vitest";
import type { JiraWorklog, PendingRecurringOccurrence, PersonalNote, RecurringEntry } from "../../shared/types";
import type { ReconstructSignal } from "./reconstruct";
import {
  buildCommittedItems,
  buildGhostItems,
  buildPendingRecurringItems,
  ceilingForStart,
  clampMinute,
  computeDayWindow,
  findGaps,
  DEFAULT_PX_PER_HOUR,
  DEFAULT_WINDOW_END_MIN,
  DEFAULT_WINDOW_START_MIN,
  fitMove,
  fitResizeEnd,
  fitResizeStart,
  floorForEnd,
  hourMarks,
  layoutColumns,
  layoutHeight,
  MINUTES_PER_DAY,
  minuteToLabel,
  minuteToY,
  minutesFromMidnight,
  noteToItem,
  overlapsCommitted,
  pendingRecurringToItem,
  rangesOverlap,
  recurringToItem,
  rectForRange,
  snapMinute,
  startedISOForMinute,
  worklogToItem,
  yToMinute,
  type CalendarItem,
  type DayLayout
} from "./dayCalendar";

const layout: DayLayout = { startMin: 8 * 60, endMin: 18 * 60, pxPerHour: 60 };

const committed = (id: string, startMin: number, endMin: number): CalendarItem => ({
  id,
  kind: "worklog",
  startMin,
  endMin,
  colorRole: "accent",
  layer: "committed"
});

describe("minutes ↔ pixels", () => {
  it("maps a minute to its offset from the window top", () => {
    expect(minuteToY(8 * 60, layout)).toBe(0);
    expect(minuteToY(9 * 60, layout)).toBe(60);
    expect(minuteToY(8 * 60 + 30, layout)).toBe(30);
  });

  it("round-trips y ↔ minute", () => {
    expect(yToMinute(minuteToY(600, layout), layout)).toBeCloseTo(600);
    expect(minuteToY(yToMinute(120, layout), layout)).toBeCloseTo(120);
  });

  it("computes total grid height", () => {
    expect(layoutHeight(layout)).toBe(10 * DEFAULT_PX_PER_HOUR);
  });
});

describe("snap & clamp", () => {
  it("snaps to the nearest step", () => {
    expect(snapMinute(547, 15)).toBe(540);
    expect(snapMinute(548, 15)).toBe(555);
    expect(snapMinute(600, 15)).toBe(600);
  });

  it("clamps into range", () => {
    expect(clampMinute(-30)).toBe(0);
    expect(clampMinute(2000)).toBe(MINUTES_PER_DAY);
    expect(clampMinute(600, 540, 660)).toBe(600);
    expect(clampMinute(500, 540, 660)).toBe(540);
  });
});

describe("rectForRange", () => {
  it("positions and sizes a block inside the window", () => {
    expect(rectForRange(9 * 60, 10 * 60 + 30, layout)).toEqual({ top: 60, height: 90 });
  });

  it("clips a block that spills past the window edges", () => {
    const rect = rectForRange(7 * 60, 19 * 60, layout);
    expect(rect.top).toBe(0);
    expect(rect.height).toBe(layoutHeight(layout));
  });
});

describe("overlap detection", () => {
  it("detects overlapping and adjacent ranges", () => {
    expect(rangesOverlap(540, 600, 570, 630)).toBe(true);
    expect(rangesOverlap(540, 600, 600, 660)).toBe(false); // touching, not overlapping
    expect(rangesOverlap(540, 600, 601, 660)).toBe(false);
  });

  it("ignores the excluded id and the ghost layer", () => {
    const items: CalendarItem[] = [
      committed("a", 540, 600),
      { ...committed("g", 540, 600), id: "g", layer: "ghost" }
    ];
    expect(overlapsCommitted(550, 560, items)).toBe(true);
    expect(overlapsCommitted(550, 560, items, "a")).toBe(false); // only ghost left
  });
});

describe("gap fitting", () => {
  const items = [committed("a", 540, 600), committed("b", 660, 720)]; // 9–10, 11–12

  it("finds the ceiling and floor around a gap", () => {
    expect(ceilingForStart(600, items, undefined)).toBe(660); // next block starts 11:00
    expect(floorForEnd(660, items, undefined)).toBe(600); // prev block ends 10:00
  });

  it("moves a fixed-duration block within its gap", () => {
    expect(fitMove(610, 30, items, undefined)).toEqual({ startMin: 610, endMin: 640 });
  });

  it("clamps a move so the block stays inside the gap", () => {
    // 50-min block in the 10:00–11:00 gap can start no later than 10:10.
    expect(fitMove(650, 50, items, undefined)).toEqual({ startMin: 610, endMin: 660 });
  });

  it("rejects a move that lands inside a committed block", () => {
    expect(fitMove(570, 30, items, undefined)).toBeNull();
  });

  it("rejects a move whose duration cannot fit the gap", () => {
    expect(fitMove(610, 120, items, undefined)).toBeNull(); // 2h into a 1h gap
  });

  it("resizes the bottom edge but stops at the next block", () => {
    expect(fitResizeEnd(540, 800, items, "a")).toEqual({ startMin: 540, endMin: 660 });
  });

  it("resizes the top edge but stops at the previous block", () => {
    expect(fitResizeStart(500, 660, items, "b")).toEqual({ startMin: 600, endMin: 660 });
  });

  it("never overruns a neighbor closer than the minimum item length", () => {
    // resize-end: 2-min block at 540–542, next block starts 544 (gap 2m < MIN 5m).
    const tightBelow = [committed("a", 540, 542), committed("b", 544, 600)];
    expect(fitResizeEnd(540, 800, tightBelow, "a")).toEqual({ startMin: 540, endMin: 544 }); // clamps to neighbor, no overlap
    // resize-start: block b at 601–603 with a ending 600 just above (gap 1m).
    const tightAbove = [committed("a", 540, 600), committed("b", 601, 603)];
    expect(fitResizeStart(0, 603, tightAbove, "b")).toEqual({ startMin: 600, endMin: 603 }); // clamps to neighbor's end
  });
});

describe("computeDayWindow", () => {
  it("uses the default working window when empty", () => {
    expect(computeDayWindow([])).toEqual({
      startMin: DEFAULT_WINDOW_START_MIN,
      endMin: DEFAULT_WINDOW_END_MIN,
      pxPerHour: DEFAULT_PX_PER_HOUR
    });
  });

  it("expands outward, hour-aligned, to include early/late items", () => {
    const window = computeDayWindow([committed("a", 6 * 60 + 20, 6 * 60 + 50), committed("b", 21 * 60, 21 * 60 + 40)]);
    expect(window.startMin).toBe(6 * 60);
    expect(window.endMin).toBe(22 * 60);
  });
});

describe("hourMarks", () => {
  it("lists whole hours within the window", () => {
    const marks = hourMarks({ startMin: 8 * 60, endMin: 11 * 60, pxPerHour: 60 });
    expect(marks).toEqual([
      { min: 480, label: "08" },
      { min: 540, label: "09" },
      { min: 600, label: "10" },
      { min: 660, label: "11" }
    ]);
  });
});

describe("mappers", () => {
  const startISO = new Date(2026, 6, 8, 9, 30).toISOString(); // local 09:30, TZ-safe round-trip

  it("maps a worklog to a committed accent item", () => {
    const worklog = { id: "w1", timeSpentSeconds: 3600, started: startISO } as JiraWorklog;
    const item = worklogToItem(worklog);
    expect(item).toMatchObject({ id: "wl:w1", startMin: 570, endMin: 630, colorRole: "accent", layer: "committed" });
  });

  it("colors notes by category", () => {
    const base = { id: "n1", timeSpentSeconds: 1800, startedISO: startISO } as PersonalNote;
    expect(noteToItem({ ...base, category: "meeting" }).colorRole).toBe("meeting");
    expect(noteToItem({ ...base, category: "firefighting" }).colorRole).toBe("fire");
    expect(noteToItem({ ...base }).colorRole).toBe("fire");
  });

  it("maps a confirmed recurring ritual to a committed meeting item at its wall-clock time", () => {
    const entry = { eventId: "rec-daily", localTime: "09:15", timeSpentSeconds: 900, title: "Daily Standup" } as RecurringEntry;
    const item = recurringToItem(entry);
    expect(item).toMatchObject({
      id: "rec:rec-daily",
      kind: "recurring",
      startMin: 555, // 09:15
      endMin: 570, // + 15 min
      colorRole: "meeting",
      layer: "committed"
    });
    expect(item.recurring).toBe(entry);
  });

  it("maps a pending recurring ritual to a non-committed suggestion item at its scheduled time", () => {
    const pending = {
      eventId: "rec-sync",
      dateKey: "2026-06-18",
      localTime: "15:00",
      defaultDurationMinutes: 30,
      title: "Weekly Team Sync"
    } as PendingRecurringOccurrence;
    const item = pendingRecurringToItem(pending);
    expect(item).toMatchObject({
      id: "pending:rec-sync",
      kind: "recurring-pending",
      startMin: 900, // 15:00
      endMin: 930, // + 30 min
      colorRole: "meeting",
      layer: "ghost" // never the committed lane — it's a suggestion, not logged time
    });
    expect(item.pending).toBe(pending);
  });

  it("sorts pending recurring suggestions by start time", () => {
    const late = { eventId: "b", localTime: "15:00", defaultDurationMinutes: 30 } as PendingRecurringOccurrence;
    const early = { eventId: "a", localTime: "09:15", defaultDurationMinutes: 15 } as PendingRecurringOccurrence;
    expect(buildPendingRecurringItems([late, early]).map((item) => item.id)).toEqual(["pending:a", "pending:b"]);
  });

  it("merges worklogs, notes and recurring into one start-sorted lane", () => {
    const worklog = { id: "w1", timeSpentSeconds: 3600, started: new Date(2026, 6, 8, 11, 0).toISOString() } as JiraWorklog;
    const note = { id: "n1", timeSpentSeconds: 1800, startedISO: new Date(2026, 6, 8, 9, 0).toISOString() } as PersonalNote;
    const recurring = { eventId: "rec-daily", localTime: "09:15", timeSpentSeconds: 900, title: "Daily" } as RecurringEntry;
    const items = buildCommittedItems([worklog], [note], [recurring]);
    expect(items.map((item) => item.id)).toEqual(["note:n1", "rec:rec-daily", "wl:w1"]);
    expect(items.every((item) => item.layer === "committed")).toBe(true);
  });

  it("defaults recurring to an empty lane so existing callers are unaffected", () => {
    const note = { id: "n1", timeSpentSeconds: 1800, startedISO: new Date(2026, 6, 8, 9, 0).toISOString() } as PersonalNote;
    expect(buildCommittedItems([], [note]).map((item) => item.id)).toEqual(["note:n1"]);
  });
});

describe("layoutColumns", () => {
  it("keeps non-overlapping items in a single full-width column", () => {
    const positioned = layoutColumns([committed("a", 540, 600), committed("b", 660, 720)]);
    expect(positioned.every((p) => p.columns === 1 && p.column === 0)).toBe(true);
  });

  it("splits two overlapping items into two columns", () => {
    const positioned = layoutColumns([committed("a", 540, 660), committed("b", 600, 720)]);
    expect(positioned.map((p) => ({ id: p.item.id, column: p.column, columns: p.columns }))).toEqual([
      { id: "a", column: 0, columns: 2 },
      { id: "b", column: 1, columns: 2 }
    ]);
  });

  it("shares one cluster width across a chain of overlaps", () => {
    // a overlaps b, b overlaps c, but a and c do not — all one cluster, 2 wide.
    const positioned = layoutColumns([committed("a", 540, 620), committed("b", 600, 700), committed("c", 660, 740)]);
    expect(positioned.every((p) => p.columns === 2)).toBe(true);
    expect(positioned.find((p) => p.item.id === "c")?.column).toBe(0); // reuses a's freed column
  });

  it("starts a fresh cluster after a gap", () => {
    const positioned = layoutColumns([committed("a", 540, 660), committed("b", 600, 720), committed("c", 780, 840)]);
    expect(positioned.find((p) => p.item.id === "c")).toMatchObject({ column: 0, columns: 1 });
  });
});

describe("buildGhostItems", () => {
  const signal = (over: Partial<ReconstructSignal>): ReconstructSignal => ({
    id: "s",
    kind: "commit",
    key: "X-1",
    title: "Coding",
    sub: "",
    durationMinutes: 60,
    isMarker: false,
    confidence: "med",
    startHour: 9,
    naiveDescription: "",
    ...over
  });

  it("keeps placeable, unlogged signals as hour-placed ghost items", () => {
    const [item] = buildGhostItems([signal({})], new Set());
    expect(item).toMatchObject({ kind: "ghost", layer: "ghost", startMin: 540, endMin: 600 });
  });

  it("drops instant markers and zero-duration signals", () => {
    expect(buildGhostItems([signal({ id: "a", isMarker: true }), signal({ id: "b", durationMinutes: 0 })], new Set())).toEqual(
      []
    );
  });

  it("drops signals whose ticket is already logged today", () => {
    expect(buildGhostItems([signal({ key: "X-1" })], new Set(["X-1"]))).toEqual([]);
  });

  it("keeps keyless signals (nothing to dedup against)", () => {
    expect(buildGhostItems([signal({ key: "" })], new Set(["X-1"]))).toHaveLength(1);
  });
});

describe("findGaps", () => {
  const items = [committed("a", 540, 600), committed("b", 660, 720)]; // 9–10, 11–12

  it("finds interior gaps within the window", () => {
    // Window = first start .. last end → only the 10–11 hole.
    expect(findGaps(items, 540, 720)).toEqual([{ startMin: 600, endMin: 660 }]);
  });

  it("includes leading and trailing gaps when the window is wider", () => {
    expect(findGaps(items, 480, 780)).toEqual([
      { startMin: 480, endMin: 540 },
      { startMin: 600, endMin: 660 },
      { startMin: 720, endMin: 780 }
    ]);
  });

  it("merges overlapping items so overlaps do not create phantom gaps", () => {
    const overlapping = [committed("a", 540, 660), committed("b", 600, 720)];
    expect(findGaps(overlapping, 540, 720)).toEqual([]);
  });

  it("drops gaps shorter than the minimum", () => {
    expect(findGaps(items, 540, 720, 90)).toEqual([]); // the only gap is 60m < 90m
  });
});

describe("minuteToLabel", () => {
  it("formats a minute-of-day as 24h H:MM", () => {
    expect(minuteToLabel(570)).toBe("9:30");
    expect(minuteToLabel(600)).toBe("10:00");
    expect(minuteToLabel(0)).toBe("0:00");
  });
});

describe("minutesFromMidnight & startedISOForMinute", () => {
  it("reads local minutes from an instant", () => {
    expect(minutesFromMidnight(new Date(2026, 6, 8, 9, 30))).toBe(570);
  });

  it("round-trips a minute back into a local start instant", () => {
    const iso = startedISOForMinute(new Date(2026, 6, 8), 570);
    expect(minutesFromMidnight(new Date(iso))).toBe(570);
  });
});
