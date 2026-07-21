// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppWeekRoute, type AppWeekRouteProps } from "./AppWeekRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { weekViewProps } = vi.hoisted(() => ({
  weekViewProps: [] as Record<string, unknown>[]
}));

vi.mock("../components/WeekView", () => ({
  WeekView: (props: Record<string, unknown>) => {
    weekViewProps.push(props);
    const weekState = props.weekState as { weekRangeLabel: string; trackedWeekHours: number };
    return (
      <section
        data-testid="week-view"
        data-week={weekState.weekRangeLabel}
        data-tracked={String(weekState.trackedWeekHours)}
        data-syncing={String(props.isSyncing)}
        data-configured={String(props.isConfigured)}
        data-active-count={String(props.activeTicketCount)}
        data-logging={String(props.isLogging)}
      >
        <button type="button" onClick={() => (props.onSync as () => void)()}>
          sync
        </button>
        <button type="button" onClick={() => (props.onPreviousWeek as () => void)()}>
          previous
        </button>
        <button type="button" onClick={() => (props.onCurrentWeek as () => void)()}>
          current
        </button>
        <button type="button" onClick={() => (props.onNextWeek as () => void)()}>
          next
        </button>
        <button type="button" onClick={() => (props.onAddTime as (date?: Date) => void)(new Date(2026, 5, 17))}>
          add
        </button>
        <button type="button" onClick={() => (props.onToggleSkipped as (dateKey: string) => void)("2026-06-17")}>
          skip
        </button>
        <button
          type="button"
          onClick={() => (props.onDockLog as (payload: Record<string, unknown>) => void)({ issueKey: "FTDM-101" })}
        >
          dock
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onConfirmRecurring as (payload: Record<string, unknown>) => void)({
              eventId: "standup",
              dateKey: "2026-06-17",
              timeSpentSeconds: 900
            })
          }
        >
          recurring
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onMoveWorklog as (worklog: Record<string, unknown>, patch: Record<string, unknown>) => void)(
              { id: "wl-1", issueKey: "FTDM-101" },
              { startedISO: "2026-06-17T09:00:00.000Z", timeSpentSeconds: 3600 }
            )
          }
        >
          move
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onMoveRecurring as (entry: Record<string, unknown>, patch: Record<string, unknown>) => void)(
              { eventId: "standup", dateKey: "2026-06-17" },
              { localTime: "10:15", timeSpentSeconds: 1800 }
            )
          }
        >
          move recurring
        </button>
      </section>
    );
  }
}));

const currentDate = new Date(2026, 5, 17, 12);

const weekState = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  weekRangeLabel: "Jun 15-21",
  trackedWeekHours: 12,
  weeklyTargetHours: 32,
  jiraTrackedWeekHours: 9,
  personalNoteHours: 3,
  remainingWeekHours: 20,
  dailyTargetHours: 8,
  activeWorkingDates: ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18"],
  skippedDates: [],
  days: [],
  recurringTrackedHours: 0
} as AppWeekRouteProps["weekState"];

const syncResult = {
  weekKey: "2026-06-15",
  syncedAt: "2026-06-25T09:00:00.000Z"
} as AppWeekRouteProps["syncResult"];

const noop = () => undefined;
const asyncTrue = async () => true;

const baseProps = (): AppWeekRouteProps => ({
  weekState,
  syncResult,
  currentDate,
  isSyncing: false,
  isSyncingReviews: false,
  isConfigured: true,
  syncState: "synced",
  viewMode: "summary",
  onViewModeChange: noop,
  onOpenCommandPalette: noop,
  dockTickets: [],
  activeTicketCount: 4,
  isLogging: false,
  handleSync: noop,
  goToPreviousWeek: noop,
  goToCurrentWeek: noop,
  goToNextWeek: noop,
  openAddTime: noop,
  handleMoveWorklog: asyncTrue,
  handleMoveRecurring: asyncTrue,
  openEditWorklog: noop,
  openEditPersonalNote: noop,
  handleToggleSkipped: noop,
  handleAddWorklog: asyncTrue,
  handleConfirmRecurring: asyncTrue,
  handleSkipRecurring: asyncTrue,
  handleDeleteRecurringOccurrence: asyncTrue
});

let container: HTMLDivElement;
let root: Root;

const renderRoute = (props: Partial<AppWeekRouteProps> = {}) => {
  act(() => {
    root.render(<AppWeekRoute {...baseProps()} {...props} />);
  });
};

beforeEach(() => {
  weekViewProps.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppWeekRoute", () => {
  it("maps app-level week state to WeekView props", () => {
    renderRoute({ isLogging: true });

    const rendered = container.querySelector("[data-testid='week-view']");
    expect(rendered?.getAttribute("data-week")).toBe("Jun 15-21");
    expect(rendered?.getAttribute("data-tracked")).toBe("12");
    expect(rendered?.getAttribute("data-configured")).toBe("true");
    expect(rendered?.getAttribute("data-active-count")).toBe("4");
    expect(rendered?.getAttribute("data-logging")).toBe("true");
    expect(weekViewProps[0]?.weekState).toBe(weekState);
    expect(weekViewProps[0]?.syncResult).toBe(syncResult);
    expect(weekViewProps[0]?.currentDate).toBe(currentDate);
  });

  it("combines Jira and review sync state before rendering WeekView", () => {
    renderRoute({ isSyncing: false, isSyncingReviews: true });

    expect(container.querySelector("[data-testid='week-view']")?.getAttribute("data-syncing")).toBe("true");
    expect(weekViewProps[0]?.isSyncing).toBe(true);
  });

  it("passes WeekView actions through unchanged", () => {
    const handleSync = vi.fn();
    const goToPreviousWeek = vi.fn();
    const goToCurrentWeek = vi.fn();
    const goToNextWeek = vi.fn();
    const openAddTime = vi.fn();
    const handleToggleSkipped = vi.fn();
    const handleAddWorklog = vi.fn();
    const handleConfirmRecurring = vi.fn();
    const handleMoveWorklog = vi.fn();
    const handleMoveRecurring = vi.fn();
    renderRoute({
      handleSync,
      goToPreviousWeek,
      goToCurrentWeek,
      goToNextWeek,
      openAddTime,
      handleToggleSkipped,
      handleAddWorklog,
      handleConfirmRecurring,
      handleMoveWorklog,
      handleMoveRecurring
    });

    act(() => {
      container.querySelectorAll("button")[0]?.click();
      container.querySelectorAll("button")[1]?.click();
      container.querySelectorAll("button")[2]?.click();
      container.querySelectorAll("button")[3]?.click();
      container.querySelectorAll("button")[4]?.click();
      container.querySelectorAll("button")[5]?.click();
      container.querySelectorAll("button")[6]?.click();
      container.querySelectorAll("button")[7]?.click();
      container.querySelectorAll("button")[8]?.click();
      container.querySelectorAll("button")[9]?.click();
    });

    expect(handleSync).toHaveBeenCalledTimes(1);
    expect(goToPreviousWeek).toHaveBeenCalledTimes(1);
    expect(goToCurrentWeek).toHaveBeenCalledTimes(1);
    expect(goToNextWeek).toHaveBeenCalledTimes(1);
    expect(openAddTime).toHaveBeenCalledWith(new Date(2026, 5, 17));
    expect(handleToggleSkipped).toHaveBeenCalledWith("2026-06-17");
    expect(handleAddWorklog).toHaveBeenCalledWith({ issueKey: "FTDM-101" });
    expect(handleConfirmRecurring).toHaveBeenCalledWith({
      eventId: "standup",
      dateKey: "2026-06-17",
      timeSpentSeconds: 900
    });
    expect(handleMoveWorklog).toHaveBeenCalledWith(
      { id: "wl-1", issueKey: "FTDM-101" },
      { startedISO: "2026-06-17T09:00:00.000Z", timeSpentSeconds: 3600 }
    );
    expect(handleMoveRecurring).toHaveBeenCalledWith(
      { eventId: "standup", dateKey: "2026-06-17" },
      { localTime: "10:15", timeSpentSeconds: 1800 }
    );
  });
});
