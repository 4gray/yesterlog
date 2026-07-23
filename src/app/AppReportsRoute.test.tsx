// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppReportsRoute, type AppReportsRouteProps } from "./AppReportsRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { reportsViewProps } = vi.hoisted(() => ({
  reportsViewProps: [] as Record<string, unknown>[]
}));

vi.mock("../components/ReportsView", () => ({
  ReportsView: (props: Record<string, unknown>) => {
    reportsViewProps.push(props);
    const weekState = props.weekState as { weekRangeLabel: string; trackedWeekHours: number };
    return (
      <section
        data-testid="reports-view"
        data-week={weekState.weekRangeLabel}
        data-tracked={String(weekState.trackedWeekHours)}
      >
        <button type="button" onClick={() => (props.onPreviousWeek as () => void)()}>
          previous
        </button>
        <button type="button" onClick={() => (props.onCurrentWeek as () => void)()}>
          current
        </button>
        <button type="button" onClick={() => (props.onNextWeek as () => void)()}>
          next
        </button>
      </section>
    );
  }
}));

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
} as AppReportsRouteProps["weekState"];

const noop = () => undefined;

const baseProps = (): AppReportsRouteProps => ({
  reportTab: "summary",
  weekState,
  isBitbucketReady: false,
  issueUrlsByKey: {},
  issueTypesByKey: {},
  onReportTabChange: noop,
  goToPreviousWeek: noop,
  goToCurrentWeek: noop,
  goToNextWeek: noop
});

let container: HTMLDivElement;
let root: Root;

const renderRoute = (props: Partial<AppReportsRouteProps> = {}) => {
  act(() => {
    root.render(<AppReportsRoute {...baseProps()} {...props} />);
  });
};

beforeEach(() => {
  reportsViewProps.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppReportsRoute", () => {
  it("maps app-level reports state to ReportsView props", () => {
    const onReportTabChange = vi.fn();
    const reviewResult = { weekKey: "2026-06-15", sessions: [] } as unknown as NonNullable<
      AppReportsRouteProps["reviewResult"]
    >;
    renderRoute({
      reviewResult,
      isBitbucketReady: true,
      issueUrlsByKey: { "YLOG-410": "https://example.atlassian.net/browse/YLOG-410" },
      issueTypesByKey: { "YLOG-410": { name: "Task", hierarchyLevel: 0 } },
      onReportTabChange
    });

    const rendered = container.querySelector("[data-testid='reports-view']");
    expect(rendered?.getAttribute("data-week")).toBe("Jun 15-21");
    expect(rendered?.getAttribute("data-tracked")).toBe("12");
    expect(reportsViewProps[0]?.weekState).toBe(weekState);
    expect(reportsViewProps[0]?.reviewResult).toBe(reviewResult);
    expect(reportsViewProps[0]?.isBitbucketReady).toBe(true);
    expect(reportsViewProps[0]?.onReportTabChange).toBe(onReportTabChange);
  });

  it("passes ReportsView navigation actions through unchanged", () => {
    const goToPreviousWeek = vi.fn();
    const goToCurrentWeek = vi.fn();
    const goToNextWeek = vi.fn();
    renderRoute({
      goToPreviousWeek,
      goToCurrentWeek,
      goToNextWeek
    });

    act(() => {
      container.querySelectorAll("button")[0]?.click();
      container.querySelectorAll("button")[1]?.click();
      container.querySelectorAll("button")[2]?.click();
    });

    expect(goToPreviousWeek).toHaveBeenCalledTimes(1);
    expect(goToCurrentWeek).toHaveBeenCalledTimes(1);
    expect(goToNextWeek).toHaveBeenCalledTimes(1);
  });
});
