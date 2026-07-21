// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RecurringEntry, WeekState } from "../../shared/types";
import { WeekTimeline } from "./WeekTimeline";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const currentDate = new Date(2026, 5, 17, 14, 30);
const recurringEntry: RecurringEntry = {
  eventId: "rec-daily",
  dateKey: "2026-06-17",
  title: "Daily Standup",
  localTime: "09:15",
  timeSpentSeconds: 15 * 60
};

const weekState = (entry: RecurringEntry): WeekState =>
  ({
    weekKey: "2026-06-15",
    weekStartISO: "2026-06-15T00:00:00.000Z",
    weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
    weekRangeLabel: "Jun 15–21",
    weeklyTargetHours: 40,
    trackedWeekHours: 0.25,
    jiraTrackedWeekHours: 0,
    personalNoteHours: 0,
    recurringTrackedHours: 0.25,
    remainingWeekHours: 39.75,
    dailyTargetHours: 8,
    activeWorkingDates: ["2026-06-17"],
    skippedDates: [],
    days: [
      {
        dateKey: "2026-06-17",
        dateLabel: "Jun 17",
        weekdayName: "Wednesday",
        isToday: true,
        isConfiguredWorkingDay: true,
        isSkipped: false,
        targetHours: 8,
        trackedHours: 0.25,
        missingHours: 7.75,
        issues: [],
        personalNotes: [],
        recurringEntries: [entry],
        pendingRecurring: []
      }
    ]
  }) as WeekState;

let container: HTMLDivElement;
let root: Root;

const renderTimeline = (entry: RecurringEntry) => {
  act(() => {
    root.render(
      <WeekTimeline
        weekState={weekState(entry)}
        currentDate={currentDate}
        todayKey="2026-06-17"
        onAddTime={() => undefined}
        onMoveWorklog={async () => true}
        onMoveRecurring={async () => true}
        onEditWorklog={() => undefined}
        onEditPersonalNote={() => undefined}
        onToggleSkipped={() => undefined}
      />
    );
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("WeekTimeline interaction state", () => {
  it("preserves manual scroll when a recurring occurrence moves", () => {
    renderTimeline(recurringEntry);
    const scroll = container.querySelector<HTMLElement>(".week-timeline-scroll");
    expect(scroll).not.toBeNull();
    scroll!.scrollTop = 321;

    renderTimeline({ ...recurringEntry, localTime: "08:45" });

    expect(scroll!.scrollTop).toBe(321);
    expect(container.textContent).toContain("8:45–9:00");
  });
});
