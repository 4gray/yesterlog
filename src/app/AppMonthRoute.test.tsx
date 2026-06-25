// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppMonthRoute, type AppMonthRouteProps } from "./AppMonthRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { monthViewProps } = vi.hoisted(() => ({
  monthViewProps: [] as Record<string, unknown>[]
}));

vi.mock("../components/LoadingView", () => ({
  LoadingView: () => <section data-testid="loading-view">Loading</section>
}));

vi.mock("../components/MonthView", () => ({
  MonthView: (props: Record<string, unknown>) => {
    monthViewProps.push(props);
    const monthState = props.monthState as { monthLabel: string; trackedHours: number };
    return (
      <section
        data-testid="month-view"
        data-month={monthState.monthLabel}
        data-tracked={String(monthState.trackedHours)}
      >
        <button type="button" onClick={() => (props.onSelectWeek as (date: Date) => void)(new Date(2026, 5, 15))}>
          select
        </button>
        <button type="button" onClick={() => (props.onPreviousMonth as () => void)()}>
          previous
        </button>
        <button type="button" onClick={() => (props.onCurrentMonth as () => void)()}>
          current
        </button>
        <button type="button" onClick={() => (props.onNextMonth as () => void)()}>
          next
        </button>
      </section>
    );
  }
}));

const monthState = {
  monthLabel: "June 2026",
  trackedHours: 25
} as AppMonthRouteProps["monthState"];

const noop = () => undefined;

const baseProps = (): AppMonthRouteProps => ({
  monthState,
  openWeekFromMonth: noop,
  goToPreviousMonth: noop,
  goToCurrentMonth: noop,
  goToNextMonth: noop
});

let container: HTMLDivElement;
let root: Root;

const renderRoute = (props: Partial<AppMonthRouteProps> = {}) => {
  act(() => {
    root.render(<AppMonthRoute {...baseProps()} {...props} />);
  });
};

beforeEach(() => {
  monthViewProps.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppMonthRoute", () => {
  it("shows the shared loading surface while month state is not ready", () => {
    renderRoute({ monthState: undefined });

    expect(container.querySelector("[data-testid='loading-view']")).not.toBeNull();
    expect(container.querySelector("[data-testid='month-view']")).toBeNull();
    expect(monthViewProps).toEqual([]);
  });

  it("maps ready month state to MonthView props", () => {
    renderRoute();

    const rendered = container.querySelector("[data-testid='month-view']");
    expect(rendered?.getAttribute("data-month")).toBe("June 2026");
    expect(rendered?.getAttribute("data-tracked")).toBe("25");
    expect(monthViewProps[0]?.monthState).toBe(monthState);
  });

  it("passes MonthView navigation actions through unchanged", () => {
    const openWeekFromMonth = vi.fn();
    const goToPreviousMonth = vi.fn();
    const goToCurrentMonth = vi.fn();
    const goToNextMonth = vi.fn();
    renderRoute({
      openWeekFromMonth,
      goToPreviousMonth,
      goToCurrentMonth,
      goToNextMonth
    });

    act(() => {
      container.querySelectorAll("button")[0]?.click();
      container.querySelectorAll("button")[1]?.click();
      container.querySelectorAll("button")[2]?.click();
      container.querySelectorAll("button")[3]?.click();
    });

    expect(openWeekFromMonth).toHaveBeenCalledWith(new Date(2026, 5, 15));
    expect(goToPreviousMonth).toHaveBeenCalledTimes(1);
    expect(goToCurrentMonth).toHaveBeenCalledTimes(1);
    expect(goToNextMonth).toHaveBeenCalledTimes(1);
  });
});
